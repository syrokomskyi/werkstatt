/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0229] The canonical breadcrumb trail builder — the single source of truth for both the
  rendered breadcrumbs section and the BreadcrumbList JSON-LD on every page of every site.
  Framework-agnostic and pure: ancestor discovery is injected via a BreadcrumbAncestorResolver
  seam so each route source (authored pages, Programmatic Surface) contributes its own hierarchy.
</purpose>
<non-goals>
  <item>Do not read files, the route registry, or the surface artifact — that is the resolver's job.</item>
  <item>Do not render markup or emit JSON-LD — callers project the trail into both.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0229: initial canonical trail builder + resolver seam.</item>
</CHANGE_SUMMARY>
*/

import type { SemanticBreadcrumb } from "./models.ts";

/** One crumb in a breadcrumb trail. URLs are absolute so the trail feeds JSON-LD directly. */
export type BreadcrumbCrumb = SemanticBreadcrumb & { pageId?: string };

/** An ordered breadcrumb trail: Home first, the current page last. */
export type BreadcrumbTrail = BreadcrumbCrumb[];

/**
 * The injected ancestor-discovery seam. Returns the ordered ancestors that sit *between* Home and
 * the current page (exclusive of both), nearest-root first. Each route source implements this over
 * its own hierarchy (authored: parentPageId chain; Programmatic Surface: the depth/tuple chain).
 * Non-live ancestors (noindex / redirect / missing) MUST be skipped so the trail stays clickable.
 */
export interface BreadcrumbAncestorResolver {
  resolveAncestors(input: {
    pageId: string;
    lang: string;
    defaultLang: string;
  }): Promise<BreadcrumbCrumb[]>;
}

/**
 * Strip a site-name suffix from an SEO title. Pages often use "Page Name | Site Name" for the
 * <title>; a breadcrumb should show only the page-name portion.
 */
export function stripSiteNameFromTitle(title: string): string {
  const separatorIndex = title.lastIndexOf(" | ");
  return separatorIndex > 0 ? title.slice(0, separatorIndex).trim() : title.trim();
}

/**
 * The ordered ancestor pageIds of a Programmatic Surface page, derived purely from its synthetic
 * pageId, nearest-root first and exclusive of the page itself.
 *
 * A surface pageId encodes its axis tuple as `<surfaceId>:<v1>:<v2>:…` (and the depth-0 landing as
 * `<surfaceId>:_root`), so the hierarchy is recoverable without the Blueprint: the depth-0 landing
 * plus every shallower tuple. Returns `[]` for the root landing and for any non-surface pageId.
 *
 * This is the single source of the surface hierarchy shape — shared by the render-time ancestor
 * resolver (which maps these ids to live crumbs) and `breadcrumb.trail.validate` (which checks the
 * ancestors resolve to routes). Keep both on this one function so they cannot drift.
 */
export function surfaceAncestorPageIds(pageId: string): string[] {
  const parts = pageId.split(":");
  if (parts.length < 2) return [];
  const surfaceId = parts[0]!;
  const values = parts.slice(1);
  // The depth-0 landing (`<surfaceId>:_root`) has no ancestors between it and Home.
  if (values.length === 1 && values[0] === "_root") return [];

  const ids: string[] = [`${surfaceId}:_root`];
  for (let depth = 1; depth < values.length; depth += 1) {
    ids.push(`${surfaceId}:${values.slice(0, depth).join(":")}`);
  }
  return ids;
}

/** Normalize a URL for dedupe: drop a trailing slash (but keep a bare-root "/"). */
function dedupeKey(url: string): string {
  if (url === "/") return "/";
  return url.replace(/\/+$/, "");
}

/**
 * Assemble the canonical breadcrumb trail for one page:
 *
 *   [ Home, …live ancestors (root-first)…, current page ]
 *
 * The same trail is projected into the visible breadcrumbs section AND the BreadcrumbList JSON-LD,
 * so the two can never drift. The home page itself yields a single-node trail (Home === self), which
 * callers suppress per schema.org guidance.
 */
export async function buildBreadcrumbTrail(input: {
  pageId: string;
  pageTitle: string;
  selfUrl: string;
  homeLabel: string;
  homeUrl: string;
  lang: string;
  defaultLang: string;
  resolver: BreadcrumbAncestorResolver;
}): Promise<BreadcrumbTrail> {
  const { pageId, pageTitle, selfUrl, homeLabel, homeUrl, lang, defaultLang, resolver } = input;

  const ancestors = await resolver.resolveAncestors({ pageId, lang, defaultLang });

  const home: BreadcrumbCrumb = { name: homeLabel, url: homeUrl };
  const self: BreadcrumbCrumb = { name: stripSiteNameFromTitle(pageTitle), url: selfUrl, pageId };

  const trail: BreadcrumbTrail = [home];
  const seen = new Set<string>([dedupeKey(homeUrl), dedupeKey(selfUrl)]);
  for (const crumb of ancestors) {
    const key = dedupeKey(crumb.url);
    // Drop ancestors that collapse onto Home or self, or repeat an earlier ancestor.
    if (seen.has(key) || !crumb.name.trim()) continue;
    seen.add(key);
    trail.push({ ...crumb, name: stripSiteNameFromTitle(crumb.name) });
  }
  trail.push(self);
  return trail;
}
