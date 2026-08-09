import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runImportExtensionsLint } from "../import-extensions.ts";
import { makeTestContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for import.extensions.lint — enforces that relative
    imports under packages/ use .ts/.tsx extensions (RFC-0092).
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 5 fixture tests covering clean imports, .js violation, .jsx violation, extensionless violation, and dynamic import() violation.</item>
</CHANGE_SUMMARY>
*/

describe("import.extensions.lint", () => {
  let workspaceRoot: string;
  let pkgDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "imp-ext-"));
    pkgDir = join(workspaceRoot, "packages", "test-pkg", "src");
    await mkdir(pkgDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when all relative imports use .ts extension", async () => {
    await writeFile(
      join(pkgDir, "mod.ts"),
      `import { foo } from "./foo.ts";\nexport const bar = foo;\n`,
    );
    await writeFile(join(pkgDir, "foo.ts"), `export const foo = 1;\n`);

    const result = await runImportExtensionsLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
  });

  it("fails when a relative import uses .js extension", async () => {
    await writeFile(
      join(pkgDir, "mod.ts"),
      `import { foo } from "./foo.js";\nexport const bar = foo;\n`,
    );

    const result = await runImportExtensionsLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const data = result.data as { violations: string[]; total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.violations[0]).toContain(".js");
  });

  it("fails when a relative import is extensionless", async () => {
    await writeFile(
      join(pkgDir, "mod.ts"),
      `import { foo } from "./foo";\nexport const bar = foo;\n`,
    );

    const result = await runImportExtensionsLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const data = result.data as { violations: string[]; total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.violations[0]).toContain("extensionless");
  });

  it("passes for non-.ts file imports (.astro, .css, .json)", async () => {
    await writeFile(
      join(pkgDir, "mod.ts"),
      `import Foo from "./foo.astro";\nimport "./styles.css";\nimport data from "./data.json";\n`,
    );

    const result = await runImportExtensionsLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
  });

  it("fails when dynamic import() uses .js extension", async () => {
    await writeFile(
      join(pkgDir, "mod.ts"),
      `const mod = await import("./foo.js");\nexport { mod };\n`,
    );

    const result = await runImportExtensionsLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
  });
});
