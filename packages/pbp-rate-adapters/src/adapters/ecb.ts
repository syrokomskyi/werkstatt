/*
<MODULE_CONTRACT>
<purpose>ECB rate source adapter — fetches EUR reference rates from the European Central Bank daily XML feed (RFC-0744).</purpose>
<non-goals>
  <item>Does not define the RateSourceAdapter interface — that is in src/types.ts.</item>
  <item>Does not handle scheduling — that is the rate-fetcher-worker service.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0744 — ECB adapter parsing eurofxref-daily.xml.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntityRef } from "@warpgogol/pbp";
import type { RateFetchResult, RateSourceAdapter } from "../types.js";

const ECB_DAILY_XML_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

interface EcbRate {
  currency: string;
  rate: string;
}

/**
 * Parse the ECB daily XML response and extract all EUR reference rates.
 *
 * The XML format is:
 * <gesmes:Envelope>
 *   <Cube>
 *     <Cube time="2026-08-07">
 *       <Cube currency="USD" rate="1.0923"/>
 *       <Cube currency="UAH" rate="44.1234"/>
 *       ...
 *     </Cube>
 *   </Cube>
 * </gesmes:Envelope>
 */
export function parseEcbXml(xml: string): { observedAt: string; rates: EcbRate[] } {
  const timeMatch = xml.match(/<Cube\s+time="([^"]+)"/);
  const observedAt = timeMatch ? timeMatch[1] : new Date().toISOString().slice(0, 10);

  const rateRegex = /<Cube\s+currency="([A-Z]{3})"\s+rate="([\d.]+)"/g;
  const rates: EcbRate[] = [];
  let match: RegExpExecArray | null;
  while ((match = rateRegex.exec(xml)) !== null) {
    rates.push({ currency: match[1], rate: match[2] });
  }

  return { observedAt, rates };
}

/**
 * Compute a cross-rate for non-EUR pairs using EUR as the base.
 *
 * For EUR→UAH: use the UAH rate directly (rate = UAH per EUR).
 * For EUR→USD: use the USD rate directly.
 * For USD→UAH: compute as (UAH per EUR) / (USD per EUR) = UAH per USD.
 * For UAH→USD: compute as (USD per EUR) / (UAH per EUR) = USD per UAH.
 *
 * The ECB publishes EUR-base rates only. For any pair where neither currency
 * is EUR, we compute the cross-rate via EUR.
 */
function computeCrossRate(
  sourceCurrency: string,
  targetCurrency: string,
  rates: Map<string, string>,
): string | null {
  // Direct: EUR → target
  if (sourceCurrency === "EUR") {
    const rate = rates.get(targetCurrency);
    return rate ?? null;
  }

  // Inverse: target → EUR (1 / rate)
  if (targetCurrency === "EUR") {
    const rate = rates.get(sourceCurrency);
    if (!rate) return null;
    const inverse = 1 / Number.parseFloat(rate);
    return inverse.toFixed(6);
  }

  // Cross-rate via EUR: source → EUR → target
  const sourceRate = rates.get(sourceCurrency);
  const targetRate = rates.get(targetCurrency);
  if (!sourceRate || !targetRate) return null;

  // source/EUR = 1/sourceRate (EUR per source unit)
  // target/EUR = 1/targetRate (EUR per target unit)
  // source → target = (1/sourceRate) / (1/targetRate) = targetRate / sourceRate
  const cross = Number.parseFloat(targetRate) / Number.parseFloat(sourceRate);
  return cross.toFixed(6);
}

export function createEcbAdapter(
  sourceContractRef: PbpEntityRef,
  fetchFn: (url: string) => Promise<string> = defaultFetch,
): RateSourceAdapter {
  return {
    sourceContractRef,
    async fetchRate(pair: {
      sourceCurrency: string;
      targetCurrency: string;
    }): Promise<RateFetchResult> {
      const xml = await fetchFn(ECB_DAILY_XML_URL);
      const { observedAt, rates } = parseEcbXml(xml);

      const rateMap = new Map<string, string>();
      for (const r of rates) {
        rateMap.set(r.currency, r.rate);
      }

      const value = computeCrossRate(pair.sourceCurrency, pair.targetCurrency, rateMap);

      if (value === null) {
        throw new Error(
          `ECB adapter: no rate available for pair ${pair.sourceCurrency}/${pair.targetCurrency}`,
        );
      }

      return {
        value,
        observedAt,
        sourceKind: "external",
        metadata: {
          source: "ecb",
          base: "EUR",
          ratesCount: rates.length,
        },
      };
    },
  };
}

async function defaultFetch(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ECB fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}
