/*
<MODULE_CONTRACT>
<purpose>Phaser path conventions for the game plugin (RFC-0777).</purpose>
<keywords>phaser, paths, game, plugin</keywords>
<non-goals>
  <item>Do not import from any @warpgogol/* package — pure path constants only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: initial Phaser path conventions.</item>
</CHANGE_SUMMARY>
*/

import type { StackPathConventions } from "@warpgogol/werkstatt/plugin";

export const phaserPathConventions: StackPathConventions = {
  contentDir: "src",
  distDir: "dist",
  entryPoints: ["phaser.config.ts", "src/main.ts"],
};

export const PHASER_PATHS = {
  scenesDir: "src/scenes",
  assetsDir: "src/assets",
  assetManifest: "src/assets/manifest.yaml",
  phaserConfig: "phaser.config.ts",
  publicDir: "public",
  distDir: "dist",
  mainEntry: "src/main.ts",
} as const;
