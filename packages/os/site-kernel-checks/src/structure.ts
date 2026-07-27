/*
<MODULE_CONTRACT>
<purpose>Thin re-export shim over structure/* (RFC-0303 split): mirror.triad.validate,
dispatcher.sync.validate, mirror.quartet.validate, and naming.convention.lint.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split into structure/{mirror-triad,dispatcher-sync,quartet-mirror,naming-convention,shared}.ts; this file is now a thin re-export shim so existing "./structure.ts" imports keep working unchanged.</item>
</CHANGE_SUMMARY>
*/

export { runMirrorTriadValidation } from "./structure/mirror-triad.ts";
export { runDispatcherSyncValidation } from "./structure/dispatcher-sync.ts";
export { runQuartetMirrorValidation } from "./structure/quartet-mirror.ts";
export { runNamingConventionLint } from "./structure/naming-convention.ts";
