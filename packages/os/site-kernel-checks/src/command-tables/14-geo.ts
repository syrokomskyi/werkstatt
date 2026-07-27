/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/14-geo.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: add geo command registrations to the data-driven command table set.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runGeoCatalogValidate, runGeoSlugPreview } from "../geo.ts";

export const GEO_COMMANDS: CheckCommandEntry[] = [
  {
    name: "geo.catalog.validate",
    description:
      "Validate the shared geo catalog: country DE resolves, region DE-BW resolves, cities have slugByLang for de and uk (RFC-0237).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/geo/src/catalog.yaml"],
    execute: runGeoCatalogValidate,
  },
  {
    name: "geo.slug.preview",
    description:
      "Preview the locale-aware URL slug for a city name (RFC-0237). Usage: geo.slug.preview <name> --lang=de|uk",
    scope: "workspace",
    flags: {
      lang: {
        kind: "string",
        description: "Language code.",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runGeoSlugPreview,
  },
];
