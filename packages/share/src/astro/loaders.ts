/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] Shared Astro content collection loaders for all WGogol apps. The glob
  implementation now lives in the @gogol/content-source filesystem adapter; this module
  re-exports it under the long-standing name so generated content.config.ts files keep
  importing markdownCollectionLoader from @gogol/share/astro/loaders unchanged.
</purpose>
<non-goals>
  <item>Do not define collection schemas — those are app-specific.</item>
  <item>Do not reimplement the glob — it belongs to the fs adapter.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: delegate to @gogol/content-source fs adapter; behavior unchanged.</item>
</CHANGE_SUMMARY>
*/

export { fsMarkdownCollectionLoader as markdownCollectionLoader } from "@gogol/content-source";
export type { MarkdownCollectionLoaderOptions } from "@gogol/content-source";
