/*
<MODULE_CONTRACT>
<purpose>Process one queued Check Warpgogol request into evidence, report, action pack, run metadata, and status artifacts.</purpose>
<non-goals>
  <item>Do not own queue claiming mechanics or worker loop scheduling; those live in local-store.ts and worker.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0365: services source files participate in the Compass source-markup contract.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureSiteEvidenceGraph } from "@warpgogol/check-runner-node";
import {
  redactCheckTarget,
  validateTargetSafety,
  collectDeterministicDiagnostics,
  makeCheckReport,
  makeAgentAction,
  makeAgentActionPack,
  renderReportHtml,
  makeRunArtifact,
  runRelDir,
  runRelPath,
  type CheckReport,
  type CheckRunRequest,
  type CheckRunStatus,
} from "@warpgogol/check-core";
import { loadRunnerConfig } from "./config.ts";
import { claimNextRequest, completeRequest, ensureStore, writeStatus } from "./local-store.ts";

export async function runOnce(): Promise<boolean> {
  const config = loadRunnerConfig();
  await ensureStore(config);
  const request = await claimNextRequest(config);
  if (!request) return false;
  try {
    await processRequest(config, request);
  } finally {
    await completeRequest(config, request);
  }
  return true;
}

type RunnerDiagnostic = CheckReport["diagnostics"][number];
async function processRequest(
  config: ReturnType<typeof loadRunnerConfig>,
  request: CheckRunRequest,
): Promise<void> {
  const runDir = join(config.runsDir, request.runId);
  const relRunDir = runRelDir(request.runId);
  try {
    await writeStatus(config, status(request, "running"));
    const safety = validateTargetSafety(request.target);
    if (safety.some((diagnostic) => diagnostic.severity === "error")) {
      await writeStatus(config, {
        ...status(request, "fail"),
        summary: {
          error: safety.filter((d) => d.severity === "error").length,
          warning: safety.filter((d) => d.severity === "warning").length,
          info: safety.filter((d) => d.severity === "info").length,
        },
        error: { message: "Target safety validation failed.", code: "target-safety" },
      });
      return;
    }
    await mkdir(join(runDir, "logs"), { recursive: true });
    await writeFile(
      join(runDir, "target.redacted.json"),
      `${JSON.stringify(redactCheckTarget(request.target), null, 2)}\n`,
    );
    const graph = await captureSiteEvidenceGraph(request.target, {
      runDir,
      relativeRunDir: relRunDir,
    });
    await writeFile(join(runDir, "evidence.graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
    const diagnostics: RunnerDiagnostic[] = collectDeterministicDiagnostics(graph);
    const report = makeCheckReport(
      request.runId,
      request.target.id,
      diagnostics,
      graph.pages.length,
    );
    await writeFile(join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(join(runDir, "report.html"), renderReportHtml(report));
    const pack = makeAgentActionPack(
      request.runId,
      request.target.id,
      diagnostics.map((diagnostic, index) => makeAgentAction(diagnostic, index, undefined)),
    );
    await writeFile(join(runDir, "action-pack.json"), `${JSON.stringify(pack, null, 2)}\n`);
    const artifact = makeRunArtifact(
      request.runId,
      request.target.id,
      relRunDir,
      report.status,
      true,
    );
    artifact.startedAt = request.createdAt;
    artifact.finishedAt = new Date().toISOString();
    artifact.artifacts.report = runRelPath(request.runId, "report.json");
    artifact.artifacts.reportHtml = runRelPath(request.runId, "report.html");
    artifact.artifacts.actionPack = runRelPath(request.runId, "action-pack.json");
    await writeFile(join(runDir, "run.json"), `${JSON.stringify(artifact, null, 2)}\n`);
    await writeStatus(config, {
      ...status(request, report.status),
      summary: report.summary,
      reportPath: runRelPath(request.runId, "report.json"),
      actionPackPath: runRelPath(request.runId, "action-pack.json"),
    });
  } catch (error) {
    await writeStatus(config, {
      ...status(request, "error"),
      error: {
        message: error instanceof Error ? error.message : String(error),
        code: "runner-error",
      },
    });
  }
}

function status(request: CheckRunRequest, kind: CheckRunStatus["status"]): CheckRunStatus {
  return {
    schemaVersion: 1,
    runId: request.runId,
    targetId: request.target.id,
    status: kind,
    updatedAt: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  await runOnce();
}
