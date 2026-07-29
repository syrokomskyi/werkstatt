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
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import yaml from "yaml";
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
} from "@warpgogol/ontology/operations";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import { readRegistry, writeRegistry, findEntry } from "../sternsystem/registry-io.ts";
import { appendBordbuchEntry } from "../bordbuch/bordbuch-io.ts";
import type {
  DeploymentAdapter,
  DeploymentLimits,
  PropagateInput,
  RollbackInput,
  HealthInput,
} from "./adapter.ts";
import { createCloudflareWorkersAdapter } from "./adapters/index.ts";
import { artifactStorePreflight, artifactStoreRehydrate } from "../artifact-store/index.ts";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

type Channel = "alt" | "main";

function parseChannel(value: string | undefined, defaultValue: Channel): Channel {
  if (value === "alt" || value === "main") return value;
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

async function readReleaseManifest(
  workspaceRoot: string,
  releaseId: string,
): Promise<Record<string, unknown>> {
  const manifestPath = path.join(workspaceRoot, "releases", releaseId, "release.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`release '${releaseId}' not found`);
  }
  const content = await fs.readFile(manifestPath, "utf8");
  const parsed = yaml.parse(content);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`release '${releaseId}' manifest is not a valid YAML object`);
  }
  return parsed as Record<string, unknown>;
}

function getChannelConfig(dep: DeploymentConfig, channel: Channel): DeploymentChannel {
  const channelConfig = channel === "alt" ? dep.channels.alt : dep.channels.main;
  if (!channelConfig) {
    throw new Error(`[leitstand] channel '${channel}' is not defined for system`);
  }
  return channelConfig;
}

async function resolveSecretsFilePath(
  secretsFileRef: string | undefined,
): Promise<string | undefined> {
  if (!secretsFileRef) return undefined;
  const match = secretsFileRef.match(/^env:([A-Z0-9_]+)$/);
  if (!match) return undefined;
  const envValue = process.env[match[1]];
  if (!envValue) return undefined;
  return envValue;
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

  // 3. Credential reference syntax
  if (channelConfig.secretsFile) {
    const refMatch = channelConfig.secretsFile.match(
      /^(env|github-secret|cloudflare-secret):[A-Z0-9_]+$/,
    );
    checks.push({
      name: "credential-ref-syntax",
      passed: !!refMatch,
      detail: refMatch
        ? "Secret reference syntax valid"
        : `Invalid secret reference: ${channelConfig.secretsFile}`,
    });
  }

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
): LastPropagatedChannel {
  return {
    releaseId,
    at: new Date().toISOString(),
    healthy,
    state,
    operationId,
    leaseExpiresAt: null,
  };
}

// §5.1: leitstand.propagate
export interface LeitstandPropagateData {
  systemId: string;
  releaseId: string;
  channel: Channel;
  state: "succeeded" | "failed" | "failed-stale" | "in-progress";
  deploymentUrl: string;
  startedAt: string;
  completedAt: string | null;
  preflight: { passed: boolean; checks: PreflightCheck[] };
  health: { state: "healthy" | "unhealthy" | "unknown"; checks: HealthCheck[] };
}

export async function runLeitstandPropagate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<LeitstandPropagateData>> {
  const { workspaceRoot, logger } = context;
  const releaseId = flagString(input, "release");
  if (!releaseId) throw new Error("[leitstand.propagate] --release is required");

  const channel = parseChannel(flagString(input, "channel"), "alt");

  const releaseManifest = await readReleaseManifest(workspaceRoot, releaseId);
  if (releaseManifest.state !== "published") {
    throw new Error(
      `[leitstand.propagate] release '${releaseId}' is not published (state: ${releaseManifest.state})`,
    );
  }

  const systemId = releaseManifest.systemId as string;
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

    // Channel gate: main requires healthy alt of same release
    if (channel === "main" && dep.channels.alt) {
      const altProp = dep.lastPropagated?.alt;
      if (!altProp || altProp.releaseId !== releaseId || !altProp.healthy) {
        throw new Error(
          `[leitstand.propagate] main-channel gate: alt channel must have a healthy propagation of release '${releaseId}' before promoting to main`,
        );
      }
    }

    const channelConfig = getChannelConfig(dep, channel);
    const adapter = resolveAdapter(dep.adapter);
    const distPath = path.join(workspaceRoot, "releases", releaseId, "dist");
    const serverDistPath = path.join(distPath, "server");
    const effectiveServerDistPath = existsSync(serverDistPath) ? serverDistPath : distPath;
    const secretsFilePath = await resolveSecretsFilePath(channelConfig.secretsFile);

    // Preflight
    const preflightChecks = await runPreflight(
      workspaceRoot,
      releaseId,
      dep,
      channel,
      channelConfig,
      adapter,
      releaseManifest.missionId as string | undefined,
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
    );
    entry.deployment = dep;
    await writeRegistry(workspaceRoot, registry);

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
        health: { state: healthResult.state, checks: healthResult.checks },
      },
      summary: `[leitstand.propagate] ${releaseId} deployed to ${channel} (${result.state}, health: ${healthResult.state})`,
    };
  } finally {
    await releaseLock(workspaceRoot, `deployment:${systemId}`);
  }
}

// §5.2: leitstand.status
export interface LeitstandStatusData {
  systemId: string;
  channels: {
    alt?: { releaseId: string; state: string; healthy: boolean; at: string } | null;
    main?: { releaseId: string; state: string; healthy: boolean; at: string } | null;
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
    return { releaseId: e.releaseId, state: e.state, healthy: e.healthy, at: e.at };
  }

  const data: LeitstandStatusData = {
    systemId,
    channels: {
      alt: channelFilter && channelFilter !== "alt" ? undefined : channelStatus("alt"),
      main: channelFilter && channelFilter !== "main" ? undefined : channelStatus("main"),
    },
  };

  if (!channelFilter) {
    logger.info(
      `  alt:  ${data.channels.alt?.releaseId ?? "none"} (${data.channels.alt?.state ?? "none"})`,
    );
    logger.info(
      `  main: ${data.channels.main?.releaseId ?? "none"} (${data.channels.main?.state ?? "none"})`,
    );
  } else {
    const ch = channelFilter as Channel;
    const status = data.channels[ch];
    logger.info(`  ${ch}: ${status?.releaseId ?? "none"} (${status?.state ?? "none"})`);
  }

  return {
    data,
    summary: `[leitstand.status] ${systemId}: alt=${data.channels.alt?.releaseId ?? "none"}, main=${data.channels.main?.releaseId ?? "none"}`,
  };
}

// §5.3: leitstand.rollback
export interface LeitstandRollbackData {
  systemId: string;
  channel: Channel;
  rolledBackFrom: string;
  rolledBackTo: string;
  state: "succeeded" | "failed";
  deploymentUrl: string;
}

export async function runLeitstandRollback(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<LeitstandRollbackData>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system");
  const channel = flagString(input, "channel");
  const toReleaseId = flagString(input, "to-release");
  if (!systemId) throw new Error("[leitstand.rollback] --system is required");
  if (!channel || (channel !== "alt" && channel !== "main")) {
    throw new Error("[leitstand.rollback] --channel <alt|main> is required");
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

    const currentRelease = dep.lastPropagated?.[channel as Channel]?.releaseId ?? null;
    if (!currentRelease) {
      throw new Error(
        `[leitstand.rollback] no previous release found for '${systemId}' on channel '${channel}'`,
      );
    }

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

    const channelConfig = getChannelConfig(dep, channel as Channel);
    const adapter = resolveAdapter(dep.adapter);
    const distPath = path.join(workspaceRoot, "releases", targetRelease, "dist");
    const secretsFilePath = await resolveSecretsFilePath(channelConfig.secretsFile);

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
      channel: channel as Channel,
      distPath: effectiveDistPath,
      workerName: channelConfig.workerName,
      url: channelConfig.url,
      secretsFilePath,
    });

    // Update registry — per-channel lastPropagated
    if (!dep.lastPropagated) {
      dep.lastPropagated = {};
    }
    dep.lastPropagated[channel as Channel] = buildLastPropagatedEntry(
      targetRelease,
      result.state === "succeeded" ? "succeeded" : "failed",
      result.state === "succeeded",
      operationId,
    );
    entry.deployment = dep;
    await writeRegistry(workspaceRoot, registry);

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
        channel: channel as Channel,
        rolledBackFrom: currentRelease,
        rolledBackTo: targetRelease,
        state: result.state as "succeeded" | "failed",
        deploymentUrl: result.deploymentUrl,
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
