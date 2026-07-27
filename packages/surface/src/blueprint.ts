/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0192/0193] The Blueprint contract type (the declarative spec that configures one surface)
  plus the pure helpers that turn a Blueprint + loaded datasets into the eligibility matrix and
  the materialized VirtualRouteEntry[] (routes + redirect decisions). Framework-free. The runtime
  Zod schema and the YAML files live in @warpgogol/ontology (RFC-0193); block baking is added there.
</purpose>
<non-goals>
  <item>Do not parse YAML or validate (ontology owns the Zod schema).</item>
  <item>Do not read content or bake page blocks (the kernel command / RFC-0193 provider does).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0192: Blueprint type + entry assembly (no block baking yet).</item>
  <item>RFC-0199: resolveSlug/routesFor/assembleEntries/generateEntries take a LocalizedUniverse so URL segments localize per language while identity stays on the neutral tuple.</item>
  <item>RFC-0496: add BlueprintServiceConfig + ServicePublicationGate for website-service depth-1 service dossier configuration; add BlueprintLinkingParent for cross-surface parent linking.</item>
  <item>RFC-0497: add BlueprintIntersectionConfig + IntersectionGate + IntersectionSimilarity for website-local depth-5 intersection gate configuration.</item>
  <item>RFC-0500: add BlueprintHubConfig for depth-0 editorial knowledge hub configuration; add BlueprintStatusGate for record status filtering.</item>
</CHANGE_SUMMARY>
*/

import {
  buildEligibilityMatrix,
  nearestLiveAncestor,
  normalizeSegment,
  pathKey,
  type AxisFieldMap,
  type EligibilityMatrix,
  type MatrixEntry,
} from "./eligibility.ts";
import type {
  AxisTuple,
  EligibilityPolicy,
  LocalizedUniverse,
  SurfaceAxis,
  SurfaceRecord,
  VirtualRouteEntry,
} from "./types.ts";

/** A localized string map: lang → value. */
export type LocalizedString = Record<string, string>;

export interface BlueprintAxis {
  id: string;
  /**
   * The content-source collection + field whose entries form this axis's value universe,
   * OR a geo provider reference (RFC-0238) resolved via @warpgogol/geo.
   */
  universe: { collection: string; field: string } | { provider: string };
  /** The record field whose value(s) carry this axis's membership. */
  match: { recordField: string };
}

export type GeoDepth = "full" | "twin-only" | "off";

/**
 * RFC-0325: static article metadata for a level with no per-record binding (e.g. a depth-0 pillar
 * hub). Depth ≥1 levels bound to a dataset record instead read `publishedAt`/`updatedAt`/`author`/
 * `tags` directly from the matching record's frontmatter (the record wins when both are present).
 */
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

/** RFC-0496: publication gate thresholds for depth-1 service dossier pages. */
export interface ServicePublicationGate {
  minServiceVariants: number;
  minCustomerQuestions: number;
  minPriceModels: number;
  minFaq: number;
  minPageStructure: number;
}

/** RFC-0496: blueprint-level service configuration for website-service depth-1 pages. */
export interface BlueprintServiceConfig {
  gate: ServicePublicationGate;
  claimRestrictions: string[];
  mode: "warn" | "fail";
}

/** RFC-0496: cross-surface parent linking — service pages link up to their parent industry page. */
export interface BlueprintLinkingParent {
  surface: string;
  depth: number;
  joinField: string;
}

/** RFC-0492: publication gate thresholds for depth-1 industry dossier pages. */
export interface IndustryPublicationGate {
  minServiceCategories: number;
  minCustomerJourneys: number;
  minTrustSignals: number;
  minArchitectureEntries: number;
  minModuleMappings: number;
  minUniqueFaq: number;
}

/** RFC-0492: blueprint-level dossier configuration for depth-1 industry pages. */
export interface BlueprintDossier {
  gate: IndustryPublicationGate;
  claimRestrictions: string[];
  doorwayMaxFlaggedShare: number;
  duplicateMaxSimilarity: number;
  mode: "warn" | "fail";
}

/** RFC-0497: gate thresholds for intersection records. */
export interface IntersectionGate {
  minLocalServiceQuestions: number;
  minScenarios: number;
  minLocalEvidence: number;
  minUniqueContentBlocks: number;
  minUniqueFaq: number;
  minSources: number;
}

/** RFC-0497: similarity thresholds for intersection pages. */
export interface IntersectionSimilarity {
  similarityToIndustryPage: number;
  similarityToCityPage: number;
  similarityToServicePage: number;
  similarityToOtherIntersections: number;
}

/** RFC-0497: blueprint-level intersection configuration for depth-5 pages. */
export interface BlueprintIntersectionConfig {
  gate: IntersectionGate;
  similarity: IntersectionSimilarity;
  substanceIndependenceThreshold: number;
  mode: "warn" | "fail";
}

/** RFC-0500: hub configuration for depth-0 editorial knowledge hubs (ratgeber). */
export interface BlueprintHubConfig {
  cardFields: string[];
  reservedSlugs: string[];
}

/** RFC-0500: status gate — only records with allowed statuses are emitted as surface entries. */
export interface BlueprintStatusGate {
  allowedStatuses: string[];
  excludedStatuses: string[];
}

export interface BlueprintLevel {
  depth: number;
  /** lang → slug template, e.g. "website/{industry}/{city}". */
  slug: LocalizedString;
  /** Force this level to be emitted as a redirect stub to a live authored or surface pageId. */
  redirectToPageId?: string;
  /** The constellation (ordered Planet sequence) that renders this depth. */
  constellation: string;
  /** RFC-0195: per-depth GEO contribution. */
  geo?: GeoDepth;
  /**
   * RFC-0193: lang → page-title template with `{axisId.field}` / `{axisId}` tokens, e.g.
   * "{industry.name} Website in {city.name}". When omitted the baker falls back to joining the
   * axis-value names.
   */
  titleTemplate?: LocalizedString;
  /** lang → meta-description template (same tokens). Optional. */
  descriptionTemplate?: LocalizedString;
  /** lang → static intro prose for this level (used as the lead when no axis-value intro exists,
   * e.g. a pillar page with no axis data). */
  intro?: LocalizedString;
  /**
   * RFC-0325: this level's generated pages carry this semantic page type for JSON-LD/OG meta
   * (defaults to "content", mirroring `VirtualRouteEntry.semanticType`). Set to "article" for a
   * dated editorial genre (Ratgeber-style guides).
   */
  semanticType?: string;
  /** RFC-0325: static article dates for a level with no per-record binding. See BlueprintLevelArticle. */
  article?: BlueprintLevelArticle;
  /** RFC-0490: optional pillar-hub configuration for depth-0 hub pages. */
  pillar?: BlueprintPillar;
  /** RFC-0492: optional dossier configuration for depth-1 industry pages. */
  dossier?: BlueprintDossier;
  /** RFC-0496: optional service configuration for website-service depth-1 pages. */
  service?: BlueprintServiceConfig;
  /** RFC-0497: optional intersection configuration for website-local depth-5 pages. */
  intersection?: BlueprintIntersectionConfig;
  /** RFC-0500: optional hub configuration for depth-0 editorial knowledge hubs. */
  hub?: BlueprintHubConfig;
}

export interface BlueprintLinking {
  children?: { limit: number };
  siblings?: { limit: number };
  teasers?: { relevance?: Array<{ sharedAxis: string; weight: number }> };
  /** RFC-0496: cross-surface parent linking (e.g. website-service → website-local depth-1). */
  parent?: BlueprintLinkingParent;
}

export interface BlueprintProjection {
  title?: LocalizedString;
  description?: LocalizedString | { ref: string };
}

/**
 * RFC-0197/0207: one build-time, frozen, provenanced enriched field.
 *
 * `kind` selects the output shape:
 *   - "field"     — a single string folded into one content block (the original localMarket; default).
 *   - "narrative" — a structured SurfaceNarrative (h1/lead/tagline/bridges) that supplies the hero
 *                   and section headings, replacing template-glue for indexable pages.
 * `scope` selects the generation granularity:
 *   - "tuple"  — one generation per live axis tuple at `scopeDepth` (default — bespoke per page).
 *   - "record" — one generation per axis value (reused across the matrix); requires `axis`.
 */
export interface EnrichedFieldSpec {
  field: string;
  promptId: string;
  maxTokens: number;
  scopeDepth: number;
  kind?: "field" | "narrative";
  scope?: "tuple" | "record";
  /** For scope:"record": the axis id whose values this field is generated per. */
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
  /** RFC-0281: minimum consented Werk records required for this depth. */
  minWerkEvidence?: number;
  /** RFC-0281: when set to "works", candidates at this depth are bounded by the Werk evidence join. */
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

/** The eligibility policy as authored in a Blueprint (segmentPattern defaulted by the loader). */
export interface BlueprintPolicy {
  minRecordsPerDepth: Record<number, number>;
  noindexBelowPerDepth?: Record<number, number>;
  redirectPolicy?: "nearest-ancestor" | "root";
  trailingSlash?: boolean;
  maxStubDepth?: number;
  /** RFC-0194: minimum Page Substance Score (0..100) to index; below ⇒ auto-noindex. */
  substanceMin?: number;
  /** RFC-0274: optional per-depth substance floors that override the legacy global floor. */
  substanceMinPerDepth?: Record<number, number>;
  /** RFC-0274: per-depth proof profile required before a page may be indexable. */
  evidencePerDepth?: Record<number, BlueprintEvidenceDepthPolicy>;
  /** RFC-0280: per-depth search-demand signal gate. */
  demandPerDepth?: Record<number, BlueprintDemandDepthPolicy>;
  /** RFC-0324: per-depth indexability role for geo/PSEO levels. */
  depthRoles?: Record<number, BlueprintDepthRolePolicy>;
  /** RFC-0194: hard ceiling on indexable pages per surface (sitemap budget). */
  sitemapBudget?: number;
  /** RFC-0194: max share (0..1) of a family that may be thin before pseo.validate fails. */
  maxThinShare?: number;
  /**
   * RFC-0240: depths gated behind the regional-hub-or-higher `pseo` tier (e.g. `[3]` for a region-hub
   * level). Suppressed (dropped) when the resolved entitlements do not report `pseo.regionalUnlocked`.
   */
  regionalGateDepths?: readonly number[];
  /**
   * RFC-0192: how baked pages are stored. "inline" (default) bakes each page's blocks into the
   * registry artifact (src/surface.generated.yaml). "lazy" keeps that artifact lightweight
   * (metadata only) and writes each baked page to its own file (.surface-cache/<pageId>.yaml),
   * loaded on demand at render — for surfaces too large to hold every page in one artifact.
   */
  bake?: "inline" | "lazy";
  /** RFC-0500: status gate — only records with allowed statuses are emitted as surface entries. */
  statusGate?: BlueprintStatusGate;
}

export interface Blueprint {
  id: string;
  /** Single gate (RFC-0169). Always "pseo" today; kept explicit for forward tiering. */
  entitlement: string;
  dataset: { collection: string; status?: string };
  axes: BlueprintAxis[];
  levels: BlueprintLevel[];
  policy: BlueprintPolicy;
  linking?: BlueprintLinking;
  rotation?: { variantsByTupleHash: boolean };
  projection?: BlueprintProjection;
  /**
   * RFC-0196: freshness SLA per depth + the record field carrying lastVerified. `mode` selects how
   * a page's age is derived from its contributing records' ages: "any" (oldest — decay if any record
   * is stale, default), "all" (youngest — decay only if every record is stale), or "median".
   */
  freshness?: {
    slaDaysPerDepth: Record<number, number>;
    field: string;
    mode?: "any" | "all" | "median";
  };
  /** RFC-0197/0207: fields generated once via surface.enrich (string fields and narrative bundles). */
  enrichedFields?: EnrichedFieldSpec[];
}

const DEFAULT_SEGMENT_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Resolve the Blueprint policy into a concrete EligibilityPolicy. */
export function resolvePolicy(bp: Blueprint): EligibilityPolicy {
  return {
    minRecordsPerDepth: bp.policy.minRecordsPerDepth,
    noindexBelowPerDepth: bp.policy.noindexBelowPerDepth ?? {},
    redirectPolicy: bp.policy.redirectPolicy ?? "nearest-ancestor",
    trailingSlash: bp.policy.trailingSlash ?? true,
    segmentPattern: DEFAULT_SEGMENT_PATTERN,
  };
}

export function buildAxisFieldMap(bp: Blueprint): AxisFieldMap {
  const map: Record<string, string> = {};
  for (const axis of bp.axes) map[axis.id] = axis.match.recordField;
  return map;
}

/** Build SurfaceAxis[] from a Blueprint and the loaded value universes (axisId → slugs). */
export function buildAxes(
  bp: Blueprint,
  universes: Record<string, readonly string[]>,
): SurfaceAxis[] {
  return bp.axes.map((axis) => ({ id: axis.id, universe: universes[axis.id] ?? [] }));
}

/** Synthetic stable pageId for a (blueprint, depth, tuple). */
export function pageIdFor(
  bp: Blueprint,
  depth: number,
  tuple: AxisTuple,
  axisOrder: readonly string[],
): string {
  if (depth === 0) return `${bp.id}:_root`;
  const values: string[] = [];
  for (let i = 0; i < depth; i += 1) values.push(tuple[axisOrder[i]!] ?? "");
  return `${bp.id}:${values.join(":")}`;
}

function levelByDepth(bp: Blueprint, depth: number): BlueprintLevel | undefined {
  return bp.levels.find((level) => level.depth === depth);
}

function tradeHubDepth(bp: Blueprint): number {
  for (const [depth, role] of Object.entries(bp.policy.depthRoles ?? {})) {
    if (role.indexability === "index") return Number(depth);
  }
  return 1;
}

function canonicalTargetPageId(
  bp: Blueprint,
  entry: MatrixEntry,
  axisOrder: readonly string[],
): string | undefined {
  const role = bp.policy.depthRoles?.[entry.depth];
  if (role?.indexability !== "navigation-noindex") return undefined;
  const targetDepth =
    role.canonicalTarget === "tradeHub"
      ? tradeHubDepth(bp)
      : typeof role.canonicalTarget === "number"
        ? role.canonicalTarget
        : undefined;
  if (targetDepth === undefined || targetDepth >= entry.depth) return undefined;
  return pageIdFor(bp, targetDepth, entry.tuple, axisOrder);
}

/**
 * Resolve a slug template ("website/{industry}/{city}") against a tuple for one language,
 * normalizing each value. RFC-0199: each token's value is the per-language localized slug from
 * `universe` when present, falling back to the neutral tuple value otherwise — so the identity key
 * stays neutral while the emitted URL segment localizes.
 */
export function resolveSlug(
  template: string,
  tuple: AxisTuple,
  lang: string,
  universe: LocalizedUniverse,
  pattern: RegExp,
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, axisId: string) => {
    const value = tuple[axisId];
    if (value === undefined) return "";
    const localized = universe[axisId]?.get(value)?.byLang?.[lang] ?? value;
    return normalizeSegment(localized, pattern);
  });
}

/** Localized routes (lang → slug) for one matrix entry. */
function routesFor(
  bp: Blueprint,
  entry: MatrixEntry,
  langs: readonly string[],
  pattern: RegExp,
  universe: LocalizedUniverse,
): Record<string, string> {
  const level = levelByDepth(bp, entry.depth);
  const routes: Record<string, string> = {};
  if (!level) return routes;
  for (const lang of langs) {
    const template = level.slug[lang] ?? level.slug[langs[0]!] ?? "";
    routes[lang] = resolveSlug(template, entry.tuple, lang, universe, pattern);
  }
  return routes;
}

/**
 * Turn the eligibility matrix into materialized VirtualRouteEntry[] (routes + redirect targets).
 * Block baking (entry.page) is layered on by the kernel command / RFC-0193 provider afterwards.
 */
export function assembleEntries(
  bp: Blueprint,
  matrix: EligibilityMatrix,
  langs: readonly string[],
  policy: EligibilityPolicy,
  localizedUniverse: LocalizedUniverse = {},
): VirtualRouteEntry[] {
  const result: VirtualRouteEntry[] = [];
  for (const entry of matrix.entries) {
    const pageId = pageIdFor(bp, entry.depth, entry.tuple, matrix.axisOrder);
    const routes = routesFor(bp, entry, langs, policy.segmentPattern, localizedUniverse);
    const level = levelByDepth(bp, entry.depth);
    const role = bp.policy.depthRoles?.[entry.depth];
    const navigationNoindex = role?.indexability === "navigation-noindex";
    const geo = navigationNoindex ? (role.geo ?? "off") : (level?.geo ?? "full");
    const forcedRedirectToPageId = level?.redirectToPageId;
    const indexable = forcedRedirectToPageId ? false : entry.indexable;
    const noindex = forcedRedirectToPageId || navigationNoindex ? true : entry.noindex;
    const canonicalPageId = canonicalTargetPageId(bp, entry, matrix.axisOrder);
    let redirectToPageId: string | undefined = forcedRedirectToPageId;
    if (!indexable && !redirectToPageId) {
      const ancestor = nearestLiveAncestor(entry, matrix, policy);
      if (ancestor) {
        redirectToPageId = pageIdFor(bp, ancestor.depth, ancestor.tuple, matrix.axisOrder);
      }
    }
    result.push({
      surfaceId: bp.id,
      pageId,
      routes,
      axes: entry.tuple,
      depth: entry.depth,
      recordCount: entry.recordCount,
      indexable,
      noindex,
      geo,
      ...(redirectToPageId ? { redirectToPageId } : {}),
      ...(canonicalPageId ? { canonicalPageId } : {}),
      decision: forcedRedirectToPageId
        ? {
            ...(entry.decision ?? { recordGate: true, indexable: false, noindex: true }),
            indexable: false,
            noindex: true,
            reason: "redirect-stub",
          }
        : navigationNoindex
          ? {
              ...(entry.decision ?? { recordGate: true, indexable: true, noindex: true }),
              indexable,
              noindex: true,
              reason: "navigation-noindex",
            }
          : entry.decision,
    });
  }
  return result;
}

/** Full pipeline: Blueprint + loaded data → VirtualRouteEntry[] (no baked pages). */
export function generateEntries(
  bp: Blueprint,
  data: {
    records: readonly SurfaceRecord[];
    universes: Record<string, readonly string[]>;
    langs: readonly string[];
    /** RFC-0199: per-language slug segments. Absent ⇒ neutral slugs only (legacy behavior). */
    localizedUniverse?: LocalizedUniverse;
    /** RFC-0240: whether the resolved entitlements unlock the regional-hub-or-higher `pseo` tier. */
    regionalUnlocked?: boolean;
  },
): VirtualRouteEntry[] {
  const policy = resolvePolicy(bp);
  const axes = buildAxes(bp, data.universes);
  const axisFieldMap = buildAxisFieldMap(bp);
  const matrix = buildEligibilityMatrix(axes, axisFieldMap, data.records, policy, {
    maxDepth: Math.max(0, ...bp.levels.map((level) => level.depth)),
    maxStubDepth: bp.policy.maxStubDepth ?? 1,
    forceNonIndexableDepths: data.regionalUnlocked ? [] : (bp.policy.regionalGateDepths ?? []),
  });
  return assembleEntries(bp, matrix, data.langs, policy, data.localizedUniverse ?? {});
}

export { pathKey };
