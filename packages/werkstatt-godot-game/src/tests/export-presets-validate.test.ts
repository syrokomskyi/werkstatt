/*
<MODULE_CONTRACT>
<purpose>Unit tests for export-presets-validate.ts (GODOT-09).</purpose>
<keywords>tests, export, presets, validator, godot</keywords>
<non-goals>
  <item>Does not test the build hook or deploy adapter — only the validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial tests for export presets validator — covers Godot 4.x [preset.N] format, missing file, empty/absolute paths, unknown platform, multiple presets.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateExportPresets } from "../checks/export-presets-validate.ts";

describe("godot.export.presets.validate", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "godot-export-test-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("passes when no export_presets.cfg exists (skipping)", async () => {
    const result = await validateExportPresets(projectRoot);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("passes with valid Godot 4.x [preset.0] format", async () => {
    await writeFile(
      join(projectRoot, "export_presets.cfg"),
      [
        "[preset.0]",
        'name="Web"',
        'platform="Web"',
        "runnable=true",
        'export_path="bin/web/index.html"',
        "",
        "[preset.0.options]",
        "html/export_icon=true",
        "",
      ].join("\n"),
    );
    const result = await validateExportPresets(projectRoot);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("fails when no preset sections exist", async () => {
    await writeFile(join(projectRoot, "export_presets.cfg"), 'name="test"\n');
    const result = await validateExportPresets(projectRoot);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations[0]?.ruleId).toBe("GODOT-09");
    expect(result.data?.violations[0]?.message).toContain("no preset sections");
  });

  it("fails when preset has empty export_path", async () => {
    await writeFile(
      join(projectRoot, "export_presets.cfg"),
      ["[preset.0]", 'name="Web"', 'platform="Web"', 'export_path=""', ""].join("\n"),
    );
    const result = await validateExportPresets(projectRoot);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations.some((v) => v.message.includes("none are complete"))).toBe(true);
  });

  it("fails when preset uses absolute export path", async () => {
    await writeFile(
      join(projectRoot, "export_presets.cfg"),
      [
        "[preset.0]",
        'name="Web"',
        'platform="Web"',
        'export_path="/absolute/path/game.html"',
        "",
      ].join("\n"),
    );
    const result = await validateExportPresets(projectRoot);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations.some((v) => v.message.includes("absolute path"))).toBe(true);
  });

  it("fails when preset uses unknown platform", async () => {
    await writeFile(
      join(projectRoot, "export_presets.cfg"),
      [
        "[preset.0]",
        'name="Custom"',
        'platform="CustomPlatform"',
        'export_path="bin/game.html"',
        "",
      ].join("\n"),
    );
    const result = await validateExportPresets(projectRoot);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations.some((v) => v.message.includes("unknown platform"))).toBe(true);
  });

  it("passes with multiple valid presets", async () => {
    await writeFile(
      join(projectRoot, "export_presets.cfg"),
      [
        "[preset.0]",
        'name="Web"',
        'platform="Web"',
        'export_path="bin/web/index.html"',
        "",
        "[preset.1]",
        'name="Linux"',
        'platform="Linux/X11"',
        'export_path="bin/linux/game.x86_64"',
        "",
      ].join("\n"),
    );
    const result = await validateExportPresets(projectRoot);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });
});
