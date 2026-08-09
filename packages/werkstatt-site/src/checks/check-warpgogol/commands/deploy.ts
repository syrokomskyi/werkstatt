/*
<MODULE_CONTRACT>
<purpose>Deploy alt run, main gate, artifact validation, and check run command handlers for check-warpgogol.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { join, posix } from "node:path";
import { captureSiteEvidenceGraph } from "@warpgogol/werkstatt-site/check-runner";
import {
  checkRunArtifactSchema,
  makeRunId,
  redactCheckTarget,
  runRelDir,
  runRelPath,
  validateTargetSafety,
} from "@warpgogol/werkstatt-site/check-core";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "../result.ts";
import { getStringFlag, readTargetFromFlag, resolveWorkspacePath } from "../target-io.ts";
import { makeRunArtifact, numberFlag } from "./helpers.ts";
import { runCheckReportGenerate } from "./report.ts";
import { runCheckActionPackGenerate } from "./report.ts";

export async function runCheckDeployAltRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const runId = getStringFlag(input, "run-id") ?? makeRunId();
  const nextInput: KernelCommandInput = { ...input, flags: { ...input.flags, "run-id": runId } };
  const runResult = await runCheckRun(nextInput, context);
  if (runResult.data?.summary.error) return runResult;
  const runPath = runRelPath(runId, "run.json");
  const reportResult = await runCheckReportGenerate(
    { ...input, flags: { ...input.flags, run: runPath } },
    context,
  );
  await runCheckActionPackGenerate({ ...input, flags: { ...input.flags, run: runPath } }, context);
  return {
    ...reportResult,
    data: reportResult.data
      ? { ...reportResult.data, command: "check.deploy-alt.run" }
      : reportResult.data,
    summary: `check.deploy-alt.run: ${reportResult.data?.status ?? "pass"}`,
  };
}

export async function runCheckDeployMainGate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const reportPath = getStringFlag(input, "report");
  const runPath = getStringFlag(input, "run");
  if (!reportPath && !runPath) {
    return diagnosticsResult("check.deploy-main.gate", [
      {
        ruleId: "CW-GATE-01",
        severity: "error",
        message: "Missing required --report or --run path.",
        fixHint: "Pass --report <report.json> or --run .check-warpgogol/runs/<runId>/run.json.",
      },
    ]);
  }
  const resolvedReportPath = reportPath
    ? resolveWorkspacePath(context, reportPath)
    : resolveWorkspacePath(
        context,
        posix.join(posix.dirname(runPath!.replace(/\\/g, "/")), "report.json"),
      );
  try {
    const report = JSON.parse(await context.io.readFile(resolvedReportPath)) as {
      summary: { error: number; warning: number };
    };
    const maxErrors = numberFlag(input, "max-errors", 0);
    const maxWarnings = numberFlag(input, "max-warnings", Number.POSITIVE_INFINITY);
    const diagnostics: Diagnostic[] = [];
    if (report.summary.error > maxErrors) {
      diagnostics.push({
        ruleId: "CW-GATE-02",
        severity: "error",
        message: `Deploy-main gate blocked: ${report.summary.error} error(s) exceed max-errors ${maxErrors}.`,
        fixHint:
          "Fix blocking diagnostics or rerun the alt check after an intentional threshold change.",
      });
    }
    if (report.summary.warning > maxWarnings) {
      diagnostics.push({
        ruleId: "CW-GATE-03",
        severity: "error",
        message: `Deploy-main gate blocked: ${report.summary.warning} warning(s) exceed max-warnings ${maxWarnings}.`,
        fixHint: "Fix warning drift or raise the gate threshold intentionally.",
      });
    }
    return diagnosticsResult("check.deploy-main.gate", diagnostics);
  } catch (error) {
    return diagnosticsResult("check.deploy-main.gate", [
      {
        ruleId: "CW-GATE-01",
        severity: "error",
        message: "Deploy-main gate could not read report.json.",
        fixHint: "Run check.deploy-alt.run or check.report.generate before gating main deploy.",
        data: { error: error instanceof Error ? error.message : String(error) },
      },
    ]);
  }
}

export async function runCheckArtifactValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const runFile = getStringFlag(input, "run");
  if (!runFile) {
    return diagnosticsResult("check.artifact.validate", [
      {
        ruleId: "CW-ART-01",
        severity: "error",
        message: "Missing required --run path.",
        fixHint: "Pass --run .check-warpgogol/runs/<runId>/run.json.",
      },
    ]);
  }
  try {
    const absolute = resolveWorkspacePath(context, runFile);
    const artifact = checkRunArtifactSchema.parse(JSON.parse(await context.io.readFile(absolute)));
    const baseDir = absolute.slice(0, -"/run.json".length);
    const diagnostics: Diagnostic[] = [];
    for (const path of Object.values(artifact.artifacts)) {
      if (!path) continue;
      const artifactPath = resolveWorkspacePath(context, path);
      if (!(await context.io.exists(artifactPath))) {
        diagnostics.push({
          ruleId: "CW-ART-02",
          severity: "error",
          message: `Declared artifact is missing: ${path}`,
          fixHint: "Regenerate the run or remove stale artifact references.",
        });
      }
    }
    if (!absolute.endsWith(join(runRelDir(artifact.runId), "run.json"))) {
      diagnostics.push({
        ruleId: "CW-ART-03",
        severity: "warning",
        message: "run.json is outside the canonical .check-warpgogol/runs/<runId>/ layout.",
        fixHint: `Move the run under ${runRelDir(artifact.runId)}.`,
        data: { baseDir },
      });
    }
    return diagnosticsResult("check.artifact.validate", diagnostics);
  } catch (error) {
    return diagnosticsResult("check.artifact.validate", [
      {
        ruleId: "CW-ART-01",
        severity: "error",
        message: "Run artifact is missing or malformed.",
        fixHint: "Ensure run.json matches CheckRunArtifact from RFC-0296.",
        data: { error: error instanceof Error ? error.message : String(error) },
      },
    ]);
  }
}

export async function runCheckRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { target, diagnostics } = await readTargetFromFlag(input, context);
  if (!target) return diagnosticsResult("check.run", diagnostics);
  const safetyDiagnostics = validateTargetSafety(target);
  if (safetyDiagnostics.some((d) => d.severity === "error")) {
    return diagnosticsResult("check.run", [...diagnostics, ...safetyDiagnostics]);
  }
  const runId = getStringFlag(input, "run-id") ?? makeRunId();
  const relRunDir = runRelDir(runId);
  const runDir = join(context.workspaceRoot, relRunDir);
  await context.io.mkdir(runDir);
  await context.io.mkdir(join(runDir, "logs"));
  await context.io.writeFile(
    join(runDir, "target.redacted.json"),
    `${JSON.stringify(redactCheckTarget(target), null, 2)}\n`,
  );
  const graph = await captureSiteEvidenceGraph(target, { runDir, relativeRunDir: relRunDir });
  await context.io.writeFile(
    join(runDir, "evidence.graph.json"),
    `${JSON.stringify(graph, null, 2)}\n`,
  );
  const runArtifact = makeRunArtifact(runId, target.id, relRunDir, "warn", true);
  await context.io.writeFile(join(runDir, "run.json"), `${JSON.stringify(runArtifact, null, 2)}\n`);
  return diagnosticsResult("check.run", [
    {
      ruleId: "CW-RUN-01",
      severity: "warning",
      message: "check.run captured evidence; report/action-pack phases are not implemented yet.",
      fixHint:
        "Continue RFC-0297 implementation to populate report.json, report.html, and action-pack.json.",
      data: { runId, runDir: relRunDir, pageCount: graph.pages.length },
    },
  ]);
}
