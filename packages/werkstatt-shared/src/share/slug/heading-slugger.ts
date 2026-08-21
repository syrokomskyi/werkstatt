/*
<MODULE_CONTRACT>
<purpose>Canonical heading anchor slug generation with stateful deduplication (RFC-0915, DNA-88). Wraps github-slugger.</purpose>
<non-goals>
  <item>Do not handle URL slug generation — use slugUrl for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0915: wraps github-slugger as canonical heading slugger, replacing direct imports in werkstatt-site.</item>
</CHANGE_SUMMARY>
*/

import GithubSlugger from "github-slugger";

/**
 * Stateful heading slug generator with deduplication.
 * First "Fazit" → "fazit", second → "fazit-1".
 * Wraps github-slugger for canonical heading anchor generation.
 */
export class HeadingSlugger {
  private readonly slugger = new GithubSlugger();

  slug(text: string): string {
    return this.slugger.slug(text);
  }
}
