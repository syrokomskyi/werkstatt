/*
<MODULE_CONTRACT>
<purpose>Godot stack invariants GODOT-01..07 surfaced to agents.</purpose>
<keywords>invariants, godot, csharp</keywords>
<non-goals>
  <item>Do not enforce invariants here — enforcement lives in validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot stack invariants GODOT-01..04.</item>
  <item>Enhancement: add GODOT-05 (scene reference integrity), GODOT-06 (csproj settings), GODOT-07 (resource location and references).</item>
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
];
