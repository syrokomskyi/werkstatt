/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/geo.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: add geo catalog validation and slug preview commands.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { createGeoService, citySlug } from "@warpgogol/geo";
import { passResult, failResult } from "./result-helpers.ts";

/** Validate that the geo catalog loads and every entry has required fields. */
export async function runGeoCatalogValidate(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const geo = createGeoService();
  const violations: string[] = [];

  // Pilot: DE must resolve
  const de = geo.country("DE");
  if (!de) {
    violations.push("GEO-CAT-01: country DE not found in catalog");
  } else {
    if (de.alpha3 !== "deu")
      violations.push(`GEO-CAT-02: DE alpha3 is "${de.alpha3}", expected "deu"`);
    if (!de.slug) violations.push("GEO-CAT-03: DE missing slug");
  }

  // Region DE-BW must resolve
  const bw = geo.region("DE-BW");
  if (!bw) {
    violations.push("GEO-CAT-04: region DE-BW not found");
  } else {
    if (!bw.slug) violations.push("GEO-CAT-05: region DE-BW missing slug");
  }

  // Cities for DE-BW must be non-empty
  const cities = geo.citiesOfRegion("DE-BW");
  if (cities.length === 0) {
    violations.push("GEO-CAT-06: no cities found for region DE-BW");
  }

  // Every city must have slugByLang for de and uk
  for (const city of cities) {
    if (!city.slugByLang.de) violations.push(`GEO-CAT-07: city ${city.id} missing de slug`);
    if (!city.slugByLang.uk) violations.push(`GEO-CAT-08: city ${city.id} missing uk slug`);
  }

  if (violations.length > 0) {
    return failResult("geo.catalog.validate", violations);
  }
  return passResult("geo.catalog.validate", `ok (${cities.length} cities in DE-BW)`);
}

/** Preview the locale-aware slug for a city name. */
export async function runGeoSlugPreview(
  input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const name = input.flags["name"] as string | undefined;
  const lang = (input.flags.lang as string | undefined) ?? "de";
  if (!name) {
    return failResult("geo.slug.preview", [
      "usage: geo.slug.preview --name <city-name> --lang=<lang>",
    ]);
  }
  const slug = citySlug(name, lang);
  return passResult("geo.slug.preview", `"${name}" → "${slug}" (lang=${lang})`);
}
