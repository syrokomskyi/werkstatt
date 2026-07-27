/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0160] Single URL-policy seam for the whole platform. Maps a
  (language, slug) pair to a URL path under the unprefixed-default-language
  contract: the default language has NO prefix; non-default languages keep
  their prefix.

  This is a pure module with no `astro:content` (or any Astro) imports, so it is
  safe to consume from both the Astro build (`@warpgogol/share/routes`) and
  framework-agnostic CLI contexts (sitemap generation/validation in
  `@warpgogol/site-kernel-checks`). It is the ONLY place allowed to build localized
  URL paths — no inline `/${lang}/${slug}` ternaries elsewhere.
</purpose>
<non-goals>
  <item>Do not read system.md, content collections, or the route registry.</item>
  <item>Do not import Astro APIs — keep this consumable from Node CLIs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0160: initial implementation of the unprefixed-default URL policy.</item>
</CHANGE_SUMMARY>
*/

/** Options for {@link localizeUrl}. */
export interface LocalizeUrlOptions {
  /** The site's default language. Pages in this language are served unprefixed. */
  defaultLanguage: string;
}

/**
 * Project a (language, slug) pair to a URL path under the unprefixed-default
 * contract (RFC-0160).
 *
 * - default language, home (`slug === ""`) → `/`
 * - default language, page              → `/<slug>`
 * - non-default language, home          → `/<lang>/`
 * - non-default language, page          → `/<lang>/<slug>`
 *
 * @example
 * localizeUrl("de", "",            { defaultLanguage: "de" }) // "/"
 * localizeUrl("de", "datenschutz", { defaultLanguage: "de" }) // "/datenschutz"
 * localizeUrl("en", "",            { defaultLanguage: "de" }) // "/en/"
 * localizeUrl("en", "privacy",     { defaultLanguage: "de" }) // "/en/privacy"
 */
export function localizeUrl(lang: string, slug: string, opts: LocalizeUrlOptions): string {
  const isDefault = lang === opts.defaultLanguage;
  if (isDefault) {
    return slug === "" ? "/" : `/${slug}`;
  }
  return slug === "" ? `/${lang}/` : `/${lang}/${slug}`;
}
