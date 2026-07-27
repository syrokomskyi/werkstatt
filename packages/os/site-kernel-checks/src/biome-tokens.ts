/*
<MODULE_CONTRACT>
<purpose>RFC-0201: Validates CSS token usage against active app biomes. Reports BIOME-TOKEN-01..04 violations. Split (RFC-0303 Phase 3) into sub-modules under biome-tokens/, this file is the thin re-export shim.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added Compass scaffolding.</item>
  <item>RFC-0303 Phase 3: split the flat 660-line file into sub-modules under biome-tokens/; this file is now the re-export shim.</item>
</CHANGE_SUMMARY>
*/

export { runBiomeTokensValidate } from "./biome-tokens/validate.ts";
export type {
  CssTokenUse,
  BiomeTokenResolution,
  BiomeTokenRule,
  BiomeTokenViolation,
  BiomeTokensResult,
} from "./biome-tokens/types.ts";
