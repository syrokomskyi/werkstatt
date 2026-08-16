/*
<MODULE_CONTRACT>
<purpose>Tests for godot.script.validate (GODOT-08) — C# script conventions.</purpose>
<keywords>tests, script, validate, godot</keywords>
<non-goals>
  <item>Does not test dotnet build — only the validator's convention checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial tests for script-validate — class name match, partial, using Godot.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateScripts } from "../checks/script-validate.ts";

describe("godot.script.validate", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "godot-script-test-"));
    mkdirSync(join(projectRoot, "Scripts"), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes when all conventions are followed", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "Player.cs"),
      `using Godot;

public partial class Player : CharacterBody2D
{
    public override void _Ready() { }
}
`,
    );

    const result = await validateScripts(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when class name does not match file name", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "Player.cs"),
      `using Godot;

public partial class Entity : Node2D
{
}
`,
    );

    const result = await validateScripts(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("Entity");
    expect(result.data?.violations[0]?.message).toContain("Player");
  });

  it("fails when using Godot is missing", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "Enemy.cs"),
      `public partial class Enemy : Node2D
{
}
`,
    );

    const result = await validateScripts(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("using Godot");
  });

  it("fails when partial is missing on Node subclass", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "GameManager.cs"),
      `using Godot;

public class GameManager : Node
{
}
`,
    );

    const result = await validateScripts(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("partial");
  });

  it("passes for non-Node classes without partial", async () => {
    writeFileSync(
      join(projectRoot, "Scripts", "MathHelper.cs"),
      `using Godot;

public class MathHelper
{
    public static int Add(int a, int b) => a + b;
}
`,
    );

    const result = await validateScripts(projectRoot);
    expect(result.exitCode).toBe(0);
  });
});
