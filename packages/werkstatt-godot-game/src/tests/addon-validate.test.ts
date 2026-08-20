/*
<MODULE_CONTRACT>
<purpose>Tests for godot.addon.validate (GODOT-12) — addon structure and NuGet deps.</purpose>
<keywords>tests, addon, validate, godot</keywords>
<non-goals>
  <item>Does not test NuGet validation generally — that is nuget-validate's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial tests for addon-validate — plugin.cfg, enabled status, missing NuGet deps.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateAddons } from "../checks/addon-validate.ts";

describe("godot.addon.validate", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "godot-addon-test-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes when no addons/ directory exists", async () => {
    const result = await validateAddons(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.addons).toHaveLength(0);
  });

  it("passes when addon has valid plugin.cfg and is enabled", async () => {
    mkdirSync(join(projectRoot, "addons", "my-addon"), { recursive: true });
    writeFileSync(
      join(projectRoot, "addons", "my-addon", "plugin.cfg"),
      `[plugin]\nname="My Addon"\nauthor="Test"\nversion="1.0"\ndescription="A test addon"\n`,
    );
    writeFileSync(
      join(projectRoot, "project.godot"),
      `[editor_plugins]\nenabled=PackedStringArray("res://addons/my-addon")\n`,
    );

    const result = await validateAddons(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.addons).toHaveLength(1);
    expect(result.data?.addons[0]?.name).toBe("my-addon");
    expect(result.data?.addons[0]?.enabled).toBe(true);
  });

  it("fails when addon is missing plugin.cfg", async () => {
    mkdirSync(join(projectRoot, "addons", "bad-addon"), { recursive: true });
    writeFileSync(
      join(projectRoot, "project.godot"),
      `[editor_plugins]\nenabled=PackedStringArray("res://addons/bad-addon")\n`,
    );

    const result = await validateAddons(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("missing plugin.cfg");
  });

  it("fails when plugin.cfg is missing required fields", async () => {
    mkdirSync(join(projectRoot, "addons", "incomplete"), { recursive: true });
    writeFileSync(
      join(projectRoot, "addons", "incomplete", "plugin.cfg"),
      `[plugin]\nname="Incomplete"\n`,
    );
    writeFileSync(
      join(projectRoot, "project.godot"),
      `[editor_plugins]\nenabled=PackedStringArray("res://addons/incomplete")\n`,
    );

    const result = await validateAddons(projectRoot);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.data?.violations[0]?.message).toContain("required field");
  });

  it("fails when C# addon has NuGet deps not in Game.csproj", async () => {
    mkdirSync(join(projectRoot, "addons", "cs-addon"), { recursive: true });
    writeFileSync(
      join(projectRoot, "addons", "cs-addon", "plugin.cfg"),
      `[plugin]\nname="CS Addon"\nauthor="Test"\nversion="1.0"\ndescription="A C# addon"\n`,
    );
    writeFileSync(
      join(projectRoot, "addons", "cs-addon", "cs-addon.csproj"),
      `<Project Sdk="Godot.NET.Sdk">\n  <ItemGroup>\n    <PackageReference Include="SomePackage" Version="1.0.0" />\n  </ItemGroup>\n</Project>`,
    );
    writeFileSync(
      join(projectRoot, "project.godot"),
      `[editor_plugins]\nenabled=PackedStringArray("res://addons/cs-addon")\n`,
    );
    writeFileSync(
      join(projectRoot, "Game.csproj"),
      `<Project Sdk="Godot.NET.Sdk">\n</Project>`,
    );

    const result = await validateAddons(projectRoot);
    expect(result.exitCode).toBe(1);
    const nugetViolation = result.data?.violations.find((v) =>
      v.message.includes("SomePackage"),
    );
    expect(nugetViolation).toBeDefined();
  });

  it("passes when C# addon NuGet deps are declared in Game.csproj", async () => {
    mkdirSync(join(projectRoot, "addons", "cs-addon"), { recursive: true });
    writeFileSync(
      join(projectRoot, "addons", "cs-addon", "plugin.cfg"),
      `[plugin]\nname="CS Addon"\nauthor="Test"\nversion="1.0"\ndescription="A C# addon"\n`,
    );
    writeFileSync(
      join(projectRoot, "addons", "cs-addon", "cs-addon.csproj"),
      `<Project Sdk="Godot.NET.Sdk">\n  <ItemGroup>\n    <PackageReference Include="SharedPackage" Version="1.0.0" />\n  </ItemGroup>\n</Project>`,
    );
    writeFileSync(
      join(projectRoot, "project.godot"),
      `[editor_plugins]\nenabled=PackedStringArray("res://addons/cs-addon")\n`,
    );
    writeFileSync(
      join(projectRoot, "Game.csproj"),
      `<Project Sdk="Godot.NET.Sdk">\n  <ItemGroup>\n    <PackageReference Include="SharedPackage" Version="1.0.0" />\n  </ItemGroup>\n</Project>`,
    );

    const result = await validateAddons(projectRoot);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });
});
