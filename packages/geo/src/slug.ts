/*
<MODULE_CONTRACT>
<purpose>Maintains packages/geo/src/slug.ts as an authored geo authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0237: add German and Ukrainian slug derivation for geo-driven URLs.</item>
  <item>Architecture review 2026-07-10: refactor to SlugStrategy registry for language extensibility.</item>
</CHANGE_SUMMARY>
*/

import slugify from "@sindresorhus/slugify";
import CyrillicToTranslit from "cyrillic-to-translit-js";
import type { SlugStrategy } from "./types.ts";

interface CyrillicTranslit {
  transform(value: string): string;
}

interface CyrillicTranslitConstructor {
  new (options: { preset: "uk" }): CyrillicTranslit;
}

const germanReplacements: Array<[string, string]> = [
  ["ä", "ae"],
  ["ö", "oe"],
  ["ü", "ue"],
  ["ß", "ss"],
  ["Ä", "Ae"],
  ["Ö", "Oe"],
  ["Ü", "Ue"],
];

class GermanSlugStrategy implements SlugStrategy {
  slug(name: string): string {
    return slugify(name, { customReplacements: germanReplacements });
  }
}

class UkrainianSlugStrategy implements SlugStrategy {
  private readonly translit = new (CyrillicToTranslit as unknown as CyrillicTranslitConstructor)({
    preset: "uk",
  });
  slug(name: string): string {
    return slugify(this.translit.transform(name));
  }
}

class DefaultSlugStrategy implements SlugStrategy {
  slug(name: string): string {
    return slugify(name);
  }
}

const slugStrategies = new Map<string, SlugStrategy>([
  ["de", new GermanSlugStrategy()],
  ["uk", new UkrainianSlugStrategy()],
]);

const defaultStrategy = new DefaultSlugStrategy();

/** Locale-aware Latin URL slug for a city name. */
export function citySlug(name: string, lang: string): string {
  return (slugStrategies.get(lang) ?? defaultStrategy).slug(name);
}
