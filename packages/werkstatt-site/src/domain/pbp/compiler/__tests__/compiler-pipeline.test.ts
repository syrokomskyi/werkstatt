/*
<MODULE_CONTRACT>
<purpose>Golden fixture tests for the PBP compiler pipeline (RFC-0467).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — compiler pipeline golden fixture tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compilePbpProfile } from "../index.js";
import {
  validateSchemaOrgPrices,
  buildCanonicalPriceSet,
  buildCanonicalCurrencySet,
} from "../index.js";
import type { PbpCompilerInput } from "../index.js";
import type { PbpResolvedGraph } from "../types.js";

let testDir: string;

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `pbp-compiler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeEntity(locale: string, filename: string, data: Record<string, unknown>): void {
  const dir = join(testDir, locale);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  writeFileSync(join(dir, filename), `---\n${yaml}\n---\n`);
}

describe("PBP Compiler Pipeline", () => {
  it("compiles a minimal valid business profile", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
      summary: "Software development studio",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    expect(result.inventory.recordsDiscovered).toBe(1);
    expect(result.resolvedGraph.business.id).toBe("https://warpgogol.com/business");
    expect(result.resolvedGraph.business.name).toBe("Warpgogol");
    expect(result.validationErrors).toHaveLength(0);
    expect(result.graphErrors).toHaveLength(0);
    expect(result.context.locale).toBe("de");
    expect(result.context.sourceRevision).toBeDefined();
  });

  it("detects duplicate entity IDs as fatal errors", async () => {
    writeEntity("de", "business-a.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
    });
    writeEntity("de", "business-b.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol Duplicate",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    const dupErrors = result.validationErrors.filter(
      (e: { code: string }) => e.code === "PBP-ID-DUPLICATE",
    );
    expect(dupErrors.length).toBeGreaterThan(0);
  });

  it("detects missing Business singleton", async () => {
    writeEntity("de", "place.md", {
      schema: "pbp/place@1",
      id: "https://warpgogol.com/places/office",
      type: "place",
      status: "published",
      name: "Office",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    await expect(compilePbpProfile(input)).rejects.toThrow(/No Business entity/);
  });

  it("detects dangling references", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
      legalIdentityRef: {
        ref: "https://warpgogol.com/legal-identity",
        expectedType: "legal-identity",
      },
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    const danglingErrors = result.graphErrors.filter(
      (e: { kind: string }) => e.kind === "missing-internal-ref",
    );
    expect(danglingErrors.length).toBeGreaterThan(0);
  });

  it("detects HTML in canonical fields", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "<b>Warpgogol</b>",
      summary: "Software development studio",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "migration",
    };

    const result = await compilePbpProfile(input);

    const htmlErrors = result.validationErrors.filter(
      (e: { code: string }) => e.code === "PBP-HTML",
    );
    expect(htmlErrors.length).toBeGreaterThan(0);
  });

  it("handles empty source directory gracefully", async () => {
    const input: PbpCompilerInput = {
      sourceDirectory: join(testDir, "nonexistent"),
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    await expect(compilePbpProfile(input)).rejects.toThrow(/No Business entity/);
  });

  it("produces deterministic results across runs", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
      summary: "Software development studio",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
      buildTime: "2026-07-20T00:00:00.000Z",
    };

    const result1 = await compilePbpProfile(input);
    const result2 = await compilePbpProfile(input);

    expect(result1.inventory.recordsDiscovered).toBe(result2.inventory.recordsDiscovered);
    expect(result1.entityIndex.size).toBe(result2.entityIndex.size);
    expect(result1.validationErrors.length).toBe(result2.validationErrors.length);
    expect(result1.graphErrors.length).toBe(result2.graphErrors.length);
    expect(result1.context.buildId).toBe(result2.context.buildId);
  });

  it("runs cycle detection on the entity graph", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    expect(result.cycleResults).toHaveLength(5);
    for (const cycleResult of result.cycleResults) {
      expect(cycleResult.hasCycle).toBe(false);
    }
  });

  it("generates Schema.org projection with organization data", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    expect(result.projections.schemaOrg["@type"]).toBe("Organization");
    expect(result.projections.schemaOrg.name).toBe("Warpgogol");
  });

  it("Schema.org projection includes canonical price for offering with fixed charge", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
    });
    writeEntity("de", "offering.md", {
      schema: "pbp/offering@1",
      id: "https://warpgogol.com/offerings/studio",
      type: "offering",
      status: "published",
      name: "Studio Package",
      businessRef: { ref: "https://warpgogol.com/business" },
      pricing: {
        currency: "EUR",
        charges: {
          monthly: {
            type: "recurring",
            purpose: "Monthly subscription",
            amount: { model: "fixed", value: "70.00" },
          },
        },
      },
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    const offers = result.projections.schemaOrg.offers as Array<Record<string, unknown>>;
    const offer = offers.find((o) => o.name === "Studio Package");
    expect(offer).toBeDefined();
    expect(offer!.price).toBe("70.00");
    expect(offer!.priceCurrency).toBe("EUR");
  });

  it("Schema.org projection omits price for offering without pricing", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
    });
    writeEntity("de", "offering.md", {
      schema: "pbp/offering@1",
      id: "https://warpgogol.com/offerings/consulting",
      type: "offering",
      status: "published",
      name: "Consulting",
      businessRef: { ref: "https://warpgogol.com/business" },
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    const offers = result.projections.schemaOrg.offers as Array<Record<string, unknown>>;
    const offer = offers.find((o) => o.name === "Consulting");
    expect(offer).toBeDefined();
    expect(offer!.price).toBeUndefined();
    const schemaPriceErrors = result.validationErrors.filter((e) => e.code === "PBP-SCHEMA-PRICE");
    expect(schemaPriceErrors).toHaveLength(0);
  });

  it("Schema.org projection omits price for offering with only range charges", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
    });
    writeEntity("de", "offering.md", {
      schema: "pbp/offering@1",
      id: "https://warpgogol.com/offerings/custom",
      type: "offering",
      status: "published",
      name: "Custom Project",
      businessRef: { ref: "https://warpgogol.com/business" },
      pricing: {
        currency: "EUR",
        charges: {
          project: {
            type: "one-time",
            purpose: "Project cost",
            amount: { model: "range", minimum: "500.00", maximum: "5000.00" },
          },
        },
      },
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    const offers = result.projections.schemaOrg.offers as Array<Record<string, unknown>>;
    const offer = offers.find((o) => o.name === "Custom Project");
    expect(offer).toBeDefined();
    expect(offer!.price).toBeUndefined();
  });

  it("validateSchemaOrgPrices passes for canonical prices", () => {
    const schemaOrg = {
      offers: [
        { "@type": "Offer", price: "70.00", priceCurrency: "EUR" },
        { "@type": "Offer", price: "150.00", priceCurrency: "EUR" },
      ],
    };
    const canonicalPrices = new Set(["70.00", "150.00"]);
    const canonicalCurrencies = new Set(["EUR"]);
    const errors = validateSchemaOrgPrices(schemaOrg, canonicalPrices, canonicalCurrencies);
    expect(errors).toHaveLength(0);
  });

  it("validateSchemaOrgPrices catches non-canonical price", () => {
    const schemaOrg = {
      offers: [{ "@type": "Offer", price: "3239.00", priceCurrency: "UAH" }],
    };
    const canonicalPrices = new Set(["70.00"]);
    const canonicalCurrencies = new Set(["EUR"]);
    const errors = validateSchemaOrgPrices(schemaOrg, canonicalPrices, canonicalCurrencies);
    expect(errors).toHaveLength(2);
    expect(errors[0].code).toBe("PBP-SCHEMA-PRICE");
    expect(errors[0].severity).toBe("error");
    expect(errors[0].message).toContain("3239.00");
    expect(errors[1].code).toBe("PBP-SCHEMA-PRICE");
    expect(errors[1].message).toContain("UAH");
  });

  it("validateSchemaOrgPrices skips offers without price field", () => {
    const schemaOrg = {
      offers: [{ "@type": "Offer", priceCurrency: "EUR" }],
    };
    const canonicalPrices = new Set(["70.00"]);
    const canonicalCurrencies = new Set(["EUR"]);
    const errors = validateSchemaOrgPrices(schemaOrg, canonicalPrices, canonicalCurrencies);
    expect(errors).toHaveLength(0);
  });

  it("validateSchemaOrgPrices catches non-canonical priceCurrency", () => {
    const schemaOrg = {
      offers: [{ "@type": "Offer", price: "70.00", priceCurrency: "UAH" }],
    };
    const canonicalPrices = new Set(["70.00"]);
    const canonicalCurrencies = new Set(["EUR"]);
    const errors = validateSchemaOrgPrices(schemaOrg, canonicalPrices, canonicalCurrencies);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("PBP-SCHEMA-PRICE");
    expect(errors[0].message).toContain("UAH");
  });

  it("validateSchemaOrgPrices skips empty priceCurrency", () => {
    const schemaOrg = {
      offers: [{ "@type": "Offer", price: "70.00", priceCurrency: "" }],
    };
    const canonicalPrices = new Set(["70.00"]);
    const canonicalCurrencies = new Set(["EUR"]);
    const errors = validateSchemaOrgPrices(schemaOrg, canonicalPrices, canonicalCurrencies);
    expect(errors).toHaveLength(0);
  });

  it("buildCanonicalPriceSet collects fixed-model charge values", () => {
    const graph = {
      offerings: {
        a: {
          id: "a",
          name: "A",
          pricing: {
            currency: "EUR",
            charges: {
              m: {
                type: "recurring",
                purpose: "Monthly",
                amount: { model: "fixed", value: "70.00" },
              },
            },
          },
        },
        b: {
          id: "b",
          name: "B",
          pricing: {
            currency: "EUR",
            charges: {
              r: {
                type: "one-time",
                purpose: "Range",
                amount: { model: "range", minimum: "10", maximum: "100" },
              },
            },
          },
        },
        c: { id: "c", name: "C" },
      },
    } as unknown as PbpResolvedGraph;
    const prices = buildCanonicalPriceSet(graph);
    expect(prices.has("70.00")).toBe(true);
    expect(prices.size).toBe(1);
  });

  it("buildCanonicalCurrencySet collects source currency codes", () => {
    const graph = {
      offerings: {
        a: {
          id: "a",
          name: "A",
          pricing: {
            currency: "EUR",
            charges: {
              m: {
                type: "recurring",
                purpose: "Monthly",
                amount: { model: "fixed", value: "70.00" },
              },
            },
          },
        },
        b: {
          id: "b",
          name: "B",
          pricing: {
            currency: "USD",
            charges: {
              r: {
                type: "one-time",
                purpose: "Range",
                amount: { model: "range", minimum: "10", maximum: "100" },
              },
            },
          },
        },
        c: { id: "c", name: "C" },
      },
    } as unknown as PbpResolvedGraph;
    const currencies = buildCanonicalCurrencySet(graph);
    expect(currencies.has("EUR")).toBe(true);
    expect(currencies.has("USD")).toBe(true);
    expect(currencies.size).toBe(2);
  });

  it("extractCanonicalPrice selects fixed charge by sorted key for determinism", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://warpgogol.com/business",
      type: "business",
      status: "published",
      name: "Warpgogol",
    });
    writeEntity("de", "offering.md", {
      schema: "pbp/offering@1",
      id: "https://warpgogol.com/offerings/multi",
      type: "offering",
      status: "published",
      name: "Multi Charge",
      businessRef: { ref: "https://warpgogol.com/business" },
      pricing: {
        currency: "EUR",
        charges: {
          yearly: {
            type: "recurring",
            purpose: "Yearly",
            amount: { model: "fixed", value: "840.00" },
          },
          monthly: {
            type: "recurring",
            purpose: "Monthly",
            amount: { model: "fixed", value: "70.00" },
          },
        },
      },
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    const offers = result.projections.schemaOrg.offers as Array<Record<string, unknown>>;
    const offer = offers.find((o) => o.name === "Multi Charge");
    expect(offer).toBeDefined();
    // Sorted key order: "monthly" < "yearly", so monthly (70.00) is canonical
    expect(offer!.price).toBe("70.00");
  });
});
