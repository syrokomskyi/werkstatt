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
  <item>RFC-0560: integrate Ed25519 signed commits via createSignedCommit when PASSPORT_SIGNING_KEY is set.</item>
  <item>RFC-0568: add investigateUntrackedFiles helper and UntrackedFileReport type for cache clone untracked file origin analysis.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { readMissionManifest, resolveMissionDir } from "./mission-io.ts";
import { createSignedCommit } from "./signed-commit.ts";
import { readBordbuch } from "../bordbuch/bordbuch-io.ts";

export interface MissionGitCommitData {
  missionId: string;
  commitSha: string;
  message: string;
  committedAt: string;
  signed: boolean;
  actorId: string | null;
  signature: string | null;
}

export interface WorkpieceDirtyResult {
  dirty: boolean;
  fileCount: number;
  files: string[];
}

export interface UntrackedFileReport {
  path: string;
  createdAt: string;
  sizeBytes: number;
  likelyOrigin: "previous-mission" | "direct-commit" | "unknown";
  originHint?: string;
}

const BOILERPLATE_PATTERNS = [
  /^\.github\/workflows\/deploy-.*\.yml$/,
  /^package\.json$/,
  /^astro\.config\.mjs$/,
  /^wrangler\.jsonc$/,
  /^tsconfig\.json$/,
  /^\.gitignore$/,
  /^postcss\.config\.cjs$/,
  /^\.env\.example$/,
  /^src\/routes\/.*\.astro$/,
  /^src\/pages\/.*\.astro$/,
];

function matchesBoilerplatePattern(filePath: string): boolean {
  return BOILERPLATE_PATTERNS.some((p) => p.test(filePath));
}

export async function investigateUntrackedFiles(
  workspaceRoot: string,
  systemId: string,
  systemDir: string,
  files: string[],
): Promise<UntrackedFileReport[]> {
  const bordbuchEntries = await readBordbuch(workspaceRoot, systemId);
  const missionOpenEntries = bordbuchEntries.filter((e) => e.kind === "mission-open");
  const missionTimeRanges = missionOpenEntries.map((e, i) => {
    const next = missionOpenEntries[i + 1];
    return { start: e.occurredAt, end: next ? next.occurredAt : new Date().toISOString() };
  });

  const reports: UntrackedFileReport[] = [];
  for (const file of files) {
    const fullPath = path.join(systemDir, file);
    let createdAt = "unknown";
    let sizeBytes = 0;
    try {
      const stat = statSync(fullPath);
      createdAt = stat.mtime.toISOString();
      sizeBytes = stat.size;
    } catch {
      // File may have been removed between detection and investigation
    }

    const isBoilerplate = matchesBoilerplatePattern(file);
    const inMissionRange = missionTimeRanges.some(
      (r) => createdAt !== "unknown" && createdAt >= r.start && createdAt <= r.end,
    );

    let likelyOrigin: UntrackedFileReport["likelyOrigin"];
    let originHint: string | undefined;

    if (isBoilerplate && inMissionRange) {
      const matchingRange = missionTimeRanges.find(
        (r) => createdAt !== "unknown" && createdAt >= r.start && createdAt <= r.end,
      );
      likelyOrigin = "previous-mission";
      originHint = matchingRange
        ? `file matches boilerplate pattern and was created during a mission starting at ${matchingRange.start}`
        : undefined;
    } else if (!isBoilerplate && !inMissionRange) {
      likelyOrigin = "direct-commit";
      originHint =
        "file does not match boilerplate patterns and was not created during a known mission";
    } else {
      likelyOrigin = "unknown";
    }

    reports.push({ path: file, createdAt, sizeBytes, likelyOrigin, originHint });
  }
  return reports;
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
  const { workspaceRoot } = context;
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
      signed: false,
      actorId: null,
      signature: null,
    };
    return {
      data,
      summary: `[mission.git.commit] ${missionId} no changes to commit`,
    };
  }

  const signingKey = process.env["PASSPORT_SIGNING_KEY"];
  const actorId = manifest.openedBy ?? "unknown";

  if (signingKey) {
    const result = await createSignedCommit(workpieceDir, message, actorId, signingKey);

    const data: MissionGitCommitData = {
      missionId,
      commitSha: result.commitSha,
      message,
      committedAt: new Date().toISOString(),
      signed: result.signed,
      actorId: result.actorId,
      signature: result.signature,
    };

    return {
      data,
      summary: result.signed
        ? `[mission.git.commit] ${missionId} signed commit: ${result.commitSha.slice(0, 12)}`
        : `[mission.git.commit] ${missionId} committed: ${result.commitSha.slice(0, 12)}`,
    };
  }

  // No signing key — produce unsigned commit
  process.stderr.write(`[warn] PASSPORT_SIGNING_KEY not set — producing unsigned commit.\n`);

  const commitSha = git(workpieceDir, `commit -m ${JSON.stringify(message)}`);

  const data: MissionGitCommitData = {
    missionId,
    commitSha,
    message,
    committedAt: new Date().toISOString(),
    signed: false,
    actorId: null,
    signature: null,
  };

  return {
    data,
    summary: `[mission.git.commit] ${missionId} committed: ${commitSha.slice(0, 12)}`,
  };
}
