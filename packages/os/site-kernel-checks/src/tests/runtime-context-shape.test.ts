import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRuntimeContextShape } from "../runtime-context-shape.ts";
import { makeTestSiteContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for runtime.context.shape — validates that
    RuntimeContext has exactly three fields and that workspace code
    does not construct contexts with non-null segment or non-empty flags.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 4 fixture tests covering clean src, forbidden segment, forbidden flags, and missing src dir.</item>
</CHANGE_SUMMARY>
*/

describe("runtime.context.shape", () => {
  let workspaceRoot: string;
  let appDir: string;
  let srcDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "rc-shape-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    srcDir = join(appDir, "src");
    await mkdir(srcDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when src has no forbidden RuntimeContext patterns", async () => {
    await writeFile(
      join(srcDir, "helper.ts"),
      `import { EMPTY_RUNTIME_CONTEXT } from "@gogol/share/runtime-context";\nexport const ctx = EMPTY_RUNTIME_CONTEXT("de");\n`,
    );

    const result = await runRuntimeContextShape(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("fails when a file has segment set to non-null", async () => {
    await writeFile(
      join(srcDir, "bad.ts"),
      `import type { RuntimeContext } from "@gogol/share/runtime-context";\nconst ctx: RuntimeContext = { locale: "de", segment: "eu", flags: {} };\n`,
    );

    const result = await runRuntimeContextShape(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
  });

  it("fails when a file has non-empty flags", async () => {
    await writeFile(
      join(srcDir, "bad.ts"),
      `import type { RuntimeContext } from "@gogol/share/runtime-context";\nconst ctx: RuntimeContext = { locale: "de", segment: null, flags: { feature: true } };\n`,
    );

    const result = await runRuntimeContextShape(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
  });

  it("passes when src dir does not exist", async () => {
    await rm(srcDir, { recursive: true, force: true });

    const result = await runRuntimeContextShape(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });
});
