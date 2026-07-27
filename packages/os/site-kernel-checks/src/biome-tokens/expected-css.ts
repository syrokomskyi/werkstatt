/*
<MODULE_CONTRACT>
<purpose>Re-export the canonical biome-to-token projection for RFC-0201 BIOME-TOKEN-04 drift detection.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from biome-tokens.ts as part of the domain split.</item>
  <item>Consolidated: delegates to @warpgogol/ontology projectBiomeToTokens — single source of truth.</item>
</CHANGE_SUMMARY>
*/

import { projectBiomeToTokens } from "@warpgogol/ontology";

// Build expected CSS from biome YAML using the canonical projection.
export function buildExpectedBiomeCss(biome: Record<string, unknown>): Map<string, string> {
  return projectBiomeToTokens(biome);
}
