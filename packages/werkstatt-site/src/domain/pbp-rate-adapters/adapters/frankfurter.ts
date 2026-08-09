/*
<MODULE_CONTRACT>
<purpose>Frankfurter rate source adapter — fetches daily reference rates from the Frankfurter API (RFC-0744).
Frankfurter is a free, no-key API that serves ECB reference rates in JSON format.
API: https://api.frankfurter.dev/v2/rate/{base}/{quote} → { date, base, quote, rate }</purpose>
<non-goals>
  <item>Does not define the RateSourceAdapter interface — that is in src/types.ts.</item>
  <item>Does not handle scheduling — that is the rate-fetcher-worker service.</item>
  <item>Does not fetch historical rates — only the latest daily rate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added Frankfurter adapter as alternative to ECB XML adapter (RFC-0744).</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntityRef } from "@warpgogol/werkstatt-site/pbp";
import type { RateFetchResult, RateSourceAdapter } from "../types.js";

const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v2";

interface FrankfurterRateResponse {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

export function parseFrankfurterResponse(json: string): FrankfurterRateResponse {
  const parsed = JSON.parse(json) as Partial<FrankfurterRateResponse>;
  if (
    typeof parsed.date !== "string" ||
    typeof parsed.base !== "string" ||
    typeof parsed.quote !== "string" ||
    typeof parsed.rate !== "number"
  ) {
    throw new Error("Frankfurter adapter: invalid response shape");
  }
  return parsed as FrankfurterRateResponse;
}

export function createFrankfurterAdapter(
  sourceContractRef: PbpEntityRef,
  fetchFn: (url: string) => Promise<string> = defaultFetch,
): RateSourceAdapter {
  return {
    sourceContractRef,
    async fetchRate(pair: {
      sourceCurrency: string;
      targetCurrency: string;
    }): Promise<RateFetchResult> {
      const url = `${FRANKFURTER_BASE_URL}/rate/${pair.sourceCurrency}/${pair.targetCurrency}`;
      const body = await fetchFn(url);
      const data = parseFrankfurterResponse(body);

      return {
        value: data.rate.toString(),
        observedAt: data.date,
        sourceKind: "external",
        metadata: {
          source: "frankfurter",
          base: data.base,
          quote: data.quote,
        },
      };
    },
  };
}

async function defaultFetch(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Frankfurter fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}
