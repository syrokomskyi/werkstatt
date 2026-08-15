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
<item>RFC-0866: implement full 13-phase executeDeployPhases function with channel-specific behavior.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import type { DeploymentAdapter, PropagateInput, HealthInput } from "./adapter.ts";
import type {
  DeploymentStaticConfig,
  DeploymentChannel,
  PurgeResult,
  HealthCheck,
  PropagationResult,
} from "@warpgogol/werkstatt/schemas";
import type { Sha256Digest } from "../fingerprint/primitives.ts";
import {
  verifyFreshness,
  runMissionCheckWithResilience,
  type FreshnessResult,
} from "./leitstand-commands.ts";
import type { AuthorizeOutcome } from "./deploy-helpers.ts";
import type { DeploymentEffectRecordV1 } from "../certification/deployment/authority.ts";
import { buildEffectRecord, writeDeploymentEffectRecord } from "./deploy-helpers.ts";
import { appendAndCommitBordbuch } from "../bordbuch/bordbuch-commit-helper.ts";
import { writeSystemStateSmart, readSystemStateSmart } from "../sternsystem/registry-io.ts";
import { collectPurgeUrls, purgeCacheByUrls, skippedPurgeResult } from "./cache-purge.ts";
import { readBehaviorSnapshot, sourceDotenv, filterEnv } from "./adapters/index.ts";
import { fingerprintTree } from "@warpgogol/werkstatt/fingerprint/semantic";
import { atomicWriteFile } from "../werkstatt/atomic.ts";

const noopLogger = {
  info: (_m: string) => {},
  warn: (_m: string) => {},
  success: (_m: string) => {},
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HEALTH_CHECK_MAX_ATTEMPTS = 3;
const HEALTH_CHECK_BACKOFF_DELAYS_MS = [3_000, 6_000];

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
  secretsFilePath?: string;
  skipEvidenceSync?: boolean;
  forceBuild?: boolean;
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

function getChannelConfig(
  dep: DeploymentStaticConfig,
  channel: "dev" | "alt" | "main",
): DeploymentChannel {
  const channelConfig =
    channel === "dev" ? dep.channels.dev : channel === "alt" ? dep.channels.alt : dep.channels.main;
  if (!channelConfig) {
    throw new Error(`[executeDeployPhases] channel '${channel}' is not defined for system`);
  }
  return channelConfig;
}

function isDevWorkersUrl(url: string): boolean {
  return url.includes(".workers.dev");
}

async function runPurgeStep(
  workspaceRoot: string,
  releaseId: string,
  deploymentUrl: string,
  secretsFilePath: string | undefined,
): Promise<PurgeResult> {
  const secretsEnv = secretsFilePath ? await sourceDotenv(secretsFilePath) : {};
  const env = { ...filterEnv(process.env), ...secretsEnv };
  const zoneId = env["CLOUDFLARE_ZONE_ID"];
  const apiToken = env["CLOUDFLARE_API_TOKEN"];
  if (!zoneId) return skippedPurgeResult("CLOUDFLARE_ZONE_ID not set");
  if (!apiToken) return skippedPurgeResult("CLOUDFLARE_API_TOKEN not set");
  const snapshot = await readBehaviorSnapshot(workspaceRoot, releaseId);
  const routes = snapshot?.routes ?? [];
  const urls = collectPurgeUrls(deploymentUrl, routes);
  return purgeCacheByUrls(zoneId, apiToken, urls);
}

async function runHealthCheckWithRetry(
  adapter: DeploymentAdapter,
  systemId: string,
  deploymentUrl: string,
  channel: "dev" | "alt" | "main",
): Promise<{ state: "healthy" | "unhealthy" | "unknown"; checks: HealthCheck[] }> {
  for (let attempt = 1; attempt <= HEALTH_CHECK_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await sleep(HEALTH_CHECK_BACKOFF_DELAYS_MS[attempt - 2]);
    }
    try {
      const healthInput: HealthInput = {
        systemId,
        deploymentUrl,
        channel,
        releaseId: "",
        expectedBehaviorSnapshotHash: "",
        workspaceRoot: "",
      };
      const result = await adapter.health(healthInput);
      if (result.state === "healthy") {
        return { state: "healthy", checks: result.checks ?? [] };
      }
      if (attempt === HEALTH_CHECK_MAX_ATTEMPTS) {
        return { state: result.state ?? "unhealthy", checks: result.checks ?? [] };
      }
    } catch {
      if (attempt === HEALTH_CHECK_MAX_ATTEMPTS) {
        return { state: "unhealthy", checks: [] };
      }
    }
  }
  return { state: "unknown", checks: [] };
}

export async function executeDeployPhases(
  ctx: DeployExecutionContext,
  channel: "dev" | "alt" | "main",
): Promise<DeployExecutionResult> {
  const channelConfig = getChannelConfig(ctx.systemConfig, channel);
  const deploymentUrl = channelConfig.url ?? "";
  const now = new Date().toISOString();

  let buildSkipped = false;
  let buildIdentityPath = "";
  let localDistTreeHash = "";
  let purgeResult: PurgeResult | undefined;
  let freshness: FreshnessResult = {
    verified: false,
    cdnDistTreeHash: null,
    localDistTreeHash: "",
    attempts: 0,
  };
  let healthState: "healthy" | "unhealthy" | "unknown" = "unknown";
  let healthChecks: HealthCheck[] = [];
  let evidenceSynced = false;
  let evidenceSyncError: string | null = null;
  let bordbuchCommitted = false;
  let systemStateUpdated = false;
  let failingPhase: string | undefined;

  const gate =
    channel === "dev" ? "dev-deploy" : channel === "alt" ? "propagate-alt" : "promote-main";

  const effectRecord = buildEffectRecord(
    ctx.operationId,
    ctx.candidateId,
    gate,
    channel,
    ctx.artifactHash,
    ctx.authResult.ok ? ctx.authResult.outcome.decisionId : "",
    false,
    null,
    "deploying",
    now,
  );

  try {
    if (ctx.releaseId) {
      const releaseDir = path.join(ctx.workspaceRoot, "releases", ctx.releaseId);
      const distDir = path.join(releaseDir, "dist");
      if (!existsSync(distDir)) {
        try {
          execSync("pnpm build", {
            cwd: ctx.workspaceRoot,
            stdio: "pipe",
            timeout: 600000,
          });
        } catch (err) {
          failingPhase = "build";
          throw new Error(`Build failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        buildSkipped = true;
      }

      buildIdentityPath = path.join(distDir, ".well-known", "build-identity.json");
      try {
        const distTreeHashResult = await fingerprintTree(path.join(distDir, "client"), {
          mode: "stable",
        });
        localDistTreeHash = distTreeHashResult.value;
        const identity = {
          releaseId: ctx.releaseId,
          distTreeHash: localDistTreeHash,
          buildTimestamp: now,
        };
        await atomicWriteFile(buildIdentityPath, JSON.stringify(identity, null, 2));
      } catch {
        // Non-fatal — build-identity is best-effort
      }
    }

    const distPath = ctx.releaseId
      ? path.join(ctx.workspaceRoot, "releases", ctx.releaseId, "dist")
      : "";
    const propagateInput: PropagateInput = {
      systemId: ctx.systemId,
      releaseId: ctx.releaseId ?? "",
      url: deploymentUrl,
      channel,
      distPath,
      workerName: channelConfig.workerName,
      secretsFilePath: ctx.secretsFilePath,
      expectedBehaviorSnapshotHash: "",
    };
    let propagateResult: PropagationResult;
    try {
      propagateResult = await ctx.adapter.propagate(propagateInput);
    } catch (err) {
      failingPhase = "wrangler-deploy";
      throw new Error(
        `Wrangler deploy failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const actualDeploymentUrl = propagateResult.deploymentUrl || deploymentUrl;

    if (channel !== "dev" || !isDevWorkersUrl(actualDeploymentUrl)) {
      try {
        purgeResult = await runPurgeStep(
          ctx.workspaceRoot,
          ctx.releaseId ?? "",
          actualDeploymentUrl,
          ctx.secretsFilePath,
        );
        if (channel !== "dev" && !purgeResult.success) {
          failingPhase = "cache-purge";
          throw new Error(`CDN cache purge failed: ${purgeResult.error ?? "unknown"}`);
        }
      } catch (err) {
        if (channel !== "dev") throw err;
        // Dev channel: purge failure is non-fatal
      }
    }

    if (channel !== "dev" || !isDevWorkersUrl(actualDeploymentUrl)) {
      if (localDistTreeHash) {
        freshness = await verifyFreshness(actualDeploymentUrl, localDistTreeHash, noopLogger);
        if (!freshness.verified) {
          failingPhase = "freshness";
          throw new Error(`Freshness verification failed: ${freshness.error ?? "unknown"}`);
        }
      }
    }

    const healthResult = await runHealthCheckWithRetry(
      ctx.adapter,
      ctx.systemId,
      actualDeploymentUrl,
      channel,
    );
    healthState = healthResult.state;
    healthChecks = healthResult.checks;
    if (healthState === "unhealthy") {
      failingPhase = "health-check";
      throw new Error("Health check failed — deployment is unhealthy");
    }

    if (channel === "dev" && ctx.missionId && ctx.commitSha) {
      try {
        const missionResult = await runMissionCheckWithResilience(
          ctx.workspaceRoot,
          ctx.missionId,
          actualDeploymentUrl,
          ctx.commitSha,
          noopLogger,
        );
        if (missionResult.exitCode === 1) {
          failingPhase = "mission-check";
          throw new Error("mission.check failed with content violations (exit 1)");
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("mission.check")) {
          throw err;
        }
        // Infrastructure error — non-fatal for pipeline, logged
      }
    }

    if (channel === "alt" && ctx.missionId && ctx.commitSha) {
      try {
        const evidenceDir = path.join(
          ctx.workspaceRoot,
          "missions",
          ctx.missionId,
          "workpiece",
          "evidence",
        );
        const metadataPath = path.join(evidenceDir, "evidence-metadata.json");
        const studyRunPath = path.join(evidenceDir, "study-run.json");
        if (existsSync(metadataPath) && existsSync(studyRunPath)) {
          const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
          const studyRun = JSON.parse(await fs.readFile(studyRunPath, "utf8"));
          if (metadata.commitSha !== ctx.commitSha || studyRun.missionId !== ctx.missionId) {
            failingPhase = "axiom-evidence-gate";
            throw new Error(
              `Axiom evidence gate: commitSha or missionId mismatch (expected sha=${ctx.commitSha}, mission=${ctx.missionId})`,
            );
          }
        }
      } catch (err) {
        if (failingPhase === "axiom-evidence-gate") throw err;
        // Non-fatal — evidence files may not exist
      }
    }

    if (channel === "main") {
      // Main verification is handled by the caller via authorizeMainPromotion
      // This phase is a no-op in the shared pipeline — the verification
      // happens before executeDeployPhases is called.
    }

    if (!ctx.skipEvidenceSync) {
      try {
        const { executeKernelCommand } = await import("@warpgogol/werkstatt/kernel");
        await executeKernelCommand({
          workspaceRoot: ctx.workspaceRoot,
          commandName: "evidence.sync",
          argv: [`--site=${ctx.systemId}`],
        });
        evidenceSynced = true;
      } catch (err) {
        evidenceSyncError = err instanceof Error ? err.message : String(err);
      }
    }

    try {
      await appendAndCommitBordbuch(
        ctx.workspaceRoot,
        ctx.systemId,
        "deployment",
        `${gate} deployed to ${channel}`,
        "leitstand",
      );
      bordbuchCommitted = true;
    } catch {
      // Non-fatal
    }

    try {
      const state = await readSystemStateSmart(ctx.workspaceRoot, ctx.systemId);
      if (state) {
        const channelKey = channel as "dev" | "alt" | "main";
        if (!state.lastPropagated) state.lastPropagated = {} as never;
        (state.lastPropagated as Record<string, unknown>)[channelKey] = {
          releaseId: ctx.releaseId ?? "",
          at: now,
          url: actualDeploymentUrl,
          state: "deployed",
        };
        await writeSystemStateSmart(ctx.workspaceRoot, ctx.systemId, state);
        systemStateUpdated = true;
      }
    } catch {
      // Non-fatal
    }

    const finalEffectRecord = buildEffectRecord(
      ctx.operationId,
      ctx.candidateId,
      gate,
      channel,
      ctx.artifactHash,
      ctx.authResult.ok ? ctx.authResult.outcome.decisionId : "",
      false,
      null,
      "deployed",
      now,
    );
    await writeDeploymentEffectRecord(ctx.workspaceRoot, ctx.systemId, finalEffectRecord);

    return {
      deploymentUrl: actualDeploymentUrl,
      buildSkipped,
      buildIdentity: {
        releaseId: ctx.releaseId ?? "",
        written: existsSync(buildIdentityPath),
        path: buildIdentityPath,
      },
      freshness,
      purgeResult,
      healthState,
      healthChecks,
      effectRecord: finalEffectRecord,
      bordbuchCommitted,
      systemStateUpdated,
      evidenceSynced,
      evidenceSyncError,
    };
  } catch {
    const failedEffectRecord = buildEffectRecord(
      ctx.operationId,
      ctx.candidateId,
      gate,
      channel,
      ctx.artifactHash,
      ctx.authResult.ok ? ctx.authResult.outcome.decisionId : "",
      false,
      null,
      "failed",
      now,
    );
    await writeDeploymentEffectRecord(ctx.workspaceRoot, ctx.systemId, failedEffectRecord);

    return {
      deploymentUrl,
      buildSkipped,
      buildIdentity: {
        releaseId: ctx.releaseId ?? "",
        written: existsSync(buildIdentityPath),
        path: buildIdentityPath,
      },
      freshness,
      purgeResult,
      healthState,
      healthChecks,
      effectRecord: failedEffectRecord,
      bordbuchCommitted,
      systemStateUpdated,
      evidenceSynced,
      evidenceSyncError,
      failingPhase: failingPhase ?? "unknown",
    };
  }
}
