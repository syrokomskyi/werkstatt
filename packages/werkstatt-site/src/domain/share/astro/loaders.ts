/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] Shared Astro content collection loaders for all Warpgogol apps. The glob
  implementation now lives in the @warpgogol/werkstatt-site/content-source filesystem adapter; this module
  re-exports it under the long-standing name so generated content.config.ts files keep
  importing markdownCollectionLoader from @warpgogol/werkstatt-site/share/astro/loaders unchanged.
</purpose>
<non-goals>
  <item>Do not define collection schemas — those are app-specific.</item>
  <item>Do not reimplement the glob — it belongs to the fs adapter.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: delegate to @warpgogol/werkstatt-site/content-source fs adapter; behavior unchanged.</item>
</CHANGE_SUMMARY>
*/

export { fsMarkdownCollectionLoader as markdownCollectionLoader } from "@warpgogol/werkstatt-site/content-source";
export type { MarkdownCollectionLoaderOptions } from "@warpgogol/werkstatt-site/content-source";
