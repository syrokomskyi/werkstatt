import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateSceneStructure } from "../checks/scene-validate.ts";

describe("validateSceneStructure", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "godot-scene-test-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes when .tscn files are in Scenes/ and .cs files are in Scripts/", async () => {
    mkdirSync(join(projectRoot, "Scenes"), { recursive: true });
    mkdirSync(join(projectRoot, "Scripts"), { recursive: true });
    writeFileSync(join(projectRoot, "Scenes", "Main.tscn"), "[gd_scene]");
    writeFileSync(join(projectRoot, "Scripts", "Main.cs"), "public class Main {}");

    const result = await validateSceneStructure(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("fails when a .tscn file is outside Scenes/", async () => {
    mkdirSync(join(projectRoot, "Scenes"), { recursive: true });
    mkdirSync(join(projectRoot, "Assets"), { recursive: true });
    writeFileSync(join(projectRoot, "Scenes", "Main.tscn"), "[gd_scene]");
    writeFileSync(join(projectRoot, "Assets", "Bad.tscn"), "[gd_scene]");

    const result = await validateSceneStructure(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.file).toBe("Assets/Bad.tscn");
  });

  it("fails when a .cs file is outside Scripts/", async () => {
    mkdirSync(join(projectRoot, "Scripts"), { recursive: true });
    mkdirSync(join(projectRoot, "Scenes"), { recursive: true });
    writeFileSync(join(projectRoot, "Scripts", "Main.cs"), "public class Main {}");
    writeFileSync(join(projectRoot, "Scenes", "Bad.cs"), "public class Bad {}");

    const result = await validateSceneStructure(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.file).toBe("Scenes/Bad.cs");
  });

  it("skips bin/, obj/, .godot/ directories", async () => {
    mkdirSync(join(projectRoot, "Scenes"), { recursive: true });
    mkdirSync(join(projectRoot, "Scripts"), { recursive: true });
    mkdirSync(join(projectRoot, "bin", "Debug"), { recursive: true });
    mkdirSync(join(projectRoot, "obj"), { recursive: true });
    writeFileSync(join(projectRoot, "Scenes", "Main.tscn"), "[gd_scene]");
    writeFileSync(join(projectRoot, "Scripts", "Main.cs"), "public class Main {}");
    writeFileSync(join(projectRoot, "bin", "Debug", "Generated.cs"), "// generated");

    const result = await validateSceneStructure(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("passes when project has no .tscn or .cs files", async () => {
    const result = await validateSceneStructure(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });
});
