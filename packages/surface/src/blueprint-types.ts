/*
<MODULE_CONTRACT>
<purpose>
  Blueprint type definitions extracted from blueprint.ts. Pure type
  contracts for the declarative surface spec — no functions, no I/O.
</purpose>
<non-goals>
  <item>Do not define functions — those live in blueprint.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract blueprint type definitions from blueprint.ts.</item>
</CHANGE_SUMMARY>
*/

/** A localized string map: lang → value. */
export type LocalizedString = Record<string, string>;

export interface BlueprintAxis {
  id: string;
  universe: { collection: string; field: string } | { provider: string };
  match: { recordField: string };
}

export type GeoDepth = "full" | "twin-only" | "off";

export interface BlueprintLevelArticle {
  publishedAt: string;
  updatedAt?: string;
  author?: string;
  tags?: string[];
}

export interface BlueprintPillarHero {
  eyebrow: LocalizedString;
  heading: LocalizedString;
  lead: LocalizedString;
  primaryCta: { label: LocalizedString; target: string };
  secondaryCta: { label: LocalizedString; target: string };
}

export interface BlueprintPillarAdaptationDimension {
  heading: LocalizedString;
  body: LocalizedString;
}

export interface BlueprintPillarAdaptation {
  heading: LocalizedString;
  dimensions: BlueprintPillarAdaptationDimension[];
}

export interface BlueprintPillarProductPrice {
  heading: LocalizedString;
  body: LocalizedString;
  priceRef: string;
}

export interface BlueprintPillarFinalCta {
  heading: LocalizedString;
  body: LocalizedString;
  primaryCta: { label: LocalizedString; target: string };
  secondaryCta: { label: LocalizedString; target: string };
}

export interface BlueprintPillar {
  hero: BlueprintPillarHero;
  adaptation: BlueprintPillarAdaptation;
  productPrice: BlueprintPillarProductPrice;
  finalCta: BlueprintPillarFinalCta;
}

export interface ServicePublicationGate {
  minServiceVariants: number;
  minCustomerQuestions: number;
  minPriceModels: number;
  minFaq: number;
  minPageStructure: number;
}

export interface BlueprintServiceConfig {
  gate: ServicePublicationGate;
  claimRestrictions: string[];
  mode: "warn" | "fail";
}

export interface BlueprintLinkingParent {
  surface: string;
  depth: number;
  joinField: string;
}

export interface IndustryPublicationGate {
  minServiceCategories: number;
  minCustomerJourneys: number;
  minTrustSignals: number;
  minArchitectureEntries: number;
  minModuleMappings: number;
  minUniqueFaq: number;
}

export interface BlueprintDossier {
  gate: IndustryPublicationGate;
  claimRestrictions: string[];
  doorwayMaxFlaggedShare: number;
  duplicateMaxSimilarity: number;
  mode: "warn" | "fail";
}

export interface IntersectionGate {
  minLocalServiceQuestions: number;
  minScenarios: number;
  minLocalEvidence: number;
  minUniqueContentBlocks: number;
  minUniqueFaq: number;
  minSources: number;
}

export interface IntersectionSimilarity {
  similarityToIndustryPage: number;
  similarityToCityPage: number;
  similarityToServicePage: number;
  similarityToOtherIntersections: number;
}

export interface BlueprintIntersectionConfig {
  gate: IntersectionGate;
  similarity: IntersectionSimilarity;
  substanceIndependenceThreshold: number;
  mode: "warn" | "fail";
}

export interface BlueprintHubConfig {
  cardFields: string[];
  reservedSlugs: string[];
}

export interface BlueprintStatusGate {
  allowedStatuses: string[];
  excludedStatuses: string[];
}

export interface BlueprintLevel {
  depth: number;
  slug: LocalizedString;
  redirectToPageId?: string;
  constellation: string;
  geo?: GeoDepth;
  titleTemplate?: LocalizedString;
  descriptionTemplate?: LocalizedString;
  intro?: LocalizedString;
  semanticType?: string;
  article?: BlueprintLevelArticle;
  pillar?: BlueprintPillar;
  dossier?: BlueprintDossier;
  service?: BlueprintServiceConfig;
  intersection?: BlueprintIntersectionConfig;
  hub?: BlueprintHubConfig;
}

export interface BlueprintLinking {
  children?: { limit: number };
  siblings?: { limit: number };
  teasers?: { relevance?: Array<{ sharedAxis: string; weight: number }> };
  parent?: BlueprintLinkingParent;
}

export interface BlueprintProjection {
  title?: LocalizedString;
  description?: LocalizedString | { ref: string };
}

export interface EnrichedFieldSpec {
  field: string;
  promptId: string;
  maxTokens: number;
  scopeDepth: number;
  kind?: "field" | "narrative";
  scope?: "tuple" | "record";
  axis?: string;
}

export interface BlueprintDuplicatePolicy {
  method?: "shingle" | "simhash";
  maxSimilarityWithinCluster?: number;
}

export interface BlueprintEvidenceDepthPolicy {
  approvedNarrative?: "required" | "optional";
  requiredRecordFields?: readonly string[];
  preferredEvidenceSources?: readonly string[];
  minTupleSpecificFacts?: number;
  minWerkEvidence?: number;
  existenceSource?: "records" | "works";
  freshness?: "valid-and-current" | "valid";
  duplicate?: BlueprintDuplicatePolicy;
  leadImage?: "required" | "warning" | "optional";
  mode?: "error" | "warning";
}

export interface BlueprintDemandDepthPolicy {
  minVolume?: number;
  allowIntents?: readonly ("informational" | "commercial" | "transactional" | "navigational")[];
  missing?: "noindex" | "do-not-emit";
  staleAfterDays?: number;
}

export interface BlueprintDepthRolePolicy {
  indexability: "index" | "navigation-noindex" | "evidence-gated";
  canonicalTarget?: "tradeHub" | number;
  follow?: boolean;
  includeInSitemap?: boolean;
  geo?: GeoDepth;
  localEvidence?: {
    minVerifiedFacts?: number;
    minCitySpecificQa?: number;
    minUniqueTokenShare?: number;
    maxBodySimilarityWithinBranch?: number;
  };
}

export interface BlueprintPolicy {
  minRecordsPerDepth: Record<number, number>;
  noindexBelowPerDepth?: Record<number, number>;
  redirectPolicy?: "nearest-ancestor" | "root";
  trailingSlash?: boolean;
  maxStubDepth?: number;
  substanceMin?: number;
  substanceMinPerDepth?: Record<number, number>;
  evidencePerDepth?: Record<number, BlueprintEvidenceDepthPolicy>;
  demandPerDepth?: Record<number, BlueprintDemandDepthPolicy>;
  depthRoles?: Record<number, BlueprintDepthRolePolicy>;
  sitemapBudget?: number;
  maxThinShare?: number;
  regionalGateDepths?: readonly number[];
  bake?: "inline" | "lazy";
  statusGate?: BlueprintStatusGate;
}

export interface Blueprint {
  id: string;
  entitlement: string;
  dataset: { collection: string; status?: string };
  axes: BlueprintAxis[];
  levels: BlueprintLevel[];
  policy: BlueprintPolicy;
  linking?: BlueprintLinking;
  rotation?: { variantsByTupleHash: boolean };
  projection?: BlueprintProjection;
  freshness?: {
    slaDaysPerDepth: Record<number, number>;
    field: string;
    mode?: "any" | "all" | "median";
  };
  enrichedFields?: EnrichedFieldSpec[];
}
