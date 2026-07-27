/*
<MODULE_CONTRACT>
<purpose>
RFC-0492: surface.industry.validate — validate depth-1 industry dossier records
for the website-local surface. Checks publication gate (minimum field counts),
claim policy (prohibited result-claim phrases), and deprecated field usage.
</purpose>
<non-goals>
  <item>Do not validate general surface artifact integrity — that is surface.validate.</item>
  <item>Do not validate pillar hub configuration — that is surface.hub.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0492: initial — industry dossier validator with gate, claim, and deprecated-field checks.</item>
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
} from "@gogol/site-kernel";
import { parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSurfaceBlueprints } from "./surface-expand.ts";

const DEFAULT_GATE_THRESHOLDS: Record<string, number> = {
  minServiceCategories: 1,
  minCustomerJourneys: 1,
  minTrustSignals: 1,
  minArchitectureEntries: 1,
  minModuleMappings: 1,
  minUniqueFaq: 1,
};

const GATE_TO_RECORD_FIELD: Record<string, string> = {
  minServiceCategories: "serviceTaxonomy",
  minCustomerJourneys: "customerJourneys",
  minTrustSignals: "trustSignals",
  minArchitectureEntries: "recommendedArchitecture",
  minModuleMappings: "suitableModules",
  minUniqueFaq: "industryFaq",
};

const DEFAULT_CLAIM_RESTRICTIONS = [
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

const DEPRECATED_FIELDS = [
  "specialFocus",
  "scenarioSnippets",
  "painPoints",
  "proofSignals",
  "faqs",
];

const NEW_FIELDS = [
  "customerQuestions",
  "customerJourneys",
  "serviceTaxonomy",
  "trustSignals",
  "evidenceRequirements",
  "contactModes",
  "serviceAreaModel",
  "recommendedArchitecture",
  "suitableModules",
  "industryFaq",
];

interface IndustryRecord {
  slug: string;
  lang: string;
  data: Record<string, unknown>;
  filePath: string;
}

export async function runSurfaceIndustryValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.industry.validate must run inside an app context." };
  }

  const industriesDir = join(app.directory, "src/content/surface/industries");
  if (!existsSync(industriesDir)) {
    return passResult("surface.industry.validate", "skipped (no industries content directory)");
  }

  const blueprints = await loadSurfaceBlueprints(context.workspaceRoot);
  const websiteLocalBp = blueprints.find((b) => b.id === "website-local");
  if (!websiteLocalBp) {
    return passResult("surface.industry.validate", "skipped (no website-local blueprint found)");
  }

  const depth1Level = websiteLocalBp.levels.find((l) => l.depth === 1) as
    ((typeof websiteLocalBp.levels)[number] & { dossier?: Record<string, unknown> }) | undefined;
  const dossier = depth1Level?.dossier;
  const gateThresholds = (dossier?.gate ?? {}) as Record<string, number>;
  const claimRestrictions = (dossier?.claimRestrictions ?? DEFAULT_CLAIM_RESTRICTIONS) as string[];

  const records = await loadIndustryRecords(industriesDir);
  if (records.length === 0) {
    return passResult("surface.industry.validate", "skipped (no industry records found)");
  }

  const diagnostics: Diagnostic[] = [];

  for (const record of records) {
    const relFile = record.filePath.replace(app.directory + "/", "");

    // Publication gate — check minimum counts for each dossier field.
    for (const gateField of Object.keys(DEFAULT_GATE_THRESHOLDS)) {
      const threshold = gateThresholds[gateField] ?? DEFAULT_GATE_THRESHOLDS[gateField];
      const recordField = GATE_TO_RECORD_FIELD[gateField] ?? gateField;
      const value = record.data[recordField];
      const count = Array.isArray(value) ? value.length : 0;
      if (count < threshold) {
        diagnostics.push({
          ruleId: "industry-gate-below-threshold",
          severity: "warning",
          file: relFile,
          message: `industry "${record.slug}" field "${recordField}" has ${count} entries (gate threshold: ${threshold})`,
          fixHint: `Add at least ${threshold} entr${threshold === 1 ? "y" : "ies"} to the "${recordField}" field.`,
          data: { slug: record.slug, field: recordField, count, threshold },
        });
      }
    }

    // Claim policy — scan all string fields for prohibited phrases.
    const allText = collectAllText(record.data);
    const lowerText = allText.toLowerCase();
    for (const phrase of claimRestrictions) {
      if (lowerText.includes(phrase.toLowerCase())) {
        diagnostics.push({
          ruleId: "industry-claim-restriction",
          severity: "error",
          file: relFile,
          message: `industry "${record.slug}" contains prohibited result-claim phrase "${phrase}"`,
          fixHint: "Remove the unfulfillable promise phrase from the industry record.",
          data: { slug: record.slug, phrase },
        });
      }
    }

    // Deprecated field usage — warn when deprecated fields are used and new fields are missing.
    const usedDeprecated = DEPRECATED_FIELDS.filter((f) => record.data[f] !== undefined);
    const missingNew = NEW_FIELDS.filter((f) => record.data[f] === undefined);
    if (usedDeprecated.length > 0 && missingNew.length > 0) {
      diagnostics.push({
        ruleId: "industry-deprecated-field",
        severity: "warning",
        file: relFile,
        message: `industry "${record.slug}" uses deprecated fields [${usedDeprecated.join(", ")}] but is missing new dossier fields [${missingNew.join(", ")}]`,
        fixHint: "Migrate deprecated fields to the new dossier model fields.",
        data: { slug: record.slug, deprecated: usedDeprecated, missing: missingNew },
      });
    }
  }

  if (diagnostics.length === 0) {
    return passResult("surface.industry.validate", "all industry records passed validation");
  }

  return diagnosticsResult("surface.industry.validate", diagnostics);
}

async function loadIndustryRecords(industriesDir: string): Promise<IndustryRecord[]> {
  const records: IndustryRecord[] = [];
  const langDirs = await readdir(industriesDir, { withFileTypes: true });
  for (const langDir of langDirs) {
    if (!langDir.isDirectory()) continue;
    const lang = langDir.name;
    const langPath = join(industriesDir, lang);
    const files = await readdir(langPath);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(langPath, file);
      const raw = await readFile(filePath, "utf8");
      const parsed = parseMarkdownFrontmatter(raw);
      const slug = file.replace(/\.md$/, "");
      records.push({ slug, lang, data: parsed.data ?? {}, filePath });
    }
  }
  return records;
}

function collectAllText(data: Record<string, unknown>): string {
  const parts: string[] = [];
  function walk(value: unknown): void {
    if (typeof value === "string") {
      parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) walk(v);
    }
  }
  walk(data);
  return parts.join(" ");
}
