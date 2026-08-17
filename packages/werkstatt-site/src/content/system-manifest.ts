/*
<MODULE_CONTRACT>
<purpose>Deprecated compatibility re-export. Real implementation moved to
@warpgogol/werkstatt-shared/content/system-manifest (RFC-0868).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: moved implementation to werkstatt-shared, this file is now a re-export.</item>
</CHANGE_SUMMARY>
*/

export {
  loadSystemManifest,
  loadSystemManifestSync,
  isUsingSystemMd,
  isUsingSystemMdSync,
} from "@warpgogol/werkstatt-shared/content/system-manifest";
export type {
  SystemManifest,
  SystemManifestLoadResult,
} from "@warpgogol/werkstatt-shared/content/system-manifest";
