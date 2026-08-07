/*
<MODULE_CONTRACT>
<purpose>Unit tests for buildPriceProjection (RFC-0742).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0742 — tests for price projection builder, display config, and allowedUses enforcement.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { buildPriceProjection, DEFAULT_DISPLAY_CONFIG } from "../price-projection.js";
import type { PbpMaterializedDerivedPrice } from "../../materialized-derived-price.js";
import type { PbpCurrentUses } from "../../entities/currency-pricing-policy.js";
import type { PbpCurrencyConversionTrace } from "../../derivations/currency-conversion.js";

function makeAllowedUses(overrides: Partial<PbpCurrentUses> = {}): PbpCurrentUses {
  return {
    presentation: true,
    aiAnswers: true,
    quote: false,
    contract: false,
    invoice: false,
    settlement: false,
    ...overrides,
  };
}

function makeTrace(
  sourceCurrency: string,
  targetCurrency: string,
  rateValue: string,
): PbpCurrencyConversionTrace {
  return {
    source: { amount: "100.00", currency: sourceCurrency },
    rate: {
      value: rateValue,
      pair: `${sourceCurrency}/${targetCurrency}`,
      direction: "target-per-source",
      sourceKind: "external",
      observedAt: "2026-08-01T00:00:00.000Z",
      snapshotDigest: "sha256:abc123",
    },
    model: { id: "currency-conversion", version: "1" },
    calculation: {
      conversion: { input: "100.00", rate: rateValue, output: "4618.00" },
      rounding: { mode: "half-up", decimalPlaces: 2, output: "4618.00" },
    },
    result: { amount: "4618.00", currency: targetCurrency },
  };
}

function makeMaterializedPrice(
  overrides: Partial<PbpMaterializedDerivedPrice> = {},
): PbpMaterializedDerivedPrice {
  return {
    chargeRef: "monthly",
    targetCurrency: "UAH",
    amount: { value: "4618.00", currency: "UAH" },
    priceKind: "derived",
    commercialMeaning: "derived-price",
    derivation: {
      modelRef: "pbp-derivation:currency-conversion/1",
      modelVersion: "1",
      calculatedAt: "2026-08-01T00:00:00.000Z",
    },
    trace: makeTrace("EUR", "UAH", "46.18"),
    allowedUses: makeAllowedUses(),
    ...overrides,
  };
}

describe("buildPriceProjection", () => {
  it("returns null when allowedUses.presentation is false", () => {
    const materialized = makeMaterializedPrice({
      allowedUses: makeAllowedUses({ presentation: false }),
    });
    expect(buildPriceProjection(materialized, "uk")).toBeNull();
  });

  it("produces UK disclosure note for derived-price commercialMeaning", () => {
    const materialized = makeMaterializedPrice();
    const projection = buildPriceProjection(materialized, "uk");
    expect(projection).not.toBeNull();
    expect(projection!.display.note).toContain("Ціна розрахована за курсом");
    expect(projection!.display.note).toContain("46.18");
    expect(projection!.display.note).toContain("UAH");
  });

  it("produces DE disclosure note for derived-price commercialMeaning", () => {
    const materialized = makeMaterializedPrice();
    const projection = buildPriceProjection(materialized, "de");
    expect(projection).not.toBeNull();
    expect(projection!.display.note).toContain("Preis berechnet nach Kurs");
    expect(projection!.display.note).toContain("46.18");
    expect(projection!.display.note).toContain("UAH");
  });

  it("falls back to UK locale for unsupported locale", () => {
    const materialized = makeMaterializedPrice();
    const projection = buildPriceProjection(materialized, "fr");
    expect(projection).not.toBeNull();
    expect(projection!.display.note).toContain("Ціна розрахована за курсом");
  });

  it("formatted amount contains non-breaking space (U+00A0)", () => {
    const materialized = makeMaterializedPrice();
    const projection = buildPriceProjection(materialized, "uk");
    expect(projection).not.toBeNull();
    expect(projection!.amount.formatted).toContain("\u00A0");
  });

  it("rate.pair is in SOURCE/TARGET format", () => {
    const materialized = makeMaterializedPrice();
    const projection = buildPriceProjection(materialized, "uk");
    expect(projection).not.toBeNull();
    expect(projection!.rate.pair).toBe("EUR/UAH");
  });

  it("copies allowedUses from materialized price", () => {
    const allowedUses = makeAllowedUses({
      presentation: true,
      aiAnswers: false,
      quote: true,
    });
    const materialized = makeMaterializedPrice({ allowedUses });
    const projection = buildPriceProjection(materialized, "uk");
    expect(projection).not.toBeNull();
    expect(projection!.allowedUses).toEqual(allowedUses);
  });

  it("display config follows RFC-0735 decisions #29, #31, #34", () => {
    expect(DEFAULT_DISPLAY_CONFIG.showSourcePrice).toBe(false);
    expect(DEFAULT_DISPLAY_CONFIG.showRate).toBe(true);
    expect(DEFAULT_DISPLAY_CONFIG.showRateDateNearPrice).toBe(false);
  });

  it("display.note does not contain ≈ symbol (decision #33)", () => {
    const materialized = makeMaterializedPrice();
    const projection = buildPriceProjection(materialized, "uk");
    expect(projection).not.toBeNull();
    expect(projection!.display.note).not.toContain("≈");
  });

  it("formatted rate contains source and target currency", () => {
    const materialized = makeMaterializedPrice();
    const projection = buildPriceProjection(materialized, "de");
    expect(projection).not.toBeNull();
    expect(projection!.rate.formatted).toContain("EUR");
    expect(projection!.rate.formatted).toContain("UAH");
  });
});
