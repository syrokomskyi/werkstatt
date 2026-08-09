/*
<MODULE_CONTRACT>
<purpose>Golden test vectors and failure mode tests for currency conversion derivation (RFC-0739).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0739 — 14 test vectors: 5 golden + 3 failure modes + 1 JPY + 5 rounding modes.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeCurrencyConversion } from "./currency-conversion.js";
import type { PbpCurrencyConversionDerivation } from "./currency-conversion.js";
import type { PbpResolvedGraph } from "../compiler/types.js";
import type { PbpDerivationContract } from "../derivation.js";
import type { PbpRateSnapshot } from "../entities/rate-snapshot.js";

function makeSnapshot(overrides: Partial<PbpRateSnapshot> = {}): PbpRateSnapshot {
  return {
    schema: "pbp/rate-snapshot@1",
    id: "rate-snapshot-eur-uah-001",
    type: "rate-snapshot",
    status: "published",
    name: "EUR/UAH snapshot",
    pair: { sourceCurrency: "EUR", targetCurrency: "UAH" },
    quotation: { direction: "target-per-source" },
    value: "46.18",
    source: { kind: "external" },
    observedAt: "2026-08-07T10:00:00Z",
    freshUntil: "2099-12-31T23:59:59Z",
    digest: { algorithm: "sha256", value: "abc123def456" },
    ...overrides,
  } as PbpRateSnapshot;
}

function makeGraph(snapshot: PbpRateSnapshot): PbpResolvedGraph {
  return {
    business: {} as PbpResolvedGraph["business"],
    places: {},
    contactPoints: {},
    webPresences: {},
    products: {},
    categories: {},
    catalogEntries: {},
    offerings: {},
    policies: {},
    claims: {},
    evidenceSources: {},
    disclosures: {},
    publicDocuments: {},
    ratePolicies: {},
    rateSnapshots: { [snapshot.id]: snapshot },
  };
}

function makeContract(
  pipeline: PbpCurrencyConversionDerivation["parameters"]["pipeline"],
  snapshotRef = "rate-snapshot-eur-uah-001",
): PbpDerivationContract {
  return {
    derivationRef: "currency-conversion",
    contractVersion: "1.0.0",
    implementationVersion: "1.0.0",
    requiredInputs: [],
    parameters: {
      ratePolicyRef: { ref: "rate-policy-eur-uah-001" },
      rateSnapshotRef: { ref: snapshotRef },
      pipeline,
    },
  } as unknown as PbpDerivationContract;
}

describe("computeCurrencyConversion — golden test vectors (RFC-0739 §9)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
  });

  it("vector 1: basic conversion + ceiling 10 + subtract 1.00 → 3239.00", () => {
    const snapshot = makeSnapshot();
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "ceiling", increment: "10" },
      priceEnding: { mode: "subtract", value: "1.00" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3239");
    expect(result.value?.currency).toBe("UAH");
    expect(result.trace.calculation.conversion.output).toBe("3232.6");
    expect(result.trace.calculation.rounding.output).toBe("3240");
    expect(result.trace.calculation.priceEnding?.output).toBe("3239");
  });

  it("vector 2: percentage markup 5% + ceiling 10 → 3400", () => {
    const snapshot = makeSnapshot();
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      percentageAdjustment: { percentage: "5.00" },
      rounding: { mode: "ceiling", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3400");
    expect(result.trace.calculation.percentageAdjustment?.percentage).toBe("5.00");
  });

  it("vector 3: fixed adjustment +5 + ceiling 10 → 3240", () => {
    const snapshot = makeSnapshot();
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      fixedAdjustment: { value: "5.00" },
      rounding: { mode: "ceiling", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3240");
    expect(result.trace.calculation.fixedAdjustment?.value).toBe("5.00");
  });

  it("vector 4: ceiling 100 + subtract 1.00 → 3299 (...99 ending)", () => {
    const snapshot = makeSnapshot();
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "ceiling", increment: "100" },
      priceEnding: { mode: "subtract", value: "1.00" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3299");
  });

  it("vector 5: source-per-target direction (divide) + ceiling 10 + subtract 1.00 → 3239", () => {
    const snapshot = makeSnapshot({
      quotation: { direction: "source-per-target" },
      value: "0.02165",
    });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "ceiling", increment: "10" },
      priceEnding: { mode: "subtract", value: "1.00" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3239");
  });
});

describe("computeCurrencyConversion — failure modes (RFC-0739 §5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
  });

  it("vector 6: negative result → status failed, code PBP-CURRENCY-CONVERSION-NEGATIVE", () => {
    const snapshot = makeSnapshot({ value: "0.001" });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "0.01", sourceCurrency: "EUR", targetCurrency: "UAH" },
      fixedAdjustment: { value: "-1.00" },
      rounding: { mode: "ceiling", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("failed");
    expect(result.formulaDescription).toContain("PBP-CURRENCY-CONVERSION-NEGATIVE");
  });

  it("vector 7: zero result for positive source → status failed, code PBP-CURRENCY-CONVERSION-ZERO", () => {
    const snapshot = makeSnapshot({ value: "0" });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "0.01", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "ceiling", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("failed");
    expect(result.formulaDescription).toContain("PBP-CURRENCY-CONVERSION-ZERO");
  });

  it("vector 8: incompatible price ending → status failed, code PBP-CURRENCY-CONVERSION-ENDING-INCOMPATIBLE", () => {
    const snapshot = makeSnapshot();
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "ceiling", increment: "5" },
      priceEnding: { mode: "subtract", value: "1.00" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("failed");
    expect(result.formulaDescription).toContain("PBP-CURRENCY-CONVERSION-ENDING-INCOMPATIBLE");
  });
});

describe("computeCurrencyConversion — JPY zero-decimal currency (summit Q2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
  });

  it("vector 9: JPY (0 decimal places) conversion with precision=2", () => {
    const snapshot = makeSnapshot({
      pair: { sourceCurrency: "EUR", targetCurrency: "JPY" },
      value: "172.5",
    });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "JPY" },
      rounding: { mode: "ceiling", decimalPlaces: 0 },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.currency).toBe("JPY");
    expect(result.trace.calculation.conversion.output).toBe("12075");
  });
});

describe("computeCurrencyConversion — rounding modes (RFC-0739 §4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
  });

  it("vector 10: ceiling mode — 3394.23 → ceiling to 10 → 3400", () => {
    const snapshot = makeSnapshot({ value: "48.489" });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "ceiling", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.trace.calculation.conversion.output).toBe("3394.23");
    expect(result.value?.amount).toBe("3400");
  });

  it("vector 11: floor mode — 3394.23 → floor to 10 → 3390", () => {
    const snapshot = makeSnapshot({ value: "48.489" });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "floor", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3390");
  });

  it("vector 12: half-up mode — 3395.00 → half-up to 10 → 3400 (tie goes up)", () => {
    const snapshot = makeSnapshot({ value: "48.5" });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "half-up", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3400");
  });

  it("vector 13: half-even mode — 3395.00 → half-even to 10 → 3400 (3400 is even)", () => {
    const snapshot = makeSnapshot({ value: "48.5" });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "half-even", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3400");
  });

  it("vector 14: half-even tie-breaking — 3385.00 → half-even to 10 → 3380 (3380 is even, 3390 is odd)", () => {
    const snapshot = makeSnapshot({ value: "48.357142857" });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "half-even", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("derived");
    expect(result.value?.amount).toBe("3380");
  });
});

describe("computeCurrencyConversion — skip modes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
  });

  it("returns skipped when rate snapshot is not found", () => {
    const graph = makeGraph(makeSnapshot());
    const contract = makeContract(
      {
        conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
        rounding: { mode: "ceiling", increment: "10" },
      },
      "nonexistent-snapshot",
    );

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("skipped");
  });

  it("returns skipped when snapshot is past freshUntil", () => {
    const snapshot = makeSnapshot({ freshUntil: "2020-01-01T00:00:00Z" });
    const graph = makeGraph(snapshot);
    const contract = makeContract({
      conversion: { sourceAmount: "70.00", sourceCurrency: "EUR", targetCurrency: "UAH" },
      rounding: { mode: "ceiling", increment: "10" },
    });

    const result = computeCurrencyConversion(graph, contract);

    expect(result.status).toBe("skipped");
  });
});
