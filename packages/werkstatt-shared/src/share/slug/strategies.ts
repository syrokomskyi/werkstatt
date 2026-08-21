/*
<MODULE_CONTRACT>
<purpose>Canonical slug generation strategies for locale-aware URL slug derivation (RFC-0915, DNA-88).</purpose>
<non-goals>
  <item>Do not expose strategy classes directly — consumers use slugUrl() from slug-url.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0915: extracted from werkstatt-site/src/domain/geo/slug.ts as canonical slug strategies.</item>
</CHANGE_SUMMARY>
*/

import slugify from "@sindresorhus/slugify";
import CyrillicToTranslit from "cyrillic-to-translit-js";

export interface SlugStrategy {
  slug(name: string): string;
}

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

export function resolveSlugStrategy(lang?: string): SlugStrategy {
  return (lang ? slugStrategies.get(lang) : undefined) ?? defaultStrategy;
}
