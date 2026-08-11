/*
<MODULE_CONTRACT>
<purpose>Route registry loader for RFC-0048: loads and caches route configuration from system.md content collection.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from routes.ts as part of the domain split.</item>
  <item>RFC-0708: fold Nachweis detail and verify routes behind the nachweis entitlement gate.</item>
  <item>RFC-0803: add collectGatedPageIds() and skip gated pages in getRouteRegistry() during production builds.</item>
</CHANGE_SUMMARY>
*/

import { getCollection } from "astro:content";
import { getSurfaceEntries } from "../surface-routes.ts";
import { getParticipantProfileRoutes } from "../people-routes.ts";
import { getNachweisRoutes, getNachweisVerifyRoutes } from "../nachweis-routes.ts";
import { collectGatedPageIds } from "../deployment-gate.ts";

/** Language code (e.g., "de", "en") */
export type LanguageCode = string;

/** Stable page identifier across languages */
export type PageId = string;

/** Single route entry from system.md pages[] */
export interface LocalizedRouteEntry {
  pageId: PageId;
  cosmicStar: string;
  routes: Record<LanguageCode, string>;
  // RFC-0048: optional anchor registry — stable anchorId -> lang -> HTML fragment id
  anchors?: Record<string, Record<LanguageCode, string>>;
  // RFC-0049: exclude from public sitemap (e.g. platform-internal overlay pages)
  sitemapExclude?: boolean;
  // RFC-0097: explicit opt-in locale set. When set, the page exists only in
  // these locales — `resolveLocalizedPagePath` returns null silently for other
  // locales, `getStaticPaths` skips them, and `getLocalizedSiblingPath`
  // returns null so the language switcher hides the option.
  locales?: LanguageCode[];
  // RFC-0192: present ⇒ this route originates from a Programmatic Surface
  // (the page handler resolves its blocks from the surface artifact, not a
  // content/pages/*.md file). `axes` carries the combinatorial coordinates.
  surfaceId?: string;
  axes?: Record<string, string | undefined>;
  // RFC-0200: present ⇒ this route is a per-member profile page (the page handler
  // synthesizes its blocks from the Person record, not a content/pages/*.md file).
  personSlug?: string;
  // RFC-0229: optional parent pageId for the breadcrumb hierarchy (authored pages). When set, the
  // breadcrumb trail walks this chain (Home → …parents… → self) instead of the flat Home → self.
  parentPageId?: string;
  // Standalone page: exists in the route registry for link/semantic-target
  // resolution but rendered by a dedicated .astro file (not [...slug].astro).
  // Excluded from getStaticPathsForDefaultLang to avoid route conflicts.
  standalone?: boolean;
}

/** Route registry with bidirectional lookups */
export interface RouteRegistry {
  /** All route entries by pageId */
  byPageId: Map<PageId, LocalizedRouteEntry>;
  /** Nested map: lang -> slug -> entry */
  byLanguageAndSlug: Map<LanguageCode, Map<string, LocalizedRouteEntry>>;
  /** Default language from system.md i18n.default */
  defaultLanguage: LanguageCode;
  /** All supported languages */
  supportedLanguages: LanguageCode[];
}

// Cache for route registry (build-time only)
let ROUTE_REGISTRY_CACHE: RouteRegistry | null = null;

/**
 * RFC-0167/0169: read the resolved entitlement feature set written by
 * entitlements.resolve (build.prepare) at `src/entitlements.generated.yaml`.
 * Build-time only — this is dynamically imported so node:fs never enters a
 * client/worker bundle (routes.ts is tree-shaken out of the worker). Returns
 * null when the artifact is absent or unreadable; callers then FAIL OPEN (no
 * gating), so a missing file never drops routes.
 */
async function readEntitledFeatures(): Promise<string[] | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { parse: yamlParse } = await import("yaml");
    const raw = await readFile(join(process.cwd(), "src", "entitlements.generated.yaml"), "utf8");
    const parsed = yamlParse(raw) as { features?: unknown };
    return Array.isArray(parsed.features) ? parsed.features.map(String) : null;
  } catch {
    return null;
  }
}

/** RFC-0143: determine if a page is excluded from the sitemap via output.sitemap. */
function isSitemapExcluded(
  output: { sitemap?: boolean | { include?: boolean } } | undefined,
): boolean {
  if (!output) return false;
  if (typeof output.sitemap === "boolean") return !output.sitemap;
  if (output.sitemap && typeof output.sitemap === "object") {
    return output.sitemap.include === false;
  }
  return false;
}

/** RFC-0803: Set of pageIds excluded from production builds. */
export type GatedPageIds = Set<string>;

/**
 * Load route registry from system.md content collection.
 * Caches result for subsequent calls during the same build.
 */
export async function getRouteRegistry(): Promise<RouteRegistry> {
  if (ROUTE_REGISTRY_CACHE) {
    return ROUTE_REGISTRY_CACHE;
  }

  try {
    const systemEntries = await getCollection("system");
    const systemEntry = systemEntries[0];

    if (!systemEntry?.data) {
      throw new Error("No system.md entry found");
    }

    // Narrow projection of system.md frontmatter for route resolution. We
    // intentionally don't import SystemManifest here (it would add a heavy
    // schema dep to a thin runtime path) — declare only what we read.
    interface SystemRoutesView {
      pages?: Array<{
        pageId?: string;
        routes?: Record<string, string>;
        anchors?: Record<string, Record<string, string>>;
        output?: { sitemap?: boolean | { include?: boolean } };
        cosmicStar?: string;
        semanticType?: string;
        locales?: string[];
        parentPageId?: string;
        standalone?: boolean;
        deployment?: { production?: boolean };
      }>;
      i18n?: { default?: string; supported?: Record<string, unknown> };
    }
    const data = systemEntry.data as SystemRoutesView;
    const pages = data.pages ?? [];
    if (!data.i18n?.default) {
      throw new Error("[routes] system.md i18n.default is required.");
    }
    const defaultLanguage = data.i18n.default;
    const supportedLanguages = Object.keys(data.i18n.supported ?? { [defaultLanguage]: true });

    const byPageId = new Map<PageId, LocalizedRouteEntry>();
    const byLanguageAndSlug = new Map<LanguageCode, Map<string, LocalizedRouteEntry>>();

    // RFC-0167/0169: gate the sellable blog module. When the `blog` feature is not
    // entitled, article pages (semanticType: "article") are excluded from the route
    // registry entirely — so getStaticPaths compiles no article routes and the
    // sitemap/alternates omit them. Fail open when entitlements are unknown.
    const entitledFeatures = await readEntitledFeatures();
    const blogGated = entitledFeatures !== null && !entitledFeatures.includes("blog");

    // RFC-0803: collect gated pageIds (empty in dev mode — all pages visible)
    const gatedPageIds = collectGatedPageIds(pages);

    for (const page of pages) {
      if (!page.pageId || !page.routes) {
        console.warn(`[routes] Skipping page without pageId or routes: ${JSON.stringify(page)}`);
        continue;
      }

      if (blogGated && page.semanticType === "article") {
        continue;
      }

      // RFC-0803: skip gated pages in production builds
      if (gatedPageIds.has(page.pageId)) {
        continue;
      }

      const entry: LocalizedRouteEntry = {
        pageId: page.pageId,
        cosmicStar: page.cosmicStar ?? page.pageId,
        routes: page.routes,
        // RFC-0048: carry anchor registry if declared
        ...(page.anchors ? { anchors: page.anchors } : {}),
        // RFC-0143: carry sitemap exclusion from output.sitemap
        ...(isSitemapExcluded(page.output) ? { sitemapExclude: true } : {}),
        // RFC-0097: carry explicit locale opt-in
        ...(Array.isArray(page.locales) && page.locales.length > 0
          ? { locales: page.locales }
          : {}),
        // RFC-0229: carry the breadcrumb parent pageId
        ...(page.parentPageId ? { parentPageId: page.parentPageId } : {}),
        // Standalone page: rendered by a dedicated .astro file
        ...(page.standalone ? { standalone: true } : {}),
      };

      byPageId.set(page.pageId, entry);

      // Index by language and slug
      for (const [lang, slug] of Object.entries(page.routes)) {
        if (!byLanguageAndSlug.has(lang)) {
          byLanguageAndSlug.set(lang, new Map());
        }
        byLanguageAndSlug.get(lang)!.set(slug as string, entry);
      }
    }

    // RFC-0192: fold Programmatic Surface entries into the registry behind the `pseo`
    // entitlement gate. Build-time only (the artifact is pre-materialized by
    // surface.generate); fail-open — an absent artifact yields zero surface routes.
    // Authored pages always win on a slug collision (we never overwrite an existing slug).
    const pseoEntitled = entitledFeatures === null || entitledFeatures.includes("pseo");
    if (pseoEntitled) {
      const surfaceEntries = await getSurfaceEntries();
      for (const surface of surfaceEntries) {
        if (byPageId.has(surface.pageId)) continue;
        const entry: LocalizedRouteEntry = {
          pageId: surface.pageId,
          cosmicStar: surface.pageId,
          routes: surface.routes,
          surfaceId: surface.surfaceId,
          axes: surface.axes,
          // A non-live (redirect stub) or noindex page must never reach the sitemap.
          ...(surface.indexable && !surface.noindex ? {} : { sitemapExclude: true }),
        };
        byPageId.set(surface.pageId, entry);
        for (const [lang, slug] of Object.entries(surface.routes)) {
          if (!byLanguageAndSlug.has(lang)) byLanguageAndSlug.set(lang, new Map());
          const langMap = byLanguageAndSlug.get(lang)!;
          if (!langMap.has(slug)) langMap.set(slug, entry);
        }
      }
    }

    // RFC-0200: fold per-member profile pages into the registry behind the
    // `team.profiles` entitlement gate. Sourced directly from the people records
    // (no pre-materialized artifact — people are few). Authored pages always win
    // a slug collision. Fail open when entitlements are unknown.
    const profilesEntitled =
      entitledFeatures === null || entitledFeatures.includes("team.profiles");
    if (profilesEntitled) {
      const personRoutes = await getParticipantProfileRoutes();
      for (const person of personRoutes) {
        if (byPageId.has(person.pageId)) continue;
        const entry: LocalizedRouteEntry = {
          pageId: person.pageId,
          cosmicStar: person.pageId,
          routes: person.routes,
          personSlug: person.slug,
          // RFC-0229: nest the profile breadcrumb under the About/Team page.
          ...(person.parentPageId ? { parentPageId: person.parentPageId } : {}),
        };
        byPageId.set(person.pageId, entry);
        for (const [lang, slug] of Object.entries(person.routes)) {
          if (!byLanguageAndSlug.has(lang)) byLanguageAndSlug.set(lang, new Map());
          const langMap = byLanguageAndSlug.get(lang)!;
          if (!langMap.has(slug)) langMap.set(slug, entry);
        }
      }
    }

    // RFC-0708: fold Nachweis detail and verify routes into the registry behind
    // the `nachweis` entitlement gate. Sourced from PBP EvidenceSource records
    // with Nachweis evidence kinds and status: published.
    // Draft records are excluded — no route is generated. Authored pages
    // always win a slug collision. Fail open when entitlements are unknown.
    const nachweisEntitled = entitledFeatures === null || entitledFeatures.includes("nachweis");
    if (nachweisEntitled) {
      const [nachweisRoutes, nachweisVerifyRoutes] = await Promise.all([
        getNachweisRoutes(),
        getNachweisVerifyRoutes(),
      ]);
      for (const nachweis of nachweisRoutes) {
        if (byPageId.has(nachweis.pageId)) continue;
        const entry: LocalizedRouteEntry = {
          pageId: nachweis.pageId,
          cosmicStar: nachweis.pageId,
          routes: nachweis.routes,
        };
        byPageId.set(nachweis.pageId, entry);
        for (const [lang, slug] of Object.entries(nachweis.routes)) {
          if (!byLanguageAndSlug.has(lang)) byLanguageAndSlug.set(lang, new Map());
          const langMap = byLanguageAndSlug.get(lang)!;
          if (!langMap.has(slug)) langMap.set(slug, entry);
        }
      }
      for (const verify of nachweisVerifyRoutes) {
        if (byPageId.has(verify.pageId)) continue;
        const entry: LocalizedRouteEntry = {
          pageId: verify.pageId,
          cosmicStar: verify.pageId,
          routes: verify.routes,
        };
        byPageId.set(verify.pageId, entry);
        for (const [lang, slug] of Object.entries(verify.routes)) {
          if (!byLanguageAndSlug.has(lang)) byLanguageAndSlug.set(lang, new Map());
          const langMap = byLanguageAndSlug.get(lang)!;
          if (!langMap.has(slug)) langMap.set(slug, entry);
        }
      }
    }

    const registry: RouteRegistry = {
      byPageId,
      byLanguageAndSlug,
      defaultLanguage,
      supportedLanguages,
    };

    ROUTE_REGISTRY_CACHE = registry;
    return registry;
  } catch (error) {
    console.error("[routes] Failed to load route registry:", error);
    throw error;
  }
}

/**
 * Clear route registry cache. Useful for testing or hot reloading.
 */
export function clearRouteRegistryCache(): void {
  ROUTE_REGISTRY_CACHE = null;
}
