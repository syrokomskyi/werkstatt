/*
<MODULE_CONTRACT>
<purpose>
RFC-0557: unit tests for workpiece.imports.validate. Tests import extraction
from .ts/.mjs/.astro files, symlink existence check, and --site flag handling.
</purpose>
<non-goals>
  <item>Does not test mission discovery — uses --workpiece-dir override.</item>
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
import { runWorkpieceImportsValidate } from "../workpiece-imports-validate.ts";

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

function makeInput(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { flags } as unknown as KernelCommandInput;
}

describe("runWorkpieceImportsValidate", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("errors when --site is not provided", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "workpiece-imports-"));
    const result = await runWorkpieceImportsValidate(makeInput(), makeContext(tempDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics).toHaveLength(1);
    expect(result.data?.diagnostics[0].ruleId).toBe("WORKPIECE-IMPORTS-01");
  });

  it("errors when workpiece directory does not exist", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "workpiece-imports-"));
    const result = await runWorkpieceImportsValidate(
      makeInput({ site: "test-site", "workpiece-dir": "nonexistent" }),
      makeContext(tempDir),
    );
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics).toHaveLength(1);
    expect(result.data?.diagnostics[0].ruleId).toBe("WORKPIECE-IMPORTS-01");
  });

  it("passes when workpiece has no workspace imports", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "workpiece-imports-"));
    const workpieceDir = join(tempDir, "missions", "m01", "workpiece");
    const toolsDir = join(workpieceDir, "tools");
    await mkdir(toolsDir, { recursive: true });
    await writeFile(
      join(toolsDir, "kernel.config.ts"),
      `import { readFile } from "node:fs/promises";\n`,
    );

    const result = await runWorkpieceImportsValidate(
      makeInput({ site: "test-site", "workpiece-dir": "missions/m01/workpiece" }),
      makeContext(tempDir),
    );

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.filesScanned).toBe(1);
    expect(result.data?.unresolved).toHaveLength(0);
  });

  it("detects unresolved imports from workpiece node_modules", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "workpiece-imports-"));
    const workpieceDir = join(tempDir, "missions", "m01", "workpiece");
    const srcDir = join(workpieceDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "index.ts"),
      [
        `import { foo } from "@warpgogol/site-kernel";`,
        `import { bar } from "@warpgogol/missing-package";`,
      ].join("\n"),
    );

    // Create node_modules with only @warpgogol/site-kernel
    const nodeModulesDir = join(workpieceDir, "node_modules", "@warpgogol");
    await mkdir(nodeModulesDir, { recursive: true });
    await mkdir(join(nodeModulesDir, "site-kernel"));
    await writeFile(
      join(nodeModulesDir, "site-kernel", "package.json"),
      '{"name":"@warpgogol/site-kernel"}',
    );

    const result = await runWorkpieceImportsValidate(
      makeInput({ site: "test-site", "workpiece-dir": "missions/m01/workpiece" }),
      makeContext(tempDir),
    );

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.unresolved).toHaveLength(1);
    expect(result.data?.unresolved[0].package).toBe("@warpgogol/missing-package");
  });

  it("passes when all imports resolve from workpiece node_modules", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "workpiece-imports-"));
    const workpieceDir = join(tempDir, "missions", "m01", "workpiece");
    const srcDir = join(workpieceDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "index.ts"),
      [
        `import { foo } from "@warpgogol/site-kernel";`,
        `const bar = await import("@warpgogol/werkstatt-site/share/fs");`,
      ].join("\n"),
    );

    // Create node_modules with both packages
    const wgDir = join(workpieceDir, "node_modules", "@warpgogol");
    await mkdir(wgDir, { recursive: true });
    await mkdir(join(wgDir, "site-kernel"));
    await writeFile(
      join(wgDir, "site-kernel", "package.json"),
      '{"name":"@warpgogol/site-kernel"}',
    );
    await mkdir(join(wgDir, "share"));
    await writeFile(join(wgDir, "share", "package.json"), '{"name":"@warpgogol/werkstatt-site/share"}');

    const result = await runWorkpieceImportsValidate(
      makeInput({ site: "test-site", "workpiece-dir": "missions/m01/workpiece" }),
      makeContext(tempDir),
    );

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.unresolved).toHaveLength(0);
    expect(result.data?.importsFound).toHaveLength(2);
  });

  it("scans .astro files in src/", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "workpiece-imports-"));
    const workpieceDir = join(tempDir, "missions", "m01", "workpiece");
    const srcDir = join(workpieceDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "page.astro"),
      `---\nimport { foo } from "@warpgogol/missing-package";\n---\n<div>test</div>`,
    );

    const result = await runWorkpieceImportsValidate(
      makeInput({ site: "test-site", "workpiece-dir": "missions/m01/workpiece" }),
      makeContext(tempDir),
    );

    expect(result.exitCode).toBe(1);
    expect(result.data?.unresolved).toHaveLength(1);
    expect(result.data?.unresolved[0].package).toBe("@warpgogol/missing-package");
  });
});
