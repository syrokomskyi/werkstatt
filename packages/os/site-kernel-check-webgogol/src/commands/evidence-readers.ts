/*
<MODULE_CONTRACT>
<purpose>
  Evidence reading and run-artifact management for check-webgogol OS commands.
  Handles evidence graph loading from run directories and run.json artifact updates.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from commands/helpers.ts as part of the module split.</item>
</CHANGE_SUMMARY>
*/

import { join, posix } from "node:path";
import {
  makeRunId,
  makeRunArtifact,
  parseEvidenceGraph,
  type SiteEvidenceGraph,
} from "@gogol/check-core";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { diagnosticsResult } from "../result.ts";
import { getStringFlag, resolveWorkspacePath } from "../target-io.ts";

export { makeRunArtifact };

export async function runEvidenceOnlyCheck(
  command: string,
  input: KernelCommandInput,
  context: KernelRuntimeContext,
  collect: (graph: SiteEvidenceGraph) => Diagnostic[],
): Promise<KernelCommandResult<CheckResult>> {
  const evidence = getStringFlag(input, "evidence");
  if (!evidence) {
    return diagnosticsResult(command, [
      {
        ruleId: "CW-EVID-01",
        severity: "error",
        message: "Missing required --evidence path.",
        fixHint: "Pass --evidence .check-webgogol/runs/<runId>/evidence.graph.json.",
      },
    ]);
  }
  const graph = parseEvidenceGraph(
    JSON.parse(await context.io.readFile(resolveWorkspacePath(context, evidence))),
  );
  return diagnosticsResult(command, collect(graph));
}

type ReadEvidenceResult =
  | { graph: undefined; diagnostics: Diagnostic[] }
  | {
      graph: SiteEvidenceGraph;
      diagnostics: Diagnostic[];
      runId: string;
      runDir: string;
      relRunDir: string;
    };

export async function readEvidenceForRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<ReadEvidenceResult> {
  const run = getStringFlag(input, "run");
  const evidence = getStringFlag(input, "evidence");
  const diagnostics: Diagnostic[] = [];
  if (!run && !evidence) {
    diagnostics.push({
      ruleId: "CW-REPORT-01",
      severity: "error",
      message: "Missing required --run or --evidence path.",
      fixHint:
        "Pass --run .check-webgogol/runs/<runId>/run.json or --evidence <evidence.graph.json>.",
    });
    return { graph: undefined, diagnostics };
  }
  const evidencePath = evidence
    ? resolveWorkspacePath(context, evidence)
    : resolveWorkspacePath(
        context,
        posix.join(posix.dirname(run!.replace(/\\/g, "/")), "evidence.graph.json"),
      );
  const graph = parseEvidenceGraph(JSON.parse(await context.io.readFile(evidencePath)));
  const relRunDir = run
    ? posix.dirname(run.replace(/\\/g, "/"))
    : posix.dirname(evidence!.replace(/\\/g, "/"));
  const runDir = resolveWorkspacePath(context, relRunDir);
  const runId = relRunDir.split("/").at(-1) ?? makeRunId();
  return { graph, diagnostics, runId, runDir, relRunDir };
}

export async function updateRunArtifact(
  context: KernelRuntimeContext,
  runDir: string,
  relRunDir: string,
  additions: { report?: boolean; actionPack?: boolean; audienceReview?: boolean },
): Promise<void> {
  const runPath = join(runDir, "run.json");
  if (!(await context.io.exists(runPath))) return;
  const artifact = JSON.parse(await context.io.readFile(runPath)) as Record<string, unknown>;
  const existingArtifacts =
    typeof artifact.artifacts === "object" && artifact.artifacts !== null
      ? (artifact.artifacts as Record<string, string | undefined>)
      : {};
  artifact.artifacts = {
    ...existingArtifacts,
    report: additions.report ? posix.join(relRunDir, "report.json") : existingArtifacts.report,
    reportHtml: additions.report
      ? posix.join(relRunDir, "report.html")
      : existingArtifacts.reportHtml,
    actionPack: additions.actionPack
      ? posix.join(relRunDir, "action-pack.json")
      : existingArtifacts.actionPack,
    audienceReview: additions.audienceReview
      ? posix.join(relRunDir, "audience-review.json")
      : existingArtifacts.audienceReview,
  };
  await context.io.writeFile(runPath, `${JSON.stringify(artifact, null, 2)}\n`);
}
