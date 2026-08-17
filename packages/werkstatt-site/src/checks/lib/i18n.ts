/*
<MODULE_CONTRACT>
<purpose>Re-export shim for i18n moved to @warpgogol/werkstatt-shared (RFC-0868).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: moved to werkstatt-shared, this file re-exports for backward compatibility.</item>
</CHANGE_SUMMARY>
*/

export { readDefaultLanguageCode, defaultLanguageFromManifest } from "@warpgogol/werkstatt-shared/checks/lib/i18n";
