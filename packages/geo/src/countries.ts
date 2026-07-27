/*
<MODULE_CONTRACT>
<purpose>Country lookup via i18n-iso-countries (alpha-2 / alpha-3 / localized names).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: add localized country lookup as the country layer of @gogol/geo.</item>
  <item>Architecture review 2026-07-10: make language set configurable instead of hard-coding de/uk.</item>
</CHANGE_SUMMARY>
*/

import i18nCountries from "i18n-iso-countries";
import deLocale from "i18n-iso-countries/langs/de.json" with { type: "json" };
import ukLocale from "i18n-iso-countries/langs/uk.json" with { type: "json" };
import type { GeoCountry } from "./types.ts";

const { getName, alpha2ToAlpha3, registerLocale } = i18nCountries;

registerLocale(deLocale);
registerLocale(ukLocale);

const registeredLocales = new Set<string>(["de", "uk"]);

/** Resolve a country by its ISO 3166-1 alpha-2 code. */
export function getCountry(alpha2: string, languages?: string[]): GeoCountry | undefined {
  const alpha3 = alpha2ToAlpha3(alpha2);
  if (!alpha3) return undefined;
  const langs = languages ?? ["de", "uk"];
  const names: Record<string, string> = {};
  for (const lang of langs) {
    names[lang] = registeredLocales.has(lang) ? (getName(alpha2, lang) ?? alpha2) : alpha2;
  }
  return {
    alpha2,
    alpha3: alpha3.toLowerCase(),
    slug: alpha3.toLowerCase(),
    names,
  };
}
