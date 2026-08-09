/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/maintenance-debt-baseline.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not execute app validators outside the existing maintenance.debt.report command set.</item>
  <item>Do not store full diagnostic prose as the matching source of truth.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0251: establish a generated accepted advisory debt baseline and triage report.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import {
  collectMaintenanceDebtItems,
  maintenanceDebtKey,
  normalizeMaintenanceDebtMessage,
  type MaintenanceDebtReport,
} from "../ecosystem.ts";
import { diagnosticsResult } from "../result-helpers.ts";

export interface MaintenanceDebtBaseline {
  meta: {
    schemaVersion: 1;
    deterministic: true;
    generatedAt: null;
    contentHash: string;
    sourceReportHash: string;
  };
  items: MaintenanceDebtBaselineItem[];
}

export interface MaintenanceDebtBaselineItem {
  key: string;
  sourceCommand: string;
  severity: "warning" | "info" | "skipped";
  app?: string;
  ruleId?: string;
  file?: string;
  line?: number;
  messageHash: string;
  acceptedAt: string;
  owner: string;
  rationale: string;
  reviewAfter?: string;
}

interface MaintenanceDebtTriageReport {
  command: "maintenance.debt.triage.report";
  status: "pass" | "warn" | "fail";
  groups: Array<{
    priority: number;
    label: string;
    sourceCommand?: string;
    count: number;
    suggestedAction: string;
    items: Array<MaintenanceDebtReport["items"][number] & { key: string }>;
  }>;
}

const BASELINE_PATH = "docs/maintenance-debt.baseline.generated.yaml";
const DEFAULT_OWNER = "architecture";
const DEFAULT_RATIONALE = "Initial RFC-0251 accepted advisory backlog baseline.";
const DEFAULT_ACCEPTED_AT = "2026-07-01";

const HASH_PREFIX = "sha" + "256:";

function digestHex(value: string): string {
  return byteHash(value).slice(HASH_PREFIX.length);
}

function baselineItemForDebt(
  item: MaintenanceDebtReport["items"][number],
): MaintenanceDebtBaselineItem {
  return {
    key: maintenanceDebtKey(item),
    sourceCommand: item.sourceCommand,
    severity: item.severity,
    ...(item.app ? { app: item.app } : {}),
    ...(item.ruleId ? { ruleId: item.ruleId } : {}),
    ...(item.file ? { file: item.file } : {}),
    ...(typeof item.line === "number" ? { line: item.line } : {}),
    messageHash: digestHex(normalizeMaintenanceDebtMessage(item.message)),
    acceptedAt: DEFAULT_ACCEPTED_AT,
    owner: DEFAULT_OWNER,
    rationale: DEFAULT_RATIONALE,
  };
}

function renderBaseline(items: MaintenanceDebtBaselineItem[]): string {
  const withoutContentHash = {
    meta: {
      schemaVersion: 1 as const,
      deterministic: true as const,
      generatedAt: null,
      contentHash: "",
      sourceReportHash: digestHex(JSON.stringify(items)),
    },
    items,
  };
  const baseline: MaintenanceDebtBaseline = {
    ...withoutContentHash,
    meta: {
      ...withoutContentHash.meta,
      contentHash: digestHex(JSON.stringify(withoutContentHash)),
    },
  };
  return `${yamlStringify(baseline)}`;
}

async function readBaseline(workspaceRoot: string): Promise<MaintenanceDebtBaseline | undefined> {
  try {
    return yamlParse(
      await readFile(join(workspaceRoot, BASELINE_PATH), "utf8"),
    ) as MaintenanceDebtBaseline;
  } catch {
    return undefined;
  }
}

function validateBaselineShape(baseline: MaintenanceDebtBaseline | undefined): Diagnostic[] {
  if (!baseline) {
    return [
      {
        ruleId: "maintenance.debt.baseline.validate",
        severity: "error",
        file: BASELINE_PATH,
        message: "Maintenance debt baseline is missing or unreadable.",
        fixHint:
          "Run maintenance.debt.baseline.write after reviewing the current advisory debt report.",
      },
    ];
  }
  const diagnostics: Diagnostic[] = [];
  if (baseline.meta?.schemaVersion !== 1) {
    diagnostics.push({
      ruleId: "maintenance.debt.baseline.validate",
      severity: "error",
      file: BASELINE_PATH,
      message: "Maintenance debt baseline has an unsupported generated marker or schema version.",
      fixHint: "Regenerate the baseline with maintenance.debt.baseline.write.",
    });
  }
  return diagnostics;
}

function isExpired(value: string | undefined): boolean {
  if (!value) return false;
  return new Date(`${value}T00:00:00.000Z`).getTime() < Date.now();
}

export async function runMaintenanceDebtBaselineWrite(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ file: string; items: number }>> {
  const items = (await collectMaintenanceDebtItems(context.workspaceRoot))
    .map((item) => baselineItemForDebt(item))
    .sort((a, b) => a.key.localeCompare(b.key));
  await writeFile(join(context.workspaceRoot, BASELINE_PATH), renderBaseline(items), "utf8");
  return {
    data: { file: BASELINE_PATH, items: items.length },
    exitCode: 0,
    summary: `maintenance.debt.baseline.write: wrote ${items.length} item(s) to ${BASELINE_PATH}`,
  };
}

export async function runMaintenanceDebtBaselineValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const baseline = await readBaseline(context.workspaceRoot);
  const diagnostics = validateBaselineShape(baseline);
  const baselineByKey = new Map((baseline?.items ?? []).map((item) => [item.key, item]));

  for (const item of await collectMaintenanceDebtItems(context.workspaceRoot)) {
    const key = maintenanceDebtKey(item);
    if (!baselineByKey.has(key)) {
      diagnostics.push({
        ruleId: "maintenance.debt.baseline.validate",
        severity: item.severity === "warning" ? "error" : "warning",
        file: item.file ?? BASELINE_PATH,
        line: item.line,
        message: `New unbaselined ${item.severity} debt from ${item.sourceCommand}.`,
        fixHint: "Fix the new advisory debt, or intentionally refresh the baseline after review.",
        data: { key, sourceCommand: item.sourceCommand, app: item.app },
      });
    }
  }

  for (const item of baseline?.items ?? []) {
    if (isExpired(item.reviewAfter)) {
      diagnostics.push({
        ruleId: "maintenance.debt.baseline.validate",
        severity: "warning",
        file: BASELINE_PATH,
        message: `Baseline item ${item.key} is past its reviewAfter date.`,
        fixHint: "Review the accepted debt and either fix it or refresh the baseline rationale.",
        data: { key: item.key, reviewAfter: item.reviewAfter },
      });
    }
  }

  return diagnosticsResult("maintenance.debt.baseline.validate", diagnostics);
}

function groupLabel(
  item: MaintenanceDebtReport["items"][number],
  baselineKeys: Set<string>,
): string {
  if (!baselineKeys.has(maintenanceDebtKey(item)) && item.severity === "warning")
    return "New unbaselined warnings";
  if (item.sourceCommand === "text.normalize.report")
    return "High-volume repeated warnings by rule";
  if (item.app) return "App-specific content debt";
  if (item.severity === "info") return "Info-only cleanup";
  return "Package/platform debt";
}

function suggestedAction(label: string): string {
  if (label === "New unbaselined warnings") return "Fix now before refreshing the baseline.";
  if (label === "High-volume repeated warnings by rule") return "Batch cleanup candidate.";
  if (label === "App-specific content debt") return "Content authoring work.";
  if (label === "Info-only cleanup") return "Cleanup opportunistically.";
  return "Platform rule refinement or package cleanup.";
}

export async function runMaintenanceDebtTriageReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MaintenanceDebtTriageReport>> {
  const baseline = await readBaseline(context.workspaceRoot);
  const baselineKeys = new Set((baseline?.items ?? []).map((item) => item.key));
  const grouped = new Map<string, MaintenanceDebtTriageReport["groups"][number]>();

  for (const item of await collectMaintenanceDebtItems(context.workspaceRoot)) {
    const label = groupLabel(item, baselineKeys);
    const key = maintenanceDebtKey(item);
    const existing = grouped.get(label) ?? {
      priority:
        label === "New unbaselined warnings" ? 1 : label === "App-specific content debt" ? 4 : 6,
      label,
      sourceCommand: item.sourceCommand,
      count: 0,
      suggestedAction: suggestedAction(label),
      items: [],
    };
    existing.count += 1;
    existing.items.push({ ...item, key });
    grouped.set(label, existing);
  }

  const groups = [...grouped.values()].sort(
    (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
  );
  const status = groups.some((group) => group.label === "New unbaselined warnings")
    ? "fail"
    : groups.length
      ? "warn"
      : "pass";
  return {
    data: { command: "maintenance.debt.triage.report", status, groups },
    exitCode: 0,
    summary: `maintenance.debt.triage.report: ${groups.reduce((sum, group) => sum + group.count, 0)} item(s) in ${groups.length} group(s)`,
  };
}
