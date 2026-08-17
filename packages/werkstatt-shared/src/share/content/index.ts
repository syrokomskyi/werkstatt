/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/content/index.ts as an authored share content module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>Removed dispatch.ts re-export (merged into entity-id.ts).</item>
</CHANGE_SUMMARY>
*/

export * from "./entity-id.ts";
export * from "./merge.ts";
export * from "./resolve-field-path.ts";
