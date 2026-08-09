/*
<MODULE_CONTRACT>
<purpose>
  Re-export barrel for check-warpgogol command helpers.
  Diagnostic collectors now live in @warpgogol/werkstatt-site/check-core/diagnostics.ts.
  Evidence reading lives in evidence-readers.ts.
  Artifact builders live in artifact-builders.ts.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
  <item>Split into evidence-readers.ts and artifact-builders.ts; diagnostic collectors moved to @warpgogol/werkstatt-site/check-core.</item>
</CHANGE_SUMMARY>
*/

export {
  collectAccessibilityDiagnostics,
  collectContentSurfaceDiagnostics,
  collectDeterministicDiagnostics,
  collectLocalizationDiagnostics,
  collectTechnicalDiagnostics,
  containsSecretLikeText,
  makeDiagnostic,
} from "@warpgogol/werkstatt-site/check-core";
export {
  makeRunArtifact,
  readEvidenceForRun,
  runEvidenceOnlyCheck,
  updateRunArtifact,
} from "./evidence-readers.ts";
export {
  buildAudienceReview,
  buildHintsFromManifest,
  makeAgentAction,
  makeAgentActionPack,
  makeCheckReport,
  numberFlag,
  renderReportHtml,
} from "./artifact-builders.ts";
