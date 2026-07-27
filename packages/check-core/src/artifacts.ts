/*
<MODULE_CONTRACT>
<purpose>Check run artifact schema and run-id factory for the check-warpgogol ecosystem.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-core package extraction.</item>
</CHANGE_SUMMARY>
*/

import { posix } from "node:path";
import { z } from "zod";

export const checkRunArtifactSchema = z.object({
  runId: z.string().min(1),
  targetId: z.string().min(1),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  status: z.enum(["running", "pass", "warn", "fail"]),
  artifacts: z.object({
    run: z.string(),
    target: z.string(),
    evidenceGraph: z.string().optional(),
    report: z.string().optional(),
    reportHtml: z.string().optional(),
    actionPack: z.string().optional(),
    audienceReview: z.string().optional(),
    screenshotsDir: z.string().optional(),
    logsDir: z.string().optional(),
  }),
});

export type CheckRunArtifact = z.infer<typeof checkRunArtifactSchema>;

export function makeRunId(now = new Date()): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function makeRunArtifact(
  runId: string,
  targetId: string,
  relRunDir: string,
  status: "running" | "pass" | "warn" | "fail",
  includeEvidence: boolean,
): CheckRunArtifact {
  const now = new Date().toISOString();
  return {
    runId,
    targetId,
    startedAt: now,
    finishedAt: now,
    status,
    artifacts: {
      run: posix.join(relRunDir, "run.json"),
      target: posix.join(relRunDir, "target.redacted.json"),
      evidenceGraph: includeEvidence ? posix.join(relRunDir, "evidence.graph.json") : undefined,
      screenshotsDir: posix.join(relRunDir, "screenshots"),
      logsDir: posix.join(relRunDir, "logs"),
    },
  };
}
