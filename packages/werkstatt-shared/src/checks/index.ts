/*
<MODULE_CONTRACT>
<purpose>Shared check infrastructure barrel for @warpgogol/werkstatt-shared — exports diagnosticsResult, suppressions, i18n, and astro-site-url helpers (RFC-0868).</purpose>
<non-goals>
  <item>Do not export site-specific validators or pipeline definitions.</item>
  <item>Do not import from @warpgogol/werkstatt-site or any stack plugin.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: extracted from werkstatt-site/src/checks as shared infrastructure.</item>
</CHANGE_SUMMARY>
*/

export {
  diagnosticsResult,
  passResult,
  failResult,
  resultFromViolations,
} from "./result-helpers.ts";

export * from "./suppressions-config.ts";

export { readAstroSiteUrl } from "./lib/astro-site-url.ts";
export { readDefaultLanguageCode } from "./lib/i18n.ts";
