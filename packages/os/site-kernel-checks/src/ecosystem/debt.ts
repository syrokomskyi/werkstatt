/*
<MODULE_CONTRACT>
<purpose>Maintenance debt collection, key computation, baseline summary, and report command.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted maintenance debt logic from ecosystem.ts into ecosystem/debt.ts.</item>
  <item>RFC-0381: explicit zero-sites check before executing advisory app commands instead of catch-all.</item>
</CHANGE_SUMMARY>
*/

import { byteHash } from "@gogol/fingerprint";
import {
  discoverSiteWorkspaces,
  executeKernelCommand,
  listRegisteredKernelCommands,
} from "@gogol/site-kernel";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { ADVISORY_APP_COMMANDS, type MaintenanceDebtReport } from "./types.ts";

const HASH_PREFIX = "sha" + "256:";

function digestHex(value: string): string {
  return byteHash(value).slice(HASH_PREFIX.length);
}

function isCheckResult(data: unknown): data is CheckResult {
  return (
    data !== null &&
    typeof data === "object" &&
    Array.isArray((data as CheckResult).diagnostics) &&
    typeof (data as CheckResult).command === "string"
  );
}

function debtSeverity(diagnostic: Diagnostic): "warning" | "info" | undefined {
  if (diagnostic.severity === "warning") return "warning";
  if (diagnostic.severity === "info") return "info";
  return undefined;
}

export async function collectMaintenanceDebtItems(
  workspaceRoot: string,
): Promise<MaintenanceDebtReport["items"]> {
  const registered = new Set(
    (await listRegisteredKernelCommands(workspaceRoot)).map((command) => command.name),
  );
  const items: MaintenanceDebtReport["items"] = [];

  for (const command of ADVISORY_APP_COMMANDS) {
    if (!registered.has(command)) {
      items.push({
        sourceCommand: command,
        severity: "skipped",
        message: `Command ${command} is not registered in the current kernel registry.`,
      });
      continue;
    }

    const sites = await discoverSiteWorkspaces(workspaceRoot);
    if (sites.length === 0) continue;

    const report = await executeKernelCommand({
      workspaceRoot,
      commandName: command,
      allSites: true,
      outputFormat: "json",
      argv: [],
    });
    for (const single of Array.isArray(report) ? report : [report]) {
      if (!isCheckResult(single.data)) continue;
      for (const diagnostic of single.data.diagnostics) {
        const severity = debtSeverity(diagnostic);
        if (!severity) continue;
        items.push({
          sourceCommand: command,
          severity,
          ...(single.siteName ? { app: single.siteName } : {}),
          ruleId: diagnostic.ruleId,
          message: diagnostic.message,
          ...(diagnostic.file ? { file: diagnostic.file } : {}),
          ...(typeof diagnostic.line === "number" ? { line: diagnostic.line } : {}),
          ...(diagnostic.fixHint ? { fixHint: diagnostic.fixHint } : {}),
        });
      }
    }
  }

  return items.sort(
    (a, b) =>
      [
        a.sourceCommand.localeCompare(b.sourceCommand),
        (a.app ?? "").localeCompare(b.app ?? ""),
        (a.ruleId ?? "").localeCompare(b.ruleId ?? ""),
        (a.file ?? "").localeCompare(b.file ?? ""),
        (a.line ?? 0) - (b.line ?? 0),
        a.message.localeCompare(b.message),
      ].find((value) => value !== 0) ?? 0,
  );
}

export function normalizeMaintenanceDebtMessage(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function maintenanceDebtKey(item: MaintenanceDebtReport["items"][number]): string {
  return digestHex(
    JSON.stringify({
      sourceCommand: item.sourceCommand,
      app: item.app ?? "",
      ruleId: item.ruleId ?? "",
      file: item.file ?? "",
      line: item.line ?? null,
      message: normalizeMaintenanceDebtMessage(item.message),
    }),
  );
}

export async function runMaintenanceDebtReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MaintenanceDebtReport>> {
  const items = await collectMaintenanceDebtItems(context.workspaceRoot);
  const status: MaintenanceDebtReport["status"] = items.length > 0 ? "warn" : "pass";
  return {
    data: { command: "maintenance.debt.report", status, items },
    exitCode: 0,
    summary: `maintenance.debt.report: ${items.length} item(s)`,
  };
}
