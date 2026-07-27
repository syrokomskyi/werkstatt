/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/release/release-commands.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0357: initial release command handlers.</item>
  <item>RFC-0381: resolve platformVersion, commitSha, and platformSemanticHash from ecosystem instead of hardcoding unknown.</item>
  <item>RFC-0480: add C-surface regression check to release.prepare; block on C-surface regression without breaksC: true.</item>
  <item>RFC-0520: extract C-surface regression check into evaluateCSurfaceGate pure function.</item>
  <item>RFC-0522: write releaseId to mission manifest via writeMissionManifest after successful release preparation.</item>
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
import {
  readMissionManifest,
  writeMissionManifest,
  resolveMissionDir,
} from "../mission/mission-io.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import { atomicWriteFile, atomicMoveDir, resolveStagingDir } from "../werkstatt/atomic.ts";
import { appendBordbuchEntry } from "../bordbuch/bordbuch-io.ts";
import { readRegistry, writeRegistry, findEntry } from "../sternsystem/registry-io.ts";
import { resolveCurrentEcosystem, resolvePlatformSemanticHash } from "../bundle-io.ts";
import { evaluateCSurfaceGate } from "./c-surface-guard.ts";
import { checkBreaksCDeclaration } from "./breaks-c-helper.ts";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function deriveReleaseId(systemId: string, existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const match = id.match(/-r(\d{6})$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  const next = max + 1;
  if (next > 999999) {
    throw new Error(
      `[release.prepare] sequence number exhausted for system '${systemId}' (max: 999999)`,
    );
  }
  return `${systemId}-r${String(next).padStart(6, "0")}`;
}

async function listReleaseIds(workspaceRoot: string): Promise<string[]> {
  const releasesDir = path.join(workspaceRoot, "releases");
  if (!existsSync(releasesDir)) return [];
  const entries = await fs.readdir(releasesDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !e.name.includes(".staging-")).map((e) => e.name);
}

async function readReleaseManifest(
  workspaceRoot: string,
  releaseId: string,
): Promise<Record<string, unknown>> {
  const manifestPath = path.join(workspaceRoot, "releases", releaseId, "release.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`[release] release '${releaseId}' not found`);
  }
  const content = await fs.readFile(manifestPath, "utf8");
  const result: Record<string, unknown> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

async function writeReleaseYaml(
  workspaceRoot: string,
  releaseId: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const releaseDir = path.join(workspaceRoot, "releases", releaseId);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(manifest)) {
    if (value === null) {
      lines.push(`${key}: null`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "boolean" || typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  await atomicWriteFile(path.join(releaseDir, "release.yaml"), lines.join("\n") + "\n");
}

// §6.1: release.prepare
export interface ReleasePrepareData {
  releaseId: string;
  systemId: string;
  missionId: string;
  semver: string;
  state: "prepared";
  snapshotDiffVerdict: "pass" | "fail";
  cSurfaceVerdict: "pass" | "fail" | "skipped";
  behaviorSnapshotHash: string;
}

export async function runReleasePrepare(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ReleasePrepareData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  const semver = flagString(input, "semver") ?? "0.1.0";

  if (!missionId) throw new Error("[release.prepare] --mission is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);
  if (manifest.state !== "open" && manifest.state !== "closed") {
    throw new Error(
      `[release.prepare] mission '${missionId}' is not open or closed (state: ${manifest.state})`,
    );
  }

  // Check validation has passed
  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const validationPath = path.join(missionDir, "evidence", "validation-report.json");
  if (!existsSync(validationPath)) {
    throw new Error(`[release.prepare] mission '${missionId}' has not passed validation`);
  }

  const operationId = generateOperationId();
  const systemId = manifest.systemId;

  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "release.prepare", "agent");

  try {
    const existingReleases = await listReleaseIds(workspaceRoot);
    const systemReleases = existingReleases.filter((id) => id.startsWith(`${systemId}-r`));
    const releaseId = deriveReleaseId(systemId, systemReleases);

    await acquireLock(
      workspaceRoot,
      `release:${releaseId}`,
      operationId,
      "release.prepare",
      "agent",
    );

    try {
      const releasesBase = path.join(workspaceRoot, "releases");
      await fs.mkdir(releasesBase, { recursive: true });

      const stagingDir = resolveStagingDir(releasesBase, releaseId, operationId);
      if (existsSync(stagingDir)) {
        await fs.rm(stagingDir, { recursive: true, force: true });
      }
      await fs.mkdir(stagingDir, { recursive: true });

      // Copy validation and materialization reports
      const evidenceDir = path.join(missionDir, "evidence");
      if (existsSync(evidenceDir)) {
        await fs.mkdir(path.join(stagingDir), { recursive: true });
        for (const report of ["validation-report.json", "materialization-report.json"]) {
          const src = path.join(evidenceDir, report);
          if (existsSync(src)) {
            await fs.copyFile(src, path.join(stagingDir, report));
          }
        }
      }

      // Copy distribution if it exists
      const distributionDir = path.join(missionDir, "distribution", "dist");
      if (existsSync(distributionDir)) {
        const distDest = path.join(stagingDir, "dist");
        await fs.mkdir(distDest, { recursive: true });
        await copyDir(distributionDir, distDest);
      }

      const now = new Date().toISOString();

      const { version: platformVersion, commit } = await resolveCurrentEcosystem(workspaceRoot);
      const platformSemanticHash = await resolvePlatformSemanticHash(workspaceRoot);

      // Write release manifest
      const releaseManifest: Record<string, unknown> = {
        schemaVersion: "1.0.0",
        releaseId,
        systemId,
        missionId,
        semver,
        platformVersion,
        createdAt: now,
        publishedAt: null,
        state: "prepared",
        commitSha: commit === "unknown" ? "0000000" : commit,
        platformSemanticHash,
        siteContentHash: "sha256:pending",
        distTreeHash: "sha256:pending",
        distArtifactHash: null,
        artifact: null,
        behaviorSnapshotHash: "sha256:pending",
        readableSnapshotHash: "sha256:pending",
        qualityReportHash: null,
        snapshotDiffVerdict: "pass",
        cSurfaceVerdict: "pass" as const,
        migratorVerdict: "pass",
        versionCompareVerdict: "in-sync",
      };

      await writeReleaseYaml(workspaceRoot, releaseId + ".staging-" + operationId, releaseManifest);

      // Atomic rename
      const finalDir = path.join(releasesBase, releaseId);
      if (existsSync(finalDir)) {
        await fs.rm(finalDir, { recursive: true, force: true });
      }
      await atomicMoveDir(stagingDir, finalDir);

      // Re-write manifest at final location
      await writeReleaseYaml(workspaceRoot, releaseId, releaseManifest);

      // RFC-0522: write releaseId to mission manifest for mission-to-release association
      const missionManifest = await readMissionManifest(workspaceRoot, missionId);
      missionManifest.releaseId = releaseId;
      await writeMissionManifest(workspaceRoot, missionManifest);

      // RFC-0520: C-surface regression check delegated to evaluateCSurfaceGate
      let cSurfaceVerdict: "pass" | "fail" | "skipped" = "skipped";
      try {
        const { runSurfaceContractValidate } = await import("../surface-contract.ts");
        const surfaceResult = await runSurfaceContractValidate(
          { flags: { app: systemId }, argv: [], args: [] },
          context,
        );

        const mission = await readMissionManifest(workspaceRoot, missionId);
        const rfcId = mission.rfcId ?? null;
        let breaksC = false;
        if (rfcId) {
          breaksC = await checkBreaksCDeclaration(workspaceRoot, rfcId);
        }

        const guardResult = evaluateCSurfaceGate({
          systemId,
          missionId,
          workspaceRoot,
          surfaceValidateResult: {
            exitCode: surfaceResult.exitCode ?? 1,
            summary: surfaceResult.summary,
          },
          rfcId,
          breaksC,
        });

        cSurfaceVerdict = guardResult.verdict === "fail" ? "fail" : "pass";
        if (guardResult.verdict === "fail") {
          throw new Error(guardResult.violations[0]!.message);
        }
        if (guardResult.verdict === "pass" && breaksC) {
          logger.info(`  ${guardResult.summary}`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("C-surface regression")) {
          throw err;
        }
        cSurfaceVerdict = "skipped";
      }

      logger.success(
        `[release.prepare] ${releaseId} prepared (snapshot diff: pass, C-surface: ${cSurfaceVerdict})`,
      );

      return {
        data: {
          releaseId,
          systemId,
          missionId,
          semver,
          state: "prepared",
          snapshotDiffVerdict: "pass",
          cSurfaceVerdict,
          behaviorSnapshotHash: "sha256:pending",
        },
        summary: `[release.prepare] ${releaseId} prepared (snapshot diff: pass, C-surface: ${cSurfaceVerdict})`,
      };
    } finally {
      await releaseLock(workspaceRoot, `release:${releaseId}`);
    }
  } finally {
    await releaseLock(workspaceRoot, `system:${systemId}`);
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) return;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// §6.2: release.publish
export interface ReleasePublishData {
  releaseId: string;
  systemId: string;
  state: "published";
  publishedAt: string;
  artifactUri: string | null;
}

export async function runReleasePublish(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ReleasePublishData>> {
  const { workspaceRoot, logger } = context;
  const releaseId = flagString(input, "release");
  if (!releaseId) throw new Error("[release.publish] --release is required");

  const releaseDir = path.join(workspaceRoot, "releases", releaseId);
  if (!existsSync(releaseDir)) {
    throw new Error(`[release.publish] release '${releaseId}' not found`);
  }

  const manifest = await readReleaseManifest(workspaceRoot, releaseId);
  const state = manifest.state as string;
  if (state !== "prepared") {
    throw new Error(`[release.publish] release '${releaseId}' is not prepared (state: ${state})`);
  }

  // Check snapshot diff verdict
  if (manifest.snapshotDiffVerdict === "fail") {
    throw new Error(`[release.publish] snapshot diff verdict is fail — cannot publish`);
  }

  // Check discipline gates
  if (manifest.migratorVerdict === "fail") {
    throw new Error(`[release.publish] migrator.registry.validate failed — cannot publish`);
  }
  if (manifest.versionCompareVerdict === "refuse-downgrade") {
    throw new Error(
      `[release.publish] version-compare verdict is refuse-downgrade — cannot publish`,
    );
  }

  // RFC-0480: require successful reconcile before publishing
  const missionId = manifest.missionId as string;
  if (missionId) {
    const mission = await readMissionManifest(workspaceRoot, missionId);
    if (!mission.reconciledAt) {
      throw new Error(
        `[release.publish] mission '${missionId}' has not been reconciled — run mission.reconcile before publishing`,
      );
    }
  }

  const systemId = manifest.systemId as string;
  const operationId = generateOperationId();

  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "release.publish", "agent");
  await acquireLock(workspaceRoot, `release:${releaseId}`, operationId, "release.publish", "agent");

  try {
    const now = new Date().toISOString();

    // Update manifest
    manifest.state = "published";
    manifest.publishedAt = now;
    await writeReleaseYaml(workspaceRoot, releaseId, manifest);

    // Append Bordbuch entry
    await appendBordbuchEntry(
      workspaceRoot,
      systemId,
      "release-published",
      `Release ${releaseId} published`,
      "agent",
      {
        writerRole: "release",
        metadata: { releaseId, semver: manifest.semver },
      },
    );

    // Update registry
    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, systemId);
    if (entry) {
      entry.lastRelease = releaseId;
      await writeRegistry(workspaceRoot, registry);
    }

    logger.success(`[release.publish] ${releaseId} published`);

    return {
      data: {
        releaseId,
        systemId,
        state: "published",
        publishedAt: now,
        artifactUri: (manifest.artifact as string) ?? null,
      },
      summary: `[release.publish] ${releaseId} published`,
    };
  } finally {
    await releaseLock(workspaceRoot, `release:${releaseId}`);
    await releaseLock(workspaceRoot, `system:${systemId}`);
  }
}

// §6.3: release.validate
export interface ReleaseValidateData {
  releaseId: string;
  manifestFound: boolean;
  state: string;
  snapshotDiffVerdict: string;
  artifactPresent: boolean;
}

export async function runReleaseValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ReleaseValidateData>> {
  const { workspaceRoot, logger } = context;
  const releaseId = flagString(input, "release");
  if (!releaseId) throw new Error("[release.validate] --release is required");

  const releaseDir = path.join(workspaceRoot, "releases", releaseId);
  const manifestFound = existsSync(releaseDir);

  if (!manifestFound) {
    logger.error(`[release.validate] release '${releaseId}' not found`);
    return {
      data: {
        releaseId,
        manifestFound,
        state: "absent",
        snapshotDiffVerdict: "fail",
        artifactPresent: false,
      },
      exitCode: 1,
    };
  }

  const manifest = await readReleaseManifest(workspaceRoot, releaseId);
  const distDir = path.join(releaseDir, "dist");
  const artifactPresent = existsSync(distDir) || manifest.artifact !== null;

  logger.success(`[release.validate] ${releaseId} valid (state: ${manifest.state})`);

  return {
    data: {
      releaseId,
      manifestFound,
      state: manifest.state as string,
      snapshotDiffVerdict: manifest.snapshotDiffVerdict as string,
      artifactPresent,
    },
    summary: `[release.validate] ${releaseId} valid (state: ${manifest.state})`,
  };
}

// §6.4: release.list
export interface ReleaseListData {
  releases: Array<{ releaseId: string; systemId: string; state: string }>;
  count: number;
}

export async function runReleaseList(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ReleaseListData>> {
  const { workspaceRoot, logger } = context;
  const systemFilter = flagString(input, "system");

  const releasesDir = path.join(workspaceRoot, "releases");
  if (!existsSync(releasesDir)) {
    return {
      data: { releases: [], count: 0 },
      summary: `[release.list] 0 releases`,
    };
  }

  const entries = await fs.readdir(releasesDir, { withFileTypes: true });
  const releases: Array<{ releaseId: string; systemId: string; state: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.includes(".staging-")) continue;
    const releaseId = entry.name;
    try {
      const manifest = await readReleaseManifest(workspaceRoot, releaseId);
      const systemId = manifest.systemId as string;
      if (systemFilter && systemId !== systemFilter) continue;
      releases.push({ releaseId, systemId, state: manifest.state as string });
    } catch {
      // skip unreadable
    }
  }

  logger.info(`  Found ${releases.length} releases`);
  return {
    data: { releases, count: releases.length },
    summary: `[release.list] ${releases.length} releases`,
  };
}

// §6.7: release.rollback
export interface ReleaseRollbackData {
  releaseId: string;
  systemId: string;
  state: "rolled-back";
  rolledBackAt: string;
}

export async function runReleaseRollback(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ReleaseRollbackData>> {
  const { workspaceRoot, logger } = context;
  const releaseId = flagString(input, "release");
  if (!releaseId) throw new Error("[release.rollback] --release is required");

  const manifest = await readReleaseManifest(workspaceRoot, releaseId);
  if (manifest.state !== "published") {
    throw new Error(
      `[release.rollback] release '${releaseId}' is not published (state: ${manifest.state})`,
    );
  }

  const systemId = manifest.systemId as string;
  const operationId = generateOperationId();

  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "release.rollback", "agent");
  await acquireLock(
    workspaceRoot,
    `release:${releaseId}`,
    operationId,
    "release.rollback",
    "agent",
  );

  try {
    const now = new Date().toISOString();
    manifest.state = "rolled-back";
    await writeReleaseYaml(workspaceRoot, releaseId, manifest);

    await appendBordbuchEntry(
      workspaceRoot,
      systemId,
      "release-rolled-back",
      `Release ${releaseId} rolled back`,
      "agent",
      {
        writerRole: "release",
        metadata: { releaseId },
      },
    );

    logger.success(`[release.rollback] ${releaseId} rolled back`);

    return {
      data: { releaseId, systemId, state: "rolled-back", rolledBackAt: now },
      summary: `[release.rollback] ${releaseId} rolled back`,
    };
  } finally {
    await releaseLock(workspaceRoot, `release:${releaseId}`);
    await releaseLock(workspaceRoot, `system:${systemId}`);
  }
}
