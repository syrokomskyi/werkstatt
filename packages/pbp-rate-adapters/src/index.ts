/*
<MODULE_CONTRACT>
<purpose>Barrel exports for @warpgogol/pbp-rate-adapters (RFC-0744).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0744 — rate source adapter package.</item>
</CHANGE_SUMMARY>
*/

export type { RateSourceAdapter, RateFetchResult } from "./types.js";
export {
  registerRateSourceAdapter,
  getRateSourceAdapter,
  clearRateSourceAdapters,
} from "./registry.js";
export { createEcbAdapter, parseEcbXml } from "./adapters/ecb.js";
export { createFrankfurterAdapter, parseFrankfurterResponse } from "./adapters/frankfurter.js";
