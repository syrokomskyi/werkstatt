/*
<MODULE_CONTRACT>
<purpose>Rate source adapter interfaces for external exchange rate APIs (RFC-0744).</purpose>
<non-goals>
  <item>Does not define PbpRateSource entity — that is in @warpgogol/werkstatt-site/pbp.</item>
  <item>Does not implement specific adapters — those are in src/adapters/.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0744 — RateSourceAdapter and RateFetchResult interfaces.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntityRef } from "@warpgogol/werkstatt-site/pbp";

export interface RateFetchResult {
  value: string;
  observedAt: string;
  sourceKind: "external";
  metadata?: Record<string, unknown>;
}

export interface RateSourceAdapter {
  sourceContractRef: PbpEntityRef;
  fetchRate(pair: { sourceCurrency: string; targetCurrency: string }): Promise<RateFetchResult>;
}
