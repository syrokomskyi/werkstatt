/*
<MODULE_CONTRACT>
<purpose>Maintains packages/geo/src/regions.ts as an authored geo authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: add ISO 3166-2 region lookup as the region layer of @gogol/geo.</item>
  <item>Architecture review 2026-07-10: add regionNames override layer and configurable languages.</item>
</CHANGE_SUMMARY>
*/

// @ts-expect-error no type declarations for iso-3166-2
import iso3166_2 from "iso-3166-2";
import type { GeoRegion, GeoOverrides } from "./types.ts";

/** Resolve a region by its full ISO 3166-2 code (e.g. "DE-BW"). */
export function getRegion(
  code: string,
  overrides?: GeoOverrides,
  languages?: string[],
): GeoRegion | undefined {
  const sub = iso3166_2.subdivision(code);
  if (!sub) return undefined;
  const regionOverrides = overrides?.regionNames?.[code];
  const langs = languages ?? ["de", "uk"];
  const names: Record<string, string> = {};
  for (const lang of langs) {
    names[lang] = regionOverrides?.[lang] ?? sub.name;
  }
  return {
    code,
    countryAlpha2: sub.countryCode,
    subdivision: sub.regionCode.toLowerCase(),
    slug: sub.regionCode.toLowerCase(),
    names,
  };
}
