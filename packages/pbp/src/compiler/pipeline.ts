/*
<MODULE_CONTRACT>
<purpose>14-phase pipeline orchestrator — runs all phases in sequence and assembles the final result.</purpose>
<non-goals>
  <item>Does not implement individual phases — delegates to phase modules.</item>
  <item>Does not provide CLI access — library-only (RFC-0467).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — pipeline orchestrator.</item>
</CHANGE_SUMMARY>
*/

import type { PbpCompilerInput, PbpCompilerResult, PartialCompilerResult } from "./types.js";
import { discover } from "./discover.js";
import { parse } from "./parse.js";
import { validateRaw } from "./validate.js";
import { buildEntityIndex } from "./entity-index.js";
import { resolveLocales } from "./locale.js";
import { resolveReferences } from "./references.js";
import { resolveProfile } from "./profile.js";
import { applyRuntimeOverlays } from "./overlays.js";
import { runDerivations } from "./derivations.js";
import { validateSemantic } from "./semantic.js";
import { assembleBuyerView } from "./buyer-view.js";
import { generateProjections } from "./projection.js";
import { snapshot } from "./snapshot.js";
import { publish } from "./publication.js";

export async function compilePbpProfile(input: PbpCompilerInput): Promise<PbpCompilerResult> {
  // Phase 1: discover
  const inventory = await discover(input);

  // Phase 2: parse
  const parsed = await parse(inventory);

  // Phase 3: raw-schema-validation
  const { entities, errors: schemaErrors } = await validateRaw(parsed, input.strictness);

  // Phase 4: build-entity-index
  const { index, errors: indexErrors } = await buildEntityIndex(entities);

  // Phase 5: locale-resolution
  const { resolved, fallbackReport } = await resolveLocales(
    index,
    input.locale,
    input.defaultLocale,
  );

  // Phase 6: reference-resolution
  const { errors: graphErrors, cycleResults } = await resolveReferences(resolved);

  // Phase 7: profile-resolution
  const graph = await resolveProfile(resolved);

  // Phase 8: runtime-overlays (stub for Wave 1)
  const overlaid = await applyRuntimeOverlays(graph);

  // Phase 9: derivations
  const { results: derivationResults, errors: derivationErrors } = await runDerivations(
    overlaid,
    input.derivations ?? [],
  );

  // Phase 10: semantic-validation
  const semanticErrors = await validateSemantic(overlaid);

  // Phase 11: buyer-view
  const buyerView = input.buyerViewSchemaRef
    ? await assembleBuyerView(overlaid, input.buyerViewSchemaRef)
    : undefined;

  // Phase 12: projection
  const projections = await generateProjections(overlaid, buyerView, input.locale);

  // Phase 13: canonical-snapshot (stub for Wave 1)
  const partialForSnapshot: PartialCompilerResult = {
    inventory,
    entityIndex: resolved,
    resolvedGraph: overlaid,
    fallbackReport,
    graphErrors,
    cycleResults,
    validationErrors: [...schemaErrors, ...indexErrors, ...derivationErrors, ...semanticErrors],
    derivationResults,
    buyerView,
    projections,
  };
  const publication = await snapshot(overlaid, {
    buildId: "",
    sourceRevision: "",
    buildTime: input.buildTime ?? "",
    locale: input.locale,
    defaultLocale: input.defaultLocale,
    schemaSetDigest: "",
    derivationSetDigest: "",
    runtimeSnapshotId: null,
  });

  // Phase 14: publication
  const result = await publish({ ...partialForSnapshot, publication }, input);

  return result;
}
