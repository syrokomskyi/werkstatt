/*
<MODULE_CONTRACT>
  <purpose>RFC-0703: platform.commit.discipline.validate — per-PR CI gate for X-Platform-Bump trailer presence on platform-scope commits.</purpose>
  <non-goals>
    <item>Does not validate trailer values (patch/minor/major) — that is platform.consistency.validate PC-01/PC-02.</item>
    <item>Does not check semantic hash drift — that is platform.consistency.validate PC-01.</item>
    <item>Does not use a fixed cutoff SHA — this command uses --base..HEAD range for per-PR isolation.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0703: initial platform.commit.discipline.validate command handler.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";

import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { hasPlatformScopeFiles, hasTrailer } from "@warpgogol/site-kernel";

export interface PlatformCommitDisciplineResult extends CheckResult {
  command: "platform.commit.discipline.validate";
  base: string;
  platformScopeCommits: number;
  violations: PlatformCommitDisciplineViolation[];
}

export interface PlatformCommitDisciplineViolation {
  sha: string;
  subject: string;
  files: string[];
  message: string;
}

interface GitCommitInfo {
  sha: string;
  parents: string[];
  message: string;
  files: string[];
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

function getGitLogRange(workspaceRoot: string, base: string): GitCommitInfo[] {
  let range: string;
  try {
    const resolvedBase = gitExec(workspaceRoot, `rev-parse --verify "${base}"`);
    const resolvedHead = gitExec(workspaceRoot, "rev-parse HEAD");
    if (resolvedBase === resolvedHead) return [];
    range = `${resolvedBase}..HEAD`;
  } catch {
    throw new Error(`Could not resolve base ref '${base}'. Ensure the ref exists.`);
  }

  const shaOutput = gitExec(workspaceRoot, `log --format=%H --no-merges "${range}"`);
  const shas = shaOutput.split("\n").filter((l) => l.trim().length > 0);
  const commits: GitCommitInfo[] = [];
  for (const sha of shas) {
    const message = gitExec(workspaceRoot, `log --format=%B -n 1 ${sha}`);
    const filesOutput = gitExec(workspaceRoot, `diff-tree --no-commit-id --name-only -r ${sha}`);
    const files = filesOutput.split("\n").filter((l) => l.trim().length > 0);
    const parentsStr = gitExec(workspaceRoot, `log --format=%P -n 1 ${sha}`);
    const parents = parentsStr ? parentsStr.split(" ").filter(Boolean) : [];
    commits.push({ sha, parents, message, files });
  }
  return commits;
}

export async function runPlatformCommitDisciplineValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PlatformCommitDisciplineResult>> {
  const { workspaceRoot } = context;
  const base = flagString(input, "base");

  if (!base) {
    throw new Error(
      "[platform.commit.discipline.validate] --base is required (e.g. --base=origin/main)",
    );
  }

  const commits = getGitLogRange(workspaceRoot, base);

  const violations: PlatformCommitDisciplineViolation[] = [];
  let platformScopeCommits = 0;

  for (const commit of commits) {
    if (!hasPlatformScopeFiles(commit.files)) continue;
    platformScopeCommits++;
    if (!hasTrailer(commit.message, "X-Platform-Bump")) {
      const subject = commit.message.split("\n")[0]?.trim() ?? "";
      violations.push({
        sha: commit.sha,
        subject,
        files: commit.files.filter((f) =>
          ["packages/", "integrations/", "services/"].some((p) => f.startsWith(p)),
        ),
        message:
          "Commit touches platform scope but has no X-Platform-Bump trailer. Use ecosystem.commit for platform-scope changes.",
      });
    }
  }

  const status = violations.length === 0 ? "pass" : "fail";
  const exitCode = violations.length === 0 ? 0 : 1;

  return {
    data: {
      command: "platform.commit.discipline.validate",
      status,
      base,
      platformScopeCommits,
      violations,
      diagnostics: violations.map((v) => ({
        ruleId: "PCD-01",
        severity: "error" as const,
        message: `${v.sha.slice(0, 7)} · ${v.subject} · ${v.message}`,
        data: { sha: v.sha, files: v.files },
      })),
      summary: { error: violations.length, warning: 0, info: 0 },
    },
    exitCode,
    summary:
      violations.length === 0
        ? `[platform.commit.discipline.validate] pass — ${platformScopeCommits} platform-scope commit(s) checked, 0 violations`
        : `[platform.commit.discipline.validate] fail — ${platformScopeCommits} platform-scope commit(s) checked, ${violations.length} violation(s)`,
  };
}
