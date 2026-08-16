import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateProjectConfig } from "../checks/project-config-validate.ts";

describe("validateProjectConfig", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "godot-config-test-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes when project.godot is not found", async () => {
    const result = await validateProjectConfig(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("passes when project.godot has no sensitive sections", async () => {
    writeFileSync(join(projectRoot, "project.godot"), '[application]\nconfig/name="Test"\n');

    const result = await validateProjectConfig(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("warns (non-blocking) when project.godot contains [autoload]", async () => {
    writeFileSync(
      join(projectRoot, "project.godot"),
      '[autoload]\nMain="*res://Scripts/Main.cs"\n',
    );

    const result = await validateProjectConfig(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("warn");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.ruleId).toBe("GODOT-04");
  });

  it("warns (non-blocking) when project.godot contains [input]", async () => {
    writeFileSync(
      join(projectRoot, "project.godot"),
      '[input]\nmove_left={"deadzone":0.5,"events":[]}\n',
    );

    const result = await validateProjectConfig(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("warn");
    expect(result.data?.violations).toHaveLength(1);
  });

  it("warns for multiple sensitive sections", async () => {
    writeFileSync(
      join(projectRoot, "project.godot"),
      '[autoload]\nMain="*res://Scripts/Main.cs"\n[input]\nmove_left={}\n[rendering]\nrenderer/rendering_method="forward_plus"\n',
    );

    const result = await validateProjectConfig(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("warn");
    expect(result.data?.violations).toHaveLength(3);
  });
});
