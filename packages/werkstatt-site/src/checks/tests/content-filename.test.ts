import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runContentFilenameValidate } from "../content-filename.ts";
import { makeTestSiteContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for content.filename.validate — verifies that page
    content filenames match the pageId-to-slug convention (RFC-0090).
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 4 fixture tests covering matching filenames, mismatch detection, missing pageId, and redirect skip.</item>
</CHANGE_SUMMARY>
*/

describe("content.filename.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let pagesDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "content-fn-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    pagesDir = join(appDir, "src", "content", "pages");
    await mkdir(join(pagesDir, "de"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when filename matches pageId slug", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      "---\npageId: home\ntitle: Home\n---\n# Home\n",
    );

    const result = await runContentFilenameValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("fails when filename does not match pageId slug", async () => {
    await writeFile(
      join(pagesDir, "de", "wrong-name.md"),
      "---\npageId: about-us\ntitle: About\n---\n# About\n",
    );

    const result = await runContentFilenameValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
  });

  it("fails when pageId is missing from frontmatter", async () => {
    await writeFile(join(pagesDir, "de", "home.md"), "---\ntitle: Home\n---\n# Home\n");

    const result = await runContentFilenameValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
  });

  it("skips redirect pages (kind: redirect)", async () => {
    await writeFile(
      join(pagesDir, "de", "root-redirect.md"),
      "---\nkind: redirect\ntitle: Redirect\n---\n# Redirect\n",
    );

    const result = await runContentFilenameValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });
});
