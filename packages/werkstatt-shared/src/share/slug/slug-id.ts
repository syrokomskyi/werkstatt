/*
<MODULE_CONTRACT>
<purpose>Canonical semantic block ID slug generation (RFC-0915, DNA-88). Replaces custom NFKD slugify() in extract.ts.</purpose>
<non-goals>
  <item>Do not handle locale-aware URL slugs — use slugUrl for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0915: replaces custom NFKD-based slugify() in semantic/extract.ts with @sindresorhus/slugify wrapper.</item>
</CHANGE_SUMMARY>
*/

import slugify from "@sindresorhus/slugify";

/**
 * Generates a semantic block ID from text.
 * Uses @sindresorhus/slugify for robust Unicode handling.
 * Returns "entity" if the input produces an empty slug.
 */
export function slugId(text: string): string {
  return slugify(text) || "entity";
}
