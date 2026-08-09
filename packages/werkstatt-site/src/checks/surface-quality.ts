import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  RFC-0274 quality gates for Programmatic Surface evidence and duplicate risk.
  Reads generated artifacts plus Blueprint policy and emits deterministic RFC-0203 diagnostics.
</purpose>
<non-goals>
  <item>Do not call an LLM or score helpfulness subjectively.</item>
  <item>Do not mutate generated surface artifacts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0274: introduce surface.evidence.validate and surface.duplicate.validate.</item>
</CHANGE_SUMMARY>
*/

import { basename, join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import {
  buildAxisFieldMap,
  includeInLlms,
  includeInTwins,
  matchesRecord,
  pageText,
  tokenize,
  type Blueprint,
  type PageEntry,
  type SurfaceArtifact,
  type SurfaceRecord,
  type VirtualRouteEntry,
} from "@warpgogol/werkstatt-site/surface";
import {
  collectMarkdownFiles,
  loadSystemManifest,
  parseMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import { toKebabCase } from "@warpgogol/werkstatt-site/share/string-utils";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSurfaceBlueprints } from "./surface-expand.ts";
import { loadApprovedNarrativesBulk } from "./surface-enrich.ts";
import { loadWerkRecords, qualifyingWerkRecords } from "./surface-demand.ts";
import { loadSourceDescriptors } from "./content-source-binding.ts";

const ARTIFACT_FILE = "src/surface.generated.yaml";

function pageIdToFile(pageId: string): string {
  return pageId.replace(/[^a-z0-9_-]/gi, "__");
}

async function loadArtifact(appDir: string): Promise<SurfaceArtifact | null> {
  const artifactPath = join(appDir, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) return null;
  return yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
}

async function readDefaultLang(appDir: string): Promise<string> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  return (manifest as unknown as { i18n?: { default?: string } }).i18n?.default ?? "de";
}

async function pagesForEntry(appDir: string, entry: VirtualRouteEntry): Promise<PageEntry[]> {
  if (entry.pages) return Object.values(entry.pages);
  if (entry.lazy) {
    try {
      const raw = await readFile(
        join(appDir, ".surface-cache", `${pageIdToFile(entry.pageId)}.yaml`),
        "utf8",
      );
      const parsed = yamlParse(raw) as { pages?: Record<string, PageEntry> };
      if (parsed.pages) return Object.values(parsed.pages);
    } catch {
      return entry.page ? [entry.page] : [];
    }
  }
  return entry.page ? [entry.page] : [];
}

export async function defaultPageForEntry(
  appDir: string,
  entry: VirtualRouteEntry,
): Promise<PageEntry | undefined> {
  return (await pagesForEntry(appDir, entry))[0] ?? entry.page;
}

function hasEvidenceValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasEvidenceValue);
  if (typeof value !== "string") return value !== undefined && value !== null;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !/^(need_this|todo|tbd|placeholder|n\/a)$/i.test(trimmed);
}

async function loadRecords(
  appDir: string,
  bp: Blueprint,
  defaultLang: string,
): Promise<SurfaceRecord[]> {
  const dir = join(appDir, "src", "content", "surface", bp.dataset.collection, defaultLang);
  let files: string[] = [];
  try {
    files = await collectMarkdownFiles(dir);
  } catch {
    return [];
  }
  const records: SurfaceRecord[] = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const { data } = parseMarkdownFrontmatter(raw);
    records.push({
      ...(data as Record<string, string | string[] | undefined>),
      slug:
        typeof (data as { slug?: unknown }).slug === "string"
          ? (data as { slug: string }).slug
          : basename(file, ".md"),
      status:
        typeof (data as { status?: unknown }).status === "string"
          ? (data as { status: "active" | "archived" }).status
          : "active",
    });
  }
  return records;
}

function matchingRecords(
  bp: Blueprint,
  records: readonly SurfaceRecord[],
  entry: VirtualRouteEntry,
): SurfaceRecord[] {
  return records.filter((record) => matchesRecord(record, entry.axes, buildAxisFieldMap(bp)));
}

function freshnessInvalid(
  bp: Blueprint,
  records: readonly SurfaceRecord[],
  entry: VirtualRouteEntry,
): boolean {
  const sla = bp.freshness?.slaDaysPerDepth[entry.depth];
  const field = bp.freshness?.field;
  if (sla === undefined || !field) return false;
  return matchingRecords(bp, records, entry).some((record) => {
    const value = record[field];
    return typeof value !== "string" || Number.isNaN(Date.parse(value));
  });
}

interface LocalFactLike {
  sourceRef?: string;
  asOf?: string;
  reviewEvery?: string;
  provenance?: string;
  text?: unknown;
}

function localFacts(record: SurfaceRecord): LocalFactLike[] {
  const value = (record as Record<string, unknown>).localFacts;
  return Array.isArray(value) ? (value as LocalFactLike[]) : [];
}

function citySpecificQaCount(record: SurfaceRecord, city: string | undefined): number {
  const value = (record as Record<string, unknown>).citySpecificQa;
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const qa = item as Record<string, unknown>;
    const question = typeof qa.question === "string" ? qa.question.trim() : "";
    const answer = typeof qa.answer === "string" ? qa.answer.trim() : "";
    const normalizedAnswer = answer.toLowerCase();
    const normalizedCity = city?.toLowerCase().replace(/-/g, " ");
    return (
      question.length > 0 &&
      answer.length > 0 &&
      (!normalizedCity || normalizedAnswer.includes(normalizedCity))
    );
  }).length;
}

function isValidLocalFact(fact: LocalFactLike, sourceIds: ReadonlySet<string>): boolean {
  const text =
    typeof fact.text === "string"
      ? fact.text
      : fact.text && typeof fact.text === "object"
        ? Object.values(fact.text as Record<string, unknown>).find(
            (value) => typeof value === "string",
          )
        : undefined;
  return (
    typeof text === "string" &&
    text.trim().length > 0 &&
    fact.provenance === "external" &&
    typeof fact.sourceRef === "string" &&
    sourceIds.has(fact.sourceRef) &&
    typeof fact.asOf === "string" &&
    !Number.isNaN(Date.parse(fact.asOf)) &&
    typeof fact.reviewEvery === "string" &&
    fact.reviewEvery.length > 1
  );
}

export async function runSurfaceEvidenceValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "surface.evidence.validate must run inside an app context." };
  const artifact = await loadArtifact(app.directory);
  if (!artifact) return passResult("surface.evidence.validate", "skipped (no surface artifact)");
  const onlyBlueprint =
    typeof input.flags.blueprint === "string" ? input.flags.blueprint : undefined;
  const defaultLang = await readDefaultLang(app.directory);
  const blueprints = (await loadSurfaceBlueprints(context.workspaceRoot)).filter(
    (bp) => !onlyBlueprint || bp.id === onlyBlueprint,
  );
  const bpById = new Map(blueprints.map((bp) => [bp.id, bp]));
  const recordsByBlueprint = new Map<string, SurfaceRecord[]>();
  const narrativesByKey = new Map<string, Set<string>>();
  const works = await loadWerkRecords(app.directory, defaultLang);
  const sourceIds = new Set((await loadSourceDescriptors(context.workspaceRoot)).byId.keys());
  const diagnostics: Diagnostic[] = [];

  for (const bp of blueprints) {
    recordsByBlueprint.set(bp.id, await loadRecords(app.directory, bp, defaultLang));
    for (const field of (bp.enrichedFields ?? []).filter((f) => f.kind === "narrative")) {
      const narratives = await loadApprovedNarrativesBulk(app.directory, bp.id, defaultLang);
      narrativesByKey.set(`${bp.id}|${field.field}`, new Set(narratives.keys()));
    }
  }

  for (const entry of artifact.entries ?? []) {
    const bp = bpById.get(entry.surfaceId);
    if (!bp || !entry.indexable) continue;
    const depthRole = bp.policy.depthRoles?.[entry.depth];
    if (depthRole?.indexability === "navigation-noindex") {
      const canonicalOk =
        typeof entry.canonicalPageId === "string" && entry.canonicalPageId.length > 0;
      if (
        !entry.noindex ||
        entry.geo !== "off" ||
        !canonicalOk ||
        includeInTwins(entry) ||
        includeInLlms(entry)
      ) {
        diagnostics.push({
          ruleId: "PSEO-EVID-04",
          severity: "error",
          file: ARTIFACT_FILE,
          message: `${entry.pageId} is a navigation-noindex depth but does not carry noindex/geo-off/canonical exclusion correctly.`,
          fixHint:
            "Regenerate with RFC-0324 depthRoles so navigation pages remain live for users but stay out of sitemap/GEO/twins.",
          data: { pageId: entry.pageId, depth: entry.depth, surfaceId: entry.surfaceId },
        });
      }
    }
    const levelExists = bp.levels.some((level) => level.depth === entry.depth);
    if (!levelExists) {
      diagnostics.push({
        ruleId: "PSEO-EVID-04",
        severity: "error",
        file: ARTIFACT_FILE,
        message: `${entry.pageId} has no matching Blueprint level for depth ${entry.depth}.`,
        fixHint:
          "Do not emit phantom levels; regenerate after correcting the Blueprint or artifact.",
        data: { pageId: entry.pageId, depth: entry.depth, surfaceId: entry.surfaceId },
      });
      continue;
    }
    const localEvidence = depthRole?.localEvidence;
    if (localEvidence && !entry.noindex) {
      const records = recordsByBlueprint.get(bp.id) ?? [];
      const matching = matchingRecords(bp, records, entry);
      const validFacts = matching
        .flatMap(localFacts)
        .filter((fact) => isValidLocalFact(fact, sourceIds));
      const qaCount = matching.reduce(
        (sum, record) => sum + citySpecificQaCount(record, entry.axes.city),
        0,
      );
      const missing: string[] = [];
      if (
        typeof localEvidence.minVerifiedFacts === "number" &&
        validFacts.length < localEvidence.minVerifiedFacts
      ) {
        missing.push(`localFacts ${validFacts.length}/${localEvidence.minVerifiedFacts}`);
      }
      if (
        typeof localEvidence.minCitySpecificQa === "number" &&
        qaCount < localEvidence.minCitySpecificQa
      ) {
        missing.push(`citySpecificQa ${qaCount}/${localEvidence.minCitySpecificQa}`);
      }
      if (missing.length > 0) {
        diagnostics.push({
          ruleId: "PSEO-EVID-01",
          severity: "error",
          file: ARTIFACT_FILE,
          message: `${entry.pageId} is indexable but missing RFC-0324 local evidence: ${missing.join(", ")}.`,
          fixHint:
            "Add source-backed localFacts and citySpecificQa to contributing city records, or noindex the page.",
          data: { pageId: entry.pageId, depth: entry.depth, surfaceId: entry.surfaceId, missing },
        });
      }
    }

    const policy = bp.policy.evidencePerDepth?.[entry.depth];
    if (!policy) continue;
    const severity = policy.mode === "warning" ? "warning" : "error";
    const records = recordsByBlueprint.get(bp.id) ?? [];
    const matching = matchingRecords(bp, records, entry);
    const missing: string[] = [];
    if (policy.approvedNarrative === "required") {
      const narrativeField = (bp.enrichedFields ?? []).find(
        (f) => f.kind === "narrative" && f.scopeDepth === entry.depth,
      );
      const narrativeKey = narrativeField
        ? `${toKebabCase(entry.pageId)}-${toKebabCase(narrativeField.field)}`
        : "";
      if (
        !narrativeField ||
        !narrativesByKey.get(`${bp.id}|${narrativeField.field}`)?.has(narrativeKey)
      ) {
        missing.push("approvedNarrative");
      }
    }
    for (const field of policy.requiredRecordFields ?? []) {
      if (!matching.some((record) => hasEvidenceValue(record[field]))) missing.push(field);
    }
    if (policy.freshness && freshnessInvalid(bp, records, entry)) {
      diagnostics.push({
        ruleId: "PSEO-EVID-03",
        severity: "error",
        file: ARTIFACT_FILE,
        message: `${entry.pageId} has invalid or missing freshness evidence.`,
        fixHint:
          "Set a valid freshness date on every contributing record before the page can be indexable.",
        data: { pageId: entry.pageId, depth: entry.depth, surfaceId: entry.surfaceId },
      });
    }
    if (typeof policy.minWerkEvidence === "number" && !entry.noindex) {
      const matchingWorks = qualifyingWerkRecords(works, entry);
      if (matchingWorks.length < policy.minWerkEvidence) {
        diagnostics.push({
          ruleId: "WERK-03",
          severity: "error",
          file: ARTIFACT_FILE,
          message: `${entry.pageId} is indexable with ${matchingWorks.length}/${policy.minWerkEvidence} qualifying Werk evidence record(s).`,
          fixHint:
            "Add anchored, consented Werk records or regenerate with the evidence-join existence gate.",
          data: { pageId: entry.pageId, depth: entry.depth, surfaceId: entry.surfaceId },
        });
      }
    }
    if (missing.length > 0 && !entry.noindex) {
      diagnostics.push({
        ruleId: "PSEO-EVID-01",
        severity,
        file: ARTIFACT_FILE,
        message: `${entry.pageId} is indexable but missing required evidence: ${missing.join(", ")}.`,
        fixHint:
          "Add approved narrative/record evidence or regenerate so the page is noindexed until ready.",
        data: { pageId: entry.pageId, depth: entry.depth, surfaceId: entry.surfaceId, missing },
      });
    }
    if (missing.length > 0 && entry.decision?.evidenceGate !== false) {
      diagnostics.push({
        ruleId: "PSEO-EVID-02",
        severity: "warning",
        file: ARTIFACT_FILE,
        message: `${entry.pageId} is missing evidence but its decision does not record evidenceGate=false.`,
        fixHint: "Regenerate the surface artifact with the RFC-0274 generator.",
        data: { pageId: entry.pageId, depth: entry.depth, surfaceId: entry.surfaceId, missing },
      });
    }
  }

  return diagnosticsResult("surface.evidence.validate", diagnostics);
}

export function shingles(tokens: readonly string[], size = 5): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= tokens.length - size; i += 1) set.add(tokens.slice(i, i + size).join(" "));
  if (set.size === 0 && tokens.length > 0) set.add(tokens.join(" "));
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export async function runSurfaceDuplicateValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return { exitCode: 1, summary: "surface.duplicate.validate must run inside an app context." };
  const artifact = await loadArtifact(app.directory);
  if (!artifact) return passResult("surface.duplicate.validate", "skipped (no surface artifact)");
  const onlyBlueprint =
    typeof input.flags.blueprint === "string" ? input.flags.blueprint : undefined;
  const blueprints = (await loadSurfaceBlueprints(context.workspaceRoot)).filter(
    (bp) => !onlyBlueprint || bp.id === onlyBlueprint,
  );
  const bpById = new Map(blueprints.map((bp) => [bp.id, bp]));
  const diagnostics: Diagnostic[] = [];
  const clusters = new Map<string, VirtualRouteEntry[]>();
  for (const entry of artifact.entries ?? []) {
    if (!entry.indexable || entry.noindex) continue;
    if (onlyBlueprint && entry.surfaceId !== onlyBlueprint) continue;
    const key = `${entry.surfaceId}|${entry.depth}`;
    clusters.set(key, [...(clusters.get(key) ?? []), entry]);
  }

  for (const [cluster, entries] of clusters) {
    const [surfaceId, depthText] = cluster.split("|");
    const depth = Number(depthText);
    const bp = surfaceId ? bpById.get(surfaceId) : undefined;
    const threshold =
      (Number.isFinite(depth)
        ? (bp?.policy.depthRoles?.[depth]?.localEvidence?.maxBodySimilarityWithinBranch ??
          bp?.policy.evidencePerDepth?.[depth]?.duplicate?.maxSimilarityWithinCluster)
        : undefined) ?? 0.92;
    const texts = new Map<string, Set<string>>();
    for (const entry of entries) {
      const page = await defaultPageForEntry(app.directory, entry);
      texts.set(entry.pageId, shingles(tokenize(page ? pageText(page) : "")));
    }
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i]!;
        const b = entries[j]!;
        const score = jaccard(texts.get(a.pageId) ?? new Set(), texts.get(b.pageId) ?? new Set());
        if (score <= threshold) continue;
        diagnostics.push({
          ruleId: "PSEO-DUP-01",
          severity: threshold <= 0.7 ? "error" : "warning",
          file: ARTIFACT_FILE,
          message: `near-duplicate cluster ${cluster}: ${a.pageId} ↔ ${b.pageId} similarity ${score.toFixed(2)} exceeds ${threshold}.`,
          fixHint:
            "Add tuple-specific evidence/narrative or keep one of the pages noindexed until differentiated.",
          data: {
            cluster,
            surfaceId: a.surfaceId,
            depth: a.depth,
            pageIds: [a.pageId, b.pageId],
            similarity: score,
          },
        });
      }
    }
  }

  return diagnosticsResult("surface.duplicate.validate", diagnostics);
}
