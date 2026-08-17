/*
<MODULE_CONTRACT>
<purpose>Unit tests for resource-validate.ts (GODOT-07).</purpose>
<keywords>tests, resource, validator, godot</keywords>
<non-goals>
  <item>Do not test external dependencies — only test validator logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial tests for resource validator — passing, failing, and edge cases.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { validateResources } from "../checks/resource-validate.ts";
import { tmpdir } from "node:os";

describe("validateResources", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "tmp-resource-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes when no .tres files exist", async () => {
    const result = await validateResources(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("passes when .tres files are in Resources/ with valid references", async () => {
    mkdirSync(join(tmpDir, "Resources"), { recursive: true });
    mkdirSync(join(tmpDir, "Assets"), { recursive: true });
    writeFileSync(join(tmpDir, "Assets", "sprite.png"), "");
    writeFileSync(
      join(tmpDir, "Resources", "Player.tres"),
      `[ext_resource type="Texture2D" path="res://Assets/sprite.png" id="1"]`,
    );

    const result = await validateResources(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when .tres file is outside Resources/", async () => {
    mkdirSync(join(tmpDir, "Scenes"), { recursive: true });
    writeFileSync(join(tmpDir, "Scenes", "Bad.tres"), "");

    const result = await validateResources(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.ruleId).toBe("GODOT-07");
    expect(result.data?.violations[0]?.message).toContain("Resources/");
  });

  it("fails when .tres references nonexistent file", async () => {
    mkdirSync(join(tmpDir, "Resources"), { recursive: true });
    writeFileSync(
      join(tmpDir, "Resources", "Player.tres"),
      `[ext_resource type="Texture2D" path="res://Assets/missing.png" id="1"]`,
    );

    const result = await validateResources(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("res://Assets/missing.png");
  });

  it("fails for both misplaced and broken reference", async () => {
    mkdirSync(join(tmpDir, "Scenes"), { recursive: true });
    writeFileSync(
      join(tmpDir, "Scenes", "Bad.tres"),
      `[ext_resource type="Texture2D" path="res://Assets/missing.png" id="1"]`,
    );

    const result = await validateResources(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(2);
  });
});
