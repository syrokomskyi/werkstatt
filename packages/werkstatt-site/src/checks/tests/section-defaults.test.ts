import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSectionDefaultsValidate } from "../section-defaults.ts";
import { makeTestContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for section.defaults.validate — scans shared UI
    source for app-specific asset/pageId fallback tokens and legacy
    fallback descriptions.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 3 fixture tests covering clean source, app-specific fallback detection, and legacy fallback detection.</item>
</CHANGE_SUMMARY>
*/

describe("section.defaults.validate", () => {
  let workspaceRoot: string;
  let sectionsDir: string;
  let componentsDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "sec-def-"));
    sectionsDir = join(workspaceRoot, "packages", "ui", "src", "sections");
    componentsDir = join(workspaceRoot, "packages", "ui", "src", "components");
    await mkdir(sectionsDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when no app-specific fallbacks in shared UI", async () => {
    await writeFile(join(sectionsDir, "hero.astro"), `<div>clean component</div>\n`);

    const result = await runSectionDefaultsValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
  });

  it("fails when hero-1 asset fallback is found", async () => {
    await writeFile(join(sectionsDir, "hero.astro"), `const image = props.image ?? "hero-1";\n`);

    const result = await runSectionDefaultsValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const diagnostics = result.data!.diagnostics as Array<{ ruleId: string }>;
    expect(diagnostics.some((d) => d.ruleId === "SECTION-DEFAULT-01")).toBe(true);
  });

  it("fails when donateContact pageId fallback is found", async () => {
    await writeFile(
      join(componentsDir, "cta.astro"),
      `const target = props.ctaTarget ?? "donateContact";\n`,
    );

    const result = await runSectionDefaultsValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const diagnostics = result.data!.diagnostics as Array<{ ruleId: string }>;
    expect(diagnostics.some((d) => d.ruleId === "SECTION-DEFAULT-02")).toBe(true);
  });
});
