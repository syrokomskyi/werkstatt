/*
<MODULE_CONTRACT>
<purpose>Phase 11: Assembles the 12-section Buyer View from the resolved graph.</purpose>
<non-goals>
  <item>Does not generate projections — that is Phase 12 (projection.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 11: buyer-view.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpBuyerViewSection } from "../entities/buyer-view-schema.js";
import type { PbpResolvedGraph, PbpBuyerView } from "./types.js";

export async function assembleBuyerView(
  graph: PbpResolvedGraph,
  schemaRef: PbpEntityRef,
): Promise<PbpBuyerView> {
  const sections: Record<string, PbpBuyerViewSection> = {};

  sections["identity"] = buildSection("identity", graph.business);
  if (graph.legalIdentity) {
    sections["identity"] = mergeSectionData(sections["identity"], graph.legalIdentity);
  }

  const products = Object.values(graph.products).sort((a, b) => a.id.localeCompare(b.id));
  if (products.length > 0) {
    sections["suitability"] = buildSection("suitability", {
      products: products.map((p) => ({
        purpose: (p as unknown as Record<string, unknown>).purpose,
        outcomes: (p as unknown as Record<string, unknown>).outcomes,
      })),
    });
  }

  const benefitClaims = Object.values(graph.claims)
    .filter((c) => (c as unknown as Record<string, unknown>).claimClass === "benefit")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (benefitClaims.length > 0) {
    sections["value"] = buildSection("value", { claims: benefitClaims });
  }

  const offerings = Object.values(graph.offerings).sort((a, b) => a.id.localeCompare(b.id));
  if (offerings.length > 0) {
    const df = offerings[0];
    const dfRecord = df as unknown as Record<string, unknown>;
    const pkg = dfRecord.package as Record<string, unknown> | undefined;
    if (pkg) sections["package"] = buildSection("package", pkg);

    const related = dfRecord.relatedOfferings;
    if (Array.isArray(related))
      sections["options"] = buildSection("options", { relatedOfferings: related });

    const pricing = dfRecord.pricing;
    if (pricing) sections["pricing"] = buildSection("pricing", pricing);

    const responsibilities = dfRecord.customerResponsibilities;
    if (responsibilities)
      sections["buyer-responsibilities"] = buildSection("buyer-responsibilities", responsibilities);

    const fulfillment = dfRecord.fulfillment;
    if (fulfillment) sections["fulfillment"] = buildSection("fulfillment", fulfillment);

    const terms = dfRecord.terms;
    if (terms) sections["lifecycle"] = buildSection("lifecycle", terms);
  }

  const assurancePolicies = Object.values(graph.policies)
    .filter((p) => {
      const kind = (p as unknown as Record<string, unknown>).policyKind;
      return kind === "guarantee" || kind === "service-level";
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (assurancePolicies.length > 0) {
    sections["assurances"] = buildSection("assurances", { policies: assurancePolicies });
  }

  const rightsPolicies = Object.values(graph.policies)
    .filter((p) => {
      const kind = (p as unknown as Record<string, unknown>).policyKind;
      return kind === "ownership" || kind === "exit" || kind === "data-retention";
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (rightsPolicies.length > 0) {
    sections["rights"] = buildSection("rights", { policies: rightsPolicies });
  }

  const limitationDisclosures = Object.values(graph.disclosures).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  if (limitationDisclosures.length > 0) {
    sections["limitations"] = buildSection("limitations", { disclosures: limitationDisclosures });
  }

  return { schemaRef, sections };
}

function buildSection(sectionId: string, data: unknown): PbpBuyerViewSection {
  return {
    sectionId,
    data: data as Record<string, unknown>,
  } as unknown as PbpBuyerViewSection;
}

function mergeSectionData(base: PbpBuyerViewSection, additional: unknown): PbpBuyerViewSection {
  const baseData = (base as unknown as Record<string, unknown>).data as Record<string, unknown>;
  return buildSection((base as unknown as Record<string, unknown>).sectionId as string, {
    ...baseData,
    ...(additional as Record<string, unknown>),
  });
}
