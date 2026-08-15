/*
<MODULE_CONTRACT>
<purpose>RFC-0866: Shared 13-phase deploy execution pipeline for dev/alt/main channels. Runs after authorizeAndDeploy() returns ok: true.</purpose>
<non-goals>
  <item>Does not perform authorization — that is the responsibility of deploy-helpers.ts.</item>
  <item>Does not define the DeploymentAdapter interface — that lives in adapter.ts.</item>
  <item>Does not register commands — that lives in leitstand.module.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
<item>RFC-0866: initial deploy-execution module with DeployExecutionContext, DeployExecutionResult, and executeDeployPhases().</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import type { DeploymentAdapter, PropagateInput, HealthInput } from "./adapter.ts";
import type {
  DeploymentStaticConfig,
  PurgeResult,
  HealthCheck,
} from "@warpgogol/werkstatt/schemas";
import type { Sha256Digest } from "../fingerprint/primitives.ts";
import type { FreshnessResult } from "./leitstand-commands.ts";
import type { AuthorizeOutcome } from "./deploy-helpers.ts";
import type { DeploymentEffectRecordV1 } from "../certification/deployment/authority.ts";

export interface DeployExecutionContext {
  systemId: string;
  releaseId: string | undefined;
  candidateId: string;
  artifactHash: Sha256Digest;
  authResult: AuthorizeOutcome;
  workspaceRoot: string;
  systemConfig: DeploymentStaticConfig;
  adapter: DeploymentAdapter;
  operationId: string;
  missionId?: string;
  commitSha?: string;
  gateDecisionPath: string;
}

export interface DeployExecutionResult {
  deploymentUrl: string;
  buildSkipped: boolean;
  buildIdentity: { releaseId: string; written: boolean; path: string };
  freshness: FreshnessResult;
  purgeResult?: PurgeResult;
  healthState: "healthy" | "unhealthy" | "unknown";
  healthChecks: HealthCheck[];
  effectRecord: DeploymentEffectRecordV1;
  bordbuchCommitted: boolean;
  systemStateUpdated: boolean;
  evidenceSynced: boolean;
  evidenceSyncError: string | null;
  failingPhase?: string;
}

export async function executeDeployPhases(
  _ctx: DeployExecutionContext,
  _channel: "dev" | "alt" | "main",
): Promise<DeployExecutionResult> {
  throw new Error("[executeDeployPhases] not yet implemented — RFC-0866 Step 3");
}
