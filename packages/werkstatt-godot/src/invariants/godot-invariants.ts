/*
<MODULE_CONTRACT>
<purpose>Godot stack invariants GODOT-01..04 surfaced to agents.</purpose>
<keywords>invariants, godot, csharp</keywords>
<non-goals>
  <item>Do not enforce invariants here — enforcement lives in validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot stack invariants GODOT-01..04.</item>
</CHANGE_SUMMARY>
*/

import type { StackInvariant } from "@warpgogol/werkstatt/plugin";

export const GODOT_INVARIANTS: StackInvariant[] = [
  {
    id: "GODOT-01",
    description:
      "Scene files (.tscn) must reside in Scenes/ and scripts (.cs) in Scripts/",
    check: "godot.scene.validate",
  },
  {
    id: "GODOT-02",
    description:
      "The .godot/ directory must not be committed to git",
    check: "godot.gitignore.validate",
  },
  {
    id: "GODOT-03",
    description:
      "No hardcoded API keys or secrets in C# source files",
    check: "godot.secret.scan",
  },
  {
    id: "GODOT-04",
    description:
      "project.godot autoloads and input map changes require explicit confirmation",
    check: "godot.project.config.validate",
  },
];
