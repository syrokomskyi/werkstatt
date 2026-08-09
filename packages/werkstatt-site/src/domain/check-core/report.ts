/*
<MODULE_CONTRACT>
<purpose>Check report, diagnostic, agent action, and action pack schemas for the check-warpgogol ecosystem.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-core package extraction.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import type { Diagnostic } from "@warpgogol/werkstatt/kernel";

export const checkDiagnosticSchema = z.custom<Diagnostic>();

export const checkReportSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  targetId: z.string(),
  generatedAt: z.string().datetime(),
  status: z.enum(["pass", "warn", "fail"]),
  summary: z.object({
    error: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative(),
  }),
  diagnostics: z.array(checkDiagnosticSchema),
});

export const agentActionSchema = z.object({
  id: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  anchor: z.object({
    url: z.string().url().optional(),
    sectionId: z.string().optional(),
    selector: z.string().optional(),
  }),
  objective: z.string(),
  changeHint: z.string(),
  sourceRuleId: z.string(),
});

export const agentActionPackSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  targetId: z.string(),
  generatedAt: z.string().datetime(),
  actions: z.array(agentActionSchema),
});

export type CheckReport = Omit<z.infer<typeof checkReportSchema>, "diagnostics"> & {
  diagnostics: Diagnostic[];
};
export type AgentAction = z.infer<typeof agentActionSchema>;
export type AgentActionPack = z.infer<typeof agentActionPackSchema>;

export function statusFromSummary(summary: {
  error: number;
  warning: number;
}): "pass" | "warn" | "fail" {
  if (summary.error > 0) return "fail";
  if (summary.warning > 0) return "warn";
  return "pass";
}

export function makeCheckReport(
  runId: string,
  targetId: string,
  diagnostics: Diagnostic[],
  pageCount: number,
): CheckReport {
  const summary = {
    error: diagnostics.filter((d) => d.severity === "error").length,
    warning: diagnostics.filter((d) => d.severity === "warning").length,
    info: diagnostics.filter((d) => d.severity === "info").length,
    pageCount,
  };
  return {
    schemaVersion: 1,
    runId,
    targetId,
    generatedAt: new Date().toISOString(),
    status: statusFromSummary(summary),
    summary,
    diagnostics,
  };
}

export function makeAgentAction(
  diagnostic: Diagnostic,
  index: number,
  fallbackUrl: string | undefined,
): AgentAction {
  const url = typeof diagnostic.data?.url === "string" ? diagnostic.data.url : fallbackUrl;
  const sectionId =
    typeof diagnostic.data?.sectionId === "string" ? diagnostic.data.sectionId : undefined;
  return {
    id: `${diagnostic.ruleId.toLowerCase()}-${index + 1}`,
    severity: diagnostic.severity,
    anchor: { url, sectionId, selector: sectionId ? `#${sectionId}` : undefined },
    objective: diagnostic.message,
    changeHint:
      diagnostic.fixHint ?? "Inspect the anchored page evidence and improve the affected content.",
    sourceRuleId: diagnostic.ruleId,
  };
}

export function makeAgentActionPack(
  runId: string,
  targetId: string,
  actions: AgentAction[],
): AgentActionPack {
  return {
    schemaVersion: 1,
    runId,
    targetId,
    generatedAt: new Date().toISOString(),
    actions,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderReportHtml(report: CheckReport): string {
  const rows = report.diagnostics
    .map(
      (d) =>
        `<li><strong>${escapeHtml(d.severity)}</strong> ${escapeHtml(d.ruleId)}: ${escapeHtml(d.message)}</li>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Check Warpgogol Report ${escapeHtml(report.runId)}</title></head>
<body>
<h1>Check Warpgogol Report</h1>
<p>Status: ${escapeHtml(report.status)}. Errors: ${report.summary.error}. Warnings: ${report.summary.warning}.</p>
<ul>${rows}</ul>
</body>
</html>
`;
}
