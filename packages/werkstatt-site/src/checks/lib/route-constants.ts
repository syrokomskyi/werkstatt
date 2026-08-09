/*
<MODULE_CONTRACT>
<purpose>
Canonical top-level src/pages/ subdirectory constants shared across the naming, semantic, and
structure checks — RFC-0303 constants dedup (was 3 independently-declared identical Sets).
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted from naming/pages.ts (as PAGES_NON_ROUTE_SUBDIRS), semantic.ts (as PAGES_EXCLUDED_SUBDIRS), and structure/quartet-mirror.ts (as PAGES_ROUTE_EXCLUDED_SUBDIRS) — the three were identical and hand-kept in sync via comments.</item>
</CHANGE_SUMMARY>
*/

/**
 * Top-level subdirectories under src/pages/ that are NOT visitor-facing route
 * files (API endpoints, sitemaps, robots) and must be skipped by page-naming,
 * route-thin, and quartet-mirror checks alike. Add to this set whenever a new
 * non-route top-level subdir is introduced.
 */
export const PAGES_NON_ROUTE_SUBDIRS = new Set(["api", "sitemaps", "robots"]);
