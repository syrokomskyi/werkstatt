/*
<MODULE_CONTRACT>
<purpose>Unit tests for materializeDerivedPrices (RFC-0740).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0740 — tests for materialization logic and validation rules.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { materializeDerivedPrices } from "../materialize.js";
import type { PbpResolvedGraph } from "../types.js";
import type { PbpCurrencyPricingPolicy } from "../../entities/currency-pricing-policy.js";
import type { PbpOffering } from "../../entities/offering.js";
import type { PbpRatePolicy } from "../../entities/rate-policy.js";
import type { PbpRateSnapshot } from "../../entities/rate-snapshot.js";
import type { PbpBusiness } from "../../entities/business.js";

const BUILD_TIME = "2026-08-01T00:00:00.000Z";

function makeBusiness(): PbpBusiness {
  return {
    schema: "pbp/business@1",
    id: "https://example.com/business",
    type: "business",
    status: "published",
    name: "Test Business",
  } as unknown as PbpBusiness;
}

function makeOffering(id: string, currency: string, charges: Record<string, unknown>): PbpOffering {
  return {
    schema: "pbp/offering@1",
    id,
    type: "offering",
    status: "published",
    name: "Test Offering",
    businessRef: { ref: "https://example.com/business" },
    pricing: { currency, charges },
  } as unknown as PbpOffering;
}

function makeRatePolicy(
  id: string,
  sourceCurrency: string,
  targetCurrency: string,
  failure: "source-price-only" | "block-publication" = "source-price-only",
): PbpRatePolicy {
  return {
    schema: "pbp/rate-policy@1",
    id,
    type: "rate-policy",
    status: "published",
    pair: { sourceCurrency, targetCurrency },
    quotation: { direction: "target-per-source" },
    mode: "external",
    freshness: { maximumAge: "P1D", allowLastKnownValue: false },
    failure: { noAcceptableRate: failure },
  };
}

function makeRateSnapshot(
  id: string,
  sourceCurrency: string,
  targetCurrency: string,
  value: string,
  freshUntil: string = "2026-08-02T00:00:00.000Z",
): PbpRateSnapshot {
  return {
    schema: "pbp/rate-snapshot@1",
    id,
    type: "rate-snapshot",
    status: "published",
    pair: { sourceCurrency, targetCurrency },
    quotation: { direction: "target-per-source" },
    value,
    source: { kind: "external" },
    observedAt: "2026-07-31T00:00:00.000Z",
    freshUntil,
    digest: { algorithm: "sha256", value: "abc123" },
  };
}

function makePolicy(
  baseCurrency: string,
  targets: Record<
    string,
    { currency: string; strategy: "derived" | "fixed"; currentUses?: Record<string, boolean> }
  >,
): PbpCurrencyPricingPolicy {
  const targetCurrencies: Record<string, unknown> = {};
  for (const [key, t] of Object.entries(targets)) {
    targetCurrencies[key] = {
      currency: t.currency,
      strategy: t.strategy,
      currentUses: t.currentUses ?? {
        presentation: true,
        aiAnswers: true,
        quote: false,
        contract: false,
        invoice: false,
        settlement: false,
      },
    };
  }
  return {
    schema: "pbp/currency-pricing-policy@1",
    id: "test-currency-policy",
    type: "currency-pricing-policy",
    status: "published",
    businessRef: { ref: "https://example.com/business" },
    baseCurrency,
    targetCurrencies: targetCurrencies,
  } as unknown as PbpCurrencyPricingPolicy;
}

function makeGraph(
  offerings: PbpOffering[],
  ratePolicies: PbpRatePolicy[] = [],
  rateSnapshots: PbpRateSnapshot[] = [],
): PbpResolvedGraph {
  return {
    business: makeBusiness(),
    places: {},
    contactPoints: {},
    webPresences: {},
    products: {},
    categories: {},
    catalogEntries: {},
    offerings: Object.fromEntries(offerings.map((o) => [o.id, o])),
    policies: {},
    claims: {},
    evidenceSources: {},
    disclosures: {},
    publicDocuments: {},
    ratePolicies: Object.fromEntries(ratePolicies.map((rp) => [rp.id, rp])),
    rateSnapshots: Object.fromEntries(rateSnapshots.map((rs) => [rs.id, rs])),
  } as unknown as PbpResolvedGraph;
}

describe("materializeDerivedPrices", () => {
  it("materializes a fixed charge for a derived target currency", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "derived" } });
    const ratePolicy = makeRatePolicy("rp-eur-uah", "EUR", "UAH");
    const snapshot = makeRateSnapshot("rs-eur-uah", "EUR", "UAH", "40.00");
    const graph = makeGraph([offering], [ratePolicy], [snapshot]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(result.prices["offering-1"]).toBeDefined();
    expect(result.prices["offering-1"]).toHaveLength(1);

    const price = result.prices["offering-1"][0];
    expect(price.chargeRef).toBe("monthly");
    expect(price.targetCurrency).toBe("UAH");
    expect(price.amount.currency).toBe("UAH");
    expect(price.amount.value).toBe("4000");
    expect(price.priceKind).toBe("derived");
    expect(price.commercialMeaning).toBe("derived-price");
    expect(price.derivation.modelRef).toContain("currency-conversion");
    expect(price.derivation.calculatedAt).toBe(BUILD_TIME);
    expect(price.trace).toBeDefined();
    expect(price.trace.source.amount).toBe("100.00");
    expect(price.trace.source.currency).toBe("EUR");
    expect(price.trace.rate.value).toBe("40.00");
    expect(price.trace.result.currency).toBe("UAH");
    expect(price.allowedUses.presentation).toBe(true);
  });

  it("skips offerings without pricing", () => {
    const offering: PbpOffering = {
      schema: "pbp/offering@1",
      id: "offering-no-pricing",
      type: "offering",
      status: "published",
      name: "No Pricing",
      businessRef: { ref: "https://example.com/business" },
    } as unknown as PbpOffering;
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "derived" } });
    const graph = makeGraph([offering]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(Object.keys(result.prices)).toHaveLength(0);
  });

  it("skips offerings without charges", () => {
    const offering = makeOffering("offering-no-charges", "EUR", {});
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "derived" } });
    const graph = makeGraph([offering]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(Object.keys(result.prices)).toHaveLength(0);
  });

  it("skips non-fixed charges (range model)", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "range", minimum: "50.00", maximum: "150.00" },
      },
    });
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "derived" } });
    const graph = makeGraph([offering]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(Object.keys(result.prices)).toHaveLength(0);
  });

  it("skips target currencies with fixed strategy", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "fixed" } });
    const graph = makeGraph([offering]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(Object.keys(result.prices)).toHaveLength(0);
  });

  it("reports error when no rate policy exists for derived strategy", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "derived" } });
    const graph = makeGraph([offering]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("PBP-DERIVED-PRICE-03");
    expect(result.errors[0].entityId).toBe("offering-1");
  });

  it("reports error when no applicable snapshot and rate policy blocks publication", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "derived" } });
    const ratePolicy = makeRatePolicy("rp-eur-uah", "EUR", "UAH", "block-publication");
    const graph = makeGraph([offering], [ratePolicy]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const blockErrors = result.errors.filter((e) => e.code === "PBP-DERIVED-PRICE-08");
    expect(blockErrors).toHaveLength(1);
  });

  it("skips silently when no snapshot and rate policy allows source-price-only", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "derived" } });
    const ratePolicy = makeRatePolicy("rp-eur-uah", "EUR", "UAH", "source-price-only");
    const graph = makeGraph([offering], [ratePolicy]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(Object.keys(result.prices)).toHaveLength(0);
  });

  it("skips stale snapshot when allowLastKnownValue is false", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const policy = makePolicy("EUR", { uah: { currency: "UAH", strategy: "derived" } });
    const ratePolicy = makeRatePolicy("rp-eur-uah", "EUR", "UAH", "source-price-only");
    const staleSnapshot = makeRateSnapshot(
      "rs-eur-uah",
      "EUR",
      "UAH",
      "40.00",
      "2026-07-30T00:00:00.000Z",
    );
    const graph = makeGraph([offering], [ratePolicy], [staleSnapshot]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(Object.keys(result.prices)).toHaveLength(0);
  });

  it("materializes multiple charges and multiple target currencies", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
      activation: {
        type: "one-time",
        purpose: "Activation fee",
        amount: { model: "fixed", value: "250.00" },
      },
    });
    const policy = makePolicy("EUR", {
      uah: { currency: "UAH", strategy: "derived" },
      usd: { currency: "USD", strategy: "derived" },
    });
    const ratePolicyUah = makeRatePolicy("rp-eur-uah", "EUR", "UAH");
    const ratePolicyUsd = makeRatePolicy("rp-eur-usd", "EUR", "USD");
    const snapshotUah = makeRateSnapshot("rs-eur-uah", "EUR", "UAH", "40.00");
    const snapshotUsd = makeRateSnapshot("rs-eur-usd", "EUR", "USD", "1.10");
    const graph = makeGraph([offering], [ratePolicyUah, ratePolicyUsd], [snapshotUah, snapshotUsd]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(result.prices["offering-1"]).toHaveLength(4);

    const currencies = result.prices["offering-1"].map((p) => p.targetCurrency).sort();
    expect(currencies).toEqual(["UAH", "UAH", "USD", "USD"]);

    const chargeRefs = result.prices["offering-1"].map((p) => p.chargeRef).sort();
    expect(chargeRefs).toEqual(["activation", "activation", "monthly", "monthly"]);
  });

  it("copies allowedUses from the CurrencyPricingPolicy target", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const policy = makePolicy("EUR", {
      uah: {
        currency: "UAH",
        strategy: "derived",
        currentUses: {
          presentation: false,
          aiAnswers: true,
          quote: true,
          contract: false,
          invoice: false,
          settlement: false,
        },
      },
    });
    const ratePolicy = makeRatePolicy("rp-eur-uah", "EUR", "UAH");
    const snapshot = makeRateSnapshot("rs-eur-uah", "EUR", "UAH", "40.00");
    const graph = makeGraph([offering], [ratePolicy], [snapshot]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    expect(result.prices["offering-1"]).toHaveLength(1);
    expect(result.prices["offering-1"][0].allowedUses.presentation).toBe(false);
    expect(result.prices["offering-1"][0].allowedUses.aiAnswers).toBe(true);
    expect(result.prices["offering-1"][0].allowedUses.quote).toBe(true);
  });

  it("reports error when source and target currency are the same", () => {
    const offering = makeOffering("offering-1", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly subscription",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const policy = makePolicy("EUR", { eur: { currency: "EUR", strategy: "derived" } });
    const graph = makeGraph([offering]);

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("PBP-DERIVED-PRICE-06");
  });

  it("produces deterministic output ordering (sorted by offering key, charge key, target key)", () => {
    const offeringB = makeOffering("offering-b", "EUR", {
      monthly: {
        type: "recurring",
        purpose: "Monthly",
        amount: { model: "fixed", value: "100.00" },
      },
    });
    const offeringA = makeOffering("offering-a", "EUR", {
      zeta: {
        type: "recurring",
        purpose: "Zeta",
        amount: { model: "fixed", value: "50.00" },
      },
      alpha: {
        type: "recurring",
        purpose: "Alpha",
        amount: { model: "fixed", value: "75.00" },
      },
    });
    const policy = makePolicy("EUR", {
      usd: { currency: "USD", strategy: "derived" },
      uah: { currency: "UAH", strategy: "derived" },
    });
    const ratePolicyUah = makeRatePolicy("rp-eur-uah", "EUR", "UAH");
    const ratePolicyUsd = makeRatePolicy("rp-eur-usd", "EUR", "USD");
    const snapshotUah = makeRateSnapshot("rs-eur-uah", "EUR", "UAH", "40.00");
    const snapshotUsd = makeRateSnapshot("rs-eur-usd", "EUR", "USD", "1.10");
    const graph = makeGraph(
      [offeringB, offeringA],
      [ratePolicyUah, ratePolicyUsd],
      [snapshotUah, snapshotUsd],
    );

    const result = materializeDerivedPrices(graph, policy, BUILD_TIME);

    expect(result.errors).toHaveLength(0);
    const offeringKeys = Object.keys(result.prices).sort();
    expect(offeringKeys).toEqual(["offering-a", "offering-b"]);

    const aPrices = result.prices["offering-a"];
    expect(aPrices).toHaveLength(4);
    const chargeSequence = aPrices.map((p) => `${p.chargeRef}:${p.targetCurrency}`);
    expect(chargeSequence).toEqual(["alpha:UAH", "alpha:USD", "zeta:UAH", "zeta:USD"]);
  });
});
