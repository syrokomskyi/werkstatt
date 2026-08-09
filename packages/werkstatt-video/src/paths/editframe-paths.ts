/*
<MODULE_CONTRACT>
<purpose>Editframe path conventions for the video plugin (RFC-0778).</purpose>
<keywords>editframe, paths, video, plugin</keywords>
<non-goals>
  <item>Do not import from any @warpgogol/* package — pure path constants only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial Editframe path conventions.</item>
</CHANGE_SUMMARY>
*/

import type { StackPathConventions } from "@warpgogol/werkstatt/plugin";

export const editframePathConventions: StackPathConventions = {
  contentDir: "src",
  distDir: "dist",
  entryPoints: ["src/composition.tsx", "editframe.config.ts"],
};

export const EDITFRAME_PATHS = {
  compositionEntry: "src/composition.tsx",
  assetsDir: "src/assets",
  assetManifest: "src/assets/manifest.yaml",
  editframeConfig: "editframe.config.ts",
  distDir: "dist",
  publicDir: "public",
  renderHashFile: "dist/.render-hash.json",
} as const;
