/*
<MODULE_CONTRACT>
<purpose>
RFC-0492: surface.doorway-risk.report — diagnostic report that flags depth-4 city
pages on the website-local surface missing unique local context fields
(localDemandContext, uniqueIntro, uniqueFaq, localEvidence). Computes a flagged
share and fails surface.validate when the share exceeds the blueprint's
doorwayMaxFlaggedShare threshold.
</purpose>
<non-goals>
  <item>Do not validate industry dossier fields — that is surface.industry.validate.</item>
  <item>Do not compute prose similarity — that is surface.duplicate-content.report.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0492: initial — doorway risk diagnostic for depth-4 city pages.</item>
  <item>RFC-0497: also flag depth-5 entries missing intersection records.</item>
  <item>RFC-0516: fix localDemandContext lookup for depth-4 (use city+industry, not demand slug); respect dossier mode: warn.</item>
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
} from "@warpgogol/site-kernel";
import type { SurfaceArtifact, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSurfaceBlueprints } from "./surface-expand.ts";
import { loadDataset } from "./surface-expand/expand-helpers.ts";
import type { DatasetEntry } from "./surface-expand/expand-helpers.ts";
import { ARTIFACT_FILE } from "./surface/shared.ts";

const DEFAULT_DOORWAY_MAX_FLAGGED_SHARE = 0.3;

const _REQUIRED_LOCAL_FIELDS = [
  "localDemandContext",
  "uniqueIntro",
  "uniqueFaq",
  "localEvidence",
] as const;

interface DoorwayFlaggedPage {
  pageId: string;
  url: string;
  missingFields: string[];
}

interface DoorwayRiskReportData {
  command: "surface.doorway-risk.report";
  status: "pass" | "warn";
  flaggedPages: DoorwayFlaggedPage[];
  flaggedShare: number;
  threshold: number;
}

export async function runSurfaceDoorwayRiskReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.doorway-risk.report must run inside an app context." };
  }

  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult(
      "surface.doorway-risk.report",
      "skipped (no surface artifact; run surface.generate)",
    );
  }

  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return passResult("surface.doorway-risk.report", "skipped (surface artifact not valid YAML)");
  }

  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];
  const depth4Entries = entries.filter((e) => e.surfaceId === "website-local" && e.depth === 4);
  const depth5Entries = entries.filter((e) => e.surfaceId === "website-local" && e.depth === 5);

  if (depth4Entries.length === 0 && depth5Entries.length === 0) {
    return passResult(
      "surface.doorway-risk.report",
      "skipped (no depth-4/5 website-local entries)",
    );
  }

  const blueprints = await loadSurfaceBlueprints(context.workspaceRoot);
  const websiteLocalBp = blueprints.find((b) => b.id === "website-local");
  const depth1Level = websiteLocalBp?.levels.find((l) => l.depth === 1) as
    | (NonNullable<typeof websiteLocalBp>["levels"][number] & { dossier?: Record<string, unknown> })
    | undefined;
  const dossierConfig = depth1Level?.dossier;
  const rawThreshold = dossierConfig?.doorwayMaxFlaggedShare;
  const doorwayMaxFlaggedShare =
    typeof rawThreshold === "number" ? rawThreshold : DEFAULT_DOORWAY_MAX_FLAGGED_SHARE;
  const dossierMode = dossierConfig?.mode === "warn" ? "warn" : "error";

  const defaultLang = detectDefaultLang([...depth4Entries, ...depth5Entries]);

  const cityRecords = await loadDataset(app.directory, "cities", defaultLang);
  const demandRecords = await loadDataset(app.directory, "demands", defaultLang);
  const intersectionRecords = await loadDataset(app.directory, "intersections", defaultLang);

  const cityBySlug = new Map(cityRecords.map((r) => [r.slug, r.data]));
  const demandByCityIndustry = buildDemandByCityIndustry(demandRecords);
  const intersectionKeys = new Set(
    intersectionRecords
      .filter((r) => r.data.publicationDecision === "approved")
      .map((r) => `${r.data.industryId}::${r.data.cityId}::${r.data.serviceId}`),
  );

  const flaggedPages: DoorwayFlaggedPage[] = [];

  for (const entry of depth4Entries) {
    const missingFields = checkEntryLocalContext(entry, cityBySlug, demandByCityIndustry);
    if (missingFields.length > 0) {
      flaggedPages.push({
        pageId: entry.pageId,
        url: entry.routes[defaultLang] ?? entry.pageId,
        missingFields,
      });
    }
  }

  // RFC-0497: flag depth-5 entries without approved intersection records.
  for (const entry of depth5Entries) {
    const industry = entry.axes.industry;
    const city = entry.axes.city;
    const demand = entry.axes.demand;
    if (!industry || !city || !demand) continue;
    const key = `${industry}::${city}::${demand}`;
    if (!intersectionKeys.has(key)) {
      flaggedPages.push({
        pageId: entry.pageId,
        url: entry.routes[defaultLang] ?? entry.pageId,
        missingFields: ["intersectionRecord"],
      });
    }
  }

  const totalEntries = depth4Entries.length + depth5Entries.length;
  const flaggedShare = totalEntries > 0 ? flaggedPages.length / totalEntries : 0;
  const exceedsThreshold = flaggedShare > doorwayMaxFlaggedShare;

  const report: DoorwayRiskReportData = {
    command: "surface.doorway-risk.report",
    status: flaggedPages.length > 0 ? "warn" : "pass",
    flaggedPages,
    flaggedShare,
    threshold: doorwayMaxFlaggedShare,
  };

  if (flaggedPages.length === 0) {
    return passResult(
      "surface.doorway-risk.report",
      "no depth-4 city pages flagged for doorway risk",
    );
  }

  const baseSeverity = exceedsThreshold && dossierMode !== "warn" ? "error" : "warning";
  const diagnostics: Diagnostic[] = flaggedPages.map((page) => ({
    ruleId: "doorway-risk-missing-local-context",
    severity: baseSeverity,
    file: ARTIFACT_FILE,
    message: `${page.pageId} missing local context fields: ${page.missingFields.join(", ")}`,
    fixHint:
      "Add unique local context (uniqueIntro, uniqueFaq, localEvidence) to the city record and localDemandContext to the demand record.",
    data: { pageId: page.pageId, missingFields: page.missingFields },
  }));

  if (exceedsThreshold && dossierMode !== "warn") {
    diagnostics.push({
      ruleId: "doorway-risk-threshold-exceeded",
      severity: "error",
      file: ARTIFACT_FILE,
      message: `flagged share ${flaggedShare.toFixed(2)} exceeds threshold ${doorwayMaxFlaggedShare} (${flaggedPages.length}/${totalEntries} pages flagged)`,
      fixHint:
        "Add unique local context to flagged city pages or create intersection records for flagged depth-5 pages, or raise the doorwayMaxFlaggedShare threshold in the blueprint.",
      data: {
        flaggedShare,
        threshold: doorwayMaxFlaggedShare,
        flagged: flaggedPages.length,
        total: totalEntries,
      },
    });
  }

  const result = diagnosticsResult("surface.doorway-risk.report", diagnostics);
  if (result.data) {
    (result.data as CheckResult & { report?: DoorwayRiskReportData }).report = report;
  }
  return result;
}

function checkEntryLocalContext(
  entry: VirtualRouteEntry,
  cityBySlug: Map<string, Record<string, unknown>>,
  demandByCityIndustry: Map<string, Record<string, unknown>>,
): string[] {
  const missing: string[] = [];

  const citySlug = entry.axes.city;
  const industrySlug = entry.axes.industry;

  const cityData = citySlug ? cityBySlug.get(citySlug) : undefined;
  const demandKey = citySlug && industrySlug ? `${citySlug}::${industrySlug}` : undefined;
  const demandData = demandKey ? demandByCityIndustry.get(demandKey) : undefined;

  if (!demandData || !hasField(demandData, "localDemandContext")) {
    missing.push("localDemandContext");
  }
  if (!cityData || !hasField(cityData, "uniqueIntro")) {
    missing.push("uniqueIntro");
  }
  if (!cityData || !hasField(cityData, "uniqueFaq")) {
    missing.push("uniqueFaq");
  }
  if (!cityData || !hasField(cityData, "localEvidence")) {
    missing.push("localEvidence");
  }

  return missing;
}

function hasField(data: Record<string, unknown>, field: string): boolean {
  const value = data[field];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function buildDemandByCityIndustry(
  demandRecords: DatasetEntry[],
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const record of demandRecords) {
    const city = typeof record.data.city === "string" ? record.data.city : undefined;
    const industries = Array.isArray(record.data.industries) ? record.data.industries : [];
    if (!city) continue;
    for (const industry of industries) {
      if (typeof industry !== "string") continue;
      const key = `${city}::${industry}`;
      if (!map.has(key)) {
        map.set(key, record.data);
      }
    }
  }
  return map;
}

function detectDefaultLang(entries: VirtualRouteEntry[]): string {
  for (const entry of entries) {
    const langs = Object.keys(entry.routes);
    if (langs.length > 0) return langs[0]!;
  }
  return "de";
}
