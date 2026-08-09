import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSectionPlaceholderLint } from "../section-placeholder.ts";
import { makeTestContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for section.placeholder.lint — fails any section
    component that still renders JSON.stringify(pageOverride) scaffold stubs.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 3 fixture tests covering clean sections, stub detection, and missing sections dir.</item>
</CHANGE_SUMMARY>
*/

describe("section.placeholder.lint", () => {
  let workspaceRoot: string;
  let sectionsDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "sec-place-"));
    sectionsDir = join(workspaceRoot, "packages", "ui", "src", "sections");
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when no sections directory exists", async () => {
    const result = await runSectionPlaceholderLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
  });

  it("passes when sections render real content (no stubs)", async () => {
    await mkdir(join(sectionsDir, "hero"), { recursive: true });
    await writeFile(join(sectionsDir, "hero", "hero.astro"), `<div>{props.heading}</div>\n`);

    const result = await runSectionPlaceholderLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
  });

  it("fails when a section contains JSON.stringify(pageOverride) stub", async () => {
    await mkdir(join(sectionsDir, "cta"), { recursive: true });
    await writeFile(
      join(sectionsDir, "cta", "cta.astro"),
      `<div>{JSON.stringify(pageOverride)}</div>\n`,
    );

    const result = await runSectionPlaceholderLint(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const data = result.data as { violations: string[]; total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.violations[0]).toContain("JSON.stringify");
  });
});
