/*
<MODULE_CONTRACT>
<purpose>RFC-0829: Shared test evidence gate helper for leitstand deployment commands.
Wraps executeKernelCommand calls to test.evidence.verify, eliminating duplicated gate logic.</purpose>
<keywords>test, evidence, gate, leitstand, deployment, verify</keywords>
<responsibilities>
  <item>Provides runTestEvidenceGate helper that calls test.evidence.verify via executeKernelCommand.</item>
  <item>Logs pass/fail status with command context.</item>
  <item>Throws on fatal gate failure (exitCode 1) to block deployment.</item>
</responsibilities>
<non-goals>
  <item>Does not define test evidence types or storage — those live in @warpgogol/werkstatt-site/testing.</item>
  <item>Does not register kernel commands.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0829: extracted shared gate helper from duplicated blocks in leitstand-commands.ts and service-promote.ts.</item>
</CHANGE_SUMMARY>
*/

import { executeKernelCommand } from "../kernel/index.js";

export const GRACE_PERIOD_END = "2026-09-10";

export interface TestEvidenceGateOptions {
  workspaceRoot: string;
  commandName: string;
  target: string;
  levels: string[];
  commitSha: string;
  releaseId?: string;
  service?: string;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
  };
}

export async function runTestEvidenceGate(opts: TestEvidenceGateOptions): Promise<void> {
  opts.logger.info(
    `[${opts.commandName}] verifying test evidence (${opts.levels.join(",")}) for commit ${opts.commitSha}…`,
  );
  const evidenceResult = (await executeKernelCommand({
    workspaceRoot: opts.workspaceRoot,
    commandName: "test.evidence.verify",
    argv: [
      opts.service ? `--service=${opts.service}` : `--target=${opts.target}`,
      `--levels=${opts.levels.join(",")}`,
      `--commit-sha=${opts.commitSha}`,
      ...(opts.releaseId ? [`--release-id=${opts.releaseId}`] : []),
    ],
  })) as { exitCode?: number; data?: { status: string; summary: string } };
  if (evidenceResult.data) {
    if (evidenceResult.data.status === "pass") {
      opts.logger.info(`[${opts.commandName}] test evidence: ${evidenceResult.data.summary}`);
    } else {
      opts.logger.warn(`[${opts.commandName}] test evidence: ${evidenceResult.data.summary}`);
      if (evidenceResult.exitCode === 1) {
        throw new Error(
          `[${opts.commandName}] test evidence gate failed: ${evidenceResult.data.summary}`,
        );
      }
    }
  }
}
