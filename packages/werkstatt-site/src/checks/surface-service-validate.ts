/*
<MODULE_CONTRACT>
<purpose>
RFC-0496: surface.service.validate — validate depth-1 service dossier records
for the website-service surface. Checks publication gate (minimum field counts),
claim policy (prohibited result-claim phrases), and review/publication status.
</purpose>
<non-goals>
  <item>Do not validate general surface artifact integrity — that is surface.validate.</item>
  <item>Do not validate industry dossier records — that is surface.industry.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0496: initial — service dossier validator with gate, claim, and status checks.</item>
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

const DEFAULT_GATE_THRESHOLDS: Record<string, number> = {
  minServiceVariants: 3,
  minCustomerQuestions: 3,
  minPriceModels: 3,
  minFaq: 5,
  minPageStructure: 1,
};

const GATE_TO_RECORD_FIELD: Record<string, string> = {
  minServiceVariants: "serviceVariants",
  minCustomerQuestions: "customerQuestions",
  minPriceModels: "pricePresentationModels",
  minFaq: "faq",
  minPageStructure: "recommendedPageStructure",
};

const DEFAULT_CLAIM_RESTRICTIONS = [
  "mehr Anfragen",
  "mehr Termin-Anfragen",
  "mehr Buchungen",
  "echte Aufträge",
  "steigt die Wahrscheinlichkeit",
  "weniger Streuverluste",
  "höhere Conversion",
  "besser gefunden",
  "stärkstes Conversion-Signal",
  "garantierte Ergebnisse",
  "guaranteed results",
  "no. 1",
  "number one",
  "leading provider",
  "top rated",
  "beste Preis",
  "best price",
  "cheapest",
  "günstigste",
];

interface ServiceRecord {
  slug: string;
  lang: string;
  data: Record<string, unknown>;
  filePath: string;
}

export async function runSurfaceServiceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.service.validate must run inside an app context." };
  }

  const servicesDir = join(app.directory, "src/content/surface/services");
  if (!existsSync(servicesDir)) {
    return passResult("surface.service.validate", "skipped (no services content directory)");
  }

  const blueprints = await loadSurfaceBlueprints(context.workspaceRoot);
  const websiteServiceBp = blueprints.find((b) => b.id === "website-service");
  if (!websiteServiceBp) {
    return passResult("surface.service.validate", "skipped (no website-service blueprint found)");
  }

  const serviceLevel = websiteServiceBp.levels.find((l) => l.depth === 2) as
    ((typeof websiteServiceBp.levels)[number] & { service?: Record<string, unknown> }) | undefined;
  const serviceConfig = serviceLevel?.service;
  const gateThresholds = (serviceConfig?.gate ?? {}) as Record<string, number>;
  const claimRestrictions = (serviceConfig?.claimRestrictions ??
    DEFAULT_CLAIM_RESTRICTIONS) as string[];
  const mode = (serviceConfig?.mode ?? "warn") as "warn" | "fail";

  const records = await loadServiceRecords(servicesDir);
  if (records.length === 0) {
    return passResult("surface.service.validate", "skipped (no service records found)");
  }

  const diagnostics: Diagnostic[] = [];

  for (const record of records) {
    const relFile = record.filePath.replace(app.directory + "/", "");

    // Publication gate — check minimum counts for each service dossier field.
    for (const gateField of Object.keys(DEFAULT_GATE_THRESHOLDS)) {
      const threshold = gateThresholds[gateField] ?? DEFAULT_GATE_THRESHOLDS[gateField];
      const recordField = GATE_TO_RECORD_FIELD[gateField] ?? gateField;
      const value = record.data[recordField];
      const count = Array.isArray(value) ? value.length : 0;
      if (count < threshold) {
        diagnostics.push({
          ruleId: "service-gate-below-threshold",
          severity: mode === "fail" ? "error" : "warning",
          file: relFile,
          message: `service "${record.slug}" field "${recordField}" has ${count} entries (gate threshold: ${threshold})`,
          fixHint: `Add at least ${threshold} entr${threshold === 1 ? "y" : "ies"} to the "${recordField}" field.`,
          data: { slug: record.slug, field: recordField, count, threshold },
        });
      }
    }

    // Review/publication status checks.
    const reviewStatus = record.data["reviewStatus"];
    if (reviewStatus !== undefined && reviewStatus !== "approved") {
      diagnostics.push({
        ruleId: "service-review-status",
        severity: mode === "fail" ? "error" : "warning",
        file: relFile,
        message: `service "${record.slug}" has reviewStatus "${reviewStatus}" (expected "approved")`,
        fixHint: 'Set reviewStatus to "approved" after editorial review.',
        data: { slug: record.slug, reviewStatus },
      });
    }

    const publicationStatus = record.data["publicationStatus"];
    if (publicationStatus !== undefined && publicationStatus !== "published") {
      diagnostics.push({
        ruleId: "service-publication-status",
        severity: mode === "fail" ? "error" : "warning",
        file: relFile,
        message: `service "${record.slug}" has publicationStatus "${publicationStatus}" (expected "published")`,
        fixHint: 'Set publicationStatus to "published" to emit the service page.',
        data: { slug: record.slug, publicationStatus },
      });
    }

    // Claim policy — scan all string fields for prohibited phrases.
    const allText = collectAllText(record.data);
    const lowerText = allText.toLowerCase();
    const perRecordRestrictions = Array.isArray(record.data["claimRestrictions"])
      ? (record.data["claimRestrictions"] as string[])
      : [];
    const allRestrictions = [...claimRestrictions, ...perRecordRestrictions];
    for (const phrase of allRestrictions) {
      if (lowerText.includes(phrase.toLowerCase())) {
        diagnostics.push({
          ruleId: "service-claim-restriction",
          severity: "error",
          file: relFile,
          message: `service "${record.slug}" contains prohibited result-claim phrase "${phrase}"`,
          fixHint: "Remove the unfulfillable promise phrase from the service record.",
          data: { slug: record.slug, phrase },
        });
      }
    }
  }

  if (diagnostics.length === 0) {
    return passResult("surface.service.validate", "all service records passed validation");
  }

  return diagnosticsResult("surface.service.validate", diagnostics);
}

async function loadServiceRecords(servicesDir: string): Promise<ServiceRecord[]> {
  const records: ServiceRecord[] = [];
  const langDirs = await readdir(servicesDir, { withFileTypes: true });
  for (const langDir of langDirs) {
    if (!langDir.isDirectory()) continue;
    const lang = langDir.name;
    const langPath = join(servicesDir, lang);
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

const METADATA_FIELDS_EXCLUDED_FROM_TEXT_SCAN = new Set([
  "claimRestrictions",
  "reviewStatus",
  "publicationStatus",
  "serviceId",
  "industryId",
  "slug",
  "sources",
]);

function collectAllText(data: Record<string, unknown>): string {
  const parts: string[] = [];
  function walk(value: unknown): void {
    if (typeof value === "string") {
      parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (!METADATA_FIELDS_EXCLUDED_FROM_TEXT_SCAN.has(k)) walk(v);
      }
    }
  }
  walk(data);
  return parts.join(" ");
}
