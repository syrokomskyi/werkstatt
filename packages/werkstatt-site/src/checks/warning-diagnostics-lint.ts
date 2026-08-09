/*
<MODULE_CONTRACT>
<purpose>
warning.diagnostics.lint — RFC-0247 guard for actionable warnings that bypass
canonical Diagnostic[] transport and live only in summary prose.
</purpose>
<non-goals>
  <item>Do not parse a full TypeScript AST; this is a focused static guard like KEL/DSL.</item>
  <item>Do not forbid the word warning in docs or descriptions unless it is encoded as a finding marker.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0247: add a fail-hard guard for summary-only warning diagnostics.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

const SUPPRESSION = "warning-diagnostics-ok:";
const WARNING_MARKER = /\[warn:[^\]]+]/;
const WARNING_ARRAY_NAME = /\bproseWarnings\s*:\s*string\[\]/;
const PASS_RESULT_WARNING_SUMMARY = /\bpassResult\s*\([^)]*(?:warning|warn|\[warn:)/is;

const EXEMPT_FILES = new Set([
  "warning-diagnostics-lint.ts",
  "diagnostic-shape-lint.ts",
  "kernel-result-envelope-lint.ts",
  "diagnostics/rules.ts",
]);

async function collectTypeScriptFiles(dir: string): Promise<string[]> {
  const files = await collectFiles(dir, { extensions: [".ts"], ignore: () => false });
  return files.filter((f) => !f.endsWith(".test.ts")).sort((a, b) => a.localeCompare(b));
}

function hasSuppression(lines: string[], index: number): boolean {
  return [index - 1, index].some((lineIndex) => lines[lineIndex]?.includes(SUPPRESSION));
}

function pushDiagnostic(
  diagnostics: Diagnostic[],
  relName: string,
  line: number,
  message: string,
  fixHint: string,
): void {
  diagnostics.push({
    ruleId: "WDL-01",
    severity: "error",
    file: relName,
    line,
    message,
    fixHint,
  });
}

export async function runWarningDiagnosticsLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const checksDir = join(context.workspaceRoot, "packages", "os", "site-kernel-checks", "src");
  let files: string[];
  try {
    files = await collectTypeScriptFiles(checksDir);
  } catch (err) {
    return diagnosticsResult("warning.diagnostics.lint", [
      {
        ruleId: "WDL-00",
        severity: "error",
        message: `Could not read site-kernel-checks/src/: ${(err as Error).message}`,
        fixHint: "Ensure packages/os/site-kernel-checks/src/ exists and is readable.",
      },
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  for (const file of files) {
    const relName = relative(checksDir, file).replace(/\\/g, "/");
    if (EXEMPT_FILES.has(relName)) continue;
    const displayName = `site-kernel-checks/src/${relName}`;
    const content = await readFile(file, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (hasSuppression(lines, i)) continue;

      if (WARNING_MARKER.test(line)) {
        pushDiagnostic(
          diagnostics,
          displayName,
          i + 1,
          "Warning marker appears in source prose instead of a canonical Diagnostic.",
          "Emit a Diagnostic with severity warning/info via diagnosticsResult, or add a local warning-diagnostics-ok suppression for non-actionable prose.",
        );
      }

      if (WARNING_ARRAY_NAME.test(line)) {
        pushDiagnostic(
          diagnostics,
          displayName,
          i + 1,
          "String warning array can hide actionable findings from maintenance.debt.report.",
          "Use Diagnostic[] for advisory findings so ruleId, severity, file, and fixHint remain parseable.",
        );
      }
    }

    if (PASS_RESULT_WARNING_SUMMARY.test(content)) {
      const line = lines.findIndex((candidate) => /\bpassResult\s*\(/.test(candidate)) + 1;
      pushDiagnostic(
        diagnostics,
        displayName,
        Math.max(1, line),
        "passResult appears to include warning-like summary prose.",
        "Return diagnosticsResult(command, diagnostics) for warning/info findings; warning-only diagnostics keep exitCode 0.",
      );
    }
  }

  return diagnosticsResult("warning.diagnostics.lint", diagnostics);
}
