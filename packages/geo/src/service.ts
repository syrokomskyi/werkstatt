/*
<MODULE_CONTRACT>
<purpose>The GeoService facade — unified entrypoint for country, region, city, and provider-axis lookups.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: introduce the GeoService facade for reusable geo catalog access.</item>
  <item>RFC-0238: centralize composite-city overrides before building city indexes.</item>
  <item>Architecture review 2026-07-10: accept GeoServiceConfig, loop configured countries, add providerEntries, pass region overrides.</item>
</CHANGE_SUMMARY>
*/

import { getCountry } from "./countries.ts";
import { getRegion } from "./regions.ts";
import { buildCityCatalog } from "./cities.ts";
import { citySlug } from "./slug.ts";
import type {
  GeoService,
  GeoOverrides,
  GeoCountry,
  GeoRegion,
  GeoCity,
  GeoServiceConfig,
  GeoProviderEntry,
  GeoProviderResult,
  GeoLocalizedSlug,
} from "./types.ts";

/**
 * RFC-0238: country-state-city returns short canonical names (e.g. "Freiburg"),
 * but German composite-city names need full qualifiers ("Freiburg im Breisgau",
 * "Frankfurt am Main", "Ludwigshafen am Rhein") for uniqueness and SEO.
 *
 * DEFAULT_OVERRIDES corrects these at the source so every consumer gets the
 * full name without repeating the override.  New composite cities should be
 * added here keyed by their stable baseId (<country>-<state>-<short-slug>).
 */
const DEFAULT_OVERRIDES: GeoOverrides = {
  cityNames: {
    "de-bw-freiburg": { de: "Freiburg im Breisgau", uk: "Фрайбург-ім-Брайсгау" },
  },
};

const DEFAULT_COUNTRIES: string[] = ["DE"];
const DEFAULT_LANGUAGES: string[] = ["de", "uk"];

function mergeOverrides(defaults: GeoOverrides, caller?: GeoOverrides): GeoOverrides {
  if (!caller) return defaults;
  return {
    cityNames: { ...defaults.cityNames, ...caller.cityNames },
    citySlugs: { ...defaults.citySlugs, ...caller.citySlugs },
    regionNames: { ...defaults.regionNames, ...caller.regionNames },
  };
}

interface ProviderStrategyContext {
  langs: string[];
  defaultLang: string;
  imageResolver: ((neutral: string) => string | undefined) | undefined;
  filterValues: Set<string> | undefined;
  allCountries: GeoCountry[];
  allRegions: GeoRegion[];
  allCities: GeoCity[];
}

interface ProviderStrategy {
  collect(ctx: ProviderStrategyContext): {
    entries: GeoProviderEntry[];
    localized: Map<string, GeoLocalizedSlug>;
  };
}

const providerStrategies: Record<string, ProviderStrategy> = {
  "geo.countries": {
    collect(ctx) {
      const entries: GeoProviderEntry[] = [];
      const localized = new Map<string, GeoLocalizedSlug>();
      for (const c of ctx.allCountries) {
        if (ctx.filterValues && !ctx.filterValues.has(c.slug)) continue;
        entries.push({ slug: c.slug, data: { name: c.names[ctx.defaultLang] ?? c.slug } });
        localized.set(c.slug, { neutral: c.slug });
      }
      return { entries, localized };
    },
  },
  "geo.regions": {
    collect(ctx) {
      const entries: GeoProviderEntry[] = [];
      const localized = new Map<string, GeoLocalizedSlug>();
      for (const r of ctx.allRegions) {
        if (ctx.filterValues && !ctx.filterValues.has(r.slug)) continue;
        entries.push({ slug: r.slug, data: { name: r.names[ctx.defaultLang] ?? r.slug } });
        localized.set(r.slug, { neutral: r.slug });
      }
      return { entries, localized };
    },
  },
  "geo.cities": {
    collect(ctx) {
      const entries: GeoProviderEntry[] = [];
      const localized = new Map<string, GeoLocalizedSlug>();
      const cityByNeutral = new Map<
        string,
        { city: GeoCity; data: Record<string, unknown>; hasImage: boolean }
      >();
      for (const city of ctx.allCities) {
        const neutral = city.slugByLang[ctx.defaultLang] ?? city.id;
        if (ctx.filterValues && !ctx.filterValues.has(neutral)) continue;
        const data: Record<string, unknown> = { name: city.names[ctx.defaultLang] ?? neutral };
        let hasImage = false;
        if (ctx.imageResolver) {
          const imageSlug = ctx.imageResolver(neutral);
          if (imageSlug) {
            data.image = imageSlug;
            data.imageAlt = city.names[ctx.defaultLang] ?? neutral;
            hasImage = true;
          }
        }
        const existing = cityByNeutral.get(neutral);
        if (!existing || (hasImage && !existing.hasImage)) {
          cityByNeutral.set(neutral, { city, data, hasImage });
        }
      }
      for (const { city, data } of cityByNeutral.values()) {
        const neutral = city.slugByLang[ctx.defaultLang] ?? city.id;
        entries.push({ slug: neutral, data });
        const byLang: Record<string, string> = {};
        for (const l of ctx.langs) {
          if (l !== ctx.defaultLang && city.slugByLang[l] && city.slugByLang[l] !== neutral) {
            byLang[l] = city.slugByLang[l];
          }
        }
        localized.set(neutral, Object.keys(byLang).length ? { neutral, byLang } : { neutral });
      }
      return { entries, localized };
    },
  },
};

function resolveProviderEntries(
  provider: string,
  langs: string[],
  defaultLang: string,
  imageResolver: ((neutral: string) => string | undefined) | undefined,
  filterValues: Set<string> | undefined,
  allCountries: GeoCountry[],
  allRegions: GeoRegion[],
  allCities: GeoCity[],
): GeoProviderResult {
  const strategy = providerStrategies[provider];
  if (!strategy) {
    throw new Error(`[geo] Unknown provider: "${provider}"`);
  }
  return strategy.collect({
    langs,
    defaultLang,
    imageResolver,
    filterValues,
    allCountries,
    allRegions,
    allCities,
  });
}

export function createGeoService(config?: GeoServiceConfig): GeoService {
  const countries = config?.countries ?? DEFAULT_COUNTRIES;
  const languages = config?.languages ?? DEFAULT_LANGUAGES;
  const overrides = mergeOverrides(DEFAULT_OVERRIDES, config?.overrides);

  const allCities: GeoCity[] = [];
  const cityById = new Map<string, GeoCity>();
  const citiesByRegion = new Map<string, GeoCity[]>();

  for (const cc of countries) {
    const cities = buildCityCatalog(cc, overrides, languages);
    for (const c of cities) {
      allCities.push(c);
      cityById.set(c.id, c);
      const arr = citiesByRegion.get(c.regionCode) ?? [];
      arr.push(c);
      citiesByRegion.set(c.regionCode, arr);
    }
  }

  const regionCodes = new Set(allCities.map((c) => c.regionCode));
  const allRegionsList = [...regionCodes]
    .map((code) => getRegion(code, overrides, languages))
    .filter(Boolean) as GeoRegion[];

  const allCountriesList = countries
    .map((cc) => getCountry(cc, languages))
    .filter(Boolean) as GeoCountry[];

  return {
    country(alpha2) {
      return getCountry(alpha2, languages);
    },
    region(code) {
      return getRegion(code, overrides, languages);
    },
    city(id) {
      return cityById.get(id);
    },
    citiesOfRegion(code) {
      return citiesByRegion.get(code) ?? [];
    },
    allCountries() {
      return allCountriesList;
    },
    allRegions() {
      return allRegionsList;
    },
    allCities() {
      return allCities;
    },
    citySlug,
    providerEntries(provider, langs, defaultLang, options) {
      return resolveProviderEntries(
        provider,
        langs,
        defaultLang,
        options?.imageResolver,
        options?.filterValues,
        allCountriesList,
        allRegionsList,
        allCities,
      );
    },
  };
}
