/*
<MODULE_CONTRACT>
<purpose>Phase 12: Generates website, AI answer, and Schema.org projections from the resolved graph.</purpose>
<non-goals>
  <item>Does not create canonical snapshots — that is Phase 13 (snapshot.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 12: projection.</item>
</CHANGE_SUMMARY>
*/

import type { PbpWebsiteProjection } from "../projections/website.js";
import type { PbpAiAnswerProjection } from "../projections/ai-answer.js";
import type { PbpBuyerView, PbpProjectionSet, PbpResolvedGraph } from "./types.js";

export async function generateProjections(
  graph: PbpResolvedGraph,
  buyerView: PbpBuyerView | undefined,
  locale: string,
): Promise<PbpProjectionSet> {
  const offerings = Object.values(graph.offerings).sort((a, b) => a.id.localeCompare(b.id));

  const website: PbpWebsiteProjection[] = offerings.map(
    (offering) =>
      ({
        offeringId: offering.id,
        locale,
        renderedSections: buyerView?.sections ?? {},
      }) as unknown as PbpWebsiteProjection,
  );

  const aiAnswer: PbpAiAnswerProjection[] = offerings.map(
    (offering) =>
      ({
        offeringId: offering.id,
        locale,
        allowedFacts: [],
        deniedFacts: [],
      }) as unknown as PbpAiAnswerProjection,
  );

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
