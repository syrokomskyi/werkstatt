import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIconReferencesValidate } from "../icon-references.ts";
import { makeTestSiteContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for icon.references.validate — covers RFC-0893:
    ICON-REF-01 (missing icon), ICON-REF-02 (empty icons/gen/),
    ICON-REF-03 (malformed config), pass cases for existing and no-icon content.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0893: Initial test suite for icon.references.validate.</item>
</CHANGE_SUMMARY>
*/

describe("icon.references.validate — RFC-0893", () => {
  let workspaceRoot: string;
  let appDir: string;
  let contentDir: string;
  let pagesDir: string;
  let genDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "icon-ref-test-"));
    appDir = join(workspaceRoot, "test-app");
    contentDir = join(appDir, "src", "content");
    pagesDir = join(contentDir, "pages");
    genDir = join(
      workspaceRoot,
      "packages",
      "werkstatt-site",
      "src",
      "domain",
      "ui",
      "icons",
      "gen",
    );
    await mkdir(pagesDir, { recursive: true });
    await mkdir(genDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  async function createIconFile(vendor: string, collection: string, fileName: string) {
    const dir = join(genDir, vendor, collection, fileName.charAt(0));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${fileName}.astro`), "---\n---\n<div>icon</div>\n");
  }

  async function writeContentMd(relativePath: string, frontmatter: string) {
    const filePath = join(contentDir, relativePath);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, `---\n${frontmatter}\n---\nBody\n`);
  }

  it("detects missing icon (ICON-REF-01)", async () => {
    await createIconFile("lordicon", "doodle-outline", "clock-time-hover-icon");
    await writeContentMd(
      "pages/test.md",
      "pageId: test\ntitle: Test\nicon:\n  vendor: lordicon\n  collection: doodle-outline\n  name: NonExistentIcon\n",
    );

    const result = await runIconReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const diag = (result.data as { diagnostics?: { message: string }[] }).diagnostics ?? [];
    expect(diag.some((d) => d.message.includes("ICON-REF-01"))).toBe(true);
  });

  it("passes when icon exists", async () => {
    await createIconFile("lordicon", "doodle-outline", "clock-time-hover-icon");
    await writeContentMd(
      "pages/test.md",
      "pageId: test\ntitle: Test\nicon:\n  vendor: lordicon\n  collection: doodle-outline\n  name: ClockTimeHover\n",
    );

    const result = await runIconReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("passes when no icon references found", async () => {
    await createIconFile("lordicon", "doodle-outline", "clock-time-hover-icon");
    await writeContentMd("pages/test.md", "pageId: test\ntitle: Test\n");

    const result = await runIconReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("detects malformed config (ICON-REF-03)", async () => {
    await createIconFile("lordicon", "doodle-outline", "clock-time-hover-icon");
    await writeContentMd(
      "pages/test.md",
      "pageId: test\ntitle: Test\nicon:\n  vendor: lordicon\n  collection: doodle-outline\n",
    );

    const result = await runIconReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const diag = (result.data as { diagnostics?: { message: string }[] }).diagnostics ?? [];
    expect(diag.some((d) => d.message.includes("ICON-REF-03"))).toBe(true);
  });

  it("emits ICON-REF-02 warning when icons/gen/ is empty", async () => {
    await writeContentMd(
      "pages/test.md",
      "pageId: test\ntitle: Test\nicon:\n  vendor: lordicon\n  collection: doodle-outline\n  name: ClockTimeHover\n",
    );

    const result = await runIconReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("does not flag objects with name field but no vendor as ICON-REF-03", async () => {
    await createIconFile("lordicon", "doodle-outline", "clock-time-hover-icon");
    await writeContentMd(
      "pages/test.md",
      "pageId: test\ntitle: Test\nparties:\n  - name: Sveta Svega Kim\n    kind: Person\n    role: creator\n  - name: VEO\n    kind: AIPlatform\n    role: aiPlatform\n",
    );

    const result = await runIconReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const diag = (result.data as { diagnostics?: { message: string }[] }).diagnostics ?? [];
    expect(diag.some((d) => d.message.includes("ICON-REF-03"))).toBe(false);
  });
});
