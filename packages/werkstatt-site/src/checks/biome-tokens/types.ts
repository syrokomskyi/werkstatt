/*
<MODULE_CONTRACT>
<purpose>Shared types and constants for the RFC-0201 biome token validation checks.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from biome-tokens.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import type { CheckResult } from "@warpgogol/site-kernel";

export interface CssTokenUse {
  file: string;
  selector: string;
  property: string;
  token: string;
  fallback?: string;
  line: number;
  column: number;
}

export interface BiomeTokenResolution {
  biomeId: string;
  token: string;
  source: "biome" | "generated-biome-css" | "tokens-default" | "missing";
  value?: string;
}

export type BiomeTokenRule =
  "BIOME-TOKEN-01" | "BIOME-TOKEN-02" | "BIOME-TOKEN-03" | "BIOME-TOKEN-04";

export interface BiomeTokenViolation {
  rule: BiomeTokenRule;
  severity: "error" | "warning";
  app?: string;
  biomeId?: string;
  file: string;
  selector?: string;
  property?: string;
  token: string;
  source?: BiomeTokenResolution["source"];
  message: string;
  fixHint: string;
}

// RFC-0203: biome.tokens.validate emits the canonical CheckResult (diagnostics
// are BIOME-TOKEN-* rules) plus its scan statistics.
export interface BiomeTokensResult extends CheckResult {
  appsScanned: number;
  biomesScanned: number;
  cssFilesScanned: number;
  tokenUsesFound: number;
}

// Tokens that encode contrast context for dark surfaces
export const DARK_SURFACE_CONTRAST_TOKENS = new Set([
  "--ds-color-text-soft-on-dark",
  "--ds-color-text-on-dark-84",
]);

export const LIGHT_SURFACE_THRESHOLD = 0.5;
