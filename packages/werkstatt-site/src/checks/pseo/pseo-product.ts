/*
<MODULE_CONTRACT>
<purpose>
  RFC-0277: pseo.experiment.plan and pseo.product.validate commands.
  pseo.experiment.plan reads module context and declared experiments from
  system.md and emits a structured experiment plan with proof-gate thresholds.
  pseo.product.validate scans customer-facing copy (offer pages, pricing pages)
  for forbidden PSEO promises: index budget as SKU, guaranteed indexation,
  guaranteed rankings, guaranteed leads, destructive downgrade policy, and
  missing Notausgang/export statements for PSEO records.
</purpose>
<non-goals>
  <item>Do not call an LLM or external API — both commands are offline/read-only.</item>
  <item>Do not auto-execute experiments or delete URLs — the plan is a proposal only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0277: initial pseo.experiment.plan and pseo.product.validate.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { diagnosticsResult, passResult } from "../result-helpers.ts";
import { loadSurfaceModuleContexts } from "./pseo-module-context.ts";

const FORBIDDEN_PROMISE_PATTERNS: RegExp[] = [
  /garantiert?\s+(?:index|indexierung|ranking|platzierung|leads|kunden)/i,
  /guaranteed?\s+(?:index(?:ation)?|ranking|leads|customers)/i,
  /garantiert?\s+\d+\s+(?:seiten|pages|urls)/i,
  /guaranteed?\s+\d+\s+(?:pages|urls)/i,
  /index\s*budget\s*(?:as|als)\s+(?:sku|produkt|product)/i,
  /destruktiv\w*\s+downgrade/i,
  /destructive\s+downgrade/i,
  /noindex\s+(?:bei|on|upon)\s+downgrade/i,
];

const NOTAUSGANG_PSEO_PATTERNS: RegExp[] = [
  /notausgang/i,
  /pseo[^.]{0,80}\bexport\b/i,
  /\bexport\b[^.]{0,80}pseo/i,
  /emergency\s+export/i,
];

interface ExperimentConfig {
  id?: string;
  module?: string;
  app?: string;
  windowDays?: number;
  clusters?: unknown[];
  thresholds?: Record<string, number>;
}

interface SystemMd {
  pseoExperiments?: ExperimentConfig[];
}

export async function runPseoExperimentPlan(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "pseo.experiment.plan must run inside an app context." };
  }
  const moduleFlag = typeof input.flags.module === "string" ? input.flags.module : "pseo";

  const loaded = await loadSurfaceModuleContexts(app.directory);
  const module = Object.values(loaded.modules).find((m) => m.id === moduleFlag);
  if (!module) {
    return {
      exitCode: 1,
      summary: `pseo.experiment.plan: module "${moduleFlag}" not found in surface.modules.`,
    };
  }

  const { manifest } = await loadSystemManifest(join(app.directory, "src", "content"));
  const experiments = Array.isArray((manifest as unknown as SystemMd).pseoExperiments)
    ? (manifest as unknown as SystemMd).pseoExperiments!
    : [];

  const plan = {
    module: moduleFlag,
    app: app.name,
    stage: module.stage ?? "internalCapability",
    urlPolicy: module.urlPolicy ?? null,
    experiments: experiments.map((exp) => ({
      id: exp.id ?? `${moduleFlag}-default`,
      module: exp.module ?? moduleFlag,
      app: exp.app ?? app.name,
      windowDays: exp.windowDays ?? 90,
      clusters: exp.clusters ?? [],
      thresholds: exp.thresholds ?? {
        indexationRate: 0.6,
        medianImpressionsPerPage28d: 30,
        minQueryDiversityShare: 0.4,
        maxFullCycleCostPerPageEur: 25,
      },
    })),
    proofGates: [
      "demand-map",
      "indexation",
      "query-diversity",
      "core-safety",
      "review-economics",
      "target-language-quality",
      "url-policy",
    ],
  };

  return {
    data: { command: "pseo.experiment.plan", status: "pass", plan },
    exitCode: 0,
    summary: `pseo.experiment.plan: ${plan.experiments.length} experiment(s) planned for module "${moduleFlag}".`,
  };
}

async function collectOfferAndPricingFiles(appDir: string): Promise<string[]> {
  const files: string[] = [];
  const contentDir = join(appDir, "src", "content");
  const searchDirs = [join(contentDir, "business"), join(contentDir, "pages")];
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    await collectMdFiles(dir, files);
  }
  return files;
}

async function collectMdFiles(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMdFiles(fullPath, out);
    } else if (entry.name.endsWith(".md")) {
      out.push(fullPath);
    }
  }
}

export async function runPseoProductValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "pseo.product.validate must run inside an app context." };
  }

  const diagnostics: Diagnostic[] = [];
  const files = await collectOfferAndPricingFiles(app.directory);

  for (const file of files) {
    const content = await readFile(file, "utf8").catch(() => "");
    if (!content) continue;
    const relPath = file.replace(app.directory + "\\", "").replace(/\\/g, "/");

    for (const pattern of FORBIDDEN_PROMISE_PATTERNS) {
      if (pattern.test(content)) {
        diagnostics.push({
          ruleId: "PSEO-PROD-01",
          severity: "error",
          file: relPath,
          message: `Forbidden PSEO promise language detected (RFC-0277): pattern /${pattern.source}/.`,
          fixHint:
            "Remove guaranteed indexation/ranking/leads wording or index-budget-as-SKU language. Sell managed coverage, monitoring, and reporting instead.",
        });
      }
    }

    const mentionsPseo = /\bpseo\b|programmatic\s+surface|managed\s+(?:coverage|visibility)/i.test(
      content,
    );
    if (mentionsPseo) {
      const hasNotausgang = NOTAUSGANG_PSEO_PATTERNS.some((p) => p.test(content));
      if (!hasNotausgang) {
        diagnostics.push({
          ruleId: "PSEO-PROD-02",
          severity: "error",
          file: relPath,
          message:
            "PSEO-related copy is missing a Notausgang/export statement (RFC-0277). PSEO records, glossary, briefs, and reports must be included in export policy.",
          fixHint:
            "Add a Notausgang/export statement covering PSEO records, glossary, translator notes, briefs, and reports.",
        });
      }
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      "pseo.product.validate",
      `ok (${files.length} file(s) scanned, no forbidden PSEO promises found)`,
    );
  }

  return diagnosticsResult("pseo.product.validate", diagnostics);
}
