/*
<MODULE_CONTRACT>
<purpose>
RFC-0286: barrel for the Agent Surface shared model. Re-exports the framework-free
manifest contract + canonicalization primitives; RFC-0287..0291 add sibling modules
here (knowledge, capability, openapi, proof) and re-export them from this barrel.
</purpose>
<non-goals>
  <item>Do not add logic here — pure re-export barrel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0286: initial barrel exporting the manifest module.</item>
  <item>RFC-0292: re-export fleet-catalog module.</item>
  <item>RFC-0783: re-export api-catalog and mcp-card modules.</item>
  <item>RFC-0786: re-export dns-aid module.</item>
</CHANGE_SUMMARY>
*/

export * from "./manifest.ts";
export * from "./knowledge.ts";
export * from "./capability.ts";
export * from "./openapi.ts";
export * from "./omit-empty.ts";
export * from "./proof.ts";
export * from "./fleet-catalog.ts";
export * from "./api-catalog.ts";
export * from "./mcp-card.ts";
export * from "./dns-aid.ts";
