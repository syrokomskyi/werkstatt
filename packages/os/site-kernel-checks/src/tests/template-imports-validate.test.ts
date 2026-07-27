/*
<MODULE_CONTRACT>
<purpose>
RFC-0557: unit tests for template.imports.validate. Tests import extraction
regex (static + dynamic), devDependencies check, and dry-run mode.
</purpose>
<non-goals>
  <item>Does not test pnpm install --frozen-lockfile subprocess — tested via integration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0557: initial test suite.</item>
</CHANGE_SUMMARY>
*/

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultIO } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import {
  extractWorkspaceImports,
  runTemplateImportsValidate,
} from "../template-imports-validate.ts";

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  const { io } = createDefaultIO();
  return {
    workspaceRoot,
    io,
    logger,
    site: undefined,
    fileIntents: io,
  } as unknown as KernelRuntimeContext;
}

function makeInput(flags: Record<string, unknown> = {}, args: string[] = []): KernelCommandInput {
  return { flags, args, positional: [] } as unknown as KernelCommandInput;
}

describe("extractWorkspaceImports", () => {
  it("extracts static @warpgogol imports", () => {
    const source = `import { foo } from "@warpgogol/site-kernel";`;
    const imports = extractWorkspaceImports(source, "test.ts");
    expect(imports).toHaveLength(1);
    expect(imports[0].package).toBe("@warpgogol/site-kernel");
    expect(imports[0].line).toBe(1);
  });

  it("extracts static @webgogol imports", () => {
    const source = `import { bar } from "@webgogol/forge";`;
    const imports = extractWorkspaceImports(source, "test.ts");
    expect(imports).toHaveLength(1);
    expect(imports[0].package).toBe("@webgogol/forge");
  });

  it("extracts dynamic import() specifiers", () => {
    const source = `const mod = await import("@warpgogol/site-kernel-integrity");`;
    const imports = extractWorkspaceImports(source, "test.ts");
    expect(imports).toHaveLength(1);
    expect(imports[0].package).toBe("@warpgogol/site-kernel-integrity");
  });

  it("extracts dynamic @webgogol import() specifiers", () => {
    const source = `const mod = await import("@webgogol/forge");`;
    const imports = extractWorkspaceImports(source, "test.ts");
    expect(imports).toHaveLength(1);
    expect(imports[0].package).toBe("@webgogol/forge");
  });

  it("extracts both static and dynamic imports from the same file", () => {
    const source = [
      `import { foo } from "@warpgogol/site-kernel";`,
      `const bar = await import("@warpgogol/share/fs");`,
      `import { baz } from "@webgogol/forge";`,
    ].join("\n");
    const imports = extractWorkspaceImports(source, "test.ts");
    expect(imports).toHaveLength(3);
    expect(imports.map((i) => i.package)).toEqual([
      "@warpgogol/site-kernel",
      "@warpgogol/share",
      "@webgogol/forge",
    ]);
  });

  it("does not extract non-workspace imports", () => {
    const source = [
      `import { readFile } from "node:fs/promises";`,
      `import { defineConfig } from "astro/config";`,
      `import { z } from "zod";`,
    ].join("\n");
    const imports = extractWorkspaceImports(source, "test.ts");
    expect(imports).toHaveLength(0);
  });

  it("does not break on {{TOKEN}} placeholders", () => {
    const source = `import { {{COMPONENT_NAME}} } from "@warpgogol/site-kernel";`;
    const imports = extractWorkspaceImports(source, "test.template.ts");
    expect(imports).toHaveLength(1);
    expect(imports[0].package).toBe("@warpgogol/site-kernel");
  });

  it("reports correct line numbers", () => {
    const source = [
      `// line 1: comment`,
      `import { foo } from "@warpgogol/site-kernel";`,
      `// line 3: comment`,
      `const bar = await import("@warpgogol/share/fs");`,
    ].join("\n");
    const imports = extractWorkspaceImports(source, "test.ts");
    expect(imports).toHaveLength(2);
    expect(imports[0].line).toBe(2);
    expect(imports[1].line).toBe(4);
  });
});

describe("runTemplateImportsValidate", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("passes when no template files exist", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "template-imports-"));
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "test", devDependencies: {} }),
    );
    await writeFile(join(tempDir, "pnpm-workspace.yaml"), "packages: []\n");
    const result = await runTemplateImportsValidate(
      makeInput({ "no-frozen-lockfile": true }),
      makeContext(tempDir),
    );
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.templatesScanned).toBe(0);
  });

  it("detects missing devDependencies", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "template-imports-"));
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-workspace",
        devDependencies: { "@warpgogol/site-kernel": "workspace:*" },
      }),
    );
    await writeFile(join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    const pkgDir = join(tempDir, "packages", "test-pkg", "src", "templates");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, "kernel.config.template.ts"),
      [
        `import { foo } from "@warpgogol/site-kernel";`,
        `import { bar } from "@warpgogol/missing-package";`,
      ].join("\n"),
    );
    await writeFile(
      join(tempDir, "packages", "test-pkg", "package.json"),
      JSON.stringify({ name: "@warpgogol/test-pkg", version: "0.0.0" }),
    );

    const result = await runTemplateImportsValidate(
      makeInput({ "no-frozen-lockfile": true }),
      makeContext(tempDir),
    );

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.missingFromRootDeps).toHaveLength(1);
    expect(result.data?.missingFromRootDeps[0].package).toBe("@warpgogol/missing-package");
  });

  it("passes when all imports are in devDependencies", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "template-imports-"));
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-workspace",
        devDependencies: {
          "@warpgogol/site-kernel": "workspace:*",
          "@warpgogol/share": "workspace:*",
        },
      }),
    );
    await writeFile(join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    const pkgDir = join(tempDir, "packages", "test-pkg", "src", "templates");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, "kernel.config.template.ts"),
      [
        `import { foo } from "@warpgogol/site-kernel";`,
        `const bar = await import("@warpgogol/share/fs");`,
      ].join("\n"),
    );
    await writeFile(
      join(tempDir, "packages", "test-pkg", "package.json"),
      JSON.stringify({ name: "@warpgogol/test-pkg", version: "0.0.0" }),
    );

    const result = await runTemplateImportsValidate(
      makeInput({ "no-frozen-lockfile": true }),
      makeContext(tempDir),
    );

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.missingFromRootDeps).toHaveLength(0);
  });

  it("dry-run mode exits 0 even with violations", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "template-imports-"));
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "test-workspace", devDependencies: {} }),
    );
    await writeFile(join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    const pkgDir = join(tempDir, "packages", "test-pkg", "src", "templates");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, "kernel.config.template.ts"),
      `import { foo } from "@warpgogol/missing-package";`,
    );
    await writeFile(
      join(tempDir, "packages", "test-pkg", "package.json"),
      JSON.stringify({ name: "@warpgogol/test-pkg", version: "0.0.0" }),
    );

    const result = await runTemplateImportsValidate(
      makeInput({ "no-frozen-lockfile": true, "dry-run": true }),
      makeContext(tempDir),
    );

    expect(result.exitCode).toBe(0);
    expect(result.data?.missingFromRootDeps).toHaveLength(1);
  });
});
