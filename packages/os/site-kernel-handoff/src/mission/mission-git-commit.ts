/*
<MODULE_CONTRACT>
<purpose>RFC-0480: mission.git.commit — canonical operator edit commit command for mission workpiece.</purpose>
<non-goals>
  <item>Does not reconcile — use mission.reconcile for that.</item>
  <item>Does not validate — use mission.validate for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0480: initial mission.git.commit command handler.</item>
  <item>RFC-0480: add isWorkpieceDirty() shared helper for dirty workpiece guards.</item>
  <item>RFC-0522: extend WorkpieceDirtyResult with files[] for cache clone guard error messages.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { readMissionManifest, resolveMissionDir } from "./mission-io.ts";

export interface MissionGitCommitData {
  missionId: string;
  commitSha: string;
  message: string;
  committedAt: string;
}

export interface WorkpieceDirtyResult {
  dirty: boolean;
  fileCount: number;
  files: string[];
}

export interface OperatorCommitsResult {
  hasOperatorCommits: boolean;
  commitCount: number;
  commits: string[];
}

export function countOperatorCommits(
  workpieceDir: string,
  migratedAt: string | null,
): OperatorCommitsResult {
  if (!existsSync(path.join(workpieceDir, ".git"))) {
    return { hasOperatorCommits: false, commitCount: 0, commits: [] };
  }

  let rootSha: string;
  try {
    rootSha = execSync("git rev-list --max-parents=0 HEAD", {
      cwd: workpieceDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return { hasOperatorCommits: false, commitCount: 0, commits: [] };
  }

  let output: string;
  try {
    output = execSync(`git rev-list ${rootSha}..HEAD --oneline`, {
      cwd: workpieceDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return { hasOperatorCommits: false, commitCount: 0, commits: [] };
  }

  const allCommits = output ? output.split("\n") : [];
  const baselineCount = migratedAt ? 1 : 0;
  const operatorCommits = allCommits.slice(baselineCount);

  return {
    hasOperatorCommits: operatorCommits.length > 0,
    commitCount: operatorCommits.length,
    commits: operatorCommits,
  };
}

export function isWorkpieceDirty(workpieceDir: string): WorkpieceDirtyResult {
  if (!existsSync(path.join(workpieceDir, ".git"))) {
    return { dirty: false, fileCount: 0, files: [] };
  }
  let output: string;
  try {
    // Use execSync directly (not the git() helper) to avoid trimming leading spaces
    // in git status --porcelain output (e.g. " M file.txt" → "M file.txt" would break slice(3))
    output = execSync("git status --porcelain", {
      cwd: workpieceDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return { dirty: false, fileCount: 0, files: [] };
  }
  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  const files = lines.map((l) => l.slice(3).trim());
  return { dirty: lines.length > 0, fileCount: lines.length, files };
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export async function runMissionGitCommit(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionGitCommitData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  const message = flagString(input, "message");

  if (!missionId) throw new Error("[mission.git.commit] --mission is required");
  if (!message) throw new Error("[mission.git.commit] --message is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);

  if (manifest.state !== "open") {
    throw new Error(
      `[mission.git.commit] mission '${missionId}' is not open (state: ${manifest.state})`,
    );
  }

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const workpieceDir = path.join(missionDir, "workpiece");

  if (!existsSync(workpieceDir)) {
    throw new Error(
      `[mission.git.commit] workpiece not found for mission '${missionId}' — run mission.materialize first`,
    );
  }

  if (!existsSync(path.join(workpieceDir, ".git"))) {
    throw new Error(
      `[mission.git.commit] workpiece is not a git repository — run mission.materialize first`,
    );
  }

  // Stage all changes
  git(workpieceDir, "add -A");

  // Check if there are changes to commit
  let hasChanges: boolean;
  try {
    git(workpieceDir, "diff --cached --quiet");
    hasChanges = false;
  } catch {
    hasChanges = true;
  }

  if (!hasChanges) {
    const data: MissionGitCommitData = {
      missionId,
      commitSha: git(workpieceDir, "rev-parse HEAD"),
      message: "(no changes — workpiece is clean)",
      committedAt: new Date().toISOString(),
    };
    return {
      data,
      summary: `[mission.git.commit] ${missionId} no changes to commit`,
    };
  }

  const commitSha = git(workpieceDir, `commit -m ${JSON.stringify(message)}`);

  logger.success(`[mission.git.commit] ${missionId} committed: ${commitSha.slice(0, 12)}`);

  const data: MissionGitCommitData = {
    missionId,
    commitSha,
    message,
    committedAt: new Date().toISOString(),
  };

  return {
    data,
    summary: `[mission.git.commit] ${missionId} committed: ${commitSha.slice(0, 12)}`,
  };
}
