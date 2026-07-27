/*
<MODULE_CONTRACT>
<purpose>
RFC-0233 Visual Control System — command handlers. Implements the three `visual.*`
commands layered on the RFC-0203 Diagnostic model:
  - visual.contract.validate (app, gating): runs the Tier-1 positional invariants
    and fails the build on any error-class finding.
  - visual.report (app, advisory): full visual posture across registered rules,
    always exit 0.
  - visual.rules.list (workspace, advisory): enumerate the visual rule registry so
    an agent discovers the contract without reading source.
</purpose>
<non-goals>
  <item>Do not implement Tier 2/3 rules; they are designed in RFC-0233 and deferred.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0233: initial Visual Control System command handlers.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import { diagnosticsResult } from "../result-helpers.ts";
import { listVisualRules } from "../diagnostics/rules.ts";
import { loadVisualPages } from "./page-context.ts";
import { evaluateVisualPage, type VisualGateOverrides } from "./rules.ts";

function resolveAppDir(context: KernelRuntimeContext): string | null {
  const dir = context.site?.directory;
  if (dir) return dir;
  return null;
}

/** Read the optional per-site `visual.gate` severity overrides from system.md. */
async function loadGateOverrides(appDir: string): Promise<VisualGateOverrides> {
  try {
    const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
    const visual = (manifest as { visual?: { gate?: unknown } }).visual;
    const gate = visual?.gate;
    if (gate && typeof gate === "object" && !Array.isArray(gate)) {
      return gate as VisualGateOverrides;
    }
  } catch {
    /* no system.md or no overrides — defaults apply */
  }
  return {};
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.ruleId.localeCompare(b.ruleId),
  );
}

async function collectVisualDiagnostics(
  context: KernelRuntimeContext,
): Promise<Diagnostic[] | { error: string }> {
  const appDir = resolveAppDir(context);
  if (!appDir) {
    return { error: "visual.contract.validate requires an app context (--site <id>)." };
  }
  const overrides = await loadGateOverrides(appDir);
  const pages = await loadVisualPages(appDir, context.workspaceRoot);
  const diagnostics: Diagnostic[] = [];
  for (const page of pages) {
    diagnostics.push(...evaluateVisualPage(page, overrides));
  }
  return sortDiagnostics(diagnostics);
}

export async function runVisualContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "visual.contract.validate";
  const result = await collectVisualDiagnostics(context);
  if (!Array.isArray(result)) {
    return diagnosticsResult(cmd, [
      {
        ruleId: "VIS-BG-01",
        severity: "error",
        message: result.error,
        fixHint: "Run with --site <id> or from inside an app directory.",
      },
    ]);
  }
  return diagnosticsResult(cmd, result);
}

export async function runVisualReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "visual.report";
  const result = await collectVisualDiagnostics(context);
  const diagnostics = Array.isArray(result) ? result : [];
  // Advisory: surface findings (incl. warnings) but never gate the build.
  const base = diagnosticsResult(cmd, diagnostics);
  return {
    ...base,
    exitCode: 0,
    summary: `${cmd}: ${diagnostics.length} visual finding(s) (advisory)`,
  };
}

export async function runVisualRulesList(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "visual.rules.list";
  const rules = listVisualRules();
  const diagnostics: Diagnostic[] = rules.map((r) => ({
    ruleId: r.id,
    severity: "info",
    message: `${r.id} [tier ${r.tier ?? "?"} · ${r.severityClass ?? "?"} · gates=${
      r.severityDefault === "error" ? "error" : "warning"
    }] ${r.title} (emitted by ${r.command})`,
  }));
  const base = diagnosticsResult(cmd, diagnostics);
  return {
    ...base,
    exitCode: 0,
    summary: `${cmd}: ${rules.length} visual rule(s) registered`,
  };
}
