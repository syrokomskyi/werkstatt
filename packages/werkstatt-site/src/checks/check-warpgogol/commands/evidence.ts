/*
<MODULE_CONTRACT>
<purpose>Evidence capture, evidence validation, technical/localization/accessibility/content-surface validation, and deterministic run command handlers for check-warpgogol.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { captureSiteEvidenceGraph } from "@warpgogol/werkstatt-site/check-runner";
import {
  makeRunId,
  parseEvidenceGraph,
  redactCheckTarget,
  runRelDir,
  validateEvidenceGraphHash,
  validateTargetSafety,
} from "@warpgogol/werkstatt-site/check-core";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "../result.ts";
import { getStringFlag, readTargetFromFlag, resolveWorkspacePath } from "../target-io.ts";
import {
  collectAccessibilityDiagnostics,
  collectContentSurfaceDiagnostics,
  collectDeterministicDiagnostics,
  collectLocalizationDiagnostics,
  collectTechnicalDiagnostics,
  containsSecretLikeText,
  makeRunArtifact,
  runEvidenceOnlyCheck,
} from "./helpers.ts";

export async function runCheckEvidenceCapture(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { target, diagnostics } = await readTargetFromFlag(input, context);
  if (!target) return diagnosticsResult("check.evidence.capture", diagnostics);
  const safetyDiagnostics = validateTargetSafety(target);
  if (safetyDiagnostics.some((d) => d.severity === "error")) {
    return diagnosticsResult("check.evidence.capture", [...diagnostics, ...safetyDiagnostics]);
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
  await context.io.writeFile(
    join(runDir, "run.json"),
    `${JSON.stringify(makeRunArtifact(runId, target.id, relRunDir, "warn", true), null, 2)}\n`,
  );
  return diagnosticsResult("check.evidence.capture", [
    {
      ruleId: "CW-EVID-04",
      severity: "warning",
      message: "Evidence was captured; report/action-pack phases are not attached to this run yet.",
      fixHint:
        "Run check.report.generate and check.action-pack.generate after deterministic checks land.",
      data: { runId, pageCount: graph.pages.length },
    },
  ]);
}

export async function runCheckEvidenceValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const graphPath = getStringFlag(input, "evidence");
  if (!graphPath) {
    return diagnosticsResult("check.evidence.validate", [
      {
        ruleId: "CW-EVID-01",
        severity: "error",
        message: "Missing required --evidence path.",
        fixHint: "Pass --evidence .check-warpgogol/runs/<runId>/evidence.graph.json.",
      },
    ]);
  }
  try {
    const absolute = resolveWorkspacePath(context, graphPath);
    const graph = parseEvidenceGraph(JSON.parse(await context.io.readFile(absolute)));
    const diagnostics: Diagnostic[] = [];
    if (!validateEvidenceGraphHash(graph)) {
      diagnostics.push({
        ruleId: "CW-EVID-02",
        severity: "error",
        message: "Evidence graph hash does not match its content.",
        fixHint: "Regenerate evidence.graph.json instead of hand-editing it.",
      });
    }
    for (const page of graph.pages) {
      if (containsSecretLikeText(page.text)) {
        diagnostics.push({
          ruleId: "CW-EVID-03",
          severity: "error",
          message: `Evidence text for ${page.url} contains a secret-like token.`,
          fixHint: "Redact the source page or exclude sensitive pages from the target.",
        });
      }
      for (const viewport of page.viewports) {
        if (!viewport.screenshot) continue;
        const screenshotPath = resolveWorkspacePath(context, viewport.screenshot);
        if (!(await context.io.exists(screenshotPath))) {
          diagnostics.push({
            ruleId: "CW-EVID-01",
            severity: "error",
            message: `Evidence screenshot is missing: ${viewport.screenshot}`,
            fixHint: "Re-run check.evidence.capture for this target.",
          });
        }
      }
    }
    return diagnosticsResult("check.evidence.validate", diagnostics);
  } catch (error) {
    return diagnosticsResult("check.evidence.validate", [
      {
        ruleId: "CW-EVID-01",
        severity: "error",
        message: "Evidence graph is missing or malformed.",
        fixHint: "Ensure evidence.graph.json matches SiteEvidenceGraph from RFC-0294.",
        data: { error: error instanceof Error ? error.message : String(error) },
      },
    ]);
  }
}

export async function runCheckTechnicalValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  return runEvidenceOnlyCheck(
    "check.technical.validate",
    input,
    context,
    collectTechnicalDiagnostics,
  );
}

export async function runCheckLocalizationValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  return runEvidenceOnlyCheck(
    "check.localization.validate",
    input,
    context,
    collectLocalizationDiagnostics,
  );
}

export async function runCheckAccessibilityValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  return runEvidenceOnlyCheck(
    "check.accessibility.validate",
    input,
    context,
    collectAccessibilityDiagnostics,
  );
}

export async function runCheckContentSurfaceValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  return runEvidenceOnlyCheck(
    "check.content-surface.validate",
    input,
    context,
    collectContentSurfaceDiagnostics,
  );
}

export async function runCheckDeterministicRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  return runEvidenceOnlyCheck(
    "check.deterministic.run",
    input,
    context,
    collectDeterministicDiagnostics,
  );
}
