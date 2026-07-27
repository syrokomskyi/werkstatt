/*
<MODULE_CONTRACT>
<purpose>Public entrypoint for @gogol/site-kernel-onboarding — exports the
onboarding module factory and individual command runners (DNA-36, RFC-0029).</purpose>
<non-goals>
  <item>Do not import from app-specific packages.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 2 (RFC-0029): Initial creation.</item>
  <item>RFC-0076: Re-export onboarding input and phase contract validators.</item>
  <item>RFC-0532: Remove old command exports (brief.validate, onboarding.input.validate, onboarding.phase.validate, onboarding.scaffold, onboarding.checklist). Add onboarding.synthesize export.</item>
</CHANGE_SUMMARY>
*/

export { createOnboardingModule } from "./module.ts";
export {
  BriefFrontmatter,
  parseBriefFrontmatter,
  parseSystemFrontmatter,
  parseMarkdownAsYaml,
} from "./brief.ts";
export { runOnboardingSynthesize } from "./synthesize.ts";
export type { OnboardingSynthesizeManifest } from "./synthesize.ts";
export { runBiomeTokensDerive, deriveBiomeFields } from "./biome-derive.ts";
export { runConfigRegenerate } from "./config-regenerate.ts";
export { runConfigTemplateSync } from "./config-template-sync.ts";
export {
  readTemplate,
  readRuntimeTemplate,
  applyTokens,
  TEMPLATES_DIR,
  RUNTIME_TEMPLATES_DIR,
} from "./templates.ts";
export {
  AmendBrief,
  AmendSource,
  runAmendInputValidate,
  buildAmendInputManifest,
  readAmendInputManifest,
  readFlag,
} from "./amend.ts";
export type {
  AmendIntent,
  AmendInputManifest,
  AmendPhaseOutputHeader,
  AmendProvenanceChange,
  AmendProvenanceRecord,
} from "./amend.ts";
export { runAmendSystemMerge, applySitePlanDelta } from "./amend-system-merge.ts";
export { runAmendDeltaFiles, readBatchDelta } from "./amend-delta-files.ts";
export {
  runContentCoverageDelta,
  runAmendAtomsMerge,
  runAmendProvenanceAppend,
  runAmendProvenanceValidate,
} from "./amend-gates.ts";
export type { Brief } from "./brief.ts";
