/*
<MODULE_CONTRACT>
<purpose>Public entrypoint for @warpgogol/werkstatt-shared/onboarding — exports
brief parsing utilities (RFC-0868).</purpose>
<non-goals>
  <item>Do not import from app-specific packages or stack plugins.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: extracted from werkstatt-site/src/onboarding/brief.ts.</item>
</CHANGE_SUMMARY>
*/

export {
  BriefFrontmatter,
  parseBriefFrontmatter,
  parseSystemFrontmatter,
  parseMarkdownAsYaml,
} from "./brief.ts";
export type { Brief } from "./brief.ts";
