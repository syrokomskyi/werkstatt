/*
<MODULE_CONTRACT>
<purpose>Maintains packages/geo/src/types.ts as an authored geo authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: define the public type surface for the shared geo gazetteer.</item>
  <item>Architecture review 2026-07-10: add GeoServiceConfig, SlugStrategy, GeoProviderResult, regionNames override.</item>
</CHANGE_SUMMARY>
*/

export type Alpha2 = string;
export type Alpha3 = string;
export type RegionCode = string;

export interface GeoCountry {
  alpha2: Alpha2;
  alpha3: Alpha3;
  slug: string;
  names: Record<string, string>;
}

export interface GeoRegion {
  code: RegionCode;
  countryAlpha2: Alpha2;
  subdivision: string;
  slug: string;
  names: Record<string, string>;
}

export interface GeoCity {
  id: string;
  countryAlpha2: Alpha2;
  regionCode: RegionCode;
  names: Record<string, string>;
  /** Locale-aware Latin URL slug per language (de "stuttgart", uk "shtuthart"). */
  slugByLang: Record<string, string>;
}

export interface GeoOverrides {
  cityNames?: Record<string, Record<string, string>>;
  citySlugs?: Record<string, Record<string, string>>;
  regionNames?: Record<string, Record<string, string>>;
}

export interface GeoServiceConfig {
  /** ISO 3166-1 alpha-2 country codes to include. Default: ["DE"]. */
  countries?: Alpha2[];
  /** Output languages for names and slugs. Default: ["de", "uk"]. */
  languages?: string[];
  /** Caller-provided overrides merged on top of DEFAULT_OVERRIDES. */
  overrides?: GeoOverrides;
}

/** Structurally identical to LocalizedSlug in @warpgogol/surface. Duplicated to avoid a @warpgogol/geo -> @warpgogol/surface dependency (which would form a workspace cycle). */
export interface GeoLocalizedSlug {
  neutral: string;
  byLang?: Record<string, string>;
}

export interface GeoProviderEntry {
  slug: string;
  data: Record<string, unknown>;
}

export interface GeoProviderResult {
  entries: GeoProviderEntry[];
  localized: Map<string, GeoLocalizedSlug>;
}

export interface SlugStrategy {
  slug(name: string): string;
}

export interface GeoService {
  country(alpha2: Alpha2): GeoCountry | undefined;
  region(code: RegionCode): GeoRegion | undefined;
  city(id: string): GeoCity | undefined;
  citiesOfRegion(code: RegionCode): GeoCity[];
  allCountries(): GeoCountry[];
  allRegions(): GeoRegion[];
  allCities(): GeoCity[];
  citySlug(name: string, lang: string): string;
  providerEntries(
    provider: string,
    langs: string[],
    defaultLang: string,
    options?: {
      /** Returns an image slug (e.g. "freiburg-skyline") for a neutral slug, or undefined if no image exists. Injected by the consumer to keep @warpgogol/geo app-agnostic. */
      imageResolver?: (neutral: string) => string | undefined;
      filterValues?: Set<string>;
    },
  ): GeoProviderResult;
}
