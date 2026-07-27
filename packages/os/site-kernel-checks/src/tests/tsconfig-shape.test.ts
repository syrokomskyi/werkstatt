import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTsconfigShapeLint } from "../tsconfig-shape.ts";
import { makeTestContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for tsconfig.shape.lint — validates shared tsconfig
    invariants: allowImportingTsExtensions on base, rewriteRelativeImportExtensions
    on node-lib, and no package sets allowImportingTsExtensions: false (RFC-0092).
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 4 fixture tests covering valid config, missing base flag, missing node-lib flag, and explicit false override.</item>
</CHANGE_SUMMARY>
*/

describe("tsconfig.shape.lint", () => {
  let workspaceRoot: string;
  let tsconfigDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "tsconfig-shape-"));
    tsconfigDir = join(workspaceRoot, "tsconfig");
    await mkdir(tsconfigDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when base and node-lib have correct flags", async () => {
    await writeFile(
      join(tsconfigDir, "base.json"),
      JSON.stringify({ compilerOptions: { allowImportingTsExtensions: true } }),
    );
    await writeFile(
      join(tsconfigDir, "node-lib.json"),
      JSON.stringify({ compilerOptions: { rewriteRelativeImportExtensions: true } }),
    );

    const result = await runTsconfigShapeLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
  });

  it("fails when base.json lacks allowImportingTsExtensions", async () => {
    await writeFile(join(tsconfigDir, "base.json"), JSON.stringify({ compilerOptions: {} }));
    await writeFile(
      join(tsconfigDir, "node-lib.json"),
      JSON.stringify({ compilerOptions: { rewriteRelativeImportExtensions: true } }),
    );

    const result = await runTsconfigShapeLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const data = result.data as { violations: string[] };
    expect(data.violations.some((v) => v.includes("allowImportingTsExtensions"))).toBe(true);
  });

  it("fails when node-lib.json lacks rewriteRelativeImportExtensions", async () => {
    await writeFile(
      join(tsconfigDir, "base.json"),
      JSON.stringify({ compilerOptions: { allowImportingTsExtensions: true } }),
    );
    await writeFile(join(tsconfigDir, "node-lib.json"), JSON.stringify({ compilerOptions: {} }));

    const result = await runTsconfigShapeLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const data = result.data as { violations: string[] };
    expect(data.violations.some((v) => v.includes("rewriteRelativeImportExtensions"))).toBe(true);
  });

  it("fails when a package tsconfig explicitly sets allowImportingTsExtensions: false", async () => {
    await writeFile(
      join(tsconfigDir, "base.json"),
      JSON.stringify({ compilerOptions: { allowImportingTsExtensions: true } }),
    );
    await writeFile(
      join(tsconfigDir, "node-lib.json"),
      JSON.stringify({ compilerOptions: { rewriteRelativeImportExtensions: true } }),
    );
    const pkgTsconfigDir = join(workspaceRoot, "packages", "test-pkg");
    await mkdir(pkgTsconfigDir, { recursive: true });
    await writeFile(
      join(pkgTsconfigDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { allowImportingTsExtensions: false } }),
    );

    const result = await runTsconfigShapeLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const data = result.data as { violations: string[] };
    expect(data.violations.some((v) => v.includes("explicitly false"))).toBe(true);
  });
});
