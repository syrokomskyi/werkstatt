import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCssImportantLint } from "../css-important-lint.ts";
import { makeTestSiteContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for css.important.lint — scans .css files under
    src/styles/ for forbidden !important declarations.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 4 fixture tests covering clean CSS, !important detection, and missing styles dir.</item>
</CHANGE_SUMMARY>
*/

describe("css.important.lint", () => {
  let workspaceRoot: string;
  let appDir: string;
  let stylesDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "css-imp-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    stylesDir = join(appDir, "src", "styles");
    await mkdir(stylesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when no !important in CSS files", async () => {
    await writeFile(join(stylesDir, "global.css"), ".foo { color: red; }\n");

    const result = await runCssImportantLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("fails when !important is found", async () => {
    await writeFile(join(stylesDir, "global.css"), ".foo { color: red !important; }\n");

    const result = await runCssImportantLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(result.data!.violations).toBeGreaterThanOrEqual(1);
  });

  it("detects multiple !important declarations", async () => {
    await writeFile(
      join(stylesDir, "global.css"),
      ".a { color: red !important; }\n.b { margin: 0 !important; }\n",
    );

    const result = await runCssImportantLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    expect(result.data!.violations).toBeGreaterThanOrEqual(2);
  });

  it("passes when styles dir does not exist", async () => {
    await rm(stylesDir, { recursive: true, force: true });

    const result = await runCssImportantLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });
});
