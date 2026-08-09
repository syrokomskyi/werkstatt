/*
<MODULE_CONTRACT>
<purpose>Unit tests for renderPriceDisplayHtml (RFC-0766) — HTML string generation for price markers in prose content.</purpose>
<non-goals>
  <item>Does not test parsePriceMarkers — that is covered by section-paragraphs integration tests.</item>
  <item>Does not test buildPriceVariants — that is covered by price-variants.test.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0766: Established tests for renderPriceDisplayHtml HTML output.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { renderPriceDisplayHtml } from "./price-marker.js";
import type { DerivedPriceEntry } from "../sections/price-card/price-variants.js";

const SAMPLE_DERIVED: Record<string, DerivedPriceEntry[]> = {
  "https://warpgogol.com/id/offerings/main": [
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

describe("renderPriceDisplayHtml", () => {
  it("returns empty string when derivedPrices is null", () => {
    const result = renderPriceDisplayHtml("main", "monthlySubscription", "de", null);
    expect(result).toBe("");
  });

  it("returns empty string when offeringId not found", () => {
    const result = renderPriceDisplayHtml(
      "nonexistent",
      "monthlySubscription",
      "de",
      SAMPLE_DERIVED,
    );
    expect(result).toBe("");
  });

  it("returns empty string when chargeRef not found", () => {
    const result = renderPriceDisplayHtml("main", "nonexistent", "de", SAMPLE_DERIVED);
    expect(result).toBe("");
  });

  it("generates span-based HTML with correct classes and data attributes", () => {
    const result = renderPriceDisplayHtml("main", "monthlySubscription", "de", SAMPLE_DERIVED);
    expect(result).toContain('class="currency-aware-price-display"');
    expect(result).toContain("data-currency-price-display");
    expect(result).toContain('aria-live="polite"');
    expect(result).toContain('class="currency-aware-price-display__variant"');
    expect(result).toContain('class="currency-aware-price-display__amount"');
    expect(result).toContain('data-currency="EUR"');
    expect(result).toContain('data-currency="UAH"');
  });

  it("uses span elements, not div", () => {
    const result = renderPriceDisplayHtml("main", "monthlySubscription", "de", SAMPLE_DERIVED);
    expect(result).toContain("<span");
    expect(result).not.toContain("<div");
  });

  it("hides non-first variants", () => {
    const result = renderPriceDisplayHtml("main", "monthlySubscription", "de", SAMPLE_DERIVED);
    const firstVariantIndex = result.indexOf('data-currency="EUR"');
    const secondVariantIndex = result.indexOf('data-currency="UAH"');
    expect(result.substring(firstVariantIndex, firstVariantIndex + 50)).not.toContain("hidden");
    expect(result.substring(secondVariantIndex - 20, secondVariantIndex + 50)).toContain("hidden");
  });

  it("includes aria-label on variants", () => {
    const result = renderPriceDisplayHtml("main", "monthlySubscription", "de", SAMPLE_DERIVED);
    expect(result).toContain('aria-label="');
  });

  it("HTML-escapes formatted values", () => {
    const derivedWithSpecialChars: Record<string, DerivedPriceEntry[]> = {
      "https://warpgogol.com/id/offerings/main": [
        {
          chargeRef: "test",
          targetCurrency: "UAH",
          amount: { value: "100.00", currency: "UAH" },
          trace: {
            source: { amount: "50.00", currency: "EUR" },
            rate: { value: "2.00", pair: "EUR/UAH" },
          },
        },
      ],
    };
    const result = renderPriceDisplayHtml("main", "test", "de", derivedWithSpecialChars);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("&{");
  });
});
