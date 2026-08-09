import { parse as yamlParse, stringify as yamlStringify } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pseo-visibility.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not call external analytics APIs or execute destructive cluster actions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0282: first offline sense-to-action control loop for PSEO clusters.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  clusterOutcomeSchema,
  visibilitySnapshotSchema,
  type ClusterAction,
  type ClusterOutcome,
  type VisibilitySnapshot,
  type VirtualRouteEntry,
} from "@warpgogol/werkstatt-site/surface";
import type { OutcomesPayload } from "@warpgogol/werkstatt-site/surface/io";
import { diagnosticsResult, passResult } from "../result-helpers.ts";

const SURFACE_ARTIFACT_FILE = "src/surface.generated.yaml";
const VISIBILITY_DIR = "src/surface/visibility";
const OUTCOMES_FILE = "src/surface/visibility/outcomes.generated.yaml";
const DEMAND_MAP_FILE = "src/surface/demand-map.generated.yaml";

const PII_PATTERNS = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  /\b(userId|sessionId|clientId|customerId|visitorId|ipAddress|gaClientId|userPseudoId)\b/i,
];

interface SurfaceArtifactLike {
  entries?: VirtualRouteEntry[];
}

interface DemandMapLike {
  rows?: Array<{
    pageId?: string;
    surfaceId?: string;
    depth?: number;
    axes?: Record<string, string>;
    volume?: number;
  }>;
}

const DEFAULT_POLICY = {
  observationWindowDays: 28,
  expand: { indexationRateMin: 0.6, medianImpressionsMin: 30 },
  prune: { afterWindows: 3, impressionsMax: 0 },
  enrich: { requirePositiveDemand: true },
};

function stableAxes(axes: Record<string, unknown>): string {
  return Object.entries(axes)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
}

export function clusterIdForEntry(
  entry: Pick<VirtualRouteEntry, "surfaceId" | "depth" | "axes">,
): string {
  return `${entry.surfaceId}|d${entry.depth}|${stableAxes(entry.axes)}`;
}

function clusterIdFromRow(row: Record<string, unknown>): string {
  if (typeof row.clusterId === "string" && row.clusterId.trim()) return row.clusterId.trim();
  const axes =
    row.axes && typeof row.axes === "object"
      ? (row.axes as Record<string, unknown>)
      : {
          industry: row.industry,
          country: row.country,
          region: row.region,
          city: row.city,
          demand: row.demand,
        };
  return `${String(row.surfaceId ?? row.blueprint ?? "unknown")}|d${Number(row.depth ?? 0)}|${stableAxes(axes)}`;
}

function hasPii(value: unknown): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(JSON.stringify(value)));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseRows(raw: string): Record<string, unknown>[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = yamlParse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { snapshots?: unknown }).snapshots)
    ) {
      return (parsed as { snapshots: Record<string, unknown>[] }).snapshots;
    }
    return [parsed as Record<string, unknown>];
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines.shift() ?? "");
  return lines.map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]));
  });
}

function rowNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (value === undefined || value === "") return 0;
  return Number(value);
}

function rowToSnapshot(
  row: Record<string, unknown>,
  source: string,
  importedAt: string,
): VisibilitySnapshot {
  return visibilitySnapshotSchema.parse({
    clusterId: clusterIdFromRow(row),
    windowStart: String(row.windowStart ?? row.start ?? row.from),
    windowEnd: String(row.windowEnd ?? row.end ?? row.to),
    indexedPages: rowNumber(row, "indexedPages"),
    eligiblePages: rowNumber(row, "eligiblePages"),
    impressions: rowNumber(row, "impressions"),
    clicks: rowNumber(row, "clicks"),
    uniqueQueries: rowNumber(row, "uniqueQueries"),
    avgPosition:
      row.avgPosition === undefined || row.avgPosition === "" ? undefined : Number(row.avgPosition),
    source,
    importedAt,
    cannibalizingQueries: Array.isArray(row.cannibalizingQueries)
      ? row.cannibalizingQueries.map(String)
      : typeof row.cannibalizingQueries === "string" && row.cannibalizingQueries.trim()
        ? row.cannibalizingQueries
            .split("|")
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined,
    coreClicksBaseline:
      row.coreClicksBaseline === undefined || row.coreClicksBaseline === ""
        ? undefined
        : Number(row.coreClicksBaseline),
    coreClicksCurrent:
      row.coreClicksCurrent === undefined || row.coreClicksCurrent === ""
        ? undefined
        : Number(row.coreClicksCurrent),
  });
}

async function readJson<T>(appDir: string, file: string): Promise<T | null> {
  const path = join(appDir, file);
  if (!existsSync(path)) return null;
  return yamlParse(await readFile(path, "utf8")) as T;
}

async function writeJson(appDir: string, file: string, value: unknown): Promise<void> {
  const path = join(appDir, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${yamlStringify(value)}`, "utf8");
}

async function readSnapshots(
  appDir: string,
): Promise<Array<{ file: string; snapshots: VisibilitySnapshot[] }>> {
  const root = join(appDir, VISIBILITY_DIR);
  if (!existsSync(root)) return [];
  const files = (await readdir(root)).filter((file) => file.endsWith(".snapshot.json")).sort();
  const snapshots: Array<{ file: string; snapshots: VisibilitySnapshot[] }> = [];
  for (const file of files) {
    const full = join(root, file);
    const parsed = yamlParse(await readFile(full, "utf8")) as { snapshots?: unknown[] };
    snapshots.push({
      file: `${VISIBILITY_DIR}/${file}`,
      snapshots: (parsed.snapshots ?? []).map((item) => visibilitySnapshotSchema.parse(item)),
    });
  }
  return snapshots;
}

function latestSnapshots(
  records: Array<{ file: string; snapshots: VisibilitySnapshot[] }>,
): Map<string, VisibilitySnapshot> {
  const byCluster = new Map<string, VisibilitySnapshot>();
  for (const record of records) {
    for (const snapshot of record.snapshots) {
      const current = byCluster.get(snapshot.clusterId);
      if (!current || snapshot.windowEnd > current.windowEnd)
        byCluster.set(snapshot.clusterId, snapshot);
    }
  }
  return byCluster;
}

function positiveDemandClusters(
  artifact: SurfaceArtifactLike | null,
  demandMap: DemandMapLike | null,
): Map<string, number> {
  const byPageId = new Map((artifact?.entries ?? []).map((entry) => [entry.pageId, entry]));
  const map = new Map<string, number>();
  for (const row of demandMap?.rows ?? []) {
    const entry = typeof row.pageId === "string" ? byPageId.get(row.pageId) : undefined;
    const fallback =
      row.surfaceId && typeof row.depth === "number" && row.axes
        ? { surfaceId: row.surfaceId, depth: row.depth, axes: row.axes }
        : undefined;
    const source = entry ?? fallback;
    if (!source) continue;
    const clusterId = clusterIdForEntry(source);
    map.set(clusterId, (map.get(clusterId) ?? 0) + (Number(row.volume ?? 0) || 0));
  }
  return map;
}

function anomalyList(snapshot: VisibilitySnapshot, pages: VirtualRouteEntry[]): string[] {
  const anomalies: string[] = [];
  if (snapshot.indexedPages > 0 && snapshot.impressions === 0)
    anomalies.push("indexed-zero-impressions");
  if (snapshot.impressions > 0 && snapshot.clicks === 0) anomalies.push("impressions-zero-clicks");
  if ((snapshot.cannibalizingQueries?.length ?? 0) > 0) anomalies.push("cannibalization");
  const coreBaseline = snapshot.coreClicksBaseline;
  const coreCurrent = snapshot.coreClicksCurrent;
  if (coreBaseline && coreCurrent !== undefined && coreCurrent / coreBaseline < 0.8)
    anomalies.push("core-degradation");
  if (pages.length > 1 && snapshot.uniqueQueries > 0 && snapshot.uniqueQueries < pages.length)
    anomalies.push("low-query-diversity");
  return anomalies;
}

function proposedAction(
  snapshot: VisibilitySnapshot,
  outcome: Omit<ClusterOutcome, "proposedAction" | "rationale">,
): { action: ClusterAction; rationale: string } {
  if (
    outcome.anomalies.includes("core-degradation") ||
    outcome.anomalies.includes("cannibalization")
  ) {
    return {
      action: "escalate",
      rationale: `anomaly requires governed review: ${outcome.anomalies.join(", ")}`,
    };
  }
  if (
    snapshot.impressions <= DEFAULT_POLICY.prune.impressionsMax &&
    Date.parse(snapshot.windowEnd) - Date.parse(snapshot.windowStart) >=
      DEFAULT_POLICY.observationWindowDays * DEFAULT_POLICY.prune.afterWindows * 86_400_000
  ) {
    return {
      action: "prune",
      rationale: "multi-window zero-impression cluster should be retired through URL policy",
    };
  }
  if (outcome.positiveDemand && snapshot.impressions > 0 && snapshot.clicks === 0) {
    return {
      action: "enrich",
      rationale: "positive demand exists but clicks lag; enrich before expanding",
    };
  }
  if (
    outcome.indexationRate >= DEFAULT_POLICY.expand.indexationRateMin &&
    outcome.medianImpressionsPerPage >= DEFAULT_POLICY.expand.medianImpressionsMin
  ) {
    return {
      action: "expand",
      rationale: "indexation and impressions exceed expansion thresholds",
    };
  }
  return {
    action: "hold",
    rationale: "not enough positive signal for expansion or governed intervention",
  };
}

function buildOutcomes(
  artifact: SurfaceArtifactLike | null,
  snapshots: Map<string, VisibilitySnapshot>,
  demandVolumes: Map<string, number>,
): { outcomes: ClusterOutcome[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const clusters = new Map<string, VirtualRouteEntry[]>();
  for (const entry of artifact?.entries ?? []) {
    const clusterId = clusterIdForEntry(entry);
    clusters.set(clusterId, [...(clusters.get(clusterId) ?? []), entry]);
  }
  const outcomes: ClusterOutcome[] = [];
  for (const [clusterId, snapshot] of snapshots) {
    const pages = clusters.get(clusterId) ?? [];
    if (pages.length === 0) {
      diagnostics.push({
        ruleId: "VIS-01",
        severity: "error",
        file: OUTCOMES_FILE,
        message: `Visibility snapshot references unknown cluster "${clusterId}".`,
      });
      continue;
    }
    const eligiblePages = Math.max(
      snapshot.eligiblePages,
      pages.filter((page) => page.indexable).length,
    );
    const base = {
      clusterId,
      surfaceId: pages[0]?.surfaceId,
      depth: pages[0]?.depth,
      eligiblePages,
      indexedPages: snapshot.indexedPages,
      impressions: snapshot.impressions,
      clicks: snapshot.clicks,
      uniqueQueries: snapshot.uniqueQueries,
      indexationRate: eligiblePages === 0 ? 0 : snapshot.indexedPages / eligiblePages,
      medianImpressionsPerPage:
        eligiblePages === 0 ? 0 : Math.round(snapshot.impressions / eligiblePages),
      queryDiversityShare:
        eligiblePages === 0 ? 0 : Math.min(1, snapshot.uniqueQueries / eligiblePages),
      positiveDemand: (demandVolumes.get(clusterId) ?? 0) > 0,
      anomalies: anomalyList(snapshot, pages),
    };
    const action = proposedAction(snapshot, base);
    const outcome = clusterOutcomeSchema.parse({
      ...base,
      proposedAction: action.action,
      rationale: action.rationale,
    });
    if (outcome.proposedAction === "enrich" && !outcome.positiveDemand) {
      diagnostics.push({
        ruleId: "VIS-03",
        severity: "error",
        file: OUTCOMES_FILE,
        message: `Cluster "${clusterId}" proposed enrich without a positive demand signal.`,
      });
    }
    if (outcome.anomalies.includes("indexed-zero-impressions")) {
      diagnostics.push({
        ruleId: "VIS-02",
        severity: "warning",
        file: OUTCOMES_FILE,
        message: `Cluster "${clusterId}" is indexed but has zero impressions.`,
      });
    }
    if (outcome.anomalies.includes("cannibalization")) {
      diagnostics.push({
        ruleId: "VIS-04",
        severity: "warning",
        file: OUTCOMES_FILE,
        message: `Cluster "${clusterId}" reports query cannibalization.`,
      });
    }
    outcomes.push(outcome);
  }
  return { outcomes, diagnostics };
}

function payloadFor(
  outcomes: ClusterOutcome[],
  demandVolumes: Map<string, number>,
): OutcomesPayload {
  return {
    generatedAt: null,
    policy: DEFAULT_POLICY,
    outcomes,
    demandCorrections: outcomes.map((outcome) => ({
      clusterId: outcome.clusterId,
      realizedImpressions: outcome.impressions,
      demandVolume: demandVolumes.get(outcome.clusterId) ?? 0,
    })),
  };
}

export async function runVisibilityImport(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "visibility.import must run inside an app context." };
  const inputPath = typeof input.flags.input === "string" ? input.flags.input : "";
  const source = typeof input.flags.source === "string" ? input.flags.source : "manual";
  if (!inputPath) return { exitCode: 1, summary: "visibility.import requires --input <file>." };
  const raw = await readFile(join(context.workspaceRoot, inputPath), "utf8");
  const rows = parseRows(raw);
  const diagnostics: Diagnostic[] = [];
  const importedAt = new Date().toISOString();
  const snapshots: VisibilitySnapshot[] = [];
  for (const [index, row] of rows.entries()) {
    if (hasPii(row)) {
      diagnostics.push({
        ruleId: "VIS-05",
        severity: "error",
        message: `Visibility import row ${index + 1} contains PII-like or per-user analytics data.`,
      });
      continue;
    }
    try {
      snapshots.push(rowToSnapshot(row, source, importedAt));
    } catch (error) {
      diagnostics.push({
        ruleId: "VIS-01",
        severity: "error",
        message: `Visibility import row ${index + 1} is malformed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return diagnosticsResult("visibility.import", diagnostics);
  const windowEnd =
    snapshots
      .map((snapshot) => snapshot.windowEnd.slice(0, 10))
      .sort()
      .at(-1) ?? importedAt.slice(0, 10);
  const dest = `${VISIBILITY_DIR}/${windowEnd}.${source}.snapshot.json`;
  if (!context.dryRun) {
    await writeJson(app.directory, dest, {
      importedAt,
      source,
      snapshots,
    });
  }
  return {
    ...diagnosticsResult("visibility.import", diagnostics),
    summary: `visibility.import: imported ${snapshots.length} snapshot(s)`,
  };
}

export async function runVisibilityReconcile(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "visibility.reconcile must run inside an app context." };
  const artifact = await readJson<SurfaceArtifactLike>(app.directory, SURFACE_ARTIFACT_FILE);
  if (!artifact) return passResult("visibility.reconcile", "skipped (no surface artifact)");
  const snapshots = latestSnapshots(await readSnapshots(app.directory));
  if (snapshots.size === 0)
    return passResult("visibility.reconcile", "skipped (no visibility snapshots)");
  const demandVolumes = positiveDemandClusters(
    artifact,
    await readJson<DemandMapLike>(app.directory, DEMAND_MAP_FILE),
  );
  const { outcomes, diagnostics } = buildOutcomes(artifact, snapshots, demandVolumes);
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error") && !context.dryRun) {
    await writeJson(app.directory, OUTCOMES_FILE, payloadFor(outcomes, demandVolumes));
  }
  return {
    ...diagnosticsResult("visibility.reconcile", diagnostics),
    summary: `visibility.reconcile: ${outcomes.length} outcome(s), ${diagnostics.length} diagnostic(s)`,
  };
}

export async function runVisibilityActionPlan(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "visibility.action.plan must run inside an app context." };
  const payload = await readJson<OutcomesPayload>(app.directory, OUTCOMES_FILE);
  if (!payload) return passResult("visibility.action.plan", "skipped (no reconciled outcomes)");
  const diagnostics: Diagnostic[] = [];
  const outcomes = (payload.outcomes ?? []).map((outcome) => clusterOutcomeSchema.parse(outcome));
  for (const outcome of outcomes) {
    if (outcome.proposedAction === "enrich" && !outcome.positiveDemand) {
      diagnostics.push({
        ruleId: "VIS-03",
        severity: "error",
        file: OUTCOMES_FILE,
        message: `Cluster "${outcome.clusterId}" proposed enrich without a positive demand signal.`,
      });
    }
  }
  if (!diagnostics.some((diagnostic) => diagnostic.severity === "error") && !context.dryRun) {
    await writeJson(app.directory, OUTCOMES_FILE, { ...payload, generatedAt: null, outcomes });
  }
  return {
    ...diagnosticsResult("visibility.action.plan", diagnostics),
    summary: `visibility.action.plan: ${outcomes.length} proposed cluster action(s)`,
  };
}

export { readVisibilityOutcomes, type OutcomesPayload } from "@warpgogol/werkstatt-site/surface/io";
