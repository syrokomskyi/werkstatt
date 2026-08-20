/*
<MODULE_CONTRACT>
<purpose>Godot stack invariants GODOT-01..12 surfaced to agents.</purpose>
<keywords>invariants, godot, csharp</keywords>
<non-goals>
  <item>Do not enforce invariants here — enforcement lives in validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot stack invariants GODOT-01..04.</item>
  <item>Enhancement: add GODOT-05 (scene reference integrity), GODOT-06 (csproj settings), GODOT-07 (resource location and references).</item>
  <item>Enhancement: add GODOT-08 (script conventions), GODOT-09 (export presets), GODOT-10 (UID uniqueness), GODOT-11 (NuGet packages).</item>
  <item>Enhancement: add GODOT-12 (addon validation).</item>
</CHANGE_SUMMARY>
*/

import type { StackInvariant } from "@warpgogol/werkstatt/plugin";

export const GODOT_INVARIANTS: StackInvariant[] = [
  {
    id: "GODOT-01",
    description: "Scene files (.tscn) must reside in Scenes/ and scripts (.cs) in Scripts/",
    check: "godot.scene.validate",
  },
  {
    id: "GODOT-02",
    description: "The .godot/ directory must not be committed to git",
    check: "godot.gitignore.validate",
  },
  {
    id: "GODOT-03",
    description: "No hardcoded API keys or secrets in C# source files",
    check: "godot.secret.scan",
  },
  {
    id: "GODOT-04",
    description: "project.godot autoloads and input map changes require explicit confirmation",
    check: "godot.project.config.validate",
  },
  {
    id: "GODOT-05",
    description: "Scene files (.tscn) res:// references must point to existing files",
    check: "godot.scene.reference.validate",
  },
  {
    id: "GODOT-06",
    description: "Game.csproj must use Godot.NET.Sdk, target net8.0, and enable dynamic loading",
    check: "godot.csproj.validate",
  },
  {
    id: "GODOT-07",
    description:
      "Resource files (.tres) must reside in Resources/ and their res:// references must exist",
    check: "godot.resource.validate",
  },
  {
    id: "GODOT-08",
    description:
      "C# scripts must have class name matching file name, partial keyword on Node subclasses, and using Godot; directive",
    check: "godot.script.validate",
  },
  {
    id: "GODOT-09",
    description:
      "export_presets.cfg must have valid presets with non-empty relative export paths and known platforms",
    check: "godot.export.presets.validate",
  },
  {
    id: "GODOT-10",
    description: "Scene (.tscn) and resource (.tres) files must have unique uid:// declarations",
    check: "godot.uid.validate",
  },
  {
    id: "GODOT-11",
    description:
      "Game.csproj NuGet package references must be Godot-compatible and non-problematic",
    check: "godot.nuget.validate",
  },
  {
    id: "GODOT-12",
    description:
      "Addons in addons/ must have valid plugin.cfg, be enabled in project.godot, and declare NuGet deps in Game.csproj for C# addons",
    check: "godot.addon.validate",
  },
];
