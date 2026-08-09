/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0192/0193] The Blueprint contract type (the declarative spec that configures one surface)
  plus the pure helpers that turn a Blueprint + loaded datasets into the eligibility matrix and
  the materialized VirtualRouteEntry[] (routes + redirect decisions). Framework-free. The runtime
  Zod schema and the YAML files live in @warpgogol/werkstatt-site/ontology (RFC-0193); block baking is added there.
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

import type {
  LocalizedString,
  BlueprintAxis,
  GeoDepth,
  BlueprintLevelArticle,
  BlueprintPillarHero,
  BlueprintPillarAdaptationDimension,
  BlueprintPillarAdaptation,
  BlueprintPillarProductPrice,
  BlueprintPillarFinalCta,
  BlueprintPillar,
  ServicePublicationGate,
  BlueprintServiceConfig,
  BlueprintLinkingParent,
  IndustryPublicationGate,
  BlueprintDossier,
  IntersectionGate,
  IntersectionSimilarity,
  BlueprintIntersectionConfig,
  BlueprintHubConfig,
  BlueprintStatusGate,
  BlueprintLevel,
  BlueprintLinking,
  BlueprintProjection,
  EnrichedFieldSpec,
  BlueprintDuplicatePolicy,
  BlueprintEvidenceDepthPolicy,
  BlueprintDemandDepthPolicy,
  BlueprintDepthRolePolicy,
  BlueprintPolicy,
  Blueprint,
} from "./blueprint-types.ts";

export type {
  LocalizedString,
  BlueprintAxis,
  GeoDepth,
  BlueprintLevelArticle,
  BlueprintPillarHero,
  BlueprintPillarAdaptationDimension,
  BlueprintPillarAdaptation,
  BlueprintPillarProductPrice,
  BlueprintPillarFinalCta,
  BlueprintPillar,
  ServicePublicationGate,
  BlueprintServiceConfig,
  BlueprintLinkingParent,
  IndustryPublicationGate,
  BlueprintDossier,
  IntersectionGate,
  IntersectionSimilarity,
  BlueprintIntersectionConfig,
  BlueprintHubConfig,
  BlueprintStatusGate,
  BlueprintLevel,
  BlueprintLinking,
  BlueprintProjection,
  EnrichedFieldSpec,
  BlueprintDuplicatePolicy,
  BlueprintEvidenceDepthPolicy,
  BlueprintDemandDepthPolicy,
  BlueprintDepthRolePolicy,
  BlueprintPolicy,
  Blueprint,
};

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
