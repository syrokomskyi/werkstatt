/*
<MODULE_CONTRACT>
<purpose>Internal compiler types for the PBP 14-phase pipeline (RFC-0467).</purpose>
<non-goals>
  <item>Does not define compiler phase contract types — those are in compiler-pipeline.ts (RFC-0428).</item>
  <item>Does not define entity types — those are in src/entities/.</item>
  <item>Does not define validation error types — those are in src/validation-errors.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — PbpCompilerInput, PbpCompilerResult, PbpResolvedGraph, PbpBuyerView, PbpProjectionSet.</item>
</CHANGE_SUMMARY>
*/

import type { PbpBuildContext, PbpBuildStrictness } from "../compiler-pipeline.js";
import type { PbpSourceInventoryReport } from "../compiler-pipeline.js";
import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
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
import type { PbpRatePolicy } from "../entities/rate-policy.js";
import type { PbpRateSnapshot } from "../entities/rate-snapshot.js";
import type { PbpDerivationContract, PbpDerivationResult } from "../derivation.js";
import type { PbpFallbackReport } from "../locale.js";
import type { PbpGraphIntegrityError, PbpCycleCheckResult } from "../reference-resolution.js";
import type { PbpValidationError } from "../validation-errors.js";
import type { PbpBuyerViewSection } from "../entities/buyer-view-schema.js";
import type { PbpWebsiteProjection } from "../projections/website.js";
import type { PbpAiAnswerProjection } from "../projections/ai-answer.js";
import type { PbpPublicationSnapshot } from "../publication.js";

export interface PbpCompilerInput {
  sourceDirectory: string;
  locale: string;
  defaultLocale: string;
  strictness: PbpBuildStrictness;
  derivations?: PbpDerivationContract[];
  buyerViewSchemaRef?: PbpEntityRef;
  buildTime?: string;
}

export interface PbpResolvedGraph {
  business: PbpBusiness;
  legalIdentity?: PbpLegalIdentity;
  brand?: PbpBrand;
  places: Record<string, PbpPlace>;
  contactPoints: Record<string, PbpContactPoint>;
  webPresences: Record<string, PbpWebPresence>;
  products: Record<string, PbpProduct>;
  categories: Record<string, PbpCategory>;
  catalog?: PbpCatalog;
  catalogEntries: Record<string, PbpCatalogEntry>;
  offerings: Record<string, PbpOffering>;
  policies: Record<string, PbpPolicy>;
  claims: Record<string, PbpClaim>;
  evidenceSources: Record<string, PbpEvidenceSource>;
  disclosures: Record<string, PbpDisclosure>;
  publicDocuments: Record<string, PbpPublicDocument>;
  ratePolicies: Record<string, PbpRatePolicy>;
  rateSnapshots: Record<string, PbpRateSnapshot>;
}

export interface PbpBuyerView {
  schemaRef: PbpEntityRef;
  sections: Record<string, PbpBuyerViewSection>;
}

export interface PbpProjectionSet {
  website: PbpWebsiteProjection[];
  aiAnswer: PbpAiAnswerProjection[];
  schemaOrg: Record<string, unknown>;
}

export interface PbpCompilerResult {
  context: PbpBuildContext;
  inventory: PbpSourceInventoryReport;
  entityIndex: Map<string, PbpEntity>;
  resolvedGraph: PbpResolvedGraph;
  fallbackReport: PbpFallbackReport;
  graphErrors: PbpGraphIntegrityError[];
  cycleResults: PbpCycleCheckResult[];
  validationErrors: PbpValidationError[];
  derivationResults: PbpDerivationResult[];
  buyerView?: PbpBuyerView;
  projections: PbpProjectionSet;
  publication?: PbpPublicationSnapshot;
}

export type PartialCompilerResult = Partial<PbpCompilerResult>;
