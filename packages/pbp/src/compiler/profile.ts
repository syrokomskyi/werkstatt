/*
<MODULE_CONTRACT>
<purpose>Phase 7: Assembles the full Business profile graph from the entity index.</purpose>
<non-goals>
  <item>Does not apply runtime overlays — that is Phase 8 (overlays.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 7: profile-resolution.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import type { PbpBusiness } from "../entities/business.js";
import type { PbpLegalIdentity } from "../entities/legal-identity.js";
import type { PbpBrand } from "../entities/brand.js";
import type { PbpPlace } from "../entities/place.js";
import type { PbpContactPoint } from "../entities/contact-point.js";
import type { PbpWebPresence } from "../entities/web-presence.js";
import type { PbpProduct } from "../entities/product.js";
import type { PbpCatalog, PbpCatalogEntry } from "../entities/catalog.js";
import type { PbpOffering } from "../entities/offering.js";
import type { PbpPolicy } from "../entities/policy.js";
import type { PbpClaim } from "../entities/claim.js";
import type { PbpEvidenceSource } from "../entities/evidence-source.js";
import type { PbpDisclosure } from "../entities/disclosure.js";
import type { PbpPublicDocument } from "../entities/public-document.js";
import type { PbpCategory } from "../entities/category.js";
import type { PbpResolvedGraph } from "./types.js";

export async function resolveProfile(index: Map<string, PbpEntity>): Promise<PbpResolvedGraph> {
  const sortedIds = [...index.keys()].sort();
  const byType = new Map<string, PbpEntity[]>();

  for (const id of sortedIds) {
    const entity = index.get(id)!;
    const list = byType.get(entity.type) ?? [];
    list.push(entity);
    byType.set(entity.type, list);
  }

  const businesses = byType.get("business") ?? [];
  if (businesses.length === 0) {
    throw new Error("PBP-REF: No Business entity found in the entity index.");
  }

  const business = businesses[0] as unknown as PbpBusiness;
  const businessRecord = business as unknown as Record<string, unknown>;

  const legalIdentity = resolveRef(byType, businessRecord.legalIdentityRef) as
    PbpLegalIdentity | undefined;
  const brand = resolveRef(byType, businessRecord.brandRef) as PbpBrand | undefined;

  const places = collectByType(byType, "place") as Record<string, PbpPlace>;
  const contactPoints = collectByType(byType, "contact-point") as Record<string, PbpContactPoint>;
  const webPresences = collectByType(byType, "web-presence") as Record<string, PbpWebPresence>;
  const products = collectByType(byType, "product") as Record<string, PbpProduct>;
  const categories = collectByType(byType, "category") as Record<string, PbpCategory>;
  const catalog = (byType.get("catalog") ?? [])[0] as PbpCatalog | undefined;
  const catalogEntries = collectByType(byType, "catalog-entry") as Record<string, PbpCatalogEntry>;
  const offerings = collectByType(byType, "offering") as Record<string, PbpOffering>;
  const policies = collectByType(byType, "policy") as Record<string, PbpPolicy>;
  const claims = collectByType(byType, "claim") as Record<string, PbpClaim>;
  const evidenceSources = collectByType(byType, "evidence-source") as Record<
    string,
    PbpEvidenceSource
  >;
  const disclosures = collectByType(byType, "disclosure") as Record<string, PbpDisclosure>;
  const publicDocuments = collectByType(byType, "public-document") as Record<
    string,
    PbpPublicDocument
  >;

  return {
    business,
    legalIdentity,
    brand,
    places,
    contactPoints,
    webPresences,
    products,
    categories,
    catalog,
    catalogEntries,
    offerings,
    policies,
    claims,
    evidenceSources,
    disclosures,
    publicDocuments,
  };
}

function resolveRef(byType: Map<string, PbpEntity[]>, refObj: unknown): PbpEntity | undefined {
  if (!refObj || typeof refObj !== "object") return undefined;
  const ref = (refObj as Record<string, unknown>).ref;
  if (typeof ref !== "string") return undefined;
  for (const entities of byType.values()) {
    for (const entity of entities) {
      if (entity.id === ref) return entity;
    }
  }
  return undefined;
}

function collectByType(byType: Map<string, PbpEntity[]>, type: string): Record<string, PbpEntity> {
  const result: Record<string, PbpEntity> = {};
  const entities = byType.get(type) ?? [];
  for (const entity of entities) {
    result[entity.id] = entity;
  }
  return result;
}
