/*
<MODULE_CONTRACT>
<purpose>Thin re-export shim over surface-expand/* (RFC-0303 split): Blueprint discovery,
dataset expansion, and page baking for surface.generate (RFC-0192/0193).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split into surface-expand/{blueprints,expand,bake}.ts; this file is now a thin re-export shim so existing "./surface-expand.ts" imports keep working unchanged.</item>
</CHANGE_SUMMARY>
*/

export { readDeclaredBlueprints, loadSurfaceBlueprints } from "./surface-expand/blueprints.ts";
export { expandBlueprint } from "./surface-expand/expand.ts";
