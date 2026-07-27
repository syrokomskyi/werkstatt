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
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { readRegistry, writeRegistry, findEntry } from "../sternsystem/registry-io.ts";
import { readMissionManifest, writeMissionManifest, resolveMissionDir } from "./mission-io.ts";
import { isWorkpieceDirty } from "./mission-git-commit.ts";
import { appendBordbuchEntry, commitAndPushBordbuch } from "../bordbuch/bordbuch-io.ts";
import { acquireLock, releaseLock } from "../werkstatt/index.ts";
import { atomicWriteFile } from "../werkstatt/atomic.ts";

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
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function gitExec(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}

function resolveRepoPath(workspaceRoot: string, repo: string): string {
  if (repo.startsWith("local:")) {
    return path.resolve(workspaceRoot, repo.slice("local:".length));
  }
  if (repo.startsWith("./") || repo.startsWith("../") || repo.startsWith("/")) {
    return path.resolve(workspaceRoot, repo);
  }
  return repo;
}

export async function runMissionClose(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionCloseData>> {
  const { workspaceRoot } = context;
  const missionId = flagString(input, "mission");
  const actor = flagString(input, "_authActor") ?? flagString(input, "actor") ?? "agent";
  const releaseIdFlag = flagString(input, "release");

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
    const now = new Date().toISOString();

    // RFC-0480: create git bundle from workpiece as audit artifact
    const missionDir = resolveMissionDir(workspaceRoot, missionId);
    const workpieceDir = path.join(missionDir, "workpiece");
    const evidenceDir = path.join(missionDir, "evidence");
    await fs.mkdir(evidenceDir, { recursive: true });

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

    await appendBordbuchEntry(
      workspaceRoot,
      manifest.systemId,
      "mission-close",
      `Mission ${missionId} closed`,
      actor,
      {
        missionId,
        writerRole: "mission",
        metadata: releaseId ? { releaseId } : undefined,
      },
    );

    // Commit and push bordbuch to system git repo (RFC-0477)
    const systemDir = path.join(workspaceRoot, "systems", manifest.systemId);
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

    if (entry?.repo) {
      const bareRepoPath = resolveRepoPath(workspaceRoot, entry.repo);
      if (existsSync(bareRepoPath)) {
        try {
          let branch: string;
          try {
            branch = gitExec(bareRepoPath, "symbolic-ref HEAD").replace("refs/heads/", "");
          } catch {
            branch = "master";
          }
          try {
            originSha = gitExec(bareRepoPath, `rev-parse ${branch}`);
          } catch {
            originSha = null;
          }
          if (entry.mirror) {
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
    } else if (entry?.mirror && !mirrorSha) {
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
          "Mission closed without release — releaseId is null. Run release.prepare before close to associate a release.",
      });
    }

    const closeReport: CloseReport = {
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

    // Write close-report.json to evidence directory
    const evidencePath = path.join(missionDir, "evidence", "close-report.json");
    await atomicWriteFile(evidencePath, JSON.stringify(closeReport, null, 2) + "\n");

    if (entry && entry.currentMission === missionId) {
      entry.currentMission = null;
      await writeRegistry(workspaceRoot, registry);
    }

    return {
      data: {
        missionId,
        systemId: manifest.systemId,
        state: "closed",
        closedAt: now,
        releaseId,
        closeReport,
      },
      summary: `[mission.close] closed mission ${missionId}`,
    };
  } finally {
    await releaseLock(workspaceRoot, `mission:${missionId}`);
    await releaseLock(workspaceRoot, `system:${manifest.systemId}`);
    await releaseLock(workspaceRoot, "registry");
  }
}
