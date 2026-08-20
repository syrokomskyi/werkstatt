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
  <item>Creates icon.svg referenced by project.godot.</item>
  <item>Creates .editorconfig for C# style enforcement.</item>
</responsibilities>
<non-goals>
  <item>Does not install dependencies — the consumer runs dotnet restore after scaffold.</item>
  <item>Does not create game content — games are projects, not plugin content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot project scaffold — Main scene, Main script, project.godot, Game.csproj, .gitignore.</item>
  <item>Fix: use writeFileIfChanged instead of raw writeFile to avoid git churn on regeneration.</item>
  <item>Enhancement: add icon.svg (referenced by project.godot) and .editorconfig for C# style enforcement.</item>
</CHANGE_SUMMARY>
*/

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
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

const GAME_CSPROJ = `<Project Sdk="Godot.NET.Sdk" />
`;

const DIRECTORY_BUILD_PROPS = `<Project>
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <TargetFramework Condition="'$(OS)' == 'Windows_NT'">net8.0-windows</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
`;

const GLOBAL_JSON = `{
  "sdk": {
    "version": "8.0.100",
    "rollForward": "latestFeature"
  }
}
`;

const GAME_SLN = `Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "__PROJECT_NAME__", "Game.csproj", "{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"
EndProject
Global
	GlobalSection(SolutionConfigurationPlatforms) = preSolution
		Debug|Any CPU = Debug|Any CPU
		Release|Any CPU = Release|Any CPU
	EndGlobalSection
	GlobalSection(ProjectConfigurationPlatforms) = postSolution
		{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}.Debug|Any CPU.Build.0 = Debug|Any CPU
		{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}.Release|Any CPU.ActiveCfg = Release|Any CPU
		{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}.Release|Any CPU.Build.0 = Release|Any CPU
	EndGlobalSection
EndGlobal
`;

const EXPORT_PRESETS = `[preset.0]

name="Web"
platform="Web"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="bin/web/index.html"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_export=false

[preset.0.options]

html/export_icon=true
html/custom_html_shell=""
html/head_include=""
`;

const OMNISHARP_JSON = `{
  "FormattingOptions": {
    "UseTabs": true,
    "TabSize": 4,
    "IndentationSize": 4,
    "NewLine": "\\n"
  },
  "RoslynExtensionsOptions": {
    "EnableAnalyzersSupport": true
  }
}
`;

const VSCODE_SETTINGS = `{
  "files.associations": {
    "*.tscn": "gdscript",
    "*.tres": "gdscript",
    "*.gd": "gdscript"
  },
  "search.exclude": {
    "**/.godot": true,
    "**/bin": true,
    "**/obj": true
  },
  "files.watcherExclude": {
    "**/.godot/**": true,
    "**/bin/**": true,
    "**/obj/**": true
  }
}
`;

const MAIN_TSCN = `[gd_scene load_steps=2 format=3 uid="uid://main_scene"]

[ext_resource type="Script" path="res://Scripts/Main.cs" id="1_script"]

[node name="Main" type="Node2D"]
script = ExtResource("1_script")

[node name="HelloLabel" type="Label" parent="."]
offset_left = 200.0
offset_top = 200.0
offset_right = 600.0
offset_bottom = 300.0
text = "__PROJECT_NAME__"
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

const ICON_SVG = `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="16" fill="#478cbf"/>
  <text x="64" y="80" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">G</text>
</svg>
`;

const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{cs,csproj}]
indent_style = tab
indent_size = 4

[*.{tscn,tres,godot,cfg}]
indent_style = tab
indent_size = 4

[*.{md,txt}]
trim_trailing_whitespace = false
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

    await writeFileIfChanged(join(projectPath, "project.godot"), PROJECT_GODOT.replace(/__PROJECT_NAME__/g, projectId));
    await writeFileIfChanged(join(projectPath, "Game.csproj"), GAME_CSPROJ);
    await writeFileIfChanged(join(projectPath, "Directory.Build.props"), DIRECTORY_BUILD_PROPS);
    await writeFileIfChanged(join(projectPath, "global.json"), GLOBAL_JSON);
    await writeFileIfChanged(join(projectPath, "Game.sln"), GAME_SLN.replace(/__PROJECT_NAME__/g, projectId));
    await writeFileIfChanged(join(projectPath, "export_presets.cfg"), EXPORT_PRESETS);
    await writeFileIfChanged(join(projectPath, "omnisharp.json"), OMNISHARP_JSON);
    await mkdir(join(projectPath, ".vscode"), { recursive: true });
    await writeFileIfChanged(join(projectPath, ".vscode", "settings.json"), VSCODE_SETTINGS);
    await writeFileIfChanged(join(projectPath, "Scenes", "Main.tscn"), MAIN_TSCN.replace(/__PROJECT_NAME__/g, projectId));
    await writeFileIfChanged(join(projectPath, "Scripts", "Main.cs"), MAIN_CS.replace(/__PROJECT_NAME__/g, safeName));
    await writeFileIfChanged(join(projectPath, ".gitignore"), GITIGNORE);
    await writeFileIfChanged(join(projectPath, "icon.svg"), ICON_SVG);
    await writeFileIfChanged(join(projectPath, ".editorconfig"), EDITORCONFIG);

    ctx.logger.info("scaffold-project: project created successfully");
    return {
      success: true,
      data: {
        projectPath,
        filesCreated: [
          "project.godot",
          "Game.csproj",
          "Directory.Build.props",
          "global.json",
          "Game.sln",
          "export_presets.cfg",
          "omnisharp.json",
          ".vscode/settings.json",
          "Scenes/Main.tscn",
          "Scripts/Main.cs",
          ".gitignore",
          "icon.svg",
          ".editorconfig",
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
