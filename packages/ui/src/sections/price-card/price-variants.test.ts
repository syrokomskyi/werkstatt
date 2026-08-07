/*
<MODULE_CONTRACT>
<purpose>Unit tests for price-variants utilities (RFC-0743) — formatPrice, loadDerivedPrices, and buildPriceVariants.</purpose>
<non-goals>
  <item>Does not test formatRecurrence — that is covered by share tests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by review fix G-3 — tests for extracted buildPriceVariants logic.</item>
  <item>Review fix A-1/G-3: added tests for formatPrice and loadDerivedPrices.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildPriceVariants,
  formatPrice,
  loadDerivedPrices,
  type DerivedPriceEntry,
} from "./price-variants.js";

const NOTE_TEMPLATE_DE = "Preis berechnet nach Kurs 1 EUR = {rate} {currency}.";

const SAMPLE_DERIVED: Record<string, DerivedPriceEntry[]> = {
  "https://example.com/offering/main": [
    {
      chargeRef: "monthlySubscription",
      targetCurrency: "UAH",
      amount: { value: "540.00", currency: "UAH" },
      trace: {
        source: { amount: "15.00", currency: "EUR" },
        rate: { value: "36.00", pair: "EUR/UAH" },
      },
    },
    {
      chargeRef: "yearlySubscription",
      targetCurrency: "UAH",
      amount: { value: "5400.00", currency: "UAH" },
      trace: {
        source: { amount: "150.00", currency: "EUR" },
        rate: { value: "36.00", pair: "EUR/UAH" },
      },
    },
  ],
};

describe("buildPriceVariants", () => {
  it("returns null when offeringRef is undefined", () => {
    const result = buildPriceVariants(
      { amount: "15.00", currency: "EUR", recurrence: "P1M" },
      "monthlySubscription",
      "de",
      undefined,
      SAMPLE_DERIVED,
      NOTE_TEMPLATE_DE,
    );
    expect(result).toBeNull();
  });

  it("returns null when derivedPrices is null", () => {
    const result = buildPriceVariants(
      { amount: "15.00", currency: "EUR", recurrence: "P1M" },
      "monthlySubscription",
      "de",
      "https://example.com/offering/main",
      null,
      NOTE_TEMPLATE_DE,
    );
    expect(result).toBeNull();
  });

  it("returns null when sourceProp is undefined", () => {
    const result = buildPriceVariants(
      undefined,
      "monthlySubscription",
      "de",
      "https://example.com/offering/main",
      SAMPLE_DERIVED,
      NOTE_TEMPLATE_DE,
    );
    expect(result).toBeNull();
  });

  it("returns null when offeringRef not in derivedPrices", () => {
    const result = buildPriceVariants(
      { amount: "15.00", currency: "EUR", recurrence: "P1M" },
      "monthlySubscription",
      "de",
      "https://example.com/offering/other",
      SAMPLE_DERIVED,
      NOTE_TEMPLATE_DE,
    );
    expect(result).toBeNull();
  });

  it("returns null when chargeRef has no matching entries", () => {
    const result = buildPriceVariants(
      { amount: "15.00", currency: "EUR", recurrence: "P1M" },
      "activation",
      "de",
      "https://example.com/offering/main",
      SAMPLE_DERIVED,
      NOTE_TEMPLATE_DE,
    );
    expect(result).toBeNull();
  });

  it("returns null when only source variant exists (no derived match)", () => {
    const result = buildPriceVariants(
      { amount: "15.00", currency: "EUR", recurrence: "P1M" },
      "nonexistent",
      "de",
      "https://example.com/offering/main",
      SAMPLE_DERIVED,
      NOTE_TEMPLATE_DE,
    );
    expect(result).toBeNull();
  });

  it("builds source + derived variants with note", () => {
    const result = buildPriceVariants(
      { amount: "15.00", currency: "EUR", recurrence: "P1M" },
      "monthlySubscription",
      "de",
      "https://example.com/offering/main",
      SAMPLE_DERIVED,
      NOTE_TEMPLATE_DE,
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);

    expect(result![0].currency).toBe("EUR");
    expect(result![0].note).toBeNull();

    expect(result![1].currency).toBe("UAH");
    expect(result![1].note).toBe("Preis berechnet nach Kurs 1 EUR = 36.00 UAH.");
  });

  it("returns null when only one variant (source only, no derived match for chargeRef)", () => {
    const singleEntryDerived: Record<string, DerivedPriceEntry[]> = {
      "https://example.com/offering/main": [
        {
          chargeRef: "yearlySubscription",
          targetCurrency: "UAH",
          amount: { value: "5400.00", currency: "UAH" },
          trace: {
            source: { amount: "150.00", currency: "EUR" },
            rate: { value: "36.00", pair: "EUR/UAH" },
          },
        },
      ],
    };

    const result = buildPriceVariants(
      { amount: "15.00", currency: "EUR", recurrence: "P1M" },
      "monthlySubscription",
      "de",
      "https://example.com/offering/main",
      singleEntryDerived,
      NOTE_TEMPLATE_DE,
    );
    expect(result).toBeNull();
  });

  it("produces null note when noteTemplate is undefined", () => {
    const result = buildPriceVariants(
      { amount: "15.00", currency: "EUR", recurrence: "P1M" },
      "monthlySubscription",
      "de",
      "https://example.com/offering/main",
      SAMPLE_DERIVED,
      undefined,
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![1].note).toBeNull();
  });
});

describe("formatPrice", () => {
  it("returns empty string for undefined prop", () => {
    expect(formatPrice(undefined, "de")).toBe("");
  });

  it("returns empty string for empty amount", () => {
    expect(formatPrice({ amount: "", currency: "EUR" }, "de")).toBe("");
  });

  it("returns empty string for non-numeric amount", () => {
    expect(formatPrice({ amount: "abc", currency: "EUR" }, "de")).toBe("");
  });

  it("formats price with currency symbol", () => {
    const result = formatPrice({ amount: "15.00", currency: "EUR" }, "de");
    expect(result).toContain("15");
    expect(result).toContain("€");
  });

  it("defaults to EUR when currency is missing", () => {
    const result = formatPrice({ amount: "15.00" }, "de");
    expect(result).toContain("€");
  });
});

describe("loadDerivedPrices", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `price-variants-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(testDir, "src"), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns null when file does not exist (ENOENT)", () => {
    expect(loadDerivedPrices(testDir)).toBeNull();
  });

  it("returns parsed data when file exists", () => {
    const data: Record<string, DerivedPriceEntry[]> = {
      "https://example.com/offering/main": [
        {
          chargeRef: "monthlySubscription",
          targetCurrency: "UAH",
          amount: { value: "540.00", currency: "UAH" },
          trace: {
            source: { amount: "15.00", currency: "EUR" },
            rate: { value: "36.00", pair: "EUR/UAH" },
          },
        },
      ],
    };
    writeFileSync(join(testDir, "src", "derived-prices.generated.json"), JSON.stringify(data));

    const result = loadDerivedPrices(testDir);

    expect(result).not.toBeNull();
    expect(result!["https://example.com/offering/main"]).toHaveLength(1);
    expect(result!["https://example.com/offering/main"][0].chargeRef).toBe("monthlySubscription");
  });

  it("throws on invalid JSON", () => {
    writeFileSync(join(testDir, "src", "derived-prices.generated.json"), "{ invalid json }");

    expect(() => loadDerivedPrices(testDir)).toThrow();
  });
});
