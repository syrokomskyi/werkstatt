import { test, expect } from "vitest";
import {
  resolveReference,
  resolveReferencesInString,
  resolveReferencesDeep,
  EMPTY_CONTENT_REF_INDEX,
  type ContentRefIndex,
} from "../content-reference.ts";

const TEST_INDEX: ContentRefIndex = {
  version: 1,
  generatedAt: "2026-07-25T00:00:00Z",
  collections: ["business", "pages"],
  entries: {
    business: {
      offer: {
        de: {
          price: { monthly: "70 €/Monat", yearly: "700 €/Jahr", setup: "200 € Einrichtung" },
          growthModules: [{ price: "+19 €/Monat je Stadt" }],
        },
      },
      legal: {
        de: { companyName: "Warpgogol GmbH" },
        en: { companyName: "Warpgogol Ltd." },
      },
    },
    pages: {
      "de/index": {
        de: { title: "Startseite", subtitle: "Willkommen" },
      },
    },
  },
};

test("resolveReference — resolves a simple braceless reference", () => {
  const result = resolveReference(TEST_INDEX, "business.offer.price.monthly", "de", "de");
  expect(result.resolved).toBe(true);
  expect(result.value).toBe("70 €/Monat");
});

test("resolveReference — resolves a nested field path", () => {
  const result = resolveReference(TEST_INDEX, "business.legal.companyName", "de", "de");
  expect(result.resolved).toBe(true);
  expect(result.value).toBe("Warpgogol GmbH");
});

test("resolveReference — falls back to default language", () => {
  const result = resolveReference(TEST_INDEX, "business.legal.companyName", "fr", "de");
  expect(result.resolved).toBe(true);
  expect(result.value).toBe("Warpgogol GmbH");
});

test("resolveReference — uses English when lang is en", () => {
  const result = resolveReference(TEST_INDEX, "business.legal.companyName", "en", "de");
  expect(result.resolved).toBe(true);
  expect(result.value).toBe("Warpgogol Ltd.");
});

test("resolveReference — REF-01: missing collection", () => {
  const result = resolveReference(TEST_INDEX, "unknown.coll.field", "de", "de");
  expect(result.resolved).toBe(false);
  expect(result.error).toContain("REF-01");
});

test("resolveReference — REF-02: missing file", () => {
  const result = resolveReference(TEST_INDEX, "business.unknown.field", "de", "de");
  expect(result.resolved).toBe(false);
  expect(result.error).toContain("REF-02");
});

test("resolveReference — REF-03: missing field", () => {
  const result = resolveReference(TEST_INDEX, "business.offer.price.nonexistent", "de", "de");
  expect(result.resolved).toBe(false);
  expect(result.error).toContain("REF-03");
});

test("resolveReference — invalid syntax", () => {
  const result = resolveReference(TEST_INDEX, "not-a-ref", "de", "de");
  expect(result.resolved).toBe(false);
  expect(result.error).toContain("Invalid reference syntax");
});

test("resolveReferencesInString — pure reference string resolves fully", () => {
  const out = resolveReferencesInString(TEST_INDEX, "business.offer.price.monthly", "de", "de");
  expect(out).toBe("70 €/Monat");
});

test("resolveReferencesInString — embedded references in text", () => {
  const out = resolveReferencesInString(
    TEST_INDEX,
    "Preis: business.offer.price.monthly oder business.offer.price.yearly",
    "de",
    "de",
  );
  expect(out).toBe("Preis: 70 €/Monat oder 700 €/Jahr");
});

test("resolveReferencesInString — leaves non-reference text untouched", () => {
  const text = "Hello world, no references here.";
  const out = resolveReferencesInString(TEST_INDEX, text, "de", "de");
  expect(out).toBe(text);
});

test("resolveReferencesInString — empty index leaves text untouched", () => {
  const text = "business.offer.price.monthly should stay as-is";
  const out = resolveReferencesInString(EMPTY_CONTENT_REF_INDEX, text, "de", "de");
  expect(out).toBe(text);
});

test("resolveReferencesDeep — resolves references in nested objects", async () => {
  const data = {
    title: "business.offer.price.monthly",
    nested: { price: "business.offer.price.yearly" },
    list: ["business.offer.price.setup", "plain text"],
    number: 42,
  };
  const out = await resolveReferencesDeep(TEST_INDEX, data, "de", "de");
  expect(out).toEqual({
    title: "70 €/Monat",
    nested: { price: "700 €/Jahr" },
    list: ["200 € Einrichtung", "plain text"],
    number: 42,
  });
});

test("resolveReferencesDeep — handles arrays of objects", async () => {
  const data = [{ name: "business.legal.companyName" }, { name: "plain" }];
  const out = await resolveReferencesDeep(TEST_INDEX, data, "de", "de");
  expect(out).toEqual([{ name: "Warpgogol GmbH" }, { name: "plain" }]);
});

test("resolveReferencesDeep — empty index returns data unchanged", async () => {
  const data = { text: "business.offer.price.monthly" };
  const out = await resolveReferencesDeep(EMPTY_CONTENT_REF_INDEX, data, "de", "de");
  expect(out).toEqual(data);
});
