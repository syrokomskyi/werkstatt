/*
<MODULE_CONTRACT>
<purpose>
Localized route registry for RFC-0048. Loads route configuration from system.md
and provides utilities for resolving pageIds to localized URLs and language switching.
</purpose>
<non-goals>
  <item>Do not handle content entry resolution (separate concern).</item>
  <item>Do not implement runtime client-side routing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0048: Initial route registry implementation for localized slugs.</item>
  <item>RFC-0303 Phase 3: split the flat 694-line file into sub-modules under routes/; this file is now the re-export shim.</item>
</CHANGE_SUMMARY>
*/

export { localizeUrl } from "./url-policy.ts";
export type { LocalizeUrlOptions } from "./url-policy.ts";

export type {
  LanguageCode,
  PageId,
  LocalizedRouteEntry,
  RouteRegistry,
} from "./routes/registry.ts";
export {
  getRouteRegistry,
  clearRouteRegistryCache,
  collectGatedPageIds,
} from "./routes/registry.ts";
export type { GatedPageIds } from "./routes/registry.ts";

export type { RootCanonical } from "./routes/resolve.ts";
export {
  getRootCanonical,
  resolveLocalizedPagePath,
  getLocalizedSiblingPath,
  resolvePageIdFromPath,
  getStaticPathsFromRegistry,
  getStaticPathsForDefaultLang,
  getStaticPathsForPrefixedLangs,
  getStaticPathsForDefaultLangRedirects,
} from "./routes/resolve.ts";

export { resolveAnchorFragment, hasLocalizedPage, resolveSectionAnchor } from "./routes/anchors.ts";

export type { SitemapLocaleEntry, PageCluster } from "./routes/sitemap.ts";
export { buildSitemapClusters, generateSitemapXml, getAlternateLinks } from "./routes/sitemap.ts";
