/*
<MODULE_CONTRACT>
<purpose>Phase 12: Generates website, AI answer, and Schema.org projections from the resolved graph.</purpose>
<non-goals>
  <item>Does not create canonical snapshots — that is Phase 13 (snapshot.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 12: projection.</item>
  <item>Extended by RFC-0742 — attach priceProjections and priceTraces from materialized derived prices.</item>
  <item>Extended by RFC-0745 — emit canonical price field in Schema.org, add validateSchemaOrgPrices validation.</item>
</CHANGE_SUMMARY>
*/

import type { PbpWebsiteProjection } from "../projections/website.js";
import type { PbpAiAnswerProjection } from "../projections/ai-answer.js";
import type { PbpBuyerView, PbpProjectionSet, PbpResolvedGraph } from "./types.js";
import { buildPriceProjection } from "../projections/price-projection.js";
import type { PbpPriceProjection } from "../projections/price-projection.js";
import type { PbpCurrencyConversionTrace } from "../derivations/currency-conversion.js";
import type { PbpValidationError } from "../validation-errors.js";
import type { PbpCharge } from "../entities/pricing.js";
import type { PbpPricing } from "../entities/offering.js";

export async function generateProjections(
  graph: PbpResolvedGraph,
  buyerView: PbpBuyerView | undefined,
  locale: string,
): Promise<PbpProjectionSet> {
  const offerings = Object.values(graph.offerings).sort((a, b) => a.id.localeCompare(b.id));
  const derivedPrices = graph.derivedPrices ?? {};

  const website: PbpWebsiteProjection[] = offerings.map((offering) => {
    const materialized = derivedPrices[offering.id] ?? [];
    const priceProjections: Record<string, PbpPriceProjection> = {};
    for (const mp of materialized) {
      const projection = buildPriceProjection(mp, locale);
      if (projection) {
        priceProjections[mp.amount.currency] = projection;
      }
    }

    return {
      offeringId: offering.id,
      locale,
      renderedSections: buyerView?.sections ?? {},
      ...(Object.keys(priceProjections).length > 0 ? { priceProjections } : {}),
    } as unknown as PbpWebsiteProjection;
  });

  const aiAnswer: PbpAiAnswerProjection[] = offerings.map((offering) => {
    const materialized = derivedPrices[offering.id] ?? [];
    const priceTraces: Record<string, PbpCurrencyConversionTrace> = {};
    for (const mp of materialized) {
      if (mp.allowedUses.aiAnswers) {
        priceTraces[mp.amount.currency] = mp.trace;
      }
    }

    return {
      offeringId: offering.id,
      locale,
      allowedFacts: [],
      deniedFacts: [],
      ...(Object.keys(priceTraces).length > 0 ? { priceTraces } : {}),
    } as unknown as PbpAiAnswerProjection;
  });

  const schemaOrg = generateSchemaOrg(graph);

  return { website, aiAnswer, schemaOrg };
}

function generateSchemaOrg(graph: PbpResolvedGraph): Record<string, unknown> {
  const offerings = Object.values(graph.offerings).sort((a, b) => a.id.localeCompare(b.id));

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: graph.business.name,
    offers: offerings.map((offering) => {
      const pricing = offering.pricing;
      const price = extractCanonicalPrice(pricing);
      return {
        "@type": "Offer",
        name: offering.name,
        priceCurrency: pricing?.currency ?? "",
        ...(price !== undefined ? { price } : {}),
      };
    }),
  };
}

/** RFC-0745: Extract the first fixed-model charge amount value (by sorted charge key) as the canonical source-currency decimal string. */
function extractCanonicalPrice(pricing: PbpPricing | undefined): string | undefined {
  if (!pricing?.charges) return undefined;
  const charges = pricing.charges;
  for (const key of Object.keys(charges).sort()) {
    const charge = charges[key] as PbpCharge | undefined;
    if (!charge) continue;
    if (charge.amount.model === "fixed") {
      return charge.amount.value;
    }
  }
  return undefined;
}

/** RFC-0745: Build a set of canonical price strings from the resolved graph's offerings. */
export function buildCanonicalPriceSet(graph: PbpResolvedGraph): Set<string> {
  const prices = new Set<string>();
  for (const offering of Object.values(graph.offerings)) {
    const price = extractCanonicalPrice(offering.pricing);
    if (price !== undefined) {
      prices.add(price);
    }
  }
  return prices;
}

/** RFC-0745: Build a set of canonical source currency codes from the resolved graph's offerings. */
export function buildCanonicalCurrencySet(graph: PbpResolvedGraph): Set<string> {
  const currencies = new Set<string>();
  for (const offering of Object.values(graph.offerings)) {
    const currency = offering.pricing?.currency;
    if (currency) {
      currencies.add(currency);
    }
  }
  return currencies;
}

/** RFC-0745: Validate that Schema.org Offer price and priceCurrency fields contain only canonical source-currency values. */
export function validateSchemaOrgPrices(
  schemaOrg: Record<string, unknown>,
  canonicalPrices: Set<string>,
  canonicalCurrencies: Set<string>,
): PbpValidationError[] {
  const errors: PbpValidationError[] = [];
  const offers = schemaOrg["offers"];
  if (!Array.isArray(offers)) return errors;
  for (const offer of offers) {
    const node = offer as Record<string, unknown>;
    const price = node["price"];
    if (typeof price === "string" && !canonicalPrices.has(price)) {
      errors.push({
        code: "PBP-SCHEMA-PRICE",
        severity: "error",
        message: `Derived price value '${price}' found in Schema.org price field. Only canonical source-currency prices are allowed in structured data.`,
      });
    }
    const priceCurrency = node["priceCurrency"];
    if (
      typeof priceCurrency === "string" &&
      priceCurrency !== "" &&
      !canonicalCurrencies.has(priceCurrency)
    ) {
      errors.push({
        code: "PBP-SCHEMA-PRICE",
        severity: "error",
        message: `Non-canonical currency '${priceCurrency}' found in Schema.org priceCurrency field. Only canonical source currency codes are allowed in structured data.`,
      });
    }
  }
  return errors;
}
