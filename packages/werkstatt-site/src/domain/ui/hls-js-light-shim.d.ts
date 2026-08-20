/*
<MODULE_CONTRACT>
<purpose>Type shim for hls.js/light export. Mirrors the declaration in
@warpgogol/werkstatt-shared/share/types/hls-js-light.d.ts so that cross-package
imports typecheck in werkstatt-site's standalone tsc.</purpose>
<non-goals>
  <item>Do not change runtime resolution; this file only fills the missing package declaration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add hls.js/light ambient declaration for cross-package typecheck visibility.</item>
</CHANGE_SUMMARY>
*/

declare module "hls.js/light" {
  export { default } from "hls.js";
  export * from "hls.js";
}
