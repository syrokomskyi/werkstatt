/*
<MODULE_CONTRACT>
<purpose>
RFC-0492: surface.duplicate-content.report — detect depth-1 industry pages on the
website-local surface with >0.70 prose similarity to another depth-1 industry page.
Uses the existing shingle-based Jaccard similarity from RFC-0274 (surface-quality.ts).
Blocks surface.validate when any pair exceeds the duplicateMaxSimilarity threshold.
</purpose>
<non-goals>
  <item>Do not compare cross-depth or cross-surface pairs — only depth-1 website-local.</item>
  <item>Do not use semantic fingerprints — reuse the shingle method per RFC-0274.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0492: initial — depth-1 industry duplicate-content report.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { SurfaceArtifact } from "@warpgogol/werkstatt-site/surface";
import { pageText, tokenize } from "@warpgogol/werkstatt-site/surface";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSurfaceBlueprints } from "./surface-expand.ts";
import { defaultPageForEntry, jaccard, shingles } from "./surface-quality.ts";

const ARTIFACT_FILE = "src/surface.generated.yaml";
const DEFAULT_DUPLICATE_MAX_SIMILARITY = 0.7;

interface DuplicatePair {
  pageA: string;
  pageB: string;
  similarity: number;
}

interface DuplicateContentReportData {
  command: "surface.duplicate-content.report";
  status: "pass" | "fail";
  pairs: DuplicatePair[];
  threshold: number;
}

export async function runSurfaceDuplicateContentReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "surface.duplicate-content.report must run inside an app context.",
    };
  }

  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult(
      "surface.duplicate-content.report",
      "skipped (no surface artifact; run surface.generate)",
    );
  }

  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return passResult(
      "surface.duplicate-content.report",
      "skipped (surface artifact not valid YAML)",
    );
  }

  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];
  const depth1Entries = entries.filter(
    (e) => e.surfaceId === "website-local" && e.depth === 1 && e.indexable && !e.noindex,
  );

  if (depth1Entries.length < 2) {
    return passResult(
      "surface.duplicate-content.report",
      "skipped (fewer than 2 depth-1 website-local entries)",
    );
  }

  const blueprints = await loadSurfaceBlueprints(context.workspaceRoot);
  const websiteLocalBp = blueprints.find((b) => b.id === "website-local");
  const depth1Level = websiteLocalBp?.levels.find((l) => l.depth === 1) as
    | (NonNullable<typeof websiteLocalBp>["levels"][number] & { dossier?: Record<string, unknown> })
    | undefined;
  const dossierConfig = depth1Level?.dossier;
  const rawThreshold = dossierConfig?.duplicateMaxSimilarity;
  const threshold =
    typeof rawThreshold === "number" ? rawThreshold : DEFAULT_DUPLICATE_MAX_SIMILARITY;

  const shingleSets = new Map<string, Set<string>>();
  for (const entry of depth1Entries) {
    const page = await defaultPageForEntry(app.directory, entry);
    shingleSets.set(entry.pageId, shingles(tokenize(page ? pageText(page) : "")));
  }

  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < depth1Entries.length; i += 1) {
    for (let j = i + 1; j < depth1Entries.length; j += 1) {
      const a = depth1Entries[i]!;
      const b = depth1Entries[j]!;
      const score = jaccard(
        shingleSets.get(a.pageId) ?? new Set(),
        shingleSets.get(b.pageId) ?? new Set(),
      );
      if (score > threshold) {
        pairs.push({ pageA: a.pageId, pageB: b.pageId, similarity: score });
      }
    }
  }

  const report: DuplicateContentReportData = {
    command: "surface.duplicate-content.report",
    status: pairs.length > 0 ? "fail" : "pass",
    pairs,
    threshold,
  };

  if (pairs.length === 0) {
    return passResult(
      "surface.duplicate-content.report",
      "no depth-1 industry pairs exceed duplicate similarity threshold",
    );
  }

  const diagnostics: Diagnostic[] = pairs.map((pair) => ({
    ruleId: "industry-duplicate-content",
    severity: "error",
    file: ARTIFACT_FILE,
    message: `${pair.pageA} ↔ ${pair.pageB} similarity ${pair.similarity.toFixed(2)} exceeds threshold ${threshold}`,
    fixHint:
      "Differentiate the industry pages with trade-specific dossier content (customerQuestions, serviceTaxonomy, trustSignals, etc.) or noindex one page until differentiated.",
    data: { pageA: pair.pageA, pageB: pair.pageB, similarity: pair.similarity, threshold },
  }));

  const result = diagnosticsResult("surface.duplicate-content.report", diagnostics);
  if (result.data) {
    (result.data as CheckResult & { report?: DuplicateContentReportData }).report = report;
  }
  return result;
}
