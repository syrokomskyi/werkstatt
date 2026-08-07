import { describe, it, expect } from "vitest";
import { parseEcbXml, createEcbAdapter } from "../adapters/ecb.js";
import { clearRateSourceAdapters, getRateSourceAdapter, registerRateSourceAdapter } from "../registry.js";
import type { RateSourceAdapter } from "../types.js";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender>
    <gesmes:name>European Central Bank</gesmes:name>
  </gesmes:Sender>
  <Cube>
    <Cube time="2026-08-07">
      <Cube currency="USD" rate="1.0923"/>
      <Cube currency="UAH" rate="44.1234"/>
      <Cube currency="GBP" rate="0.8512"/>
      <Cube currency="PLN" rate="4.2987"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("parseEcbXml", () => {
  it("extracts observedAt and all rates from XML", () => {
    const result = parseEcbXml(SAMPLE_XML);
    expect(result.observedAt).toBe("2026-08-07");
    expect(result.rates).toHaveLength(4);
    expect(result.rates).toContainEqual({ currency: "USD", rate: "1.0923" });
    expect(result.rates).toContainEqual({ currency: "UAH", rate: "44.1234" });
  });

  it("handles empty XML gracefully", () => {
    const result = parseEcbXml("");
    expect(result.rates).toHaveLength(0);
  });
});

describe("createEcbAdapter", () => {
  it("fetches direct EUR→UAH rate", async () => {
    const mockFetch = async () => SAMPLE_XML;
    const adapter = createEcbAdapter(
      { ref: "https://warpgogol.com/id/rate-source/ecb-primary" },
      mockFetch,
    );

    const result = await adapter.fetchRate({
      sourceCurrency: "EUR",
      targetCurrency: "UAH",
    });

    expect(result.value).toBe("44.1234");
    expect(result.observedAt).toBe("2026-08-07");
    expect(result.sourceKind).toBe("external");
    expect(result.metadata?.source).toBe("ecb");
  });

  it("computes inverse EUR→GBP rate (target is EUR)", async () => {
    const mockFetch = async () => SAMPLE_XML;
    const adapter = createEcbAdapter(
      { ref: "https://warpgogol.com/id/rate-source/ecb-primary" },
      mockFetch,
    );

    const result = await adapter.fetchRate({
      sourceCurrency: "GBP",
      targetCurrency: "EUR",
    });

    // 1 / 0.8512 = 1.174812...
    const expected = (1 / 0.8512).toFixed(6);
    expect(result.value).toBe(expected);
  });

  it("computes cross-rate USD→UAH via EUR", async () => {
    const mockFetch = async () => SAMPLE_XML;
    const adapter = createEcbAdapter(
      { ref: "https://warpgogol.com/id/rate-source/ecb-primary" },
      mockFetch,
    );

    const result = await adapter.fetchRate({
      sourceCurrency: "USD",
      targetCurrency: "UAH",
    });

    // UAH per EUR / USD per EUR = 44.1234 / 1.0923 = 40.398...
    const expected = (44.1234 / 1.0923).toFixed(6);
    expect(result.value).toBe(expected);
  });

  it("throws on unknown currency pair", async () => {
    const mockFetch = async () => SAMPLE_XML;
    const adapter = createEcbAdapter(
      { ref: "https://warpgogol.com/id/rate-source/ecb-primary" },
      mockFetch,
    );

    await expect(
      adapter.fetchRate({ sourceCurrency: "JPY", targetCurrency: "CNY" }),
    ).rejects.toThrow("no rate available for pair JPY/CNY");
  });

  it("throws on fetch failure", async () => {
    const mockFetch = async () => {
      throw new Error("Network error");
    };
    const adapter = createEcbAdapter(
      { ref: "https://warpgogol.com/id/rate-source/ecb-primary" },
      mockFetch,
    );

    await expect(
      adapter.fetchRate({ sourceCurrency: "EUR", targetCurrency: "USD" }),
    ).rejects.toThrow("Network error");
  });
});

describe("registry", () => {
  it("registers and retrieves an adapter", () => {
    clearRateSourceAdapters();
    const mockAdapter: RateSourceAdapter = {
      sourceContractRef: { ref: "test" },
      fetchRate: async () => ({
        value: "1.0",
        observedAt: "2026-08-07",
        sourceKind: "external",
      }),
    };

    registerRateSourceAdapter("test-adapter", mockAdapter);
    const retrieved = getRateSourceAdapter("test-adapter");
    expect(retrieved).toBe(mockAdapter);
  });

  it("returns undefined for unregistered adapter", () => {
    clearRateSourceAdapters();
    const retrieved = getRateSourceAdapter("nonexistent");
    expect(retrieved).toBeUndefined();
  });
});
