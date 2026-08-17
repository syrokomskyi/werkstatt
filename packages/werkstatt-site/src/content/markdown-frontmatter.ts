/*
<MODULE_CONTRACT>
<purpose>Deprecated compatibility re-export. Real implementation moved to
@warpgogol/werkstatt-shared/content/markdown-frontmatter (RFC-0868).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: moved implementation to werkstatt-shared, this file is now a re-export.</item>
  <item>Added Compass scaffolding to clarify module purpose and boundaries.</item>
</CHANGE_SUMMARY>
*/

export {
  parseMarkdownFrontmatter,
  stringifyMarkdownFrontmatter,
} from "@warpgogol/werkstatt-shared/content/markdown-frontmatter";
export type { ParsedFrontmatter } from "@warpgogol/werkstatt-shared/content/markdown-frontmatter";
