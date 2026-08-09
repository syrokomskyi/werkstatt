/*
<MODULE_CONTRACT>
<purpose>Centralizes the export of validation and linting functions for modular checks within the Warpgogol ecosystem.</purpose>
<non-goals>
  <item>Do not define new validation logic; only export existing functions.</item>
  <item>Do not manage user interactions or output; maintain a focus on function exports.</item>
  <item>Do not handle configuration management or orchestration of transport layers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: updated header to v2 two-block contract.</item>
  <item>RFC-0264 cleanup: replace long root export groups with module-level re-export delegation.</item>
  <item>Added axiom-adapter re-exports: renderAxiomReportHtml, EvidenceMetadata, MissionCheckResult, AxiomReportData.</item>
</CHANGE_SUMMARY>
*/

export { runPageContentValidation, runNamingContentLint } from "./checks/page-content.ts";
export { runThinCopyValidation, runSharedUiThinCopyValidation } from "./checks/thin-copy.ts";
export { runDesignSystemTokenLint, runHardcodedColorLint } from "./checks/tokens.ts";
export { runMirroringValidation } from "./checks/mirroring.ts";
export { runSemanticDriftValidation } from "./checks/semantic-drift.ts";

export { runCompassInventory, runCompassValidation } from "./compass.ts";
export * from "./compass-change-summary.ts";
export * from "./compass-audit.ts";
export { createCompassInventoryEntries, type CompassInventoryEntry } from "@warpgogol/werkstatt/kernel";

export * from "./structure.ts";

export { runWerkstattOperationValidate } from "./werkstatt-operation-validate.ts";

export * from "./semantic.ts";

export { runFeaturePolicyValidate, runFeatureReferencesValidate } from "./feature-policy.ts";

export * from "./naming.ts";

export { runLighthouseValidation, runLighthouseBudgetCheck } from "./lighthouse.ts";

export { runScriptsPlacementValidation } from "./scripts-placement.ts";

export * from "./structure-hierarchy.ts";

export { runNavigationSectionValidate } from "./navigation-section.ts";

export { runManifestContractValidate, runMirrorQuintetValidate } from "./manifest.ts";

export * from "./registry.ts";

export * from "./archetype.ts";

export { runCosmicCatalogValidate, runCosmicNameUnique } from "./cosmic.ts";

export { runBiomeContractValidate } from "./biome.ts";
export { runBiomeTokensValidate } from "./biome-tokens.ts";
export { runTokensCatalogSync } from "./tokens-catalog-sync.ts";

export { runFamilyContractValidate, runFamilyList } from "./family.ts";

export { runSystemManifestValidate, runConstellationComposeValidate } from "./system-manifest.ts";

export { runAppLayoutValidate } from "./app-layout.ts";

export { runClientEditValidate } from "./client-edit.ts";

export { runPageBlockValidate } from "./page-block.ts";
export { runVisibilityExprValidate } from "./visibility-expr.ts";
export { runPagePipelineContract } from "./pipeline/pipeline-contract.ts";
export { runRuntimeContextShape } from "./runtime-context-shape.ts";
export { runContentCoverageValidate } from "./content-coverage.ts";
export { runContentVoiceLint, matchesForbiddenPhrase } from "./content-voice.ts";
export { runPbpContentValidate } from "./content-pbp.ts";
export { runContentReferencesValidate } from "./content-references.ts";
export * from "./audit-validators.ts";
export { runAuditLlm } from "./audit-llm.ts";
export { runAppQaValidate } from "./app-qa.ts";
export * from "./audit/types.ts";

export * from "./module.ts";

export * from "./contract-full.ts";

export * from "./result-helpers.ts";
// RFC-0203: canonical Diagnostic zod realization + severity vocabulary.

export { runKernelResultEnvelopeLint } from "./kernel-result-envelope-lint.ts";
export { runWarningDiagnosticsLint } from "./warning-diagnostics-lint.ts";
export {
  runPipelineTimingReport,
  runPipelineTimeoutValidate,
} from "./pipeline/pipeline-telemetry.ts";

export { runSchemaDriftValidate } from "./schema-drift.ts";

export { runContentTypesValidate } from "./content-types.ts";

// RFC-0054: Content filename validation
export { runContentFilenameValidate } from "./content-filename.ts";

// RFC-0049: Sitemap generation and validation
export { runSitemapGenerate, runSitemapValidate } from "./sitemap.ts";
// RFC-0172: post-build render-sourced image sitemap
export { runSitemapImagesGenerate, runSitemapImagesValidate } from "./sitemap-images.ts";
// RFC-0167: sellable blog/article module contract
export { runBlogValidate } from "./blog.ts";
// RFC-0508: canonical Participant record contract (replaces people.validate)
export { runParticipantValidate } from "./participant.ts";
export { runPersonCreate } from "./person-create.ts";
// RFC-0168: Integration Port governance (channels + CRM config surface)
export {
  runIntegrationConfigValidate,
  runIntegrationSecretsValidate,
  runIntegrationSecretsAudit,
} from "./integration.ts";

// RFC-0188: Visitor Sales Funnel governance (state machine + UChat alignment)
export {
  runFunnelContractValidate,
  runFunnelStageValidate,
  runFunnelCopyValidate,
  runFunnelLagebildValidate,
  runFunnelOrgValidate,
} from "./funnel.ts";

// RFC-0191: Stripe billing governance
export { runBillingConfigValidate, runBillingSecretsValidate } from "./billing.ts";

// RFC-0168 (Session C): generated, leak-guarded .env.example
export { runEnvExampleGenerate, runEnvExampleValidate } from "./env/env-example.ts";

// RFC-0761: env-and-deploy contract commands (DNA-40)
export {
  runEnvContractValidate,
  runEnvLocalCheck,
  runDeployScriptsValidate,
  parseEnvExample,
  checkEnvContract06,
} from "./env/env-contract.ts";
export { runDeployPreflight } from "./env/deploy-preflight.ts";

// CSS important lint
export { runCssImportantLint } from "./css-important-lint.ts";

// RFC-0150: Preview images validation and generation
export { runPreviewImagesValidate, runPreviewImagesGenerate } from "./preview-images.ts";

// RFC-0081: Generated marker validation
export * from "./generated-marker-validate.ts";

// RFC-0187: Post-build unresolved content reference scan
export { runDistContentReferencesValidate } from "./dist-content-references.ts";

// RFC-0089: Astro subpath exports lint
export { runAstroExportsLint } from "./astro-exports.ts";

// RFC-0245: Agent Control Plane and maintenance debt ledger
export * from "./ecosystem.ts";

// RFC-0256: advisory maintenance debt queues
export * from "./maintenance/maintenance-debt-queue.ts";

// RFC-0249: autonomous package quality and CI gates
export { runCiLocalValidate, CI_LOCAL_CHECKED_COMMANDS } from "./ci-local.ts";
export * from "./test-signal.ts";

// RFC-0620: re-export generator ownership map for cross-package import
export { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";
export type { OwnershipEntry } from "./generator-ownership.ts";

// RFC-0647: re-export ensureChromium for cross-package import by mission.materialize
export {
  ensureChromium,
  type PlaywrightChromiumEnsureResult,
} from "./playwright-chromium-ensure.ts";

// Axiom adapter: re-export report renderer and types for downstream consumers
export {
  renderAxiomReportHtml,
  type EvidenceMetadata,
  type MissionCheckResult,
  type AxiomReportData,
} from "./axiom-adapter.ts";
