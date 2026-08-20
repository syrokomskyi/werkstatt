/*
<MODULE_CONTRACT>
<purpose>Godot path conventions for the Godot plugin.</purpose>
<keywords>godot, paths, game, plugin</keywords>
<non-goals>
  <item>Do not import from any @warpgogol/* package — pure path constants only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot path conventions.</item>
</CHANGE_SUMMARY>
*/

import type { StackPathConventions } from "@warpgogol/werkstatt/plugin";

export const godotPathConventions: StackPathConventions = {
  contentDir: "Scenes",
  distDir: "bin",
  entryPoints: ["project.godot", "Game.csproj"],
};

export const GODOT_PATHS = {
  scenesDir: "Scenes",
  scriptsDir: "Scripts",
  resourcesDir: "Resources",
  assetsDir: "Assets",
  projectGodot: "project.godot",
  gameCsproj: "Game.csproj",
  godotCacheDir: ".godot",
  binDir: "bin",
  objDir: "obj",
} as const;
