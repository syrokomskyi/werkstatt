/*
<MODULE_CONTRACT>
<purpose>Report generation, action pack generation, and comparison command handlers for check-warpgogol.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type { CheckReport } from "@warpgogol/werkstatt-site/check-core";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "../result.ts";
import { getStringFlag, resolveWorkspacePath } from "../target-io.ts";
import {
  collectDeterministicDiagnostics,
  makeAgentAction,
  makeAgentActionPack,
  makeCheckReport,
  readEvidenceForRun,
  renderReportHtml,
  updateRunArtifact,
} from "./helpers.ts";

export async function runCheckReportGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const result = await readEvidenceForRun(input, context);
  if (!result.graph) return diagnosticsResult("check.report.generate", result.diagnostics);
  const { graph, runId, runDir, relRunDir } = result;
  const checkDiagnostics = collectDeterministicDiagnostics(graph);
  const report = makeCheckReport(runId, graph.targetId, checkDiagnostics, graph.pages.length);
  await context.io.writeFile(join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await context.io.writeFile(join(runDir, "report.html"), renderReportHtml(report));
  await updateRunArtifact(context, runDir, relRunDir, { report: true });
  return diagnosticsResult("check.report.generate", checkDiagnostics);
}

export async function runCheckActionPackGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const result = await readEvidenceForRun(input, context);
  if (!result.graph) return diagnosticsResult("check.action-pack.generate", result.diagnostics);
  const { graph, runId, runDir, relRunDir } = result;
  const actions = collectDeterministicDiagnostics(graph).map((diagnostic, index) =>
    makeAgentAction(diagnostic, index, graph.pages[0]?.url),
  );
  const pack = makeAgentActionPack(runId, graph.targetId, actions);
  await context.io.writeFile(
    join(runDir, "action-pack.json"),
    `${JSON.stringify(pack, null, 2)}\n`,
  );
  await updateRunArtifact(context, runDir, relRunDir, { actionPack: true });
  return diagnosticsResult("check.action-pack.generate", []);
}

export async function runCheckCompare(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const base = getStringFlag(input, "base");
  const head = getStringFlag(input, "head");
  if (!base || !head) {
    return diagnosticsResult("check.compare", [
      {
        ruleId: "CW-REPORT-01",
        severity: "error",
        message: "Missing required --base or --head report path.",
        fixHint: "Pass --base <report.json> --head <report.json>.",
      },
    ]);
  }
  const baseReport = JSON.parse(
    await context.io.readFile(resolveWorkspacePath(context, base)),
  ) as CheckReport;
  const headReport = JSON.parse(
    await context.io.readFile(resolveWorkspacePath(context, head)),
  ) as CheckReport;
  const diagnostics: Diagnostic[] = [];
  if (headReport.summary.error > baseReport.summary.error) {
    diagnostics.push({
      ruleId: "CW-REPORT-02",
      severity: "error",
      message: "Head report has more errors than the base report.",
      fixHint: "Inspect newly introduced diagnostics before accepting the head run.",
      data: { baseErrors: baseReport.summary.error, headErrors: headReport.summary.error },
    });
  }
  if (headReport.summary.warning > baseReport.summary.warning) {
    diagnostics.push({
      ruleId: "CW-REPORT-02",
      severity: "warning",
      message: "Head report has more warnings than the base report.",
      fixHint: "Review warning drift and document intentional changes.",
      data: { baseWarnings: baseReport.summary.warning, headWarnings: headReport.summary.warning },
    });
  }
  return diagnosticsResult("check.compare", diagnostics);
}
