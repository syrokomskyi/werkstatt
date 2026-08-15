/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/leitstand/index.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0358: initial leitstand module.</item>
  <item>RFC-0379: add --channel flag to all four commands; rollback requires --channel.</item>
  <item>RFC-0608: propagate always alt (removes --channel); add leitstand.promote for alt→main with build-identity verification; rollback transitions release state.</item>
  <item>RFC-0627: add leitstand.deploy for dev channel with Axiom gate; rollback auto-detects channel and auto-steps release state; status/health support dev channel.</item>
  <item>RFC-0628: replace leitstand.deploy with workpiece-based leitstand.dev-deploy; propagate gate checks published + commitSha + missionId; rollback auto-step removes dev-deployed.</item>
  <item>RFC-0751: add leitstand.service.deploy for shared Cloudflare Worker services.</item>
  <item>RFC-0806: replace leitstand.service.deploy with dev-deploy, promote, and rollback commands.</item>
  <item>RFC-0842: add leitstand.pipeline.check command for release pipeline state inspection.</item>
  <item>RFC-0866: add leitstand.certify command and shared deploy-execution pipeline.</item>
</CHANGE_SUMMARY>
*/

import {
  runLeitstandDevDeploy,
  runLeitstandPropagate,
  runLeitstandPromote,
  runLeitstandStatus,
  runLeitstandRollback,
  runLeitstandHealth,
} from "./leitstand-commands.ts";
import { runLeitstandServiceDevDeploy } from "./service-dev-deploy.ts";
import { runLeitstandServicePromote } from "./service-promote.ts";
import { runLeitstandServiceRollback } from "./service-rollback.ts";

export {
  runLeitstandDevDeploy,
  type DevDeployResult,
  runLeitstandPropagate,
  type LeitstandPropagateData,
  runLeitstandPromote,
  type LeitstandPromoteData,
  runLeitstandStatus,
  type LeitstandStatusData,
  runLeitstandRollback,
  type LeitstandRollbackData,
  runLeitstandHealth,
  type LeitstandHealthData,
  runLeitstandPipelineCheck,
  type PipelineCheckResult,
} from "./leitstand-commands.ts";
export { runLeitstandCertify, type CertifyInput, type CertifyResult } from "./certify.ts";
export {
  executeDeployPhases,
  type DeployExecutionContext,
  type DeployExecutionResult,
} from "./deploy-execution.ts";
export { runLeitstandServiceDevDeploy } from "./service-dev-deploy.ts";
export { runLeitstandServicePromote } from "./service-promote.ts";
export { runLeitstandServiceRollback } from "./service-rollback.ts";
export type {
  PreDeployGateResult,
  ServiceDevDeployData,
  ServicePromoteData,
  ServiceRollbackData,
} from "./service-deploy-helpers.ts";
export type {
  DeploymentAdapter,
  CommandRunner,
  PropagateInput,
  RollbackInput,
  HealthInput,
} from "./adapter.ts";

export { createLeitstandModule } from "./leitstand.module.ts";
