/*
<MODULE_CONTRACT>
<purpose>Tests for godot.uid.validate (GODOT-10) — UID uniqueness in .tscn/.tres files.</purpose>
<keywords>tests, uid, validate, godot</keywords>
<non-goals>
  <item>Does not test res:// references — that is scene-reference-validate's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial tests for uid-validate — uniqueness, missing UIDs.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateUids } from "../checks/uid-validate.ts";

describe("godot.uid.validate", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "godot-uid-test-"));
    mkdirSync(join(projectRoot, "Scenes"), { recursive: true });
    mkdirSync(join(projectRoot, "Resources"), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes when all files have unique UIDs", async () => {
    writeFileSync(
      join(projectRoot, "Scenes", "Main.tscn"),
      `[gd_scene load_steps=1 format=3 uid="uid://abc123"]\n`,
    );
    writeFileSync(
      join(projectRoot, "Resources", "Config.tres"),
      `[gd_resource type="Resource" uid="uid://def456"]\n`,
    );

    const result = await validateUids(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when two files have the same UID", async () => {
    writeFileSync(
      join(projectRoot, "Scenes", "Main.tscn"),
      `[gd_scene load_steps=1 format=3 uid="uid://same123"]\n`,
    );
    writeFileSync(
      join(projectRoot, "Scenes", "Level2.tscn"),
      `[gd_scene load_steps=1 format=3 uid="uid://same123"]\n`,
    );

    const result = await validateUids(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("Duplicate UID");
  });

  it("fails when a file is missing UID", async () => {
    writeFileSync(
      join(projectRoot, "Scenes", "Main.tscn"),
      `[gd_scene load_steps=1 format=3]\n`,
    );

    const result = await validateUids(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("Missing uid://");
  });

  it("passes when no .tscn or .tres files exist", async () => {
    const result = await validateUids(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });
});
