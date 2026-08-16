/*
<MODULE_CONTRACT>
<purpose>RFC-0136 audit.delta.run: run the RFC-0074 audit validators over an amend
batch delta (touched pages + new routes), reusing the LLM cache, with a
non-regression guarantee. Lives in its own package per the RFC-0136 file map;
site-kernel-checks imports and registers the handler in its check module.</purpose>
<non-goals>
  <item>Do not define the amend batch bundle, provenance, or coverage ledger — those are RFC-0135.</item>
  <item>Do not own amend-check composites or amend.phase.validate — those stay in site-kernel-checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0136: Extract audit.delta.run into the dedicated site-kernel-audit package.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { executeKernelCommand } from "@warpgogol/werkstatt/kernel";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";

interface Finding {
  ruleId: string;
  severity: "info" | "warn" | "error";
  file?: string;
  message: string;
}

interface ProvenanceChange {
  intent: "strengthen" | "new-route";
  pageId: string;
}

function readFlag(input: KernelCommandInput, name: string): string | undefined {
  const direct = input.flags[name];
  if (typeof direct === "string") return direct;
  return undefined;
}

async function readArtifact(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function result(
  command: string,
  findings: Finding[],
  extra: Record<string, unknown> = {},
): KernelCommandResult {
  const errors = findings.filter((finding) => finding.severity === "error");
  const status =
    errors.length > 0 ? "fail" : findings.some((f) => f.severity === "warn") ? "warn" : "pass";
  return {
    data: { command, status, findings, ...extra },
    exitCode: errors.length > 0 ? 1 : 0,
    summary:
      errors.length > 0
        ? `${command}: ${errors.length} violation(s)`
        : `${command}: OK${findings.length ? ` (${findings.length} note(s))` : ""}`,
  };
}

async function readBatchDelta(
  workspaceRoot: string,
  siteName: string,
  batch: string,
): Promise<ProvenanceChange[]> {
  // Prefer the (not-yet-committed) provenance record; fall back to the batch manifest.
  const recordRaw = await readArtifact(
    join(workspaceRoot, "apps", siteName, "provenance", "amend", `${batch}.json`),
  );
  if (recordRaw) {
    try {
      const record = JSON.parse(recordRaw) as { changes?: ProvenanceChange[] };
      if (record.changes?.length) return record.changes;
    } catch {
      /* fall through to manifest */
    }
  }
  const manifestRaw = await readArtifact(
    join(workspaceRoot, "onboarding", ".output", batch, "a0-intake", "input-manifest.json"),
  );
  if (!manifestRaw) return [];
  try {
    const manifest = JSON.parse(manifestRaw) as {
      files?: Array<{ pageId?: string; intent?: ProvenanceChange["intent"] }>;
    };
    const byPage = new Map<string, ProvenanceChange>();
    for (const file of manifest.files ?? []) {
      if (file.pageId && file.intent)
        byPage.set(file.pageId, { intent: file.intent, pageId: file.pageId });
    }
    return [...byPage.values()];
  } catch {
    return [];
  }
}

// RFC-0074 audit validators. Strengthen pages get content-scoped audits; new
// routes additionally need the full structured-data / linking surface.
const DELTA_CONTENT_AUDITS = [
  "seo.structured-data.validate",
  "seo.internal-linking.validate",
  "content.references.validate",
];
const DELTA_NEW_ROUTE_AUDITS = ["seo.technical.validate", "audit.agent.readiness.validate"];

export async function runAuditDeltaRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "audit.delta.run";
  const app = context.site;
  const batch = readFlag(input, "batch");

  if (!app) {
    return result(command, [
      {
        ruleId: "AUDIT.DELTA.NO-APP",
        severity: "error",
        message: `${command} requires an --site target.`,
      },
    ]);
  }
  if (!batch) {
    return result(command, [
      {
        ruleId: "AUDIT.DELTA.NO-BATCH",
        severity: "error",
        message: `${command} requires --batch amend-<NNN>.`,
      },
    ]);
  }

  const delta = await readBatchDelta(context.workspaceRoot, app.name, batch);
  if (delta.length === 0) {
    return result(command, [
      {
        ruleId: "AUDIT.DELTA.EMPTY",
        severity: "error",
        message: `No delta found for ${batch}; run amend.input.validate (and a3-author) first.`,
      },
    ]);
  }

  const hasNewRoute = delta.some((change) => change.intent === "new-route");
  // The RFC-0074 validators are whole-app: running them gives the non-regression
  // guarantee (a new route that breaks an untouched page's linking still fails),
  // while the delta set narrows what the agent is expected to have authored.
  const audits = hasNewRoute
    ? [...DELTA_CONTENT_AUDITS, ...DELTA_NEW_ROUTE_AUDITS]
    : DELTA_CONTENT_AUDITS;

  const findings: Finding[] = [];
  const steps: Array<{ command: string; ok: boolean; summary?: string }> = [];
  for (const audit of audits) {
    let report;
    try {
      report = await executeKernelCommand({
        workspaceRoot: context.workspaceRoot,
        commandName: audit,
        siteName: app.name,
        siteExplicit: true,
        argv: [],
      });
    } catch (error) {
      findings.push({
        ruleId: "AUDIT.DELTA.DISPATCH-ERROR",
        severity: "error",
        message: `${audit}: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const single = Array.isArray(report) ? report[0] : report;
    const ok = single?.ok ?? false;
    steps.push({ command: audit, ok, summary: single?.summary });
    if (!ok) {
      findings.push({
        ruleId: "AUDIT.DELTA.REGRESSION",
        severity: "error",
        message: `${audit} failed over the delta (touched: ${delta.map((d) => d.pageId).join(", ")}): ${single?.summary ?? "see logs"}`,
      });
    }
  }

  return result(command, findings, {
    batch,
    delta: delta.map((change) => ({ pageId: change.pageId, intent: change.intent })),
    steps,
  });
}
