/*
<MODULE_CONTRACT>
<purpose>Godot project scaffold hook — generates a new Godot 4.x + C# project with scene/script boilerplate.</purpose>
<keywords>scaffold, onboarding, godot, csharp</keywords>
<responsibilities>
  <item>Creates Scenes/Main.tscn with a minimal main scene.</item>
  <item>Creates Scripts/Main.cs with a minimal Node2D script.</item>
  <item>Creates project.godot with .NET enabled.</item>
  <item>Creates Game.csproj for the .NET project.</item>
  <item>Creates .gitignore with .godot/, bin/, obj/ entries.</item>
</responsibilities>
<non-goals>
  <item>Does not install dependencies — the consumer runs dotnet restore after scaffold.</item>
  <item>Does not create game content — games are projects, not plugin content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot project scaffold — Main scene, Main script, project.godot, Game.csproj, .gitignore.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

const PROJECT_GODOT = `; Engine configuration file.
; It's best edited using the editor UI and not directly,
; since the parameters that go here are not all obvious.
config_version=5

[application]
config/name="__PROJECT_NAME__"
run/main_scene="res://Scenes/Main.tscn"
config/features=PackedStringArray("4.3", "C#", "Forward Plus")
config/icon="res://icon.svg"

[dotnet]
project/assembly_name="__PROJECT_NAME__"
`;

const GAME_CSPROJ = `<Project Sdk="Godot.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <TargetFramework Condition="'$(OS)' == 'Windows_NT'">net8.0-windows</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
`;

const MAIN_TSCN = `[gd_scene load_steps=1 format=3 uid="uid://main_scene"]

[ext_resource type="Script" path="res://Scripts/Main.cs" id="1_script"]

[node name="Main" type="Node2D"]
script = ExtResource("1_script")
`;

const MAIN_CS = `using Godot;

public partial class Main : Node2D
{
    public override void _Ready()
    {
        GD.Print("__PROJECT_NAME__ ready");
    }
}
`;

const GITIGNORE = `.godot/
bin/
obj/
*.user
*.csproj.user
`;

export async function scaffoldGodotProject(ctx: PluginHookContext): Promise<HookResult> {
  const projectPath = ctx.workpiecePath ?? ctx.workspaceRoot;
  const projectId = (ctx as PluginHookContext & { projectId?: string }).projectId ?? "my-godot-game";
  const safeName = projectId.replace(/[^a-zA-Z0-9_]/g, "_");

  ctx.logger.info(`scaffold-project: creating Godot project at ${projectPath}`);

  try {
    await mkdir(join(projectPath, "Scenes"), { recursive: true });
    await mkdir(join(projectPath, "Scripts"), { recursive: true });
    await mkdir(join(projectPath, "Resources"), { recursive: true });
    await mkdir(join(projectPath, "Assets"), { recursive: true });

    await writeFile(join(projectPath, "project.godot"), PROJECT_GODOT.replace(/__PROJECT_NAME__/g, projectId));
    await writeFile(join(projectPath, "Game.csproj"), GAME_CSPROJ);
    await writeFile(join(projectPath, "Scenes", "Main.tscn"), MAIN_TSCN);
    await writeFile(join(projectPath, "Scripts", "Main.cs"), MAIN_CS.replace(/__PROJECT_NAME__/g, safeName));
    await writeFile(join(projectPath, ".gitignore"), GITIGNORE);

    ctx.logger.info("scaffold-project: project created successfully");
    return {
      success: true,
      data: {
        projectPath,
        filesCreated: [
          "project.godot",
          "Game.csproj",
          "Scenes/Main.tscn",
          "Scripts/Main.cs",
          ".gitignore",
        ],
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("scaffold-project: failed", { error: message });
    return {
      success: false,
      errors: [`scaffoldProject failed: ${message}`],
    };
  }
}
