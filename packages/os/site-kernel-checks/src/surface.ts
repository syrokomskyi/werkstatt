/*
<MODULE_CONTRACT>
<purpose>Thin re-export shim for surface commands split into surface/ (RFC-0303).</purpose>
<non-goals>
  <item>Do not implement command logic here; implementations live in surface/*.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0192: discovery + gate + artifact/manifest; expansion seam for RFC-0193.</item>
  <item>surface.generate now cleans up stale Markdown twins and lazy-cache files from the previous run before writing new ones.</item>
  <item>RFC-0303: split surface.ts (779 lines) into surface/{shared,generate,validate,freshness,starmap}.ts.</item>
</CHANGE_SUMMARY>
*/

export { runSurfaceGenerate } from "./surface/generate.ts";
export { runSurfaceValidate } from "./surface/validate.ts";
export { runSurfaceFreshness } from "./surface/freshness.ts";
export { runSurfaceStarmap } from "./surface/starmap.ts";
