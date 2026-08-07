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
</CHANGE_SUMMARY>
*/

import type { PbpWebsiteProjection } from "../projections/website.js";
import type { PbpAiAnswerProjection } from "../projections/ai-answer.js";
import type { PbpBuyerView, PbpProjectionSet, PbpResolvedGraph } from "./types.js";
import { buildPriceProjection } from "../projections/price-projection.js";
import type { PbpPriceProjection } from "../projections/price-projection.js";
import type { PbpCurrencyConversionTrace } from "../derivations/currency-conversion.js";

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
      const record = offering as unknown as Record<string, unknown>;
      const pricing = record.pricing as Record<string, unknown> | undefined;
      return {
        "@type": "Offer",
        name: offering.name,
        priceCurrency: pricing?.currency ?? "",
      };
    }),
  };
}
