/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0358: initial leitstand command handlers.</item>
  <item>RFC-0379: channel model — alt/main channels, preflight, resolveAdapter throws for unimplemented, per-channel lastPropagated with operational state, --channel flag on all commands.</item>
  <item>RFC-0379 post-review: complete preflight (artifact hash, wrangler availability, dist size limit); add artifact-store rehydration for propagate and rollback.</item>
  <item>RFC-0587: adapter-declared size limits via getLimits() passed through runPreflight to checkDistSize; remove hardcoded limit constants.</item>
  <item>RFC-0608: leitstand.propagate always deploys to alt (removes --channel); adds leitstand.promote for alt→main with build-identity verification; rollback transitions release state.</item>
  <item>RFC-0624: add post-deploy CDN cache purge step to propagate, promote, and rollback; record purgeResult in lastPropagated; display in status.</item>
  <item>RFC-0627: add dev channel, leitstand.deploy command, Axiom evidence gate in propagate, auto-step rollback.</item>
  <item>RFC-0628: replace leitstand.deploy with workpiece-based leitstand.dev-deploy; remove dev-deployed state; propagate gate checks published + commitSha + missionId + errors===0; rollback auto-step removes dev-deployed.</item>
  <item>RFC-0629: propagate gate reads evidence-metadata.json + study-run.json (native Axiom format); dev-deploy passes --commit-sha to mission.check (no evidence post-processing); JSON.parse wrapped with error handling.</item>
  <item>RFC-0634: dev-deploy writes preliminary + final build-identity.json (preliminary in public/.well-known/ before build, final in dist/client/.well-known/ after hash computation with dist cleanup); propagate verifies dev build-identity before deploying to alt; release.prepare uses workpiece HEAD for commitSha.</item>
  <item>RFC-0649: dev-deploy treats CDN purge as fatal for cloudflare-workers adapter (checks purgeResult.success); adds verifyFreshness function that fetches build-identity.json from CDN URL and compares distTreeHash; skips purge + freshness check for null adapter; freshness mismatch stops pipeline before Axiom gate.</item>
  <item>RFC-0653: dev-deploy implements build-skip cache — skips pnpm build when commitSha + platformVersion + platformSemanticHash match .dev-deploy-build-cache.json and dist/ exists. --force-build bypasses the cache. buildSkipped field added to DevDeployResult.</item>
  <item>RFC-0652: best-effort evidence.sync after axiom.report; --skip-evidence-sync flag; evidenceSynced/evidenceSyncError in output.</item>
  <item>RFC-0656: switch distTreeHash from mode: "byte" to mode: "stable" for deterministic hashing of non-deterministic build artifacts.</item>
  <item>RFC-0657: replace single-fetch verifyFreshness with retry loop (5 attempts, exponential backoff 3s/6s/12s/24s); remove fixed 6s sleep after purge; add attempts field to FreshnessResult.</item>
  <item>RFC-0665: add methodologies.validate pre-flight to dev-deploy; fail fast on invalid methodologies config before build+deploy cycle.</item>
  <item>RFC-0668: wrap mission.check call with 15-min per-attempt timeout (MISSION_CHECK_TIMEOUT_MS) and one-time retry on infrastructure errors (exit 2 or any non-0/non-1); pass --max-duration to mission.check; worst-case total 30 min with retry.</item>
  <item>Add --no-report flag (default true) to runMissionCheckWithResilience to suppress report.html generation in mission.check; axiom.report is auto-invoked separately in leitstand.dev-deploy, preventing double-write.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type {
  PropagationResult,
  HealthCheck,
  DeploymentConfig,
  DeploymentChannel,
  LastPropagatedChannel,
  PurgeResult,
} from "@warpgogol/ontology/operations";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import { readRegistry, writeRegistry, findEntry } from "../sternsystem/registry-io.ts";
import { appendBordbuchEntry } from "../bordbuch/bordbuch-io.ts";
import { readReleaseManifest, writeReleaseYaml } from "../release/release-commands.ts";
import { buildIdentitySchema } from "@warpgogol/ontology/operations";
import type {
  DeploymentAdapter,
  DeploymentLimits,
  PropagateInput,
  RollbackInput,
  HealthInput,
} from "./adapter.ts";
import {
  createCloudflareWorkersAdapter,
  readBehaviorSnapshot,
  sourceDotenv,
  filterEnv,
} from "./adapters/index.ts";
import {
  collectPurgeUrls,
  purgeCacheByUrls,
  skippedPurgeResult,
  BUILD_IDENTITY_PATH,
} from "./cache-purge.ts";
import { artifactStorePreflight, artifactStoreRehydrate } from "../artifact-store/index.ts";
import { execSync } from "node:child_process";
import { fingerprintTree } from "@warpgogol/fingerprint/semantic";
import { isBlockingFinding } from "@syrokomskyi/axiom-factory-app/run/report";
import type { Finding } from "@syrokomskyi/axiom-study";
import { atomicWriteFile } from "../werkstatt/atomic.ts";
import { computeBuildInputHash } from "../build-pipeline-helpers.ts";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

type Channel = "dev" | "alt" | "main";

function parseChannel(value: string | undefined, defaultValue: Channel): Channel {
  if (value === "dev" || value === "alt" || value === "main") return value;
  return defaultValue;
}

// Null adapter for test fixtures and adapter: "null" registry entries
const nullAdapter: DeploymentAdapter = {
  name: "null",
  async propagate(input: PropagateInput): Promise<PropagationResult> {
    const now = new Date().toISOString();
    return {
      systemId: input.systemId,
      releaseId: input.releaseId,
      state: "succeeded",
      deploymentUrl: input.url,
      startedAt: now,
      completedAt: now,
      healthChecks: [],
    };
  },
  async rollback(input: RollbackInput): Promise<PropagationResult> {
    const now = new Date().toISOString();
    return {
      systemId: input.systemId,
      releaseId: input.toReleaseId,
      state: "succeeded",
      deploymentUrl: input.url,
      startedAt: now,
      completedAt: now,
      healthChecks: [],
    };
  },
  async health(_input: HealthInput) {
    return { state: "unknown" as const, checks: [] };
  },
  getLimits() {
    return { maxTotalSize: Infinity, maxFileSize: Infinity };
  },
};

function resolveAdapter(name: string | undefined): DeploymentAdapter {
  if (!name || name === "null") return nullAdapter;
  if (name === "cloudflare-workers") return createCloudflareWorkersAdapter();
  throw new Error(`[leitstand] adapter-not-implemented: '${name}' has no concrete implementation`);
}

function getChannelConfig(dep: DeploymentConfig, channel: Channel): DeploymentChannel {
  const channelConfig =
    channel === "dev" ? dep.channels.dev : channel === "alt" ? dep.channels.alt : dep.channels.main;
  if (!channelConfig) {
    throw new Error(`[leitstand] channel '${channel}' is not defined for system`);
  }
  return channelConfig;
}

function resolveConventionSecretsPath(
  basePath: string,
  channel: "dev" | "alt" | "main",
): string | undefined {
  const envFile = channel === "main" ? ".env.main" : ".env.alt";
  const filePath = path.join(basePath, envFile);
  return existsSync(filePath) ? filePath : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// RFC-0668: Timeout and retry resilience for mission.check in leitstand.dev-deploy.
const MISSION_CHECK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes, per-attempt
const MISSION_CHECK_MAX_RETRIES = 1;

class MissionCheckTimeoutError extends Error {
  constructor(ms: number) {
    super(`mission.check timed out after ${ms}ms`);
    this.name = "MissionCheckTimeoutError";
  }
}

async function withMissionCheckTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new MissionCheckTimeoutError(ms)), ms),
    ),
  ]);
}

// RFC-0668: Wrap mission.check with per-attempt timeout and one-time retry on
// infrastructure errors (exit code 2 or any non-0/non-1). Content violations
// (exit 1) are not retried — they indicate real site issues.
export async function runMissionCheckWithResilience(
  workspaceRoot: string,
  missionId: string,
  channelUrl: string,
  commitSha: string,
  logger: { info: (m: string) => void; warn: (m: string) => void },
  noReport = true,
): Promise<{ exitCode: number; data?: Record<string, unknown> }> {
  const { executeKernelCommand } = await import("@warpgogol/site-kernel");

  for (let attempt = 0; attempt <= MISSION_CHECK_MAX_RETRIES; attempt++) {
    try {
      const result = (await withMissionCheckTimeout(
        executeKernelCommand({
          workspaceRoot,
          commandName: "mission.check",
          argv: [
            `--mission=${missionId}`,
            "--external-preview",
            `--base-url=${channelUrl}`,
            `--commit-sha=${commitSha}`,
            `--max-duration=${MISSION_CHECK_TIMEOUT_MS}`,
            ...(noReport ? ["--no-report"] : []),
          ],
        }),
        MISSION_CHECK_TIMEOUT_MS,
      )) as { exitCode?: number; data?: Record<string, unknown> };

      const exitCode = result.exitCode ?? 0;

      // Exit 0 = pass, exit 1 = content violations — return to caller, no retry
      if (exitCode === 0 || exitCode === 1) {
        return { exitCode, data: result.data };
      }

      // Exit 2 = infrastructure error, 3+ = unexpected, 137 = signal kill — retry once
      if (attempt < MISSION_CHECK_MAX_RETRIES) {
        logger.info(
          `[leitstand.dev-deploy] mission.check infrastructure error (exit ${exitCode}, attempt ${attempt + 1}/${MISSION_CHECK_MAX_RETRIES + 1}), retrying...`,
        );
        continue;
      }

      // Retry exhausted
      return { exitCode, data: result.data };
    } catch (err) {
      if (err instanceof MissionCheckTimeoutError) {
        // Timeout is not retryable — a hung process indicates a deeper issue
        throw err;
      }
      // Unexpected throw from executeKernelCommand — treat as infrastructure error, retry once
      if (attempt < MISSION_CHECK_MAX_RETRIES) {
        logger.info(
          `[leitstand.dev-deploy] mission.check threw (attempt ${attempt + 1}/${MISSION_CHECK_MAX_RETRIES + 1}), retrying...`,
        );
        continue;
      }
      throw err;
    }
  }

  throw new Error("mission.check failed after retry");
}

// RFC-0649 / RFC-0657: Result of CDN freshness verification.
export interface FreshnessResult {
  verified: boolean;
  cdnDistTreeHash: string | null;
  localDistTreeHash: string;
  attempts: number;
  error?: string;
}

// RFC-0657: Retry constants for verifyFreshness (hardcoded — no caller customization needed).
const FRESHNESS_MAX_ATTEMPTS = 5;
const FRESHNESS_BACKOFF_DELAYS_MS = [3_000, 6_000, 12_000, 24_000];

// RFC-0649 / RFC-0657: Verify CDN freshness by fetching build-identity.json from the CDN URL
// and comparing distTreeHash against the local build-identity. Retries up to 5 times with
// exponential backoff (3s, 6s, 12s, 24s). First attempt is immediate; subsequent attempts
// are separated by the backoff delays.
async function verifyFreshness(
  deploymentUrl: string,
  localDistTreeHash: string,
  logger: { info: (m: string) => void },
): Promise<FreshnessResult> {
  const base = deploymentUrl.replace(/\/$/, "");
  const url = `${base}${BUILD_IDENTITY_PATH}`;
  let lastCdnDistTreeHash: string | null = null;
  let lastError = "";

  for (let attempt = 1; attempt <= FRESHNESS_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const delayMs = FRESHNESS_BACKOFF_DELAYS_MS[attempt - 2];
      logger.info(
        `[leitstand.dev-deploy] freshness retry ${attempt}/${FRESHNESS_MAX_ATTEMPTS} after ${delayMs / 1000}s...`,
      );
      await sleep(delayMs);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastCdnDistTreeHash = null;
        lastError = `CDN freshness fetch returned HTTP ${response.status} for ${url}`;
        continue;
      }
      const cdnBuildIdentity = (await response.json()) as { distTreeHash?: string };
      const cdnDistTreeHash = cdnBuildIdentity.distTreeHash ?? null;
      lastCdnDistTreeHash = cdnDistTreeHash;
      if (cdnDistTreeHash !== localDistTreeHash) {
        lastError = `CDN serving stale content: distTreeHash mismatch (cdn: ${cdnDistTreeHash}, local: ${localDistTreeHash})`;
        continue;
      }
      return {
        verified: true,
        cdnDistTreeHash,
        localDistTreeHash,
        attempts: attempt,
      };
    } catch (err) {
      lastCdnDistTreeHash = null;
      lastError = `CDN freshness fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return {
    verified: false,
    cdnDistTreeHash: lastCdnDistTreeHash,
    localDistTreeHash,
    attempts: FRESHNESS_MAX_ATTEMPTS,
    error: lastError,
  };
}

// RFC-0624: Post-deploy CDN cache purge step. Non-blocking on failure.
async function runPurgeStep(
  workspaceRoot: string,
  releaseId: string,
  deploymentUrl: string,
  secretsFilePath: string | undefined,
  logger: { info: (m: string) => void; success: (m: string) => void; warn: (m: string) => void },
): Promise<PurgeResult> {
  const secretsEnv = secretsFilePath ? await sourceDotenv(secretsFilePath) : {};
  const env = { ...filterEnv(process.env), ...secretsEnv };

  const zoneId = env["CLOUDFLARE_ZONE_ID"];
  const apiToken = env["CLOUDFLARE_API_TOKEN"];

  if (!zoneId) {
    logger.warn("[leitstand] CLOUDFLARE_ZONE_ID not set — skipping CDN cache purge");
    return skippedPurgeResult("CLOUDFLARE_ZONE_ID not set");
  }
  if (!apiToken) {
    logger.warn("[leitstand] CLOUDFLARE_API_TOKEN not set — skipping CDN cache purge");
    return skippedPurgeResult("CLOUDFLARE_API_TOKEN not set");
  }

  const snapshot = await readBehaviorSnapshot(workspaceRoot, releaseId);
  const routes = snapshot?.routes ?? [];
  const urls = collectPurgeUrls(deploymentUrl, routes);

  logger.info(`[leitstand] Purging CDN cache for ${urls.length} URLs...`);

  const result = await purgeCacheByUrls(zoneId, apiToken, urls);
  if (result.success) {
    logger.success(`[leitstand] CDN cache purged (${result.purgedUrls} URLs)`);
  } else {
    logger.warn(`[leitstand] CDN cache purge failed: ${result.error}`);
  }
  return result;
}

interface PreflightCheck {
  name: string;
  passed: boolean;
  detail: string;
}

async function runPreflight(
  workspaceRoot: string,
  releaseId: string,
  dep: DeploymentConfig,
  channel: Channel,
  channelConfig: DeploymentChannel,
  adapter: DeploymentAdapter,
  missionId?: string,
  basePath?: string,
): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];

  // 1. Release state is published (already verified by caller, but record it)
  const manifestPath = path.join(workspaceRoot, "releases", releaseId, "release.yaml");
  checks.push({
    name: "release-published",
    passed: existsSync(manifestPath),
    detail: existsSync(manifestPath) ? "Release manifest found" : "Release manifest missing",
  });

  // 2. Channel exists in deployment.channels
  checks.push({
    name: "channel-present",
    passed: !!channelConfig,
    detail: channelConfig ? `Channel '${channel}' configured` : `Channel '${channel}' not defined`,
  });

  // 3. Convention env file existence (RFC-0666)
  const envFile = channel === "main" ? ".env.main" : ".env.alt";
  const envPath = basePath ? path.join(basePath, envFile) : "";
  checks.push({
    name: "convention-env-exists",
    passed: true, // info-level — always passed
    detail:
      basePath && existsSync(envPath)
        ? `${envFile} found at ${envPath}`
        : `${envFile} not found — using process.env fallback`,
  });

  // 4. Dist directory exists and artifact hash verifies
  const distPath = path.join(workspaceRoot, "releases", releaseId, "dist");
  const artifactResult = await artifactStorePreflight(workspaceRoot, releaseId, distPath);
  checks.push({
    name: "artifact-hash",
    passed: artifactResult.manifestFound && (artifactResult.hashVerified || !existsSync(distPath)),
    detail: !artifactResult.manifestFound
      ? "Artifact manifest not found in store"
      : !existsSync(distPath)
        ? "Dist missing locally (will rehydrate from store)"
        : artifactResult.hashVerified
          ? "Dist tree hash matches artifact manifest"
          : "Dist tree hash mismatch — will rehydrate from store",
  });

  // 5. Wrangler binary resolves
  let wranglerBinPath: string | undefined;
  if (missionId) {
    const workpieceBin = path.join(
      workspaceRoot,
      "missions",
      missionId,
      "workpiece",
      "node_modules",
      ".bin",
    );
    if (existsSync(workpieceBin)) {
      wranglerBinPath = workpieceBin;
    }
  }
  const wranglerCheck = await checkWranglerAvailable(workspaceRoot, wranglerBinPath);
  checks.push({
    name: "wrangler-available",
    passed: wranglerCheck.available,
    detail: wranglerCheck.detail,
  });

  // 6. Dist size within adapter-declared limits
  if (existsSync(distPath)) {
    const sizeCheck = await checkDistSize(distPath, adapter.getLimits());
    checks.push({
      name: "dist-size-limit",
      passed: sizeCheck.withinLimit,
      detail: sizeCheck.detail,
    });
  }

  return checks;
}

async function checkWranglerAvailable(
  workspaceRoot: string,
  nodeModulesBinPath?: string,
): Promise<{ available: boolean; detail: string }> {
  try {
    const { execFile } = await import("node:child_process");
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (nodeModulesBinPath) {
      env.PATH = `${nodeModulesBinPath}:${process.env.PATH ?? ""}`;
    }
    const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>(
      (resolve) => {
        execFile(
          "npx",
          ["--yes", "wrangler", "--version"],
          { cwd: workspaceRoot, env },
          (err, stdout, stderr) => {
            resolve({
              exitCode: err ? 1 : 0,
              stdout: stdout ?? "",
              stderr: stderr ?? "",
            });
          },
        );
      },
    );
    if (result.exitCode === 0) {
      return { available: true, detail: `wrangler resolved: ${result.stdout.trim()}` };
    }
    return {
      available: false,
      detail: `wrangler --version exited non-zero: ${result.stderr.trim().slice(0, 100)}`,
    };
  } catch {
    return { available: false, detail: "wrangler binary not found" };
  }
}

async function checkDistSize(
  distPath: string,
  limits: DeploymentLimits,
): Promise<{ withinLimit: boolean; detail: string }> {
  let totalSize = 0;
  let largestFile = 0;
  let largestFilePath = "";
  const { collectFiles } = await import("@warpgogol/share/fs");
  for (const file of await collectFiles(distPath)) {
    const stat = await fs.stat(file);
    totalSize += stat.size;
    if (stat.size > largestFile) {
      largestFile = stat.size;
      largestFilePath = file;
    }
  }
  const sizeWithinLimit = totalSize <= limits.maxTotalSize;
  const perFileWithinLimit = largestFile <= limits.maxFileSize;
  const withinLimit = sizeWithinLimit && perFileWithinLimit;
  const totalLimitMiB = limits.maxTotalSize / 1024 / 1024;
  const fileLimitMiB = limits.maxFileSize / 1024 / 1024;
  return {
    withinLimit,
    detail: withinLimit
      ? `Dist size ${(totalSize / 1024 / 1024).toFixed(2)} MiB within ${totalLimitMiB.toFixed(0)} MiB total limit`
      : !sizeWithinLimit
        ? `Dist size ${(totalSize / 1024 / 1024).toFixed(2)} MiB exceeds ${totalLimitMiB.toFixed(0)} MiB total limit`
        : `Largest file ${largestFilePath} (${(largestFile / 1024 / 1024).toFixed(2)} MiB) exceeds ${fileLimitMiB.toFixed(0)} MiB per-file limit`,
  };
}

function buildLastPropagatedEntry(
  releaseId: string,
  state: LastPropagatedChannel["state"],
  healthy: boolean,
  operationId: string,
  purgeResult?: PurgeResult,
): LastPropagatedChannel {
  return {
    releaseId,
    at: new Date().toISOString(),
    healthy,
    state,
    operationId,
    leaseExpiresAt: null,
    purgeResult,
  };
}

// §5.0: leitstand.dev-deploy (RFC-0628: workpiece-based dev deploy with Axiom verification gate)
export interface DevDeployResult {
  command: "leitstand.dev-deploy";
  systemId: string;
  missionId: string;
  commitSha: string;
  buildState: "succeeded" | "failed";
  buildSkipped: boolean;
  deployState: "succeeded" | "failed" | "failed-stale" | "in-progress";
  deploymentUrl: string;
  buildIdentity: {
    releaseId: string;
    written: boolean;
    path: string;
  };
  axiom: {
    status: "pass" | "fail" | "not-run";
    errors: number;
    warnings: number;
    exitCode: number;
    freshness: FreshnessResult;
  };
  evidenceSynced: boolean;
  evidenceSyncError: string | null;
}

export async function runLeitstandDevDeploy(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<DevDeployResult>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system");
  if (!systemId) throw new Error("[leitstand.dev-deploy] --system is required");
  const skipEvidenceSync =
    input.flags["skip-evidence-sync"] === true || input.flags["skip-evidence-sync"] === "true";
  const forceBuild = input.flags["force-build"] === true || input.flags["force-build"] === "true";

  const channel: Channel = "dev";

  // Read registry to resolve currentMission and dev channel config
  const registry = await readRegistry(workspaceRoot);
  const entry = findEntry(registry, systemId);
  if (!entry) {
    throw new Error(`[leitstand.dev-deploy] system '${systemId}' not found in registry`);
  }

  const missionId = entry.currentMission as string | undefined;
  if (!missionId) {
    throw new Error(`[leitstand.dev-deploy] system '${systemId}' has no active mission`);
  }

  const workpiecePath = path.join(workspaceRoot, "missions", missionId, "workpiece");
  if (!existsSync(workpiecePath)) {
    throw new Error(`[leitstand.dev-deploy] workpiece not found at '${workpiecePath}'`);
  }

  const dep = entry.deployment as DeploymentConfig;
  if (!dep) {
    throw new Error(`[leitstand.dev-deploy] system '${systemId}' has no deployment config`);
  }

  const channelConfig = getChannelConfig(dep, channel);
  const adapter = resolveAdapter(dep.adapter);
  const secretsFilePath = resolveConventionSecretsPath(workpiecePath, channel);

  // RFC-0665: Pre-flight — validate methodologies config before building, so
  // invalid configs fail fast instead of after a long build+deploy cycle.
  try {
    const { executeKernelCommand: executeValidate } = await import("@warpgogol/site-kernel");
    const validateResult = (await executeValidate({
      workspaceRoot,
      commandName: "methodologies.validate",
      argv: [],
      siteName: undefined,
      siteExplicit: false,
      allSites: false,
      dryRun: false,
      force: false,
      outputFormat: "json",
    })) as { ok?: boolean; exitCode?: number; summary?: string };
    if (!validateResult.ok || validateResult.exitCode !== 0) {
      return {
        data: {
          command: "leitstand.dev-deploy",
          systemId,
          missionId,
          commitSha: "",
          buildState: "failed",
          buildSkipped: false,
          deployState: "failed",
          deploymentUrl: channelConfig.url,
          buildIdentity: { releaseId: `workpiece-${missionId}`, written: false, path: "" },
          axiom: {
            status: "not-run",
            errors: 0,
            warnings: 0,
            exitCode: 0,
            freshness: {
              verified: false,
              cdnDistTreeHash: null,
              localDistTreeHash: "",
              attempts: 0,
              error: "methodologies.validate failed",
            },
          },
          evidenceSynced: false,
          evidenceSyncError: null,
        },
        exitCode: 1,
        summary: `[leitstand.dev-deploy] ${systemId}: methodologies.validate failed — ${validateResult.summary ?? "config invalid"}`,
      };
    }
  } catch (err) {
    // methodologies.validate not registered or not available — non-fatal, continue
    logger.warn(
      `[leitstand.dev-deploy] methodologies.validate pre-flight skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // RFC-0634: Capture workpiece HEAD sha before build (needed for preliminary build-identity)
  let commitSha = "";
  try {
    commitSha = execSync("git rev-parse HEAD", {
      cwd: workpiecePath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch {
    logger.warn("[leitstand.dev-deploy] could not read workpiece HEAD sha");
  }

  // RFC-0634: Compute platform info for build-identity
  const { workpieceTreeHash, platformVersion, platformSemanticHash } = await computeBuildInputHash(
    workspaceRoot,
    workpiecePath,
  );

  // RFC-0653: Build-skip cache — skip pnpm build when cache key matches and dist/ exists
  const buildCachePath = path.join(
    workspaceRoot,
    "missions",
    missionId,
    ".dev-deploy-build-cache.json",
  );
  let buildSkipped = false;
  if (!forceBuild && existsSync(buildCachePath)) {
    try {
      const cacheRaw = await fs.readFile(buildCachePath, "utf-8");
      const cache = JSON.parse(cacheRaw) as {
        commitSha: string;
        platformVersion: string;
        platformSemanticHash: string;
      };
      const distPath = path.join(workpiecePath, "dist");
      if (
        cache.commitSha === commitSha &&
        cache.platformVersion === platformVersion &&
        cache.platformSemanticHash === platformSemanticHash &&
        existsSync(distPath)
      ) {
        buildSkipped = true;
        logger.info(
          `[leitstand.dev-deploy] build skipped (cache hit: commitSha=${commitSha.slice(0, 8)}, platform=${platformVersion})`,
        );
      }
    } catch (err) {
      logger.warn(
        `[leitstand.dev-deploy] build cache read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // RFC-0634: Write preliminary build-identity.json to workpiece/public/.well-known/ before build
  // RFC-0653: Skip preliminary write when build is skipped (dist/ already has final build-identity)
  const publicWellKnownDir = path.join(workpiecePath, "public", ".well-known");
  if (!buildSkipped) {
    await fs.mkdir(publicWellKnownDir, { recursive: true });
    const preliminaryBuildIdentity = {
      releaseId: `workpiece-${missionId}`,
      systemId,
      missionId,
      semver: "0.0.0-workpiece",
      distTreeHash: "",
      behaviorSnapshotHash: "",
      siteContentHash: workpieceTreeHash,
      platformVersion,
      platformSemanticHash,
      commitSha,
      buildTimestamp: new Date().toISOString(),
      targetPlatform: "cloudflare-workers",
    };
    await atomicWriteFile(
      path.join(publicWellKnownDir, "build-identity.json"),
      JSON.stringify(preliminaryBuildIdentity, null, 2) + "\n",
    );
    logger.info(
      `[leitstand.dev-deploy] wrote preliminary build-identity.json to public/.well-known/`,
    );
  }

  // Step 1: Build workpiece (RFC-0653: skip when cache hit)
  const t0 = Date.now();
  let buildState: "succeeded" | "failed" = "succeeded";
  if (buildSkipped) {
    logger.info(`[leitstand.dev-deploy] using cached dist/ (build skipped)`);
  } else {
    logger.info(`[leitstand.dev-deploy] building workpiece at ${workpiecePath}...`);
    try {
      execSync("pnpm build", { cwd: workpiecePath, stdio: "inherit", timeout: 600_000 });
      logger.info(
        `[leitstand.dev-deploy] build completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      // RFC-0653: Write build-skip cache after successful build
      const buildCache = {
        commitSha,
        platformVersion,
        platformSemanticHash,
        writtenAt: new Date().toISOString(),
      };
      await fs.writeFile(buildCachePath, JSON.stringify(buildCache, null, 2) + "\n");
    } catch (err) {
      buildState = "failed";
      logger.warn(
        `[leitstand.dev-deploy] build failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // RFC-0634: Clean up preliminary build-identity on build failure
      await fs.rm(path.join(publicWellKnownDir, "build-identity.json"), { force: true });
      return {
        data: {
          command: "leitstand.dev-deploy",
          systemId,
          missionId,
          commitSha: "",
          buildState: "failed",
          buildSkipped: false,
          deployState: "failed",
          deploymentUrl: channelConfig.url,
          buildIdentity: { releaseId: `workpiece-${missionId}`, written: false, path: "" },
          axiom: {
            status: "not-run",
            errors: 0,
            warnings: 0,
            exitCode: 0,
            freshness: {
              verified: false,
              cdnDistTreeHash: null,
              localDistTreeHash: "",
              attempts: 0,
              error: "build failed",
            },
          },
          evidenceSynced: false,
          evidenceSyncError: null,
        },
        exitCode: 1,
        summary: `[leitstand.dev-deploy] ${systemId}: build failed — no dist/ directory`,
      };
    }
  }

  const distPath = path.join(workpiecePath, "dist");
  if (!existsSync(distPath)) {
    // RFC-0634: Clean up preliminary build-identity
    await fs.rm(path.join(publicWellKnownDir, "build-identity.json"), { force: true });
    return {
      data: {
        command: "leitstand.dev-deploy",
        systemId,
        missionId,
        commitSha: "",
        buildState: "failed",
        buildSkipped: false,
        deployState: "failed",
        deploymentUrl: channelConfig.url,
        buildIdentity: { releaseId: `workpiece-${missionId}`, written: false, path: "" },
        axiom: {
          status: "not-run",
          errors: 0,
          warnings: 0,
          exitCode: 0,
          freshness: {
            verified: false,
            cdnDistTreeHash: null,
            localDistTreeHash: "",
            attempts: 0,
            error: "dist/ not found after build",
          },
        },
        evidenceSynced: false,
        evidenceSyncError: null,
      },
      exitCode: 1,
      summary: `[leitstand.dev-deploy] ${systemId}: build failed — no dist/ directory`,
    };
  }

  // RFC-0634: Remove preliminary build-identity.json from dist/client/.well-known/ before hashing
  const distClientWellKnownPath = path.join(
    distPath,
    "client",
    ".well-known",
    "build-identity.json",
  );
  if (existsSync(distClientWellKnownPath)) {
    await fs.rm(distClientWellKnownPath, { force: true });
    logger.info(
      `[leitstand.dev-deploy] removed preliminary build-identity.json from dist/ before hashing`,
    );
  }

  // RFC-0656: Compute deterministic distTreeHash via stable mode (normalizes PDFs, source maps, JSON timestamps)
  const distTreeResult = await fingerprintTree(distPath, { mode: "stable", root: distPath });
  const distTreeHash = distTreeResult.value;

  // RFC-0634: Write final build-identity.json to dist/client/.well-known/ with real hashes
  const distWellKnownDir = path.join(distPath, "client", ".well-known");
  await fs.mkdir(distWellKnownDir, { recursive: true });
  const finalBuildIdentity = {
    releaseId: `workpiece-${missionId}`,
    systemId,
    missionId,
    semver: "0.0.0-workpiece",
    distTreeHash,
    behaviorSnapshotHash: "",
    siteContentHash: workpieceTreeHash,
    platformVersion,
    platformSemanticHash,
    commitSha,
    buildTimestamp: new Date().toISOString(),
    targetPlatform: "cloudflare-workers",
  };
  await atomicWriteFile(
    path.join(distWellKnownDir, "build-identity.json"),
    JSON.stringify(finalBuildIdentity, null, 2) + "\n",
  );
  logger.info(`[leitstand.dev-deploy] wrote final build-identity.json to dist/client/.well-known/`);

  // RFC-0634: Clean up preliminary build-identity.json from workpiece/public/.well-known/
  await fs.rm(path.join(publicWellKnownDir, "build-identity.json"), { force: true });
  logger.info(
    `[leitstand.dev-deploy] cleaned up preliminary build-identity.json from public/.well-known/`,
  );

  // Step 2: Log workpiece HEAD sha
  logger.info(`[leitstand.dev-deploy] workpiece HEAD: ${commitSha}`);

  // Step 3: Deploy to dev channel via adapter
  const t2 = Date.now();
  const serverDistPath = path.join(distPath, "server");
  const effectiveDistPath = existsSync(serverDistPath) ? serverDistPath : distPath;

  // Resolve workpiece node_modules/.bin for wrangler binary resolution
  let nodeModulesBinPath: string | undefined;
  const workpieceBin = path.join(workpiecePath, "node_modules", ".bin");
  if (existsSync(workpieceBin)) {
    nodeModulesBinPath = workpieceBin;
  }

  const result = await adapter.propagate({
    systemId,
    releaseId: `workpiece-${missionId}`,
    channel,
    distPath: effectiveDistPath,
    workerName: channelConfig.workerName,
    url: channelConfig.url,
    secretsFilePath,
    expectedBehaviorSnapshotHash: "",
    nodeModulesBinPath,
  });
  logger.info(
    `[leitstand.dev-deploy] deploy completed in ${((Date.now() - t2) / 1000).toFixed(1)}s (state: ${result.state})`,
  );

  // Step 4: Purge CDN cache (RFC-0624) + freshness verification (RFC-0649)
  const isNullAdapter = dep.adapter === "null";
  let freshness: FreshnessResult;

  if (isNullAdapter) {
    // RFC-0649: Skip purge + freshness check for null adapter — no CDN to invalidate.
    freshness = {
      verified: true,
      cdnDistTreeHash: null,
      localDistTreeHash: distTreeHash,
      attempts: 0,
    };
    logger.info("[leitstand.dev-deploy] null adapter — skipping CDN purge and freshness check");
  } else {
    const t3 = Date.now();
    const purgeResult = await runPurgeStep(
      workspaceRoot,
      `workpiece-${missionId}`,
      channelConfig.url,
      secretsFilePath,
      logger,
    );

    // RFC-0649: Purge failure is fatal for leitstand.dev-deploy — stop before Axiom gate.
    if (!purgeResult.success) {
      freshness = {
        verified: false,
        cdnDistTreeHash: null,
        localDistTreeHash: distTreeHash,
        attempts: 0,
        error: `CDN purge failed: ${purgeResult.error ?? "unknown error"}`,
      };
      logger.warn(
        `[leitstand.dev-deploy] CDN purge failed — Axiom gate not run: ${purgeResult.error ?? "unknown error"}`,
      );
      return {
        data: {
          command: "leitstand.dev-deploy",
          systemId,
          missionId,
          commitSha,
          buildState,
          buildSkipped,
          deployState: result.state,
          deploymentUrl: result.deploymentUrl,
          buildIdentity: {
            releaseId: `workpiece-${missionId}`,
            written: true,
            path: "dist/client/.well-known/build-identity.json",
          },
          axiom: { status: "not-run", errors: 0, warnings: 0, exitCode: 0, freshness },
          evidenceSynced: false,
          evidenceSyncError: null,
        },
        exitCode: 1,
        summary: `[leitstand.dev-deploy] ${systemId}: CDN purge failed — Axiom gate not run`,
      };
    }

    logger.info(
      `[leitstand.dev-deploy] purge completed in ${((Date.now() - t3) / 1000).toFixed(1)}s`,
    );

    // RFC-0649 / RFC-0657: Verify CDN freshness — fetch build-identity.json from CDN URL and compare
    // distTreeHash. Retries up to 5 times with exponential backoff (3s, 6s, 12s, 24s).
    freshness = await verifyFreshness(channelConfig.url, distTreeHash, logger);
    if (!freshness.verified) {
      logger.warn(
        `[leitstand.dev-deploy] freshness check failed — Axiom gate not run: ${freshness.error}`,
      );
      return {
        data: {
          command: "leitstand.dev-deploy",
          systemId,
          missionId,
          commitSha,
          buildState,
          buildSkipped,
          deployState: result.state,
          deploymentUrl: result.deploymentUrl,
          buildIdentity: {
            releaseId: `workpiece-${missionId}`,
            written: true,
            path: "dist/client/.well-known/build-identity.json",
          },
          axiom: { status: "not-run", errors: 0, warnings: 0, exitCode: 0, freshness },
          evidenceSynced: false,
          evidenceSyncError: null,
        },
        exitCode: 1,
        summary: `[leitstand.dev-deploy] ${systemId}: freshness check failed — Axiom gate not run`,
      };
    }
    logger.info(
      `[leitstand.dev-deploy] freshness verified (distTreeHash: ${distTreeHash.slice(0, 12)}...)`,
    );
  }

  // Step 5: Run Axiom verification gate via mission.check --external-preview
  const t4 = Date.now();
  let axiomStatus: "pass" | "fail" | "not-run" = "not-run";
  let axiomErrors = 0;
  let axiomWarnings = 0;
  let axiomExitCode = 0;

  if (result.state === "succeeded") {
    try {
      // RFC-0668: Wrap mission.check with 15-min per-attempt timeout and one-time retry
      // on infrastructure errors (exit 2 or any non-0/non-1). Content violations (exit 1)
      // are not retried.
      const axiomResult = await runMissionCheckWithResilience(
        workspaceRoot,
        missionId,
        channelConfig.url,
        commitSha,
        logger,
      );
      axiomExitCode = axiomResult.exitCode;
      if (axiomExitCode === 0) {
        axiomStatus = "pass";
      } else {
        axiomStatus = "fail";
        const data = axiomResult.data;
        if (data?.findings && typeof data.findings === "object") {
          const findings = data.findings as { errors?: number; warnings?: number };
          axiomErrors = findings.errors ?? 0;
          axiomWarnings = findings.warnings ?? 0;
        }
      }
      logger.info(
        `[leitstand.dev-deploy] Axiom gate: ${axiomStatus} (exit: ${axiomExitCode}, errors: ${axiomErrors}, warnings: ${axiomWarnings}) — ${((Date.now() - t4) / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      axiomStatus = "fail";
      axiomExitCode = 2;
      logger.warn(
        `[leitstand.dev-deploy] Axiom gate failed to run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // RFC-0629: No evidence post-processing — mission.check writes commitSha to evidence-metadata.json directly via --commit-sha flag

  // RFC-0633: Auto-invoke axiom.report after mission.check (best-effort, non-blocking)
  try {
    const { executeKernelCommand: executeReport } = await import("@warpgogol/site-kernel");
    const reportResult = (await executeReport({
      workspaceRoot,
      commandName: "axiom.report",
      argv: [`--mission=${missionId}`],
    })) as { exitCode?: number; summary?: string };
    logger.info(
      `[leitstand.dev-deploy] axiom.report: ${reportResult.summary ?? "done"} (exit: ${reportResult.exitCode ?? 0})`,
    );
  } catch (reportErr) {
    logger.warn(
      `[leitstand.dev-deploy] axiom.report failed (non-blocking): ${reportErr instanceof Error ? reportErr.message : String(reportErr)}`,
    );
  }

  // RFC-0652: Best-effort evidence.sync to R2 after axiom.report (non-blocking).
  // If evidence.sync fails, the deploy still succeeds — the operator can run evidence.sync manually.
  // The --skip-evidence-sync flag skips this step entirely.
  let evidenceSynced = false;
  let evidenceSyncError: string | null = null;

  if (!skipEvidenceSync) {
    try {
      const { executeKernelCommand: executeSync } = await import("@warpgogol/site-kernel");
      await executeSync({
        workspaceRoot,
        commandName: "evidence.sync",
        argv: [`--mission=${missionId}`],
      });
      evidenceSynced = true;
      logger.info(`[leitstand.dev-deploy] evidence.sync: uploaded to R2`);
    } catch (syncErr) {
      evidenceSyncError = syncErr instanceof Error ? syncErr.message : String(syncErr);
      logger.warn(
        `[leitstand.dev-deploy] evidence.sync failed (non-blocking): ${evidenceSyncError}`,
      );
    }
  }

  logger.info(`[leitstand.dev-deploy] total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // RFC-0628: No registry write, no bordbuch write — dev deploys are ephemeral
  return {
    data: {
      command: "leitstand.dev-deploy",
      systemId,
      missionId,
      commitSha,
      buildState,
      buildSkipped,
      deployState: result.state,
      deploymentUrl: result.deploymentUrl,
      buildIdentity: {
        releaseId: `workpiece-${missionId}`,
        written: true,
        path: "dist/client/.well-known/build-identity.json",
      },
      axiom: {
        status: axiomStatus,
        errors: axiomErrors,
        warnings: axiomWarnings,
        exitCode: axiomExitCode,
        freshness,
      },
      evidenceSynced,
      evidenceSyncError,
    },
    exitCode: axiomStatus === "fail" ? 1 : 0,
    summary: `[leitstand.dev-deploy] ${systemId} deployed to dev (${result.state}, Axiom: ${axiomStatus})`,
  };
}

// §5.1: leitstand.propagate (RFC-0628: requires published + Axiom evidence gate with commitSha+missionId match)
export interface LeitstandPropagateData {
  systemId: string;
  releaseId: string;
  channel: "alt";
  state: "succeeded" | "failed" | "failed-stale" | "in-progress";
  deploymentUrl: string;
  startedAt: string;
  completedAt: string | null;
  preflight: { passed: boolean; checks: PreflightCheck[] };
  purgeResult?: PurgeResult;
  health: { state: "healthy" | "unhealthy" | "unknown"; checks: HealthCheck[] };
  releaseState: "alt-deployed";
  devBuildIdentityVerified: boolean;
  axiomEvidenceVerified: boolean;
}

export async function runLeitstandPropagate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<LeitstandPropagateData>> {
  const { workspaceRoot, logger } = context;
  const releaseId = flagString(input, "release");
  if (!releaseId) throw new Error("[leitstand.propagate] --release is required");

  if (input.flags["channel"] !== undefined) {
    throw new Error(
      "[leitstand.propagate] --channel is removed; use leitstand.promote for main deployment",
    );
  }

  const channel: Channel = "alt";

  const releaseManifest = await readReleaseManifest(workspaceRoot, releaseId);
  if (releaseManifest.state !== "published") {
    throw new Error(
      `[leitstand.propagate] release '${releaseId}' must be in state 'published' (state: ${releaseManifest.state}). Run leitstand.dev-deploy first, then release.publish.`,
    );
  }

  const systemId = releaseManifest.systemId as string;
  const missionId = releaseManifest.missionId as string;
  const releaseCommitSha = releaseManifest.commitSha as string;

  // RFC-0629: Axiom evidence gate — verify evidence-metadata.json exists with matching auditId + commitSha
  // RFC-0041 (Axiom): missionId renamed to auditId in evidence-metadata.json
  const metadataPath = path.join(
    workspaceRoot,
    "missions",
    missionId,
    "evidence",
    "axiom",
    "evidence-metadata.json",
  );
  if (!existsSync(metadataPath)) {
    throw new Error(
      `[leitstand.propagate] no Axiom evidence found for mission '${missionId}'. Run leitstand.dev-deploy first.`,
    );
  }

  // Parse evidence-metadata.json for auditId + commitSha verification
  // RFC-0041: Axiom writes auditId (was missionId)
  const metadataContent = await fs.readFile(metadataPath, "utf-8");
  let metadata: {
    auditId?: string;
    commitSha?: string;
    methodologies?: Array<{
      id: string;
      digest?: string;
      blockOn?: string[];
    }>;
  };
  try {
    metadata = JSON.parse(metadataContent) as {
      auditId?: string;
      commitSha?: string;
      methodologies?: Array<{
        id: string;
        digest?: string;
        blockOn?: string[];
      }>;
    };
  } catch {
    throw new Error(
      `[leitstand.propagate] Axiom evidence malformed: evidence-metadata.json is not valid JSON for mission '${missionId}'.`,
    );
  }

  if (metadata.auditId && metadata.auditId !== missionId) {
    throw new Error(
      `[leitstand.propagate] evidence auditId '${metadata.auditId}' does not match release missionId '${missionId}'.`,
    );
  }

  if (metadata.commitSha && releaseCommitSha && metadata.commitSha !== releaseCommitSha) {
    throw new Error(
      `[leitstand.propagate] evidence commitSha '${metadata.commitSha}' does not match release commitSha '${releaseCommitSha}' — re-run leitstand.dev-deploy after workpiece changes.`,
    );
  }

  // RFC-0665: Per-methodology gate — reject pre-RFC-0665 evidence (missing methodologies[])
  if (
    !metadata.methodologies ||
    !Array.isArray(metadata.methodologies) ||
    metadata.methodologies.length === 0
  ) {
    throw new Error(
      `[leitstand.propagate] Evidence predates RFC-0665 (no methodologies[] field). Re-run leitstand.dev-deploy to generate current evidence.`,
    );
  }

  // RFC-0629: Verify study-run.json exists and has no high/critical findings
  const studyRunPath = path.join(
    workspaceRoot,
    "missions",
    missionId,
    "evidence",
    "axiom",
    "study-run.json",
  );
  if (!existsSync(studyRunPath)) {
    throw new Error(
      `[leitstand.propagate] no Axiom study-run found for mission '${missionId}'. Run leitstand.dev-deploy first.`,
    );
  }

  const studyRunContent = await fs.readFile(studyRunPath, "utf-8");
  let studyRun: { findings?: Finding[] };
  try {
    studyRun = JSON.parse(studyRunContent) as { findings?: Finding[] };
  } catch {
    throw new Error(
      `[leitstand.propagate] Axiom evidence malformed: study-run.json is not valid JSON for mission '${missionId}'.`,
    );
  }

  if (!studyRun.findings || !Array.isArray(studyRun.findings)) {
    throw new Error(
      `[leitstand.propagate] Axiom evidence malformed: missing findings array in study-run.json`,
    );
  }

  // RFC-0665: Per-methodology gate — each methodology declares its own blockOn severity levels.
  // Findings are matched by methodologyId (falling back to extension-based predicate for
  // backward compat with findings that don't carry methodologyId yet).
  // Incomplete findings (e.g., accessibility.axe.incomplete) do not block — they are
  // instrument limitations, not confirmed violations.
  for (const methodology of metadata.methodologies ?? []) {
    const blockOn = methodology.blockOn ?? ["high", "critical"];
    const methodologyFindings = studyRun.findings.filter((f) => {
      // Match by methodologyId if present
      if (f.methodologyId) {
        return f.methodologyId === methodology.id;
      }
      // Fallback: match by extension predicate for pre-RFC-0665 finding format
      const ext = f.extension as Record<string, Record<string, unknown>> | undefined;
      return ext?.[methodology.id]?.predicate !== undefined;
    });
    const blockingFindings = methodologyFindings.filter((f) =>
      isBlockingFinding(f, methodology.id, blockOn),
    );
    if (blockingFindings.length > 0) {
      throw new Error(
        `[leitstand.propagate] Axiom verification failed: methodology '${methodology.id}' has ${blockingFindings.length} block-on violation(s). Fix and re-deploy to dev.`,
      );
    }
  }

  // RFC-0634: Verify dev build-identity.json before deploying to alt
  // Fetch build-identity.json from the dev channel URL and verify against release manifest
  const registryForDev = await readRegistry(workspaceRoot);
  const entryForDev = findEntry(registryForDev, systemId);
  if (!entryForDev) {
    throw new Error(`[leitstand.propagate] system '${systemId}' not found in registry`);
  }
  const depForDev = entryForDev.deployment as DeploymentConfig;
  if (!depForDev) {
    throw new Error(`[leitstand.propagate] system '${systemId}' has no deployment config`);
  }
  const devChannelConfig = getChannelConfig(depForDev, "dev");
  const devBuildIdentityUrl = `${devChannelConfig.url}/.well-known/build-identity.json?cb=${Date.now()}`;
  logger.info(`  Fetching dev build-identity from ${devBuildIdentityUrl}...`);
  let devBuildIdentityVerified = false;
  try {
    const devResponse = await fetch(devBuildIdentityUrl);
    if (!devResponse.ok) {
      throw new Error(
        `[leitstand.propagate] build-identity.json not served by dev deployment (${devResponse.status}). Run leitstand.dev-deploy first.`,
      );
    }
    const rawDevBuildIdentity = await devResponse.json();
    const devParseResult = buildIdentitySchema.safeParse(rawDevBuildIdentity);
    if (!devParseResult.success) {
      throw new Error(
        `[leitstand.propagate] dev build-identity.json schema validation failed: ${devParseResult.error.message}`,
      );
    }
    const devBuildIdentity = devParseResult.data;

    // Verify missionId matches
    if (devBuildIdentity.missionId !== missionId) {
      throw new Error(
        `[leitstand.propagate] build-identity.json missionId mismatch: expected '${missionId}', got '${devBuildIdentity.missionId}'.`,
      );
    }

    // Verify commitSha matches release manifest
    if (
      devBuildIdentity.commitSha !== releaseCommitSha &&
      devBuildIdentity.commitSha !== "0000000" &&
      releaseCommitSha !== "0000000"
    ) {
      throw new Error(
        `[leitstand.propagate] dev build-identity commitSha '${devBuildIdentity.commitSha}' does not match release commitSha '${releaseCommitSha}' — re-run leitstand.dev-deploy after workpiece changes.`,
      );
    }

    // Verify distTreeHash matches
    const releaseDistTreeHash = releaseManifest.distTreeHash as string;
    if (
      releaseDistTreeHash &&
      devBuildIdentity.distTreeHash &&
      devBuildIdentity.distTreeHash !== releaseDistTreeHash
    ) {
      throw new Error(
        `[leitstand.propagate] dev build-identity distTreeHash mismatch: manifest='${releaseDistTreeHash}', identity='${devBuildIdentity.distTreeHash}'.`,
      );
    }

    // Verify siteContentHash matches
    const releaseSiteContentHash = releaseManifest.siteContentHash as string;
    if (
      releaseSiteContentHash &&
      devBuildIdentity.siteContentHash &&
      devBuildIdentity.siteContentHash !== releaseSiteContentHash
    ) {
      throw new Error(
        `[leitstand.propagate] dev build-identity siteContentHash mismatch: manifest='${releaseSiteContentHash}', identity='${devBuildIdentity.siteContentHash}'.`,
      );
    }

    // behaviorSnapshotHash is NOT verified for dev→alt (empty for workpiece)
    devBuildIdentityVerified = true;
    logger.info(`  Dev build-identity verified for ${releaseId}`);
  } catch (verifyErr) {
    throw new Error(
      `[leitstand.propagate] dev build-identity verification failed: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
    );
  }

  const operationId = generateOperationId();

  await acquireLock(
    workspaceRoot,
    `deployment:${systemId}`,
    operationId,
    "leitstand.propagate",
    "agent",
  );

  try {
    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, systemId);
    if (!entry) {
      throw new Error(`[leitstand.propagate] system '${systemId}' not found in registry`);
    }

    const dep = entry.deployment as DeploymentConfig;
    if (!dep) {
      throw new Error(`[leitstand.propagate] system '${systemId}' has no deployment config`);
    }

    const channelConfig = getChannelConfig(dep, channel);
    const adapter = resolveAdapter(dep.adapter);
    const distPath = path.join(workspaceRoot, "releases", releaseId, "dist");
    const serverDistPath = path.join(distPath, "server");
    const effectiveServerDistPath = existsSync(serverDistPath) ? serverDistPath : distPath;
    const secretsFilePath = resolveConventionSecretsPath(
      path.join(workspaceRoot, "releases", releaseId),
      channel,
    );

    // Preflight
    const preflightChecks = await runPreflight(
      workspaceRoot,
      releaseId,
      dep,
      channel,
      channelConfig,
      adapter,
      releaseManifest.missionId as string | undefined,
      path.join(workspaceRoot, "releases", releaseId),
    );
    const preflightPassed = preflightChecks.every((c) => c.passed);
    if (!preflightPassed) {
      const failed = preflightChecks
        .filter((c) => !c.passed)
        .map((c) => c.name)
        .join(", ");
      throw new Error(`[leitstand.propagate] preflight failed: ${failed}`);
    }

    // Rehydrate dist from artifact store if missing or hash mismatch
    let effectiveDistPath = distPath;
    if (!existsSync(distPath)) {
      logger.info(`  Dist missing locally — rehydrating from artifact store...`);
      const rehydrated = await artifactStoreRehydrate(workspaceRoot, releaseId, distPath);
      effectiveDistPath = rehydrated.output;
      logger.info(`  Rehydrated to ${effectiveDistPath}`);
    }

    logger.info(
      `  Adapter: ${adapter.name}, channel: ${channel}, worker: ${channelConfig.workerName}`,
    );

    // Resolve workpiece node_modules/.bin for wrangler binary resolution
    const missionId = releaseManifest.missionId as string;
    let nodeModulesBinPath: string | undefined;
    if (missionId) {
      const workpieceBin = path.join(
        workspaceRoot,
        "missions",
        missionId,
        "workpiece",
        "node_modules",
        ".bin",
      );
      if (existsSync(workpieceBin)) {
        nodeModulesBinPath = workpieceBin;
      }
    }

    const result = await adapter.propagate({
      systemId,
      releaseId,
      channel,
      distPath: existsSync(serverDistPath) ? effectiveServerDistPath : effectiveDistPath,
      workerName: channelConfig.workerName,
      url: channelConfig.url,
      secretsFilePath,
      expectedBehaviorSnapshotHash: releaseManifest.behaviorSnapshotHash as string,
      nodeModulesBinPath,
    });

    // RFC-0624: Purge CDN cache after deploy, before health check
    const purgeResult = await runPurgeStep(
      workspaceRoot,
      releaseId,
      channelConfig.url,
      secretsFilePath,
      logger,
    );
    if (purgeResult.success) {
      await sleep(6_000);
    }

    // Run health verification after deploy
    const healthResult = await adapter.health({
      systemId,
      channel,
      deploymentUrl: channelConfig.url,
      releaseId,
      expectedBehaviorSnapshotHash: releaseManifest.behaviorSnapshotHash as string,
      workspaceRoot,
    });

    const healthy = result.state === "succeeded" && healthResult.state === "healthy";

    // Update registry — per-channel lastPropagated
    if (!dep.lastPropagated) {
      dep.lastPropagated = {};
    }
    dep.lastPropagated[channel] = buildLastPropagatedEntry(
      releaseId,
      result.state === "succeeded" ? "succeeded" : "failed",
      healthy,
      operationId,
      purgeResult,
    );
    entry.deployment = dep;
    await writeRegistry(workspaceRoot, registry);

    // RFC-0608: transition release state to alt-deployed on success
    if (result.state === "succeeded") {
      releaseManifest.state = "alt-deployed";
      await writeReleaseYaml(workspaceRoot, releaseId, releaseManifest);
    }

    // Append Bordbuch
    await appendBordbuchEntry(
      workspaceRoot,
      systemId,
      "deployment",
      `Release ${releaseId} deployed to ${channel}`,
      "agent",
      {
        writerRole: "leitstand",
        metadata: {
          releaseId,
          channel,
          state: result.state,
          healthState: healthResult.state,
          operationId,
        },
      },
    );

    logger.success(
      `[leitstand.propagate] ${releaseId} deployed to ${channel} (${result.state}, health: ${healthResult.state})`,
    );

    return {
      data: {
        systemId,
        releaseId,
        channel,
        state: result.state,
        deploymentUrl: result.deploymentUrl,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        preflight: { passed: preflightPassed, checks: preflightChecks },
        purgeResult,
        health: { state: healthResult.state, checks: healthResult.checks },
        releaseState: "alt-deployed",
        devBuildIdentityVerified,
        axiomEvidenceVerified: true,
      },
      summary: `[leitstand.propagate] ${releaseId} deployed to ${channel} (${result.state}, health: ${healthResult.state})`,
    };
  } finally {
    await releaseLock(workspaceRoot, `deployment:${systemId}`);
  }
}

// §5.1b: leitstand.promote (RFC-0608: alt→main with build-identity verification)
export interface LeitstandPromoteData {
  systemId: string;
  releaseId: string;
  channel: "main";
  state: "succeeded" | "failed";
  deploymentUrl: string;
  buildIdentityVerified: boolean;
  purgeResult?: PurgeResult;
  healthState: "healthy" | "unhealthy" | "unknown";
  releaseState: "promoted";
}

export async function runLeitstandPromote(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<LeitstandPromoteData>> {
  const { workspaceRoot, logger } = context;
  const releaseId = flagString(input, "release");
  if (!releaseId) throw new Error("[leitstand.promote] --release is required");

  const releaseManifest = await readReleaseManifest(workspaceRoot, releaseId);
  if (releaseManifest.state !== "alt-deployed") {
    throw new Error(
      `[leitstand.promote] release '${releaseId}' must be in state 'alt-deployed' (current: ${releaseManifest.state}). Run leitstand.propagate first.`,
    );
  }

  const systemId = releaseManifest.systemId as string;
  const operationId = generateOperationId();

  await acquireLock(
    workspaceRoot,
    `deployment:${systemId}`,
    operationId,
    "leitstand.promote",
    "agent",
  );

  try {
    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, systemId);
    if (!entry) {
      throw new Error(`[leitstand.promote] system '${systemId}' not found in registry`);
    }

    const dep = entry.deployment as DeploymentConfig;
    if (!dep) {
      throw new Error(`[leitstand.promote] system '${systemId}' has no deployment config`);
    }

    const altConfig = getChannelConfig(dep, "alt");
    const mainConfig = getChannelConfig(dep, "main");
    const adapter = resolveAdapter(dep.adapter);

    // 1. Fetch build-identity.json from alt URL
    const buildIdentityUrl = `${altConfig.url}/.well-known/build-identity.json?cb=${Date.now()}`;
    logger.info(`  Fetching build identity from ${buildIdentityUrl}...`);
    const response = await fetch(buildIdentityUrl);
    if (!response.ok) {
      throw new Error(
        `[leitstand.promote] build-identity.json not found at alt URL (${response.status}): ${buildIdentityUrl}`,
      );
    }
    const rawBuildIdentity = await response.json();
    const parseResult = buildIdentitySchema.safeParse(rawBuildIdentity);
    if (!parseResult.success) {
      throw new Error(
        `[leitstand.promote] build-identity.json schema validation failed: ${parseResult.error.message}`,
      );
    }
    const buildIdentity = parseResult.data;

    // 2. Verify build identity fields match release manifest
    const fieldsToVerify: Array<[string, string | undefined, string]> = [
      ["releaseId", releaseId, buildIdentity.releaseId],
      ["distTreeHash", releaseManifest.distTreeHash as string, buildIdentity.distTreeHash],
      [
        "behaviorSnapshotHash",
        releaseManifest.behaviorSnapshotHash as string,
        buildIdentity.behaviorSnapshotHash,
      ],
      ["siteContentHash", releaseManifest.siteContentHash as string, buildIdentity.siteContentHash],
    ];
    for (const [fieldName, manifestValue, identityValue] of fieldsToVerify) {
      if (manifestValue !== identityValue) {
        throw new Error(
          `[leitstand.promote] build-identity mismatch for '${fieldName}': manifest='${manifestValue}', identity='${identityValue}'`,
        );
      }
    }
    logger.success(`  Build identity verified for ${releaseId}`);

    // 3. Run health check against alt deployment
    const altHealthResult = await adapter.health({
      systemId,
      channel: "alt",
      deploymentUrl: altConfig.url,
      releaseId,
      expectedBehaviorSnapshotHash: releaseManifest.behaviorSnapshotHash as string,
      workspaceRoot,
    });

    if (altHealthResult.state !== "healthy") {
      throw new Error(
        `[leitstand.promote] alt deployment is not healthy (state: ${altHealthResult.state}). Cannot promote to main.`,
      );
    }

    // 4. Deploy to main channel
    const distPath = path.join(workspaceRoot, "releases", releaseId, "dist");
    const serverDistPath = path.join(distPath, "server");
    const effectiveServerDistPath = existsSync(serverDistPath) ? serverDistPath : distPath;
    const secretsFilePath = resolveConventionSecretsPath(
      path.join(workspaceRoot, "releases", releaseId),
      "main",
    );

    // Rehydrate dist from artifact store if missing
    let effectiveDistPath = distPath;
    if (!existsSync(distPath)) {
      logger.info(`  Dist missing locally — rehydrating from artifact store...`);
      const rehydrated = await artifactStoreRehydrate(workspaceRoot, releaseId, distPath);
      effectiveDistPath = rehydrated.output;
      logger.info(`  Rehydrated to ${effectiveDistPath}`);
    }

    const missionId = releaseManifest.missionId as string;
    let nodeModulesBinPath: string | undefined;
    if (missionId) {
      const workpieceBin = path.join(
        workspaceRoot,
        "missions",
        missionId,
        "workpiece",
        "node_modules",
        ".bin",
      );
      if (existsSync(workpieceBin)) {
        nodeModulesBinPath = workpieceBin;
      }
    }

    logger.info(`  Promoting to main channel (worker: ${mainConfig.workerName})...`);
    const result = await adapter.propagate({
      systemId,
      releaseId,
      channel: "main",
      distPath: existsSync(serverDistPath) ? effectiveServerDistPath : effectiveDistPath,
      workerName: mainConfig.workerName,
      url: mainConfig.url,
      secretsFilePath,
      expectedBehaviorSnapshotHash: releaseManifest.behaviorSnapshotHash as string,
      nodeModulesBinPath,
    });

    // RFC-0624: Purge CDN cache after main deploy, before main health check (not before alt health check)
    const purgeResult = await runPurgeStep(
      workspaceRoot,
      releaseId,
      mainConfig.url,
      secretsFilePath,
      logger,
    );
    if (purgeResult.success) {
      await sleep(6_000);
    }

    // 5. Run health check on main
    const mainHealthResult = await adapter.health({
      systemId,
      channel: "main",
      deploymentUrl: mainConfig.url,
      releaseId,
      expectedBehaviorSnapshotHash: releaseManifest.behaviorSnapshotHash as string,
      workspaceRoot,
    });

    // 6. Update registry — main channel lastPropagated
    if (!dep.lastPropagated) {
      dep.lastPropagated = {};
    }
    dep.lastPropagated["main"] = buildLastPropagatedEntry(
      releaseId,
      result.state === "succeeded" ? "succeeded" : "failed",
      result.state === "succeeded" && mainHealthResult.state === "healthy",
      operationId,
      purgeResult,
    );
    entry.deployment = dep;
    await writeRegistry(workspaceRoot, registry);

    // 7. Transition release state to promoted on success
    if (result.state === "succeeded") {
      releaseManifest.state = "promoted";
      await writeReleaseYaml(workspaceRoot, releaseId, releaseManifest);
    }

    // 8. Append Bordbuch
    await appendBordbuchEntry(
      workspaceRoot,
      systemId,
      "deployment",
      `Release ${releaseId} promoted to main`,
      "agent",
      {
        writerRole: "leitstand",
        metadata: {
          releaseId,
          channel: "main",
          promote: true,
          state: result.state,
          healthState: mainHealthResult.state,
          buildIdentityVerified: true,
          operationId,
        },
      },
    );

    logger.success(
      `[leitstand.promote] ${releaseId} promoted to main (${result.state}, health: ${mainHealthResult.state})`,
    );

    return {
      data: {
        systemId,
        releaseId,
        channel: "main",
        state: result.state as "succeeded" | "failed",
        deploymentUrl: result.deploymentUrl,
        buildIdentityVerified: true,
        purgeResult,
        healthState: mainHealthResult.state,
        releaseState: "promoted",
      },
      summary: `[leitstand.promote] ${releaseId} promoted to main (${result.state}, health: ${mainHealthResult.state})`,
    };
  } finally {
    await releaseLock(workspaceRoot, `deployment:${systemId}`);
  }
}

// §5.2: leitstand.status
export interface LeitstandStatusData {
  systemId: string;
  channels: {
    dev?: {
      releaseId: string;
      state: string;
      healthy: boolean;
      at: string;
      purgeResult?: PurgeResult;
    } | null;
    alt?: {
      releaseId: string;
      state: string;
      healthy: boolean;
      at: string;
      purgeResult?: PurgeResult;
    } | null;
    main?: {
      releaseId: string;
      state: string;
      healthy: boolean;
      at: string;
      purgeResult?: PurgeResult;
    } | null;
  };
}

export async function runLeitstandStatus(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<LeitstandStatusData>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system");
  if (!systemId) throw new Error("[leitstand.status] --system is required");

  const channelFilter = flagString(input, "channel");

  const registry = await readRegistry(workspaceRoot);
  const entry = findEntry(registry, systemId);
  if (!entry) {
    throw new Error(`[leitstand.status] system '${systemId}' not found in registry`);
  }

  const dep = entry.deployment as DeploymentConfig | undefined;
  const lp = dep?.lastPropagated;

  function channelStatus(c: Channel) {
    const e = lp?.[c];
    if (!e) return null;
    return {
      releaseId: e.releaseId,
      state: e.state,
      healthy: e.healthy,
      at: e.at,
      purgeResult: e.purgeResult,
    };
  }

  const data: LeitstandStatusData = {
    systemId,
    channels: {
      dev: channelFilter && channelFilter !== "dev" ? undefined : channelStatus("dev"),
      alt: channelFilter && channelFilter !== "alt" ? undefined : channelStatus("alt"),
      main: channelFilter && channelFilter !== "main" ? undefined : channelStatus("main"),
    },
  };

  if (!channelFilter) {
    logger.info(
      `  dev:  ${data.channels.dev?.releaseId ?? "none"} (${data.channels.dev?.state ?? "none"})${data.channels.dev?.purgeResult ? ` purge: ${data.channels.dev.purgeResult.success ? "ok" : "failed"}` : ""}`,
    );
    logger.info(
      `  alt:  ${data.channels.alt?.releaseId ?? "none"} (${data.channels.alt?.state ?? "none"})${data.channels.alt?.purgeResult ? ` purge: ${data.channels.alt.purgeResult.success ? "ok" : "failed"}` : ""}`,
    );
    logger.info(
      `  main: ${data.channels.main?.releaseId ?? "none"} (${data.channels.main?.state ?? "none"})${data.channels.main?.purgeResult ? ` purge: ${data.channels.main.purgeResult.success ? "ok" : "failed"}` : ""}`,
    );
  } else {
    const ch = channelFilter as Channel;
    const status = data.channels[ch];
    logger.info(`  ${ch}: ${status?.releaseId ?? "none"} (${status?.state ?? "none"})`);
  }

  return {
    data,
    summary: `[leitstand.status] ${systemId}: dev=${data.channels.dev?.releaseId ?? "none"}, alt=${data.channels.alt?.releaseId ?? "none"}, main=${data.channels.main?.releaseId ?? "none"}`,
  };
}

// §5.3: leitstand.rollback (RFC-0627: auto-detect channel from release state, auto-step)
export interface LeitstandRollbackData {
  systemId: string;
  channel: Channel;
  rolledBackFrom: string;
  rolledBackTo: string;
  state: "succeeded" | "failed";
  deploymentUrl: string;
  purgeResult?: PurgeResult;
  releaseState: string;
}

function detectChannelFromState(releaseState: string): Channel {
  if (releaseState === "promoted") return "main";
  if (releaseState === "alt-deployed") return "alt";
  throw new Error(
    `[leitstand.rollback] cannot rollback release in state '${releaseState}' — expected 'promoted' or 'alt-deployed'`,
  );
}

function autoStepReleaseState(currentState: string): string {
  if (currentState === "promoted") return "alt-deployed";
  if (currentState === "alt-deployed") return "published";
  return "published";
}

export async function runLeitstandRollback(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<LeitstandRollbackData>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system");
  const toReleaseId = flagString(input, "to-release");
  if (!systemId) throw new Error("[leitstand.rollback] --system is required");

  // RFC-0627: --channel flag is removed; auto-detect from release state
  if (input.flags["channel"] !== undefined) {
    throw new Error(
      "[leitstand.rollback] --channel is removed; channel is auto-detected from release state",
    );
  }

  const operationId = generateOperationId();
  await acquireLock(
    workspaceRoot,
    `deployment:${systemId}`,
    operationId,
    "leitstand.rollback",
    "agent",
  );

  try {
    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, systemId);
    if (!entry) {
      throw new Error(`[leitstand.rollback] system '${systemId}' not found in registry`);
    }

    const dep = entry.deployment as DeploymentConfig;
    if (!dep) {
      throw new Error(`[leitstand.rollback] system '${systemId}' has no deployment config`);
    }

    // RFC-0627: Auto-detect channel from current release state
    // Find the current release from any channel's lastPropagated, then read its state
    const currentRelease =
      dep.lastPropagated?.main?.releaseId ??
      dep.lastPropagated?.alt?.releaseId ??
      dep.lastPropagated?.dev?.releaseId ??
      null;
    if (!currentRelease) {
      throw new Error(`[leitstand.rollback] no previous release found for '${systemId}'`);
    }

    const currentManifest = await readReleaseManifest(workspaceRoot, currentRelease);
    const currentState = currentManifest.state as string;
    const channel = detectChannelFromState(currentState);

    // Find previous published release if not specified
    const releasesDir = path.join(workspaceRoot, "releases");
    let targetRelease = toReleaseId;
    if (!targetRelease) {
      if (!existsSync(releasesDir)) {
        throw new Error(
          `[leitstand.rollback] no previous published release found for '${systemId}'`,
        );
      }
      const entries = await fs.readdir(releasesDir, { withFileTypes: true });
      const candidates: string[] = [];
      for (const e of entries) {
        if (!e.isDirectory() || e.name.includes(".staging-")) continue;
        if (e.name.startsWith(`${systemId}-r`) && e.name !== currentRelease) {
          try {
            const manifest = await readReleaseManifest(workspaceRoot, e.name);
            if (manifest.state === "published") candidates.push(e.name);
          } catch {
            /* skip */
          }
        }
      }
      candidates.sort().reverse();
      targetRelease = candidates[0];
      if (!targetRelease) {
        throw new Error(
          `[leitstand.rollback] no previous published release found for '${systemId}'`,
        );
      }
    }

    const channelConfig = getChannelConfig(dep, channel);
    const adapter = resolveAdapter(dep.adapter);
    const distPath = path.join(workspaceRoot, "releases", targetRelease, "dist");
    const secretsFilePath = resolveConventionSecretsPath(
      path.join(workspaceRoot, "releases", targetRelease),
      channel,
    );

    // Rehydrate dist from artifact store if missing
    let effectiveDistPath = distPath;
    if (!existsSync(distPath)) {
      logger.info(`  Dist missing locally — rehydrating from artifact store...`);
      const rehydrated = await artifactStoreRehydrate(workspaceRoot, targetRelease, distPath);
      effectiveDistPath = rehydrated.output;
      logger.info(`  Rehydrated to ${effectiveDistPath}`);
    }

    const result = await adapter.rollback({
      systemId,
      toReleaseId: targetRelease,
      channel,
      distPath: effectiveDistPath,
      workerName: channelConfig.workerName,
      url: channelConfig.url,
      secretsFilePath,
    });

    // RFC-0624: Purge CDN cache after rollback (no health check follows, no 6s delay)
    const purgeResult = await runPurgeStep(
      workspaceRoot,
      targetRelease,
      channelConfig.url,
      secretsFilePath,
      logger,
    );
    if (purgeResult.success) {
      logger.success("[leitstand] Visitors will see rolled-back content");
    }

    // Update registry — per-channel lastPropagated
    if (!dep.lastPropagated) {
      dep.lastPropagated = {};
    }
    dep.lastPropagated[channel] = buildLastPropagatedEntry(
      targetRelease,
      result.state === "succeeded" ? "succeeded" : "failed",
      result.state === "succeeded",
      operationId,
      purgeResult,
    );
    entry.deployment = dep;
    await writeRegistry(workspaceRoot, registry);

    // RFC-0627: auto-step release state one step back in the deployment chain
    let newReleaseState = "";
    if (result.state === "succeeded" && currentRelease) {
      try {
        const rolledBackManifest = await readReleaseManifest(workspaceRoot, currentRelease);
        rolledBackManifest.state = autoStepReleaseState(currentState) as string;
        newReleaseState = rolledBackManifest.state as string;
        await writeReleaseYaml(workspaceRoot, currentRelease, rolledBackManifest);
      } catch (err) {
        // Release manifest may not exist for very old releases — non-fatal
        if (err instanceof Error && !err.message.includes("not found")) {
          throw err;
        }
      }
    }

    // Append Bordbuch
    await appendBordbuchEntry(
      workspaceRoot,
      systemId,
      "release-rolled-back",
      `Rolled back ${channel} to ${targetRelease}`,
      "agent",
      {
        writerRole: "leitstand",
        metadata: {
          channel,
          rollback: true,
          rolledBackFrom: currentRelease,
          rolledBackTo: targetRelease,
        },
      },
    );

    logger.success(
      `[leitstand.rollback] ${systemId} ${channel}: rolled back from ${currentRelease} to ${targetRelease}`,
    );

    return {
      data: {
        systemId,
        channel,
        rolledBackFrom: currentRelease,
        rolledBackTo: targetRelease,
        state: result.state as "succeeded" | "failed",
        deploymentUrl: result.deploymentUrl,
        purgeResult,
        releaseState: newReleaseState || autoStepReleaseState(currentState),
      },
      summary: `[leitstand.rollback] ${systemId} ${channel}: rolled back to ${targetRelease}`,
    };
  } finally {
    await releaseLock(workspaceRoot, `deployment:${systemId}`);
  }
}

// §5.4: leitstand.health
export interface LeitstandHealthData {
  systemId: string;
  channel: Channel;
  state: "healthy" | "unhealthy" | "unknown";
  checks: HealthCheck[];
}

export async function runLeitstandHealth(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<LeitstandHealthData>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system");
  if (!systemId) throw new Error("[leitstand.health] --system is required");

  const channel = parseChannel(flagString(input, "channel"), "alt");

  const registry = await readRegistry(workspaceRoot);
  const entry = findEntry(registry, systemId);
  if (!entry) {
    throw new Error(`[leitstand.health] system '${systemId}' not found in registry`);
  }

  const dep = entry.deployment as DeploymentConfig;
  if (!dep) {
    throw new Error(`[leitstand.health] system '${systemId}' has no deployment config`);
  }

  const channelConfig = getChannelConfig(dep, channel);
  const adapter = resolveAdapter(dep.adapter);
  const releaseId = dep.lastPropagated?.[channel]?.releaseId ?? "";

  const result = await adapter.health({
    systemId,
    channel,
    deploymentUrl: channelConfig.url,
    releaseId,
    expectedBehaviorSnapshotHash: "",
    workspaceRoot,
  });

  logger.info(`  Health: ${result.state}, ${result.checks.length} checks`);

  return {
    data: { systemId, channel, state: result.state, checks: result.checks },
    summary: `[leitstand.health] ${systemId} ${channel}: ${result.state}`,
  };
}
