/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/surface-demand.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not call Google Search Console, Keyword Planner, or any external API.</item>
  <item>Do not fabricate search volume or completed works.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0280/RFC-0281: first-class demand signals and Werk evidence joins.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { byteHash } from "@warpgogol/werkstatt/fingerprint";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import {
  demandSignalSchema,
  werkRecordSchema,
  type BlueprintDemandDepthPolicy,
  type DemandSignal,
  type VirtualRouteEntry,
  type WerkRecord,
} from "@warpgogol/werkstatt-site/surface";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { toKebabCase } from "@warpgogol/werkstatt-site/share/string-utils";
import { stringify as stringifyYaml, parse as yamlParse, stringify as yamlStringify } from "yaml";
import type { ZodType } from "zod";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

const DEMAND_ROOT = ["src", "content", "surface", "demand-signals"];
const WERK_ROOT = ["src", "content", "surface", "werke"];
const ARTIFACT_FILE = "src/surface.generated.yaml";
const DEMAND_MAP_FILE = "src/surface/demand-map.generated.yaml";
const EVIDENCE_JOIN_FILE = "src/surface/evidence-join.generated.yaml";

const PII_PATTERNS = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  /\b(userId|sessionId|clientId|customerId|visitorId|ipAddress)\b/i,
];

interface ParsedRecord<T> {
  file: string;
  lang: string;
  raw: Record<string, unknown>;
  record?: T;
  errors: string[];
}

interface SurfaceArtifactLike {
  entries?: VirtualRouteEntry[];
}

function digest(value: string): string {
  return byteHash(value);
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function axisMatches(signalAxes: Record<string, unknown>, entry: VirtualRouteEntry): boolean {
  for (const [axis, value] of Object.entries(signalAxes)) {
    if (typeof value !== "string") continue;
    if (entry.axes[axis] !== value) return false;
  }
  return true;
}

function workMatches(work: WerkRecord, entry: VirtualRouteEntry): boolean {
  const industry = entry.axes.industry;
  const city = entry.axes.city;
  const demand = entry.axes.demand;
  if (industry && !work.axes.industry.includes(industry)) return false;
  if (city && work.axes.city !== city) return false;
  if (entry.axes.country && work.axes.country && work.axes.country !== entry.axes.country)
    return false;
  if (entry.axes.region && work.axes.region && work.axes.region !== entry.axes.region) return false;
  if (demand && work.axes.demand?.length && !work.axes.demand.includes(demand)) return false;
  return true;
}

function isStale(isoDate: string, staleAfterDays: number, now = Date.now()): boolean {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return true;
  return Math.floor((now - parsed) / 86_400_000) > staleAfterDays;
}

function hasPii(value: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(value));
}

async function readMarkdownRecords<T>(
  appDir: string,
  rootParts: readonly string[],
  schema: ZodType<T>,
): Promise<ParsedRecord<T>[]> {
  const root = join(appDir, ...rootParts);
  if (!existsSync(root)) return [];
  const files = await collectMarkdownFiles(root);
  const parsed: ParsedRecord<T>[] = [];
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, "/");
    const [lang = "und"] = rel.split("/");
    try {
      const rawText = await readFile(file, "utf8");
      const { data } = parseMarkdownFrontmatter(rawText);
      const result = schema.safeParse(data);
      if (result.success) {
        parsed.push({ file, lang, raw: data, record: result.data, errors: [] });
      } else {
        parsed.push({
          file,
          lang,
          raw: data,
          errors: result.error.issues.map(
            (issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
          ),
        });
      }
    } catch (error) {
      parsed.push({
        file,
        lang,
        raw: {},
        errors: [error instanceof Error ? error.message : "unreadable record"],
      });
    }
  }
  return parsed;
}

export async function loadDemandSignals(appDir: string, lang?: string): Promise<DemandSignal[]> {
  const parsed = await readMarkdownRecords(appDir, DEMAND_ROOT, demandSignalSchema);
  return parsed
    .filter((entry) => !lang || entry.lang === lang)
    .map((entry) => entry.record)
    .filter((record): record is DemandSignal => Boolean(record));
}

export async function loadWerkRecords(appDir: string, lang?: string): Promise<WerkRecord[]> {
  const parsed = await readMarkdownRecords(appDir, WERK_ROOT, werkRecordSchema);
  return parsed
    .filter((entry) => !lang || entry.lang === lang)
    .map((entry) => entry.record)
    .filter((record): record is WerkRecord => Boolean(record));
}

export function qualifyingDemandSignals(
  signals: readonly DemandSignal[],
  entry: VirtualRouteEntry,
  policy: BlueprintDemandDepthPolicy,
): DemandSignal[] {
  const minVolume = policy.minVolume ?? 0;
  const allowed = new Set(
    policy.allowIntents ?? ["informational", "commercial", "transactional", "navigational"],
  );
  const staleAfter = policy.staleAfterDays ?? 365;
  return signals.filter(
    (signal) =>
      axisMatches(signal.axes, entry) &&
      allowed.has(signal.intent) &&
      (signal.volume ?? 0) >= minVolume &&
      !isStale(signal.observedAt, staleAfter),
  );
}

export function qualifyingWerkRecords(
  works: readonly WerkRecord[],
  entry: VirtualRouteEntry,
): WerkRecord[] {
  return works.filter(
    (work) => work.consent.publishable && work.consent.clientApproved && workMatches(work, entry),
  );
}

async function readArtifact(appDir: string): Promise<SurfaceArtifactLike | null> {
  const path = join(appDir, ARTIFACT_FILE);
  if (!existsSync(path)) return null;
  return yamlParse(await readFile(path, "utf8")) as SurfaceArtifactLike;
}

function axisUniverseFromArtifact(artifact: SurfaceArtifactLike | null): Map<string, Set<string>> {
  const universes = new Map<string, Set<string>>();
  for (const entry of artifact?.entries ?? []) {
    for (const [axis, value] of Object.entries(entry.axes)) {
      if (typeof value !== "string") continue;
      const set = universes.get(axis) ?? new Set<string>();
      set.add(value);
      universes.set(axis, set);
    }
  }
  return universes;
}

function validateAxisValues(
  axes: Record<string, unknown>,
  universes: Map<string, Set<string>>,
  file: string,
  ruleId: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [axis, value] of Object.entries(axes)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item !== "string") continue;
      const universe = universes.get(axis);
      if (universe && !universe.has(item)) {
        diagnostics.push({
          ruleId,
          severity: "error",
          file,
          message: `Axis value ${axis}:${item} does not resolve against generated surface axes.`,
          data: { axis, value: item },
        });
      }
    }
  }
  return diagnostics;
}

export async function runDemandSignalValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "demand.signal.validate must run inside an app context." };
  const artifact = await readArtifact(app.directory);
  const universes = axisUniverseFromArtifact(artifact);
  const parsed = await readMarkdownRecords(app.directory, DEMAND_ROOT, demandSignalSchema);
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (entry.errors.length) {
      diagnostics.push({
        ruleId: "DEM-01",
        severity: "error",
        file: entry.file,
        message: `Demand signal fails schema: ${entry.errors.join("; ")}`,
      });
      continue;
    }
    const signal = entry.record!;
    diagnostics.push(...validateAxisValues(signal.axes, universes, entry.file, "DEM-01"));
    if (normalizeQuery(signal.query) !== signal.query) {
      diagnostics.push({
        ruleId: "DEM-01",
        severity: "error",
        file: entry.file,
        message: `Demand signal query must be normalized lowercase: "${signal.query}".`,
      });
    }
    if (isStale(signal.observedAt, 365)) {
      diagnostics.push({
        ruleId: "DEM-02",
        severity: "warning",
        file: entry.file,
        message: `Demand signal "${signal.id}" is stale beyond 365 days.`,
      });
    }
    const rawText = JSON.stringify(entry.raw);
    if (hasPii(rawText)) {
      diagnostics.push({
        ruleId: "DEM-05",
        severity: "error",
        file: entry.file,
        message: `Demand signal "${signal.id}" contains PII-like or per-user analytics fields.`,
      });
    }
    const key = `${entry.lang}|${signal.query}|${JSON.stringify(signal.axes)}`;
    if (seen.has(key)) {
      diagnostics.push({
        ruleId: "DEM-04",
        severity: "warning",
        file: entry.file,
        message: `Duplicate demand query "${signal.query}" for the same axis binding.`,
      });
    }
    seen.add(key);
  }
  return diagnosticsResult("demand.signal.validate", diagnostics);
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

function parseImportRows(raw: string): Record<string, unknown>[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = yamlParse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { signals?: unknown }).signals)
    ) {
      return (parsed as { signals: Record<string, unknown>[] }).signals;
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

function rowToSignal(row: Record<string, unknown>, source: string, importId: string): DemandSignal {
  const axes =
    row.axes && typeof row.axes === "object"
      ? (row.axes as Record<string, string>)
      : {
          industry: typeof row.industry === "string" ? row.industry : undefined,
          country: typeof row.country === "string" ? row.country : undefined,
          region: typeof row.region === "string" ? row.region : undefined,
          city: typeof row.city === "string" ? row.city : undefined,
          demand: typeof row.demand === "string" ? row.demand : undefined,
        };
  const compactAxes = Object.fromEntries(
    Object.entries(axes).filter(([, value]) => typeof value === "string" && value.trim()),
  );
  const query = normalizeQuery(String(row.query ?? ""));
  const signal = {
    id: String(row.id ?? toKebabCase(`${importId}-${query}`)),
    query,
    intent: String(row.intent ?? "commercial"),
    axes: compactAxes,
    volume: row.volume === undefined || row.volume === "" ? undefined : Number(row.volume),
    competition:
      row.competition === undefined || row.competition === "" ? undefined : Number(row.competition),
    source,
    observedAt: String(row.observedAt ?? new Date().toISOString()),
    provenance: {
      importId,
      sourceRef: typeof row.sourceRef === "string" ? row.sourceRef : undefined,
    },
  };
  return demandSignalSchema.parse(signal);
}

export async function runDemandSignalImport(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "demand.signal.import must run inside an app context." };
  const inputPath = typeof input.flags.input === "string" ? input.flags.input : "";
  const lang = typeof input.flags.lang === "string" ? input.flags.lang : "de";
  const source = typeof input.flags.source === "string" ? input.flags.source : "manual";
  const importId =
    typeof input.flags.importId === "string"
      ? input.flags.importId
      : `import-${new Date().toISOString().slice(0, 10)}`;
  if (!inputPath) return { exitCode: 1, summary: "demand.signal.import requires --input <file>." };
  const raw = await readFile(join(context.workspaceRoot, inputPath), "utf8");
  const rows = parseImportRows(raw);
  const destDir = join(app.directory, ...DEMAND_ROOT, lang);
  await mkdir(destDir, { recursive: true });
  let written = 0;
  for (const row of rows) {
    const signal = rowToSignal(row, source, importId);
    const dest = join(destDir, `${toKebabCase(signal.id)}.md`);
    const body = `---\n${stringifyYaml(signal).trim()}\n---\n\nImported demand signal ${signal.id}.\n`;
    if (!context.dryRun) await writeFile(dest, body, "utf8");
    written += 1;
  }
  return {
    exitCode: 0,
    summary: `demand.signal.import: ${context.dryRun ? "would import" : "imported"} ${written} signal(s)`,
    data: { command: "demand.signal.import", written, dryRun: context.dryRun },
  };
}

export async function runDemandMapReport(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "demand.map.report must run inside an app context." };
  const artifact = await readArtifact(app.directory);
  if (!artifact) return passResult("demand.map.report", "skipped (no surface artifact)");
  const blueprint = typeof input.flags.blueprint === "string" ? input.flags.blueprint : undefined;
  const lang = typeof input.flags.lang === "string" ? input.flags.lang : "de";
  const signals = await loadDemandSignals(app.directory, lang);
  const rows = (artifact.entries ?? [])
    .filter((entry) => entry.indexable && (!blueprint || entry.surfaceId === blueprint))
    .map((entry) => {
      const matching = signals.filter((signal) => axisMatches(signal.axes, entry));
      const volume = matching.reduce((sum, signal) => sum + (signal.volume ?? 0), 0);
      return {
        pageId: entry.pageId,
        surfaceId: entry.surfaceId,
        depth: entry.depth,
        axes: entry.axes,
        volume,
        queries: matching.map((signal) => ({
          id: signal.id,
          query: signal.query,
          intent: signal.intent,
          volume: signal.volume ?? 0,
          source: signal.source,
          observedAt: signal.observedAt,
        })),
      };
    })
    .filter((row) => row.queries.length > 0);
  const payload = {
    generatedAt: null,
    lang,
    blueprint: blueprint ?? "all",
    rows,
  };
  const dest = join(app.directory, DEMAND_MAP_FILE);
  await mkdir(dirname(dest), { recursive: true });
  if (!context.dryRun) await writeFile(dest, `${yamlStringify(payload)}`, "utf8");
  return {
    exitCode: 0,
    summary: `demand.map.report: ${rows.length} mapped tuple(s)`,
    data: payload,
  };
}

export async function runWerkRecordValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) return { exitCode: 1, summary: "werk.record.validate must run inside an app context." };
  const artifact = await readArtifact(app.directory);
  const universes = axisUniverseFromArtifact(artifact);
  const parsed = await readMarkdownRecords(app.directory, WERK_ROOT, werkRecordSchema);
  const diagnostics: Diagnostic[] = [];
  for (const entry of parsed) {
    if (entry.errors.length) {
      diagnostics.push({
        ruleId: "WERK-01",
        severity: "error",
        file: entry.file,
        message: `Werk record fails schema or anchored provenance: ${entry.errors.join("; ")}`,
      });
      continue;
    }
    const work = entry.record!;
    diagnostics.push(
      ...validateAxisValues(
        work.axes as unknown as Record<string, unknown>,
        universes,
        entry.file,
        "WERK-05",
      ),
    );
    if (work.consent.publishable && work.consent.clientApproved === false) {
      diagnostics.push({
        ruleId: "WERK-02",
        severity: "error",
        file: entry.file,
        message: `Werk "${work.id}" is publishable but lacks client approval.`,
      });
    }
    for (const media of work.media ?? []) {
      if (!media.creditRef.trim()) {
        diagnostics.push({
          ruleId: "WERK-04",
          severity: "warning",
          file: entry.file,
          message: `Werk "${work.id}" media "${media.ref}" lacks an RFC-0220 credit reference.`,
        });
      }
    }
  }
  return diagnosticsResult("werk.record.validate", diagnostics);
}

export async function runSurfaceEvidenceJoin(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "surface.evidence.join must run inside an app context." };
  const artifact = await readArtifact(app.directory);
  if (!artifact) return passResult("surface.evidence.join", "skipped (no surface artifact)");
  const blueprint = typeof input.flags.blueprint === "string" ? input.flags.blueprint : undefined;
  const lang = typeof input.flags.lang === "string" ? input.flags.lang : "de";
  const works = await loadWerkRecords(app.directory, lang);
  const rows = (artifact.entries ?? [])
    .filter((entry) => entry.indexable && (!blueprint || entry.surfaceId === blueprint))
    .map((entry) => ({
      pageId: entry.pageId,
      surfaceId: entry.surfaceId,
      depth: entry.depth,
      axes: entry.axes,
      works: qualifyingWerkRecords(works, entry).map((work) => ({
        id: work.id,
        title: work.title,
        sourceRef: work.provenance.sourceRef,
        anchoredHash: work.provenance.anchoredHash,
      })),
    }))
    .filter((row) => row.works.length > 0);
  const payload = {
    generatedAt: null,
    lang,
    blueprint: blueprint ?? "all",
    rows,
  };
  const dest = join(app.directory, EVIDENCE_JOIN_FILE);
  await mkdir(dirname(dest), { recursive: true });
  if (!context.dryRun) await writeFile(dest, `${yamlStringify(payload)}`, "utf8");
  return {
    ...diagnosticsResult("surface.evidence.join", []),
    summary: `surface.evidence.join: ${rows.length} joined tuple(s)`,
    data: {
      command: "surface.evidence.join",
      status: "pass",
      diagnostics: [],
      summary: { error: 0, warning: 0, info: 0 },
    },
  };
}

export function stableAnchoredHash(value: unknown): string {
  return digest(JSON.stringify(value));
}
