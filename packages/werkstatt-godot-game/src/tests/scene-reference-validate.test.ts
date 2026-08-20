/*
<MODULE_CONTRACT>
<purpose>Unit tests for scene-reference-validate.ts (GODOT-05).</purpose>
<keywords>tests, scene, reference, validator, godot</keywords>
<non-goals>
  <item>Do not test external dependencies — only test validator logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial tests for scene reference validator — passing and failing cases.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { validateSceneReferences } from "../checks/scene-reference-validate.ts";
import { tmpdir } from "node:os";

describe("validateSceneReferences", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "tmp-scene-ref-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes when no .tscn files exist", async () => {
    const result = await validateSceneReferences(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("passes when all res:// references exist", async () => {
    mkdirSync(join(tmpDir, "Scenes"), { recursive: true });
    mkdirSync(join(tmpDir, "Scripts"), { recursive: true });
    writeFileSync(join(tmpDir, "Scripts", "Main.cs"), "");
    writeFileSync(
      join(tmpDir, "Scenes", "Main.tscn"),
      `[ext_resource type="Script" path="res://Scripts/Main.cs" id="1_script"]`,
    );

    const result = await validateSceneReferences(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when res:// reference points to nonexistent file", async () => {
    mkdirSync(join(tmpDir, "Scenes"), { recursive: true });
    writeFileSync(
      join(tmpDir, "Scenes", "Main.tscn"),
      `[ext_resource type="Script" path="res://Scripts/Missing.cs" id="1_script"]`,
    );

    const result = await validateSceneReferences(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.ruleId).toBe("GODOT-05");
    expect(result.data?.violations[0]?.reference).toBe("res://Scripts/Missing.cs");
  });

  it("passes with multiple valid references", async () => {
    mkdirSync(join(tmpDir, "Scenes"), { recursive: true });
    mkdirSync(join(tmpDir, "Scripts"), { recursive: true });
    mkdirSync(join(tmpDir, "Scenes", "Levels"), { recursive: true });
    writeFileSync(join(tmpDir, "Scripts", "Player.cs"), "");
    writeFileSync(join(tmpDir, "Scenes", "Level1.tscn"), "");
    writeFileSync(
      join(tmpDir, "Scenes", "Main.tscn"),
      `[ext_resource type="Script" path="res://Scripts/Player.cs" id="1"]\n[ext_resource type="PackedScene" path="res://Scenes/Level1.tscn" id="2"]`,
    );

    const result = await validateSceneReferences(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });
});
