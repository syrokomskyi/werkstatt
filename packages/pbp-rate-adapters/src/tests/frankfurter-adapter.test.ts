import { describe, it, expect } from "vitest";
import { parseFrankfurterResponse, createFrankfurterAdapter } from "../adapters/frankfurter.js";

const SAMPLE_RESPONSE = `{"date":"2026-08-07","base":"EUR","quote":"USD","rate":1.1546}`;
const SAMPLE_RESPONSE_UAH = `{"date":"2026-08-07","base":"USD","quote":"UAH","rate":44.757}`;

describe("parseFrankfurterResponse", () => {
  it("parses a valid Frankfurter JSON response", () => {
    const result = parseFrankfurterResponse(SAMPLE_RESPONSE);
    expect(result.date).toBe("2026-08-07");
    expect(result.base).toBe("EUR");
    expect(result.quote).toBe("USD");
    expect(result.rate).toBe(1.1546);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseFrankfurterResponse("not json")).toThrow();
  });

  it("throws on missing fields", () => {
    expect(() => parseFrankfurterResponse('{"date":"2026-08-07"}')).toThrow(
      "invalid response shape",
    );
  });
});

describe("createFrankfurterAdapter", () => {
  it("fetches a direct EUR→USD rate", async () => {
    const mockFetch = async () => SAMPLE_RESPONSE;
    const adapter = createFrankfurterAdapter(
      { ref: "https://warpgogol.com/id/rate-source/frankfurter-primary" },
      mockFetch,
    );

    const result = await adapter.fetchRate({
      sourceCurrency: "EUR",
      targetCurrency: "USD",
    });

    expect(result.value).toBe("1.1546");
    expect(result.observedAt).toBe("2026-08-07");
    expect(result.sourceKind).toBe("external");
    expect(result.metadata?.source).toBe("frankfurter");
    expect(result.metadata?.base).toBe("EUR");
    expect(result.metadata?.quote).toBe("USD");
  });

  it("fetches a cross-rate USD→UAH directly from API", async () => {
    const mockFetch = async () => SAMPLE_RESPONSE_UAH;
    const adapter = createFrankfurterAdapter(
      { ref: "https://warpgogol.com/id/rate-source/frankfurter-primary" },
      mockFetch,
    );

    const result = await adapter.fetchRate({
      sourceCurrency: "USD",
      targetCurrency: "UAH",
    });

    expect(result.value).toBe("44.757");
    expect(result.observedAt).toBe("2026-08-07");
    expect(result.metadata?.source).toBe("frankfurter");
  });

  it("throws on fetch failure", async () => {
    const mockFetch = async () => {
      throw new Error("Network error");
    };
    const adapter = createFrankfurterAdapter(
      { ref: "https://warpgogol.com/id/rate-source/frankfurter-primary" },
      mockFetch,
    );

    await expect(
      adapter.fetchRate({ sourceCurrency: "EUR", targetCurrency: "USD" }),
    ).rejects.toThrow("Network error");
  });
});
