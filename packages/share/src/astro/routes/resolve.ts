/*
<MODULE_CONTRACT>
<purpose>Route resolution helpers for RFC-0048: resolve pageId + language to localized URL path and provide language switcher helper.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from routes.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { localizeUrl } from "../url-policy.ts";
import type { LanguageCode, PageId } from "./registry.ts";
import { getRouteRegistry } from "./registry.ts";

/**
 * RFC-0159: Canonical contract for the root entry page (`/`).
 *
 * The root URL serves the default-language home content directly (no redirect
 * stub), so AI crawlers and lightweight HTTP clients receive fully rendered
 * HTML + JSON-LD in zero redirects. To avoid duplicate-content ambiguity
 * between `/` and `/<defaultLang>/`, the root page emits a canonical link to
 * the default-language home (static Option B — no Worker 301 required).
 *
 * Only visitors whose browser language preference matches a supported
 * NON-default language are soft-redirected client-side to `/<lang>/`.
 */
export interface RootCanonical {
  /** Canonical absolute URL for the default-language home (`/<defaultLang>/`). */
  canonicalUrl: string;
  /** Default language whose home is served at `/`. */
  defaultLanguage: LanguageCode;
  /** Supported non-default languages eligible for the soft client redirect. */
  redirectableLanguages: LanguageCode[];
}

/**
 * Build the root-entry canonical contract from the route registry.
 *
 * @param siteUrl Absolute site origin (e.g. "https://warpgogol.com").
 */
export async function getRootCanonical(siteUrl: string): Promise<RootCanonical> {
  const registry = await getRouteRegistry();
  const baseUrl = siteUrl.replace(/\/$/, "");
  const defaultLanguage = registry.defaultLanguage;
  return {
    // RFC-0160: the default language is unprefixed, so `/` is the true canonical
    // home — there is no `/<defaultLang>/` duplicate to point at.
    canonicalUrl: `${baseUrl}/`,
    defaultLanguage,
    redirectableLanguages: registry.supportedLanguages.filter((l) => l !== defaultLanguage),
  };
}

/**
 * Resolve a pageId and language to a localized URL path.
 * Returns null if pageId or language is not found.
 *
 * @example
 * resolveLocalizedPagePath("privacyPolicy", "de") // "/de/datenschutz"
 * resolveLocalizedPagePath("privacyPolicy", "en") // "/en/privacy"
 */
export async function resolveLocalizedPagePath(
  pageId: PageId,
  lang: LanguageCode,
): Promise<string | null> {
  const registry = await getRouteRegistry();
  const entry = registry.byPageId.get(pageId);

  if (!entry) {
    console.warn(`[routes] PageId not found: ${pageId}`);
    return null;
  }

  // RFC-0097: locale-scoped page → silent null when caller asks for an
  // unsupported locale. Distinct from "page exists everywhere but a locale
  // route slug is missing" which remains a loud warning below.
  if (entry.locales && !entry.locales.includes(lang)) {
    return null;
  }

  const slug = entry.routes[lang];
  if (slug === undefined) {
    console.warn(`[routes] No route for pageId ${pageId} in language ${lang}`);
    return null;
  }

  // RFC-0160: unprefixed default language; prefixed non-default languages.
  return localizeUrl(lang, slug, { defaultLanguage: registry.defaultLanguage });
}

/**
 * Get URL for the same page in a different language.
 * Falls back to home page if the target language doesn't have the page.
 *
 * @example
 * getLocalizedSiblingPath("de", "datenschutz", "en") // "/en/privacy"
 */
export async function getLocalizedSiblingPath(
  currentLang: LanguageCode,
  currentSlug: string,
  targetLang: LanguageCode,
): Promise<string> {
  const registry = await getRouteRegistry();

  const homeFor = (lang: LanguageCode) =>
    localizeUrl(lang, "", { defaultLanguage: registry.defaultLanguage });

  // Find current page by lang + slug
  const langMap = registry.byLanguageAndSlug.get(currentLang);
  if (!langMap) {
    return homeFor(targetLang);
  }

  const entry = langMap.get(currentSlug);
  if (!entry) {
    return homeFor(targetLang);
  }

  // RFC-0097: locale-scoped page → fall back to home for unsupported locales
  // (intentional; lang-switcher hides this option once the caller observes the
  // home-equivalent path).
  if (entry.locales && !entry.locales.includes(targetLang)) {
    return homeFor(targetLang);
  }

  // Get target language slug for same pageId
  const targetSlug = entry.routes[targetLang];
  if (targetSlug === undefined) {
    // Page doesn't exist in target language, go to home
    return homeFor(targetLang);
  }

  return localizeUrl(targetLang, targetSlug, { defaultLanguage: registry.defaultLanguage });
}

/**
 * Find pageId from language and slug.
 * Used by route handlers to resolve incoming URLs.
 */
export async function resolvePageIdFromPath(
  lang: LanguageCode,
  slug: string,
): Promise<PageId | null> {
  const registry = await getRouteRegistry();
  const langMap = registry.byLanguageAndSlug.get(lang);

  if (!langMap) {
    console.warn(`[routes] No routes registered for language: ${lang}`);
    return null;
  }

  const entry = langMap.get(slug);
  if (!entry) {
    console.warn(`[routes] No pageId found for slug "${slug}" in language ${lang}`);
  }
  return entry?.pageId ?? null;
}

/**
 * Get all static paths for a language from the route registry.
 * Used by [lang]/[...slug].astro for getStaticPaths().
 */
export async function getStaticPathsFromRegistry(
  langs?: LanguageCode[],
): Promise<Array<{ params: { lang: string; slug?: string } }>> {
  const registry = await getRouteRegistry();
  const targetLangs = langs ?? registry.supportedLanguages;
  const paths: Array<{ params: { lang: string; slug?: string } }> = [];

  for (const lang of targetLangs) {
    const langMap = registry.byLanguageAndSlug.get(lang);
    if (!langMap) continue;

    for (const [slug, entry] of langMap.entries()) {
      // RFC-0097: skip locale-scoped pages that don't opt into this locale.
      // The byLanguageAndSlug index already only carries entries whose
      // `routes[lang]` exists, but we re-check `locales` here defensively in
      // case authored routes drift from the locales array.
      if (entry.locales && !entry.locales.includes(lang)) continue;
      // Standalone pages are rendered by dedicated .astro files
      if (entry.standalone) continue;

      if (slug === "") {
        // Home page
        paths.push({ params: { lang } });
      } else {
        paths.push({ params: { lang, slug } });
      }
    }
  }

  return paths;
}

/**
 * RFC-0160: Static paths for the UNPREFIXED default language.
 *
 * Returns `{ params: { slug } }` for every default-language page EXCEPT the
 * home (`slug === ""`), which is served by the dedicated root `index.astro`.
 * Consumed by `apps/<site>/src/pages/[...slug].astro`.
 */
export async function getStaticPathsForDefaultLang(): Promise<Array<{ params: { slug: string } }>> {
  const registry = await getRouteRegistry();
  const lang = registry.defaultLanguage;
  const langMap = registry.byLanguageAndSlug.get(lang);
  const paths: Array<{ params: { slug: string } }> = [];
  if (!langMap) return paths;

  for (const [slug, entry] of langMap.entries()) {
    if (slug === "") continue; // home is owned by index.astro
    if (entry.standalone) continue; // rendered by a dedicated .astro file
    if (entry.locales && !entry.locales.includes(lang)) continue;
    paths.push({ params: { slug } });
  }

  return paths;
}

/**
 * RFC-0160: Static paths for PREFIXED non-default languages only.
 *
 * Identical to {@link getStaticPathsFromRegistry} but with the default language
 * excluded (the default language is served unprefixed via `index.astro` +
 * `[...slug].astro`). Consumed by `apps/<site>/src/pages/[lang]/[...slug].astro`.
 */
export async function getStaticPathsForPrefixedLangs(): Promise<
  Array<{ params: { lang: string; slug?: string } }>
> {
  const registry = await getRouteRegistry();
  const prefixedLangs = registry.supportedLanguages.filter((l) => l !== registry.defaultLanguage);
  return getStaticPathsFromRegistry(prefixedLangs);
}

/**
 * RFC-0160: Static paths for default-language PREFIXED redirects.
 *
 * Returns `{ params: { lang, slug } }` for every default-language page so that
 * `/<defaultLang>/<slug>` emits a redirect to the unprefixed `/<slug>`.
 * Consumed alongside {@link getStaticPathsForPrefixedLangs} in
 * `apps/<site>/src/pages/[lang]/[...slug].astro`.
 */
export async function getStaticPathsForDefaultLangRedirects(): Promise<
  Array<{ params: { lang: string; slug?: string } }>
> {
  const registry = await getRouteRegistry();
  return getStaticPathsFromRegistry([registry.defaultLanguage]);
}
