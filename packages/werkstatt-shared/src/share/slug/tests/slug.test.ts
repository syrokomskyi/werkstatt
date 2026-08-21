/*
<MODULE_CONTRACT>
  <purpose>RFC-0915: unit tests for canonical slug module output compatibility.</purpose>
  <keywords>RFC-0915, slug, slugUrl, slugId, HeadingSlugger, DNA-88</keywords>
  <responsibilities>
    <item>Verify slugUrl locale-aware output for DE, UK, and default locales.</item>
    <item>Verify slugId semantic block ID output and empty fallback.</item>
    <item>Verify HeadingSlugger deduplication behavior.</item>
  </responsibilities>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0915: initial unit tests for canonical slug module.</item></CHANGE_SUMMARY>
*/

import { test, expect, describe } from "vitest";
import { slugUrl, slugId, HeadingSlugger } from "../index.ts";

describe("slugUrl", () => {
  test("German umlauts are expanded", () => {
    expect(slugUrl("München", "de")).toBe("muenchen");
    expect(slugUrl("Köln", "de")).toBe("koeln");
    expect(slugUrl("Düsseldorf", "de")).toBe("duesseldorf");
    expect(slugUrl("ß", "de")).toBe("ss");
  });

  test("Ukrainian Cyrillic is transliterated", () => {
    expect(slugUrl("Київ", "uk")).toBe("kyiv");
    expect(slugUrl("Львів", "uk")).toBe("lviv");
  });

  test("Default locale passes through", () => {
    expect(slugUrl("Hello World")).toBe("hello-world");
    expect(slugUrl("Berlin", "en")).toBe("berlin");
    expect(slugUrl("New York", "en")).toBe("new-york");
  });

  test("Returns entity for empty input", () => {
    expect(slugUrl("")).toBe("entity");
    expect(slugUrl("!!!", "de")).toBe("entity");
  });

  test("Is idempotent", () => {
    const once = slugUrl("Frankfurt am Main", "de");
    expect(slugUrl(once, "de")).toBe(once);
  });
});

describe("slugId", () => {
  test("Generates kebab-case ID from heading", () => {
    expect(slugId("Fazit")).toBe("fazit");
    expect(slugId("Preisvergleich")).toBe("preisvergleich");
    expect(slugId("FAQ & Antworten")).toBe("faq-and-antworten");
  });

  test("Returns entity for empty input", () => {
    expect(slugId("")).toBe("entity");
    expect(slugId("!!!")).toBe("entity");
  });
});

describe("HeadingSlugger", () => {
  test("First occurrence has no suffix", () => {
    const slugger = new HeadingSlugger();
    expect(slugger.slug("Fazit")).toBe("fazit");
  });

  test("Second occurrence gets -1 suffix", () => {
    const slugger = new HeadingSlugger();
    slugger.slug("Fazit");
    expect(slugger.slug("Fazit")).toBe("fazit-1");
  });

  test("Third occurrence gets -2 suffix", () => {
    const slugger = new HeadingSlugger();
    slugger.slug("Fazit");
    slugger.slug("Fazit");
    expect(slugger.slug("Fazit")).toBe("fazit-2");
  });

  test("Different headings do not collide", () => {
    const slugger = new HeadingSlugger();
    expect(slugger.slug("Preis")).toBe("preis");
    expect(slugger.slug("Fazit")).toBe("fazit");
  });
});
