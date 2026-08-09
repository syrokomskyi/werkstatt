import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runScriptsPlacementValidation } from "../scripts-placement.ts";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for scripts.placement.validate — validates script
    placement rules in Astro files per RFC-0011 and RFC-0031.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 4 fixture tests covering clean layout, SP-01 global script load, SP-02 oversized inline block, and SP-07 misnamed client.ts.</item>
</CHANGE_SUMMARY>
*/

describe("scripts.placement.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let srcDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "scripts-place-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    srcDir = join(appDir, "src");
    await mkdir(join(srcDir, "layouts"), { recursive: true });
    await mkdir(join(srcDir, "components"), { recursive: true });
    await mkdir(join(srcDir, "pages"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when layout has no script violations", async () => {
    await writeFile(
      join(srcDir, "layouts", "layout.astro"),
      `<html><body><slot /></body></html>\n`,
    );

    const result = await runScriptsPlacementValidation(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("fails with SP-01 when layout loads component script globally", async () => {
    await writeFile(
      join(srcDir, "layouts", "layout.astro"),
      `<html><body><script is:inline src="/scripts/components/foo/bar.js"></script><slot /></body></html>\n`,
    );

    const result = await runScriptsPlacementValidation(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(unwrapData(result).errors).toBeGreaterThanOrEqual(1);
  });

  it("fails with SP-02 when layout has oversized bare is:inline block", async () => {
    const lines = Array.from({ length: 8 }, (_, i) => `console.log(${i});`).join("\n");
    await writeFile(
      join(srcDir, "layouts", "layout.astro"),
      `<html><body><script is:inline>\n${lines}\n</script><slot /></body></html>\n`,
    );

    const result = await runScriptsPlacementValidation(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(unwrapData(result).errors).toBeGreaterThanOrEqual(1);
  });

  it("fails with SP-07 when client.ts filename does not match parent dir", async () => {
    await mkdir(join(srcDir, "content", "feature"), { recursive: true });
    await writeFile(
      join(srcDir, "content", "feature", "wrong-name.client.ts"),
      `export default function() {}\n`,
    );

    const result = await runScriptsPlacementValidation(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(unwrapData(result).errors).toBe(1);
  });
});
