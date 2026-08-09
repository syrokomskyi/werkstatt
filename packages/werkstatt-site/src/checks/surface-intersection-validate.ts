/*
<MODULE_CONTRACT>
<purpose>
RFC-0497: surface.intersection.validate — validate depth-5 intersection records
for the website-local surface. Checks minimum gate (field counts), similarity
thresholds (shingle-based), and substance independence test (token-count delta).
</purpose>
<non-goals>
  <item>Do not validate general surface artifact integrity — that is surface.validate.</item>
  <item>Do not validate industry dossier records — that is surface.industry.validate.</item>
  <item>Do not validate service dossier records — that is surface.service.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0497: initial — intersection record validator with gate, similarity, and substance independence checks.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parseMarkdownFrontmatter, collectMarkdownFiles } from "@warpgogol/werkstatt-site/content";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSurfaceBlueprints } from "./surface-expand.ts";

const DEFAULT_GATE = {
  minLocalServiceQuestions: 3,
  minScenarios: 2,
  minLocalEvidence: 2,
  minUniqueContentBlocks: 1,
  minUniqueFaq: 3,
  minSources: 1,
};

const DEFAULT_SIMILARITY = {
  similarityToIndustryPage: 0.7,
  similarityToCityPage: 0.7,
  similarityToServicePage: 0.7,
  similarityToOtherIntersections: 0.7,
};

const DEFAULT_SUBSTANCE_INDEPENDENCE_THRESHOLD = 0.5;

interface IntersectionRecord {
  slug: string;
  lang: string;
  data: Record<string, unknown>;
  filePath: string;
}

export async function runSurfaceIntersectionValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "surface.intersection.validate must run inside an app context.",
    };
  }

  const intersectionsDir = join(app.directory, "src/content/surface/intersections");
  if (!existsSync(intersectionsDir)) {
    return passResult(
      "surface.intersection.validate",
      "skipped (no intersections content directory)",
    );
  }

  const blueprints = await loadSurfaceBlueprints(context.workspaceRoot);
  const websiteLocalBp = blueprints.find((b) => b.id === "website-local");
  if (!websiteLocalBp) {
    return passResult(
      "surface.intersection.validate",
      "skipped (no website-local blueprint found)",
    );
  }

  const intersectionLevel = websiteLocalBp.levels.find((l) => l.depth === 5) as
    | ((typeof websiteLocalBp.levels)[number] & { intersection?: Record<string, unknown> })
    | undefined;
  const intersectionConfig = intersectionLevel?.intersection;
  const gate = (intersectionConfig?.gate ?? DEFAULT_GATE) as unknown as Record<string, number>;
  const similarity = (intersectionConfig?.similarity ?? DEFAULT_SIMILARITY) as unknown as Record<
    string,
    number
  >;
  const substanceThreshold =
    (intersectionConfig?.substanceIndependenceThreshold as number | undefined) ??
    DEFAULT_SUBSTANCE_INDEPENDENCE_THRESHOLD;
  const mode = (intersectionConfig?.mode ?? "warn") as "warn" | "fail";

  const records = await loadIntersectionRecords(intersectionsDir);
  if (records.length === 0) {
    return passResult("surface.intersection.validate", "skipped (no intersection records found)");
  }

  const diagnostics: Diagnostic[] = [];

  for (const record of records) {
    const relFile = record.filePath.replace(app.directory + "/", "");

    // Publication gate — check minimum counts for each intersection field.
    const gateChecks: Array<{ gateField: string; recordField: string }> = [
      { gateField: "minLocalServiceQuestions", recordField: "localServiceQuestions" },
      { gateField: "minScenarios", recordField: "scenarios" },
      { gateField: "minLocalEvidence", recordField: "localEvidence" },
      { gateField: "minUniqueContentBlocks", recordField: "uniqueContentBlocks" },
      { gateField: "minUniqueFaq", recordField: "uniqueFaq" },
      { gateField: "minSources", recordField: "sources" },
    ];

    for (const { gateField, recordField } of gateChecks) {
      const threshold = gate[gateField] ?? DEFAULT_GATE[gateField as keyof typeof DEFAULT_GATE];
      const value = record.data[recordField];
      const count = Array.isArray(value) ? value.length : value ? 1 : 0;
      if (count < threshold) {
        diagnostics.push({
          ruleId: "intersection-gate-below-threshold",
          severity: mode === "fail" ? "error" : "warning",
          file: relFile,
          message: `intersection "${record.slug}" field "${recordField}" has ${count} entries (gate threshold: ${threshold})`,
          fixHint: `Add at least ${threshold} entr${threshold === 1 ? "y" : "ies"} to the "${recordField}" field.`,
          data: { slug: record.slug, field: recordField, count, threshold },
        });
      }
    }

    // Publication decision check.
    const publicationDecision = record.data["publicationDecision"];
    if (publicationDecision !== undefined && publicationDecision !== "approved") {
      diagnostics.push({
        ruleId: "intersection-publication-decision",
        severity: mode === "fail" ? "error" : "warning",
        file: relFile,
        message: `intersection "${record.slug}" has publicationDecision "${publicationDecision}" (expected "approved")`,
        fixHint: 'Set publicationDecision to "approved" after editorial review.',
        data: { slug: record.slug, publicationDecision },
      });
    }

    // Substance independence test — token count of intersection content vs. parent content.
    const intersectionText = collectIntersectionText(record.data);
    const intersectionTokens = tokenize(intersectionText);
    const intersectionTokenCount = intersectionTokens.length;

    if (intersectionTokenCount > 0) {
      const parentText = collectParentText(record.data);
      const parentTokens = tokenize(parentText);
      const parentTokenCount = parentTokens.length;

      if (parentTokenCount > 0) {
        const uniqueTokens = intersectionTokens.filter((t) => !parentTokens.includes(t)).length;
        const independenceRatio = uniqueTokens / intersectionTokenCount;
        if (independenceRatio < substanceThreshold) {
          diagnostics.push({
            ruleId: "intersection-substance-independence",
            severity: mode === "fail" ? "error" : "warning",
            file: relFile,
            message: `intersection "${record.slug}" substance independence ratio ${independenceRatio.toFixed(2)} below threshold ${substanceThreshold} — content too similar to parent pages`,
            fixHint:
              "Add more intersection-specific content that does not appear on parent industry, city, or service pages.",
            data: {
              slug: record.slug,
              independenceRatio,
              threshold: substanceThreshold,
              intersectionTokenCount,
              parentTokenCount,
            },
          });
        }
      }
    }
  }

  // Similarity check between intersection records (pairwise, within same industry).
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i]!;
      const b = records[j]!;
      if (a.lang !== b.lang) continue;
      const aIndustry = String(a.data.industryId ?? "");
      const bIndustry = String(b.data.industryId ?? "");
      if (aIndustry !== bIndustry) continue;

      const aText = collectIntersectionText(a.data);
      const bText = collectIntersectionText(b.data);
      const sim = shingleJaccard(aText, bText);
      const threshold =
        similarity.similarityToOtherIntersections ??
        DEFAULT_SIMILARITY.similarityToOtherIntersections;
      if (sim > threshold) {
        diagnostics.push({
          ruleId: "intersection-similarity-exceeded",
          severity: mode === "fail" ? "error" : "warning",
          file: a.filePath.replace(app.directory + "/", ""),
          message: `intersection "${a.slug}" and "${b.slug}" similarity ${sim.toFixed(2)} exceeds threshold ${threshold}`,
          fixHint: "Differentiate the intersection records — they are too similar to each other.",
          data: { slugA: a.slug, slugB: b.slug, similarity: sim, threshold },
        });
      }
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      "surface.intersection.validate",
      "all intersection records passed validation",
    );
  }

  return diagnosticsResult("surface.intersection.validate", diagnostics);
}

async function loadIntersectionRecords(intersectionsDir: string): Promise<IntersectionRecord[]> {
  const records: IntersectionRecord[] = [];
  const langDirs = await readdir(intersectionsDir, { withFileTypes: true });
  for (const langDir of langDirs) {
    if (!langDir.isDirectory()) continue;
    const lang = langDir.name;
    const langPath = join(intersectionsDir, lang);
    const files = await collectMarkdownFiles(langPath);
    for (const filePath of files) {
      const raw = await readFile(filePath, "utf8");
      const parsed = parseMarkdownFrontmatter(raw);
      const slug =
        typeof parsed.data?.slug === "string" && parsed.data.slug.trim()
          ? parsed.data.slug.trim()
          : filePath.split("/").pop()!.replace(/\.md$/, "");
      records.push({ slug, lang, data: parsed.data ?? {}, filePath });
    }
  }
  return records;
}

const METADATA_FIELDS_EXCLUDED = new Set([
  "publicationDecision",
  "industryId",
  "cityId",
  "serviceId",
  "intersectionId",
  "slug",
  "sources",
]);

function collectIntersectionText(data: Record<string, unknown>): string {
  const parts: string[] = [];
  function walk(value: unknown): void {
    if (typeof value === "string") {
      parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (!METADATA_FIELDS_EXCLUDED.has(k)) walk(v);
      }
    }
  }
  walk(data);
  return parts.join(" ");
}

function collectParentText(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const parentFields = ["industryDescription", "cityDescription", "serviceDescription"];
  for (const field of parentFields) {
    const value = data[field];
    if (typeof value === "string") parts.push(value);
  }
  return parts.join(" ");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function shingleJaccard(a: string, b: string, k = 3): number {
  const shinglesA = shingles(a, k);
  const shinglesB = shingles(b, k);
  if (shinglesA.size === 0 || shinglesB.size === 0) return 0;
  let intersection = 0;
  for (const s of shinglesA) {
    if (shinglesB.has(s)) intersection++;
  }
  const union = shinglesA.size + shinglesB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function shingles(text: string, k: number): Set<string> {
  const tokens = tokenize(text);
  const set = new Set<string>();
  for (let i = 0; i <= tokens.length - k; i++) {
    set.add(tokens.slice(i, i + k).join(" "));
  }
  return set;
}
