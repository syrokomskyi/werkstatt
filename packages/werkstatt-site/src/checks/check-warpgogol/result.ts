/*
<MODULE_CONTRACT>
<purpose>Result builder utility for check-warpgogol command handlers: constructs standard CheckResult objects from diagnostics.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-warpgogol package extraction.</item>
</CHANGE_SUMMARY>
*/

import type { CheckResult, Diagnostic, KernelCommandResult } from "@warpgogol/werkstatt/kernel";

export function diagnosticsResult(
  command: string,
  diagnostics: Diagnostic[],
): KernelCommandResult<CheckResult> {
  const summary = {
    error: diagnostics.filter((d) => d.severity === "error").length,
    warning: diagnostics.filter((d) => d.severity === "warning").length,
    info: diagnostics.filter((d) => d.severity === "info").length,
  };
  const status: CheckResult["status"] =
    summary.error > 0 ? "fail" : summary.warning > 0 ? "warn" : "pass";
  return {
    exitCode: summary.error > 0 ? 1 : 0,
    summary: `${command}: ${status}`,
    data: { command, status, diagnostics, summary },
  };
}
