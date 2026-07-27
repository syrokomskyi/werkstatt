/*
<MODULE_CONTRACT>
<purpose>[RFC-0192] Public entrypoint for @warpgogol/surface — the Programmatic Surface port.</purpose>
<non-goals>
  <item>Do not perform I/O — consumers (kernel command) supply loaded data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0192: initial barrel.</item>
  <item>RFC-0271: export SurfaceModuleContext schema, type, and ownership helpers.</item>
  <item>RFC-0276: export Bordbuch event/status schemas and types.</item>
  <item>RFC-0280/RFC-0281: export DemandSignal and WerkRecord schemas.</item>
  <item>RFC-0278/RFC-0279/RFC-0285: export governance schemas and types.</item>
  <item>RFC-0282/RFC-0283: export visibility and breaker schemas.</item>
  <item>RFC-0284: export fleet Leitstand schemas and types.</item>
  <item>RFC-0264 cleanup: root barrel delegates governance exports to the governance subpath.</item>
</CHANGE_SUMMARY>
*/

export type {
  AxisTuple,
  EligibilityPolicy,
  IndexDecision,
  IndexReason,
  IndustryDossierFields,
  LocalizedSlug,
  LocalizedUniverse,
  PageEntry,
  PageSurfaceProvider,
  RedirectPolicy,
  SurfaceArtifact,
  SurfaceAxis,
  SurfaceBlock,
  SurfaceCounts,
  SurfaceManifest,
  SurfaceNarrative,
  SurfaceRecord,
  SurfaceRecordImage,
  VirtualRouteEntry,
} from "./types.ts";

export {
  buildEligibilityMatrix,
  countMatching,
  enumerateCandidateTuples,
  liveChildrenOf,
  liveSiblingsOf,
  matchesRecord,
  nearestLiveAncestor,
  normalizeSegment,
  pathKey,
  type AxisFieldMap,
  type EligibilityMatrix,
  type MatrixEntry,
} from "./eligibility.ts";

export {
  assembleEntries,
  buildAxes,
  buildAxisFieldMap,
  generateEntries,
  pageIdFor,
  resolvePolicy,
  resolveSlug,
  type Blueprint,
  type BlueprintAxis,
  type BlueprintDemandDepthPolicy,
  type BlueprintDossier,
  type BlueprintDuplicatePolicy,
  type BlueprintEvidenceDepthPolicy,
  type BlueprintIntersectionConfig,
  type BlueprintLevel,
  type BlueprintLinking,
  type BlueprintPillar,
  type BlueprintPillarAdaptation,
  type BlueprintPillarAdaptationDimension,
  type BlueprintPillarFinalCta,
  type BlueprintPillarHero,
  type BlueprintPillarProductPrice,
  type BlueprintPolicy,
  type BlueprintProjection,
  type EnrichedFieldSpec,
  type GeoDepth,
  type IndustryPublicationGate,
  type IntersectionGate,
  type IntersectionSimilarity,
  type LocalizedString,
} from "./blueprint.ts";

export { blueprintSchema, parseBlueprint, type ParseBlueprintResult } from "./blueprint-schema.ts";

// Governance and operational schema bags (RFC-0271..0285) — grouped sub-barrel.
// Architecture review 2026-07-10: these are pure Zod schemas + inferred types with no functions,
// kept in a sub-folder so the engine interface stays focused on route generation and baking.
export * from "./governance/index.ts";

export {
  buildTokenDocFreq,
  pageText,
  scoreSubstance,
  tokenize,
  type SubstanceComponents,
  type SubstanceScore,
} from "./substance.ts";

export { includeInLlms, includeInTwins, renderTwin, type BlockTwinRenderer } from "./geo.ts";

export {
  composeIndexDecision,
  evaluateBudgetGate,
  evaluateDemandGate,
  evaluateEvidenceGate,
  evaluateFreshnessGate,
  evaluateSubstanceGate,
  type GateResult,
} from "./decision-composer.ts";
