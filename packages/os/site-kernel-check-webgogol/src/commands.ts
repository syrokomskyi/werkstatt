/*
<MODULE_CONTRACT>
<purpose>Re-export shim for check-webgogol command handlers. Split (RFC-0303 Phase 3) into a folder-of-files under commands/ by domain. Individual command handlers live in: commands/target.ts, commands/evidence.ts, commands/report.ts, commands/audience.ts, commands/deploy.ts, commands/services.ts, commands/services-check.ts, commands/hints.ts, commands/app.ts, commands/helpers.ts.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: split the flat 1113-line commands.ts into domain sub-modules under commands/; this file is now the re-export shim.</item>
</CHANGE_SUMMARY>
*/

export {
  runCheckTargetValidate,
  runCheckSafetyValidate,
  runCheckRunnerInfo,
} from "./commands/target.ts";

export {
  runCheckEvidenceCapture,
  runCheckEvidenceValidate,
  runCheckTechnicalValidate,
  runCheckLocalizationValidate,
  runCheckAccessibilityValidate,
  runCheckContentSurfaceValidate,
  runCheckDeterministicRun,
} from "./commands/evidence.ts";

export {
  runCheckReportGenerate,
  runCheckActionPackGenerate,
  runCheckCompare,
} from "./commands/report.ts";

export {
  runCheckAudienceProfileValidate,
  runCheckAudienceReviewRun,
  runCheckAudienceReviewValidate,
} from "./commands/audience.ts";

export {
  runCheckDeployAltRun,
  runCheckDeployMainGate,
  runCheckArtifactValidate,
  runCheckRun,
} from "./commands/deploy.ts";

export {
  runServicesWorkspaceValidate,
  runCheckWebgogolRunnerValidate,
} from "./commands/services.ts";

export { runServicesCheckRun } from "./commands/services-check.ts";

export { runWebgogolCheckHintsGenerate, runWebgogolCheckHintsValidate } from "./commands/hints.ts";

export { runCheckWebgogolAppValidate } from "./commands/app.ts";
