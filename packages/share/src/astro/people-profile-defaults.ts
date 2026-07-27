/*
<MODULE_CONTRACT>
<purpose>
  RFC-0200/RFC-0303: canonical localized base-segment defaults for a per-member profile URL
  (`<base>/<slug>`), used whenever the site has no authored About page to derive the base
  segment from. A pure module with no `astro:content` import, so it is consumable from both
  the Astro build (people-routes.ts) and framework-agnostic CLI contexts (sitemap generation in
  `@gogol/site-kernel-checks`, semantic model building in `@gogol/site-kernel-content`).
</purpose>
<non-goals>
  <item>Do not import Astro APIs — keep this consumable from Node CLIs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted from people-routes.ts (as DEFAULT_BASE_BY_LANG), site-kernel-checks/sitemap.ts, and site-kernel-content/semantic-loader.ts (both as DEFAULT_PROFILE_BASE_BY_LANG) — the three were hand-kept in sync via comments.</item>
</CHANGE_SUMMARY>
*/

/** Localized base-segment defaults for the profile URL (overridden by an about page slug). */
export const DEFAULT_PROFILE_BASE_BY_LANG: Record<string, string> = {
  de: "team",
  en: "team",
  uk: "komanda",
};
