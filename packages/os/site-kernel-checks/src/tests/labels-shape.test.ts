import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLabelsShapeHint } from "../labels-shape.ts";
import { makeTestSiteContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for labels.shape.hint — soft warnings on label
    lengths (RFC-0095) and hard errors on header/footer navIds mismatches
    across localized site labels.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 4 fixture tests covering clean labels, soft length hints, navIds mismatch, and missing site dir.</item>
</CHANGE_SUMMARY>
*/

describe("labels.shape.hint", () => {
  let workspaceRoot: string;
  let appDir: string;
  let siteDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "labels-shape-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    siteDir = join(appDir, "src", "content", "site");
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when no site/ directory exists", async () => {
    const result = await runLabelsShapeHint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("emits soft hints when brandLabel exceeds limit", async () => {
    await mkdir(join(siteDir, "de"), { recursive: true });
    const longLabel = "A".repeat(30);
    await writeFile(
      join(siteDir, "de", "labels.md"),
      `---\nbrandLabel: ${longLabel}\n---\n# Labels\n`,
    );

    const result = await runLabelsShapeHint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const hints = (result.data as { hints?: string[] }).hints;
    expect(hints).toBeDefined();
    expect(hints!.length).toBeGreaterThanOrEqual(1);
  });

  it("fails when localized header.navIds differ from default", async () => {
    await mkdir(join(siteDir, "de"), { recursive: true });
    await mkdir(join(siteDir, "en"), { recursive: true });
    await writeFile(
      join(appDir, "src", "content", "system.md"),
      "---\ni18n:\n  default: de\n---\n# System\n",
    );
    await writeFile(
      join(siteDir, "de", "labels.md"),
      "---\nheader:\n  navIds:\n    - home\n    - about\n---\n# DE\n",
    );
    await writeFile(
      join(siteDir, "en", "labels.md"),
      "---\nheader:\n  navIds:\n    - home\n    - contact\n---\n# EN\n",
    );

    const result = await runLabelsShapeHint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const errors = (result.data as { errors?: string[] }).errors;
    expect(errors).toBeDefined();
    expect(errors!.length).toBeGreaterThanOrEqual(1);
  });

  it("passes when all localized navIds match default", async () => {
    await mkdir(join(siteDir, "de"), { recursive: true });
    await mkdir(join(siteDir, "en"), { recursive: true });
    await writeFile(
      join(appDir, "src", "content", "system.md"),
      "---\ni18n:\n  default: de\n---\n# System\n",
    );
    await writeFile(
      join(siteDir, "de", "labels.md"),
      "---\nheader:\n  navIds:\n    - home\n    - about\n---\n# DE\n",
    );
    await writeFile(
      join(siteDir, "en", "labels.md"),
      "---\nheader:\n  navIds:\n    - home\n    - about\n---\n# EN\n",
    );

    const result = await runLabelsShapeHint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });
});
