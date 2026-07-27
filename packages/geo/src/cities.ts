/*
<MODULE_CONTRACT>
<purpose>Maintains packages/geo/src/cities.ts as an authored geo authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: introduce the shared city catalog builder with locale-aware slug derivation.</item>
  <item>RFC-0238: derive stable baseIds before applying composite-city overrides.</item>
  <item>Architecture review 2026-07-10: iterate configured languages instead of hard-coding de/uk.</item>
</CHANGE_SUMMARY>
*/

import { City } from "country-state-city";
import { citySlug } from "./slug.ts";
import type { GeoCity, GeoOverrides } from "./types.ts";

interface CSCCity {
  name: string;
  countryCode: string;
  stateCode?: string;
}

/** Build the shared city catalog for a country. */
export function buildCityCatalog(
  countryAlpha2: string,
  overrides?: GeoOverrides,
  languages?: string[],
): GeoCity[] {
  const langs = languages ?? ["de", "uk"];
  const primaryLang = langs[0] ?? "de";
  const raw = (City.getCitiesOfCountry(countryAlpha2) ?? []) as CSCCity[];
  const cities: GeoCity[] = [];
  for (const city of raw) {
    if (!city.stateCode) continue;
    const regionCode = `${city.countryCode}-${city.stateCode}`;
    // RFC-0238: stable baseId from raw country-state-city name for override lookup.
    const baseId = `${countryAlpha2.toLowerCase()}-${city.stateCode.toLowerCase()}-${citySlug(city.name, primaryLang)}`;
    const names: Record<string, string> = {};
    for (const lang of langs) {
      names[lang] = overrides?.cityNames?.[baseId]?.[lang] ?? city.name;
    }
    // Composite-city names produce kebab-case IDs (e.g. Freiburg im Breisgau → de-bw-freiburg-im-breisgau).
    const idSlug = citySlug(names[primaryLang] ?? city.name, primaryLang);
    const id = `${countryAlpha2.toLowerCase()}-${city.stateCode.toLowerCase()}-${idSlug}`;
    const slugByLang: Record<string, string> = {};
    for (const lang of langs) {
      slugByLang[lang] =
        overrides?.citySlugs?.[baseId]?.[lang] ?? citySlug(names[lang] ?? city.name, lang);
    }
    cities.push({
      id,
      countryAlpha2: city.countryCode.toLowerCase(),
      regionCode: regionCode.toUpperCase(),
      names,
      slugByLang,
    });
  }
  return cities;
}
