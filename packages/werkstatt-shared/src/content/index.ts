/*
<MODULE_CONTRACT>
<purpose>Public entrypoint for @warpgogol/werkstatt-shared/content — exports
markdown frontmatter utilities and system manifest loading (RFC-0868).</purpose>
<non-goals>
  <item>Do not import from app-specific packages or stack plugins.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: extracted from werkstatt-site/src/content/index.ts.</item>
</CHANGE_SUMMARY>
*/

export { parseMarkdownFrontmatter, stringifyMarkdownFrontmatter } from "./markdown-frontmatter.ts";
export type { ParsedFrontmatter } from "./markdown-frontmatter.ts";
export {
  loadSystemManifest,
  loadSystemManifestSync,
  isUsingSystemMd,
  isUsingSystemMdSync,
} from "./system-manifest.ts";
export type { SystemManifest, SystemManifestLoadResult } from "./system-manifest.ts";
