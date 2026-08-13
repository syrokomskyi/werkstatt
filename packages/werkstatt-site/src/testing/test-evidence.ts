/*
<MODULE_CONTRACT>
<purpose>RFC-0829: Test evidence types, storage helpers, verification and listing logic.
Provides recordTestEvidence, verifyTestEvidence, listTestEvidence, and resolveEvidenceDir
for use by test commands and deployment pipeline gates.</purpose>
<non-goals>
  <item>Do not register kernel commands — that lives in testing/module.ts.</item>
  <item>Do not integrate with deployment pipelines — that lives in leitstand commands.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0829: initial test evidence module with types, helpers, verify, list, record.</item>
  <item>RFC-0829 review: replace local atomicWriteFile with import from @warpgogol/werkstatt/handoff.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "@warpgogol/werkstatt/handoff";

export type TestLevel = "L1" | "L2" | "L3" | "L4" | "L5";

export interface TestFailure {
  testName: string;
  message: string;
  file: string;
}

export interface TestEvidence {
  testRunId: string;
  level: TestLevel;
  targetId: string;
  commitSha: string;
  passed: boolean;
  durationMs: number;
  timestamp: string;
  failures: TestFailure[];
}

export interface TestEvidenceLevelResult {
  level: string;
  found: boolean;
  passed: boolean;
  commitShaMatch: boolean;
  timestamp: string | null;
  failures?: TestFailure[];
}

export interface TestEvidenceVerifyResult {
  command: "test.evidence.verify";
  status: "pass" | "fail";
  target: string;
  levels: TestEvidenceLevelResult[];
  summary: string;
  gracePeriod: boolean;
}

export interface TestEvidenceListEntry {
  level: string;
  passed: boolean;
  commitSha: string;
  timestamp: string;
  testRunId: string;
}

export interface TestEvidenceListResult {
  command: "test.evidence.list";
  target: string;
  evidence: TestEvidenceListEntry[];
}

const GRACE_PERIOD_END = "2026-09-10";

function isInGracePeriod(): boolean {
  return new Date().toISOString() < GRACE_PERIOD_END;
}

export function resolveEvidenceDir(
  workspaceRoot: string,
  target: string,
  options: { releaseId?: string; service?: string },
): string {
  if (options.releaseId) {
    return join(workspaceRoot, "releases", options.releaseId, ".test-evidence");
  }
  if (options.service) {
    return join(workspaceRoot, "services", options.service, ".test-evidence");
  }
  return join(workspaceRoot, "releases", target, ".test-evidence");
}

export async function recordTestEvidence(
  workspaceRoot: string,
  target: string,
  evidence: TestEvidence,
  options: { releaseId?: string; service?: string },
): Promise<void> {
  const evidenceDir = resolveEvidenceDir(workspaceRoot, target, options);
  const evidenceFile = join(evidenceDir, `${evidence.level}.json`);
  await atomicWriteFile(evidenceFile, JSON.stringify(evidence, null, 2) + "\n");
}

export async function verifyTestEvidence(
  workspaceRoot: string,
  target: string,
  levels: string[],
  commitSha: string,
  options: { releaseId?: string; service?: string },
): Promise<TestEvidenceVerifyResult> {
  const evidenceDir = resolveEvidenceDir(workspaceRoot, target, options);
  const grace = isInGracePeriod();
  const dirExists = existsSync(evidenceDir);

  if (!dirExists && grace) {
    return {
      command: "test.evidence.verify",
      status: "pass",
      target,
      levels: levels.map((level) => ({
        level,
        found: false,
        passed: false,
        commitShaMatch: false,
        timestamp: null,
      })),
      summary: `No test evidence directory found at ${evidenceDir} — grace period active (until ${GRACE_PERIOD_END}). Run tests on the dev channel before ${GRACE_PERIOD_END}.`,
      gracePeriod: true,
    };
  }

  const levelResults: TestEvidenceLevelResult[] = [];

  for (const level of levels) {
    const evidenceFile = join(evidenceDir, `${level}.json`);

    if (!existsSync(evidenceFile)) {
      levelResults.push({
        level,
        found: false,
        passed: false,
        commitShaMatch: false,
        timestamp: null,
      });
      continue;
    }

    try {
      const content = await readFile(evidenceFile, "utf-8");
      const evidence = JSON.parse(content) as TestEvidence;
      const commitShaMatch = evidence.commitSha === commitSha;

      levelResults.push({
        level,
        found: true,
        passed: evidence.passed,
        commitShaMatch,
        timestamp: evidence.timestamp ?? null,
        ...(evidence.failures && evidence.failures.length > 0
          ? { failures: evidence.failures }
          : {}),
      });
    } catch {
      levelResults.push({
        level,
        found: false,
        passed: false,
        commitShaMatch: false,
        timestamp: null,
      });
    }
  }

  const missing = levelResults.filter((r) => !r.found);
  const failed = levelResults.filter((r) => r.found && !r.passed);
  const shaMismatch = levelResults.filter((r) => r.found && r.passed && !r.commitShaMatch);

  const hasFailures = missing.length > 0 || failed.length > 0 || shaMismatch.length > 0;
  const status: "pass" | "fail" = hasFailures ? "fail" : "pass";

  const problems: string[] = [];
  if (missing.length > 0) {
    problems.push(`Missing ${missing.map((r) => r.level).join(", ")} evidence`);
  }
  if (failed.length > 0) {
    problems.push(`Failed ${failed.map((r) => r.level).join(", ")} evidence`);
  }
  if (shaMismatch.length > 0) {
    problems.push(`commitSha mismatch for ${shaMismatch.map((r) => r.level).join(", ")} evidence`);
  }

  const summary = hasFailures
    ? `${problems.join("; ")} for commit ${commitSha}. Run tests on the dev channel first.`
    : `All required test evidence verified for commit ${commitSha}`;

  if (hasFailures && grace) {
    return {
      command: "test.evidence.verify",
      status: "pass",
      target,
      levels: levelResults,
      summary: `GRACE PERIOD (until ${GRACE_PERIOD_END}): ${summary}. Gates will become fatal after ${GRACE_PERIOD_END}.`,
      gracePeriod: true,
    };
  }

  return {
    command: "test.evidence.verify",
    status,
    target,
    levels: levelResults,
    summary,
    gracePeriod: false,
  };
}

export async function listTestEvidence(
  workspaceRoot: string,
  target: string,
  options: { releaseId?: string; service?: string },
): Promise<TestEvidenceListResult> {
  const evidenceDir = resolveEvidenceDir(workspaceRoot, target, options);

  if (!existsSync(evidenceDir)) {
    return {
      command: "test.evidence.list",
      target,
      evidence: [],
    };
  }

  const entries = await readdir(evidenceDir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));

  const evidence: TestEvidenceListEntry[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(evidenceDir, file), "utf-8");
      const parsed = JSON.parse(content) as TestEvidence;
      evidence.push({
        level: parsed.level,
        passed: parsed.passed,
        commitSha: parsed.commitSha,
        timestamp: parsed.timestamp,
        testRunId: parsed.testRunId,
      });
    } catch {
      // Skip malformed files
    }
  }

  evidence.sort((a, b) => a.level.localeCompare(b.level));

  return {
    command: "test.evidence.list",
    target,
    evidence,
  };
}

export { GRACE_PERIOD_END };
