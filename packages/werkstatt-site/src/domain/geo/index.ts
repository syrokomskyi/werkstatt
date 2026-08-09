/*
<MODULE_CONTRACT>
<purpose>Maintains packages/geo/src/index.ts as an authored geo authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: expose the shared geo service and contracts through a single package entrypoint.</item>
  <item>Architecture review 2026-07-10: export new types, SlugStrategy, registerSlugStrategy.</item>
</CHANGE_SUMMARY>
*/

export type {
  Alpha2,
  Alpha3,
  RegionCode,
  GeoCountry,
  GeoRegion,
  GeoCity,
  GeoService,
  GeoOverrides,
  GeoServiceConfig,
  GeoLocalizedSlug,
  GeoProviderEntry,
  GeoProviderResult,
} from "./types.ts";

export { createGeoService } from "./service.ts";
export { citySlug } from "./slug.ts";
