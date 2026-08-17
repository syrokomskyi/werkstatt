/*
<MODULE_CONTRACT>
<purpose>Deprecated compatibility re-export. Real implementation moved to
@warpgogol/werkstatt-shared/onboarding/brief (RFC-0868).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: moved implementation to werkstatt-shared, this file is now a re-export.</item>
</CHANGE_SUMMARY>
*/

export {
  BriefFrontmatter,
  parseBriefFrontmatter,
  parseSystemFrontmatter,
  parseMarkdownAsYaml,
} from "@warpgogol/werkstatt-shared/onboarding/brief";
export type { Brief } from "@warpgogol/werkstatt-shared/onboarding/brief";
