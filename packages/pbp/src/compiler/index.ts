/*
<MODULE_CONTRACT>
<purpose>Public API for the PBP compiler — exports compilePbpProfile and all compiler types.</purpose>
<non-goals>
  <item>Does not implement individual phases — each phase has its own module.</item>
  <item>Does not provide CLI access — library-only (RFC-0467).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — compiler index with compilePbpProfile orchestrator.</item>
</CHANGE_SUMMARY>
*/

export { compilePbpProfile } from "./pipeline.js";
export type {
  PbpCompilerInput,
  PbpCompilerResult,
  PbpResolvedGraph,
  PbpBuyerView,
  PbpProjectionSet,
  PartialCompilerResult,
} from "./types.js";
export { discover } from "./discover.js";
export { parse, type ParsedEntity } from "./parse.js";
export { validateRaw, type RawValidationResult } from "./validate.js";
export { buildEntityIndex, type EntityIndexResult } from "./entity-index.js";
export { resolveLocales, type LocaleResolutionResult } from "./locale.js";
export { resolveReferences, type ReferenceResolutionResult } from "./references.js";
export { resolveProfile } from "./profile.js";
export { applyRuntimeOverlays } from "./overlays.js";
export { runDerivations, type DerivationResult } from "./derivations.js";
export { validateSemantic } from "./semantic.js";
export { assembleBuyerView } from "./buyer-view.js";
export { generateProjections } from "./projection.js";
export { snapshot } from "./snapshot.js";
export { publish } from "./publication.js";
export { materializeDerivedPrices } from "./materialize.js";
export type { PbpMaterializedDerivedPrice } from "../materialized-derived-price.js";
