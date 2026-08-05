/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/mission/mission-close.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0355: initial mission.close command handler.</item>
  <item>RFC-0477: add reconciledAt guard, bordbuch commit+push, and close-report.json evidence.</item>
  <item>RFC-0480: create git bundle in evidence/ before closing; preserve workpiece for mission.preview.</item>
  <item>RFC-0480: add dirty workpiece guard to mission.close.</item>
  <item>RFC-0522: resolve releaseId with flag→manifest precedence; add warnings[] to CloseReport.</item>
  <item>RFC-0560: use resolveActor(input) for actor resolution with --actor-from-auth flag.</item>
  <item>RFC-0580: auto-commit werkstatt side-effects (registry.yaml, mission.yaml) after writeRegistry.</item>
  <item>RFC-0593: add mission.validate inline gate before lock acquisition; re-check state inside locks.</item>
  <item>RFC-0597: write .materialization-state.json and copy .cache/ from workpiece to cache clone as final step.</item>
  <item>ADR-0010: stop any running dev/preview server for the workpiece before closing the mission.</item>
  <item>RFC-0652: mandatory evidence.sync to R2 before writing close-report.json; --skip-evidence-sync escape hatch with Bordbuch audit entry.</item>
  <item>RFC-0655: add releaseId to CloseReport interface; pass releaseId as top-level option to appendBordbuchEntry.</item>
  <item>RFC-0658: validate bordbuch before appending close event (defense-in-depth for distribution-reuse skip path).</item>
  <item>RFC-0703: auto-pin platform version via sternsystem.pin after registry update, before werkstatt commit.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  readRegistry,
  writeRegistry,
  findEntry,
  resolveCachePath,
  resolveMirrorPath,
} from "../sternsystem/registry-io.ts";
import { readMissionManifest, writeMissionManifest, resolveMissionDir } from "./mission-io.ts";
import { isWorkpieceDirty } from "./mission-git-commit.ts";
import {
  appendBordbuchEntry,
  commitAndPushBordbuch,
  validateBordbuch,
  type BordbuchViolation,
} from "../bordbuch/bordbuch-io.ts";
import {
  runMissionValidate,
  type MissionValidateData,
} from "./mission-materialization-commands.ts";
import { acquireLock, releaseLock, commitWerkstattSideEffects } from "../werkstatt/index.ts";
import { atomicWriteFile } from "../werkstatt/atomic.ts";
import { resolveActor } from "./actor-identity.ts";

// RFC-0597: Media cache directories to persist across missions
const MEDIA_CACHE_DIRS = [".cache/video", ".cache/video-live"];

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export interface CloseReportGit {
  commitSha: string | null;
  pushed: boolean;
  pushError: string | null;
  dirtyFiles: string[];
}

export interface CloseReportMirror {
  originSha: string | null;
  mirrorSha: string | null;
  inSync: boolean;
  recommendation: string | null;
}

export interface CloseReportReconcile {
  reconciledAt: string;
  verified: boolean;
}

export interface CloseReport {
  releaseId: string | null;
  git: CloseReportGit;
  mirror: CloseReportMirror;
  reconcile: CloseReportReconcile;
  warnings: Array<{ rule: string; message: string }>;
}

export interface MissionCloseData {
  missionId: string;
  systemId: string;
  state: "closed";
  closedAt: string;
  releaseId: string | null;
  closeReport: CloseReport;
  evidenceSynced: boolean;
  evidenceSyncResult: { r2KeyPrefix: string; uploadedFiles: number } | null;
  bordbuchValidation: { violations: BordbuchViolation[]; checked: boolean };
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBoolean(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return v === true || v === "true";
}

async function runInlineValidate(
  missionId: string,
  context: KernelRuntimeContext,
): Promise<{ passed: boolean; failures: string[]; report: MissionValidateData | null }> {
  const syntheticInput: KernelCommandInput = { argv: [], flags: { mission: missionId } };
  const result = await runMissionValidate(syntheticInput, context);
  if (result.exitCode !== 1) {
    return { passed: true, failures: [], report: result.data ?? null };
  }
  const failures: string[] = [];
  if (result.data?.contractFull?.validators) {
    for (const v of result.data.contractFull.validators) {
      if (v.status === "fail") {
        failures.push(`${v.name}: exit code ${v.exitCode}`);
      }
    }
  }
  if (failures.length === 0 && result.summary) {
    failures.push(result.summary);
  }
  if (result.data) {
    failures.push(`See evidence/validation-report.json for details`);
  }
  return { passed: false, failures, report: result.data ?? null };
}

function gitExec(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}

export async function runMissionClose(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionCloseData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  const actor = resolveActor(input);
  const releaseIdFlag = flagString(input, "release");
  const skipEvidenceSync = flagBoolean(input, "skip-evidence-sync");

  if (!missionId) throw new Error("[mission.close] --mission is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);

  // RFC-0522: releaseId precedence — flag overrides manifest (written by release.prepare)
  const releaseId = releaseIdFlag ?? manifest.releaseId ?? null;

  if (manifest.state !== "open") {
    throw new Error(
      `[mission.close] mission '${missionId}' is not open (state: ${manifest.state})`,
    );
  }

  if (!manifest.reconciledAt) {
    throw new Error(
      `[mission.close] mission '${missionId}' has not been reconciled — run mission.reconcile first`,
    );
  }

  // RFC-0593: inline validation gate — run mission.validate before acquiring locks.
  // This avoids holding registry/system/mission locks for 2+ minutes during the build.
  // State is re-checked inside the lock after validation passes.
  const validationCheck = await runInlineValidate(missionId, context);
  if (!validationCheck.passed) {
    const failureLines = validationCheck.failures.map((f) => `  ${f}`).join("\n");
    throw new Error(
      `[mission.close] validation failed for mission '${missionId}' — fix issues and re-run mission.validate\n${failureLines}`,
    );
  }

  await acquireLock(workspaceRoot, "registry", manifest.operationId, "mission.close", actor);
  await acquireLock(
    workspaceRoot,
    `system:${manifest.systemId}`,
    manifest.operationId,
    "mission.close",
    actor,
  );
  await acquireLock(
    workspaceRoot,
    `mission:${missionId}`,
    manifest.operationId,
    "mission.close",
    actor,
  );

  try {
    // RFC-0593: re-read manifest inside lock and re-check state — between out-of-lock
    // validation and lock acquisition, another process could have aborted the mission.
    const lockedManifest = await readMissionManifest(workspaceRoot, missionId);
    if (lockedManifest.state !== "open") {
      throw new Error(
        `[mission.close] mission '${missionId}' state changed to '${lockedManifest.state}' during validation — aborting close`,
      );
    }

    const now = new Date().toISOString();

    // RFC-0480: create git bundle from workpiece as audit artifact
    const missionDir = resolveMissionDir(workspaceRoot, missionId);
    const workpieceDir = path.join(missionDir, "workpiece");
    const evidenceDir = path.join(missionDir, "evidence");
    await fs.mkdir(evidenceDir, { recursive: true });

    // ADR-0010: stop any running dev/preview server for the workpiece before
    // transitioning the mission to closed. Best-effort — if no server is running,
    // astro dev stop silently succeeds. This frees the dev port and prevents
    // serving stale content from a closed mission.
    if (existsSync(workpieceDir)) {
      spawnSync("pnpm", ["run", "stop"], {
        cwd: workpieceDir,
        stdio: "ignore",
      });
    }

    const dirtyCheck = isWorkpieceDirty(workpieceDir);
    if (dirtyCheck.dirty) {
      throw new Error(
        `[mission.close] workpiece has ${dirtyCheck.fileCount} uncommitted file(s). Run \`pnpm exec site-kernel run mission.git.commit --mission ${missionId} --message "<msg>"\` first, then re-run close.`,
      );
    }

    if (existsSync(path.join(workpieceDir, ".git"))) {
      const bundlePath = path.join(evidenceDir, "workpiece.git-bundle");
      try {
        execSync(`git bundle create ${JSON.stringify(bundlePath)} --all`, {
          cwd: workpieceDir,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        // Bundle creation failed — non-fatal, close proceeds
      }
    }

    manifest.state = "closed";
    manifest.closedAt = now;
    manifest.closedBy = actor;
    manifest.releaseId = releaseId;

    await writeMissionManifest(workspaceRoot, manifest);

    // RFC-0658: Validate bordbuch integrity before appending the close event.
    // This is defense-in-depth for the distribution-reuse skip path (RFC-0635)
    // where mission.validate skips build.prepare (and thus bordbuch.validate).
    const bordbuchCheck = await validateBordbuch(workspaceRoot, manifest.systemId);
    if (bordbuchCheck.violations.length > 0) {
      const violationLines = bordbuchCheck.violations
        .map((v) => `  [${v.rule}] ${v.message}`)
        .join("\n");
      throw new Error(
        `[mission.close] bordbuch for system '${manifest.systemId}' has ${bordbuchCheck.violations.length} violation(s) — run bordbuch.repair first\n${violationLines}`,
      );
    }

    await appendBordbuchEntry(
      workspaceRoot,
      manifest.systemId,
      "mission-close",
      `Mission ${missionId} closed`,
      actor,
      {
        missionId,
        releaseId,
        writerRole: "mission",
        metadata: releaseId ? { releaseId } : undefined,
      },
    );

    // Commit and push bordbuch to system git repo (RFC-0477)
    const systemDir = await resolveCachePath(workspaceRoot, manifest.systemId);
    const bordbuchResult = await commitAndPushBordbuch(
      systemDir,
      `Bordbuch: mission-close ${missionId}`,
    );

    // Gather dirty files (excluding bordbuch which was just committed)
    let dirtyFiles: string[] = [];
    try {
      const status = gitExec(systemDir, "status --porcelain");
      dirtyFiles = status
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => l.slice(3));
    } catch {
      dirtyFiles = [];
    }

    // Gather mirror status from bare repo
    let originSha: string | null = null;
    let mirrorSha: string | null = null;
    let mirrorInSync = false;
    let recommendation: string | null = null;

    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, manifest.systemId);

    if (entry && entry.mirrors.length > 1) {
      const bareMirror = entry.mirrors[1];
      const bareRepoPath = resolveMirrorPath(workspaceRoot, bareMirror.path);
      if (existsSync(bareRepoPath)) {
        try {
          let branch: string;
          try {
            branch = gitExec(bareRepoPath, "symbolic-ref HEAD").replace("refs/heads/", "");
          } catch {
            branch = "main";
          }
          try {
            originSha = gitExec(bareRepoPath, `rev-parse ${branch}`);
          } catch {
            originSha = null;
          }
          if (entry.mirrors.length > 2) {
            try {
              mirrorSha = gitExec(bareRepoPath, `rev-parse refs/mirror/${branch}`);
            } catch {
              mirrorSha = null;
            }
          }
        } catch {
          // bare repo not accessible
        }
      }
    }

    if (originSha && mirrorSha && originSha !== mirrorSha) {
      mirrorInSync = false;
      recommendation = `Mirror is behind origin. Run: sternsystem.sync --id ${manifest.systemId}`;
    } else if (originSha && mirrorSha && originSha === mirrorSha) {
      mirrorInSync = true;
    } else if (entry && entry.mirrors.length > 2 && !mirrorSha) {
      mirrorInSync = false;
      recommendation = `Mirror ref not found in bare repo. Run: sternsystem.sync --id ${manifest.systemId}`;
    } else {
      mirrorInSync = true;
    }

    // RFC-0522: build warnings array for null releaseId
    const warnings: Array<{ rule: string; message: string }> = [];
    if (!releaseId) {
      warnings.push({
        rule: "missing-release-id",
        message:
          "Mission closed without release — releaseId is null. Run release.prepare after close to associate a release.",
      });
    }

    const closeReport: CloseReport = {
      releaseId,
      git: {
        commitSha: bordbuchResult.commitSha,
        pushed: bordbuchResult.pushed,
        pushError: bordbuchResult.error,
        dirtyFiles,
      },
      mirror: {
        originSha,
        mirrorSha,
        inSync: mirrorInSync,
        recommendation,
      },
      reconcile: {
        reconciledAt: manifest.reconciledAt,
        verified: true,
      },
      warnings,
    };

    // RFC-0652: Mandatory evidence.sync to R2 before writing close-report.json.
    // If evidence.sync fails, mission.close exits 1 with EVIDENCE_SYNC_FAILED — the mission
    // cannot close without archiving evidence to R2. The --skip-evidence-sync flag is an
    // escape hatch for offline close (e.g., no R2 credentials available).
    let evidenceSynced = false;
    let evidenceSyncResult: { r2KeyPrefix: string; uploadedFiles: number } | null = null;

    if (skipEvidenceSync) {
      logger.warn(
        `  Evidence sync skipped — local evidence will be lost when mission.cleanup runs`,
      );
      // Append Bordbuch entry to make the escape hatch auditable
      try {
        await appendBordbuchEntry(
          workspaceRoot,
          manifest.systemId,
          "mission-close",
          `mission-close-evidence-skipped: ${missionId}`,
          actor,
          {
            missionId,
            writerRole: "mission",
            metadata: { evidenceSyncSkipped: true, reason: "operator-used-skip-evidence-sync" },
          },
        );
      } catch (bordbuchErr) {
        logger.warn(
          `  Warning: failed to append evidence-skipped Bordbuch entry: ${bordbuchErr instanceof Error ? bordbuchErr.message : String(bordbuchErr)}`,
        );
      }
    } else {
      const axiomEvidenceDir = path.join(missionDir, "evidence", "axiom");
      const metadataPath = path.join(axiomEvidenceDir, "evidence-metadata.json");
      if (existsSync(axiomEvidenceDir) && existsSync(metadataPath)) {
        try {
          const { executeKernelCommand } = await import("@warpgogol/site-kernel");
          const syncResult = (await executeKernelCommand({
            workspaceRoot,
            commandName: "evidence.sync",
            argv: [`--mission=${missionId}`],
          })) as {
            data?: { r2KeyPrefix?: string; uploadedFiles?: string[] };
            exitCode?: number;
          };
          evidenceSynced = true;
          const syncData = syncResult.data;
          if (syncData) {
            evidenceSyncResult = {
              r2KeyPrefix: syncData.r2KeyPrefix ?? "",
              uploadedFiles: syncData.uploadedFiles?.length ?? 0,
            };
          }
          logger.info(`  Evidence synced to R2`);
        } catch (syncError) {
          logger.error(`  Evidence sync failed — mission cannot close without archiving evidence`);
          throw new Error(
            `EVIDENCE_SYNC_FAILED: ${syncError instanceof Error ? syncError.message : String(syncError)}`,
          );
        }
      } else if (existsSync(axiomEvidenceDir)) {
        // evidence/axiom/ exists but no evidence-metadata.json — mission never ran mission.check
        logger.warn(
          `  Evidence directory exists but evidence-metadata.json is missing — skipping sync (no Axiom evidence to archive)`,
        );
      }
    }

    // Write close-report.json to evidence directory
    const evidencePath = path.join(missionDir, "evidence", "close-report.json");
    await atomicWriteFile(evidencePath, JSON.stringify(closeReport, null, 2) + "\n");

    if (entry && entry.currentMission === missionId) {
      entry.currentMission = null;
      await writeRegistry(workspaceRoot, registry);
    }

    // RFC-0703: Auto-pin platform version on mission close.
    // Called within the existing lock scope (registry, system, mission locks held).
    // sternsystem.pin reads/writes the registry without acquiring locks — safe here.
    // Pin's writeRegistry overwrites the registry with both currentMission: null AND pinnedPlatform updated.
    // commitWerkstattSideEffects then commits the combined registry change in one commit.
    try {
      const { executeKernelCommand } = await import("@warpgogol/site-kernel");
      const pinResult = (await executeKernelCommand({
        workspaceRoot,
        commandName: "sternsystem.pin",
        argv: [`--id=${manifest.systemId}`],
      })) as {
        exitCode?: number;
        summary?: string;
      };
      const pinExitCode = pinResult.exitCode ?? 0;
      if (pinExitCode !== 0) {
        throw new Error(
          `sternsystem.pin failed with exitCode ${pinExitCode}: ${pinResult.summary ?? "no summary"}`,
        );
      }
      logger.info(`  Auto-pinned platform version for ${manifest.systemId}`);
    } catch (pinError) {
      throw new Error(
        `[mission.close] sternsystem.pin failed for '${manifest.systemId}': ${pinError instanceof Error ? pinError.message : String(pinError)}`,
      );
    }

    // RFC-0703: Commit system.pin.json to cache clone after pin
    try {
      const systemDir = await resolveCachePath(workspaceRoot, manifest.systemId);
      gitExec(systemDir, "add system.pin.json");
      gitExec(
        systemDir,
        `commit -m ${JSON.stringify(`chore: auto-pin platform version for ${missionId}`)}`,
      );
      logger.info(`  Committed system.pin.json to cache clone`);
    } catch {
      // Nothing to commit or git not available — non-fatal
    }

    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [path.join("systems", "registry.yaml"), path.join("missions", missionId, "mission.yaml")],
      `werkstatt: mission.close ${missionId}`,
    );

    // RFC-0597: Write materialization state file and copy .cache/ to cache clone.
    // This is the FINAL step — only executed after the close has succeeded (bundle created,
    // bordbuch committed, state transitioned to closed). If close failed midway, no state
    // file is written — next materialization runs full preflight (safe fallback).
    try {
      const systemDir = await resolveCachePath(workspaceRoot, manifest.systemId);
      // Get current cache clone HEAD
      let cacheCloneHead: string | null = null;
      try {
        cacheCloneHead = execSync("git rev-parse HEAD", {
          cwd: systemDir,
          stdio: "pipe",
          encoding: "utf-8",
        }).trim();
      } catch {
        // cache clone HEAD cannot be resolved — skip state file write
      }
      if (cacheCloneHead) {
        const stateFile = {
          systemId: manifest.systemId,
          cacheCloneHead,
          lastValidatedAt: now,
          lastMissionId: missionId,
        };
        await atomicWriteFile(
          path.join(systemDir, ".materialization-state.json"),
          JSON.stringify(stateFile, null, 2) + "\n",
        );
        logger.info(`  Wrote .materialization-state.json (HEAD: ${cacheCloneHead.slice(0, 12)})`);
        // Commit .materialization-state.json to prevent dirty cache clone (RFC-0597 fix)
        try {
          gitExec(systemDir, "add .materialization-state.json");
          gitExec(
            systemDir,
            `commit -m ${JSON.stringify(`chore: update materialization state for ${missionId}`)}`,
          );
          logger.info(`  Committed .materialization-state.json to cache clone`);
        } catch {
          // Nothing to commit or git not available — non-fatal
        }
      }

      // Copy .cache/video/ and .cache/video-live/ from workpiece to cache clone
      const workpieceDir = path.join(missionDir, "workpiece");
      for (const cacheDir of MEDIA_CACHE_DIRS) {
        const srcCache = path.join(workpieceDir, cacheDir);
        if (existsSync(srcCache)) {
          const destCache = path.join(systemDir, cacheDir);
          try {
            // Replace (not merge) — clean copy from workpiece
            if (existsSync(destCache)) {
              await fs.rm(destCache, { recursive: true, force: true });
            }
            // Ensure parent directory exists
            await fs.mkdir(path.dirname(destCache), { recursive: true });
            // Copy recursively
            await copyDirRecursive(srcCache, destCache);
            logger.info(`  Copied ${cacheDir} from workpiece to cache clone`);
          } catch (err) {
            logger.info(
              `  Warning: failed to copy ${cacheDir} to cache clone: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    } catch (err) {
      logger.info(
        `  Warning: failed to write materialization state or copy .cache/: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      data: {
        missionId,
        systemId: manifest.systemId,
        state: "closed",
        closedAt: now,
        releaseId,
        closeReport,
        evidenceSynced,
        evidenceSyncResult,
        bordbuchValidation: { violations: [], checked: true },
      },
      summary: `[mission.close] closed mission ${missionId}`,
    };
  } finally {
    await releaseLock(workspaceRoot, `mission:${missionId}`);
    await releaseLock(workspaceRoot, `system:${manifest.systemId}`);
    await releaseLock(workspaceRoot, "registry");
  }
}
