/*
<MODULE_CONTRACT>
<purpose>Re-export shim for astro-site-url moved to @warpgogol/werkstatt-shared (RFC-0868).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: moved to werkstatt-shared, this file re-exports for backward compatibility.</item>
</CHANGE_SUMMARY>
*/

export { readAstroSiteUrl } from "@warpgogol/werkstatt-shared/checks/lib/astro-site-url";
