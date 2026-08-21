/*
<MODULE_CONTRACT>
<purpose>Canonical locale-aware URL slug generation (RFC-0915, DNA-88).</purpose>
<non-goals>
  <item>Do not handle heading anchor deduplication — use HeadingSlugger for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0915: extracted from werkstatt-site/src/domain/geo/slug.ts as canonical URL slug function.</item>
</CHANGE_SUMMARY>
*/

import { resolveSlugStrategy } from "./strategies.ts";

/**
 * Generates a locale-aware Latin URL slug from text.
 * Uses German umlaut replacements for lang="de",
 * Cyrillic transliteration for lang="uk",
 * and default @sindresorhus/slugify for other/undefined langs.
 * Returns "entity" if the input produces an empty slug.
 */
export function slugUrl(text: string, lang?: string): string {
  return resolveSlugStrategy(lang).slug(text) || "entity";
}
