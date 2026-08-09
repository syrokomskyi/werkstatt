/*
<MODULE_CONTRACT>
<purpose>
RFC-0490: surface.hub.validate — validate the depth-0 pillar hub configuration and
generated artifact for the website-local surface. Checks pillar hero CTA anchoring,
title template presence, published industry coverage, commercial promise phrases, and
priceRef syntax.
</purpose>
<non-goals>
  <item>Do not validate general surface artifact integrity — that is surface.validate.</item>
  <item>Do not resolve PBP priceRef values — only syntax is checked here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0490: initial — pillar hub validator with 6 failure modes.</item>
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
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSurfaceBlueprints } from "./surface-expand.ts";
import { ARTIFACT_FILE, readLangs } from "./surface/shared.ts";

const COMMERCIAL_PROMISE_PHRASES = [
  "best price",
  "cheapest",
  "guaranteed results",
  "no. 1",
  "number one",
  "leading provider",
  "top rated",
  "beste Preis",
  "günstigste",
  "garantierte Ergebnisse",
  "Anbieter Nr. 1",
  "Top-bewertet",
];

export async function runSurfaceHubValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.hub.validate must run inside an app context." };
  }

  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult(
      "surface.hub.validate",
      "skipped (no surface artifact; run surface.generate)",
    );
  }

  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return {
      exitCode: 1,
      summary: "surface.hub.validate: surface.generated.yaml is not valid YAML",
    };
  }
  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];

  const blueprints = await loadSurfaceBlueprints(context.workspaceRoot);
  const _bpById = new Map(blueprints.map((b) => [b.id, b]));

  const { defaultLang } = await readLangs(app.directory);

  const diagnostics: Diagnostic[] = [];

  for (const bp of blueprints) {
    const level0 = bp.levels.find((l) => l.depth === 0);
    if (!level0?.pillar) continue;

    const surfaceEntries = entries.filter((e) => e.surfaceId === bp.id);
    const depth0Entry = surfaceEntries.find((e) => e.depth === 0);

    // pillar-hero-cta-not-anchor
    if (
      level0.pillar.hero.primaryCta.target &&
      !level0.pillar.hero.primaryCta.target.startsWith("#")
    ) {
      diagnostics.push({
        ruleId: "pillar-hero-cta-not-anchor",
        severity: "error",
        file: `packages/werkstatt-site/src/domain/ontology/blueprints/${bp.id}.yaml`,
        message: `depth-0 pillar hero primaryCta target "${level0.pillar.hero.primaryCta.target}" is not an anchor (expected "#industry-catalog")`,
        fixHint:
          'Set pillar.hero.primaryCta.target to "#industry-catalog" so the hub guides visitors to the catalog first.',
      });
    }

    // pillar-missing-title-template
    if (!level0.titleTemplate) {
      diagnostics.push({
        ruleId: "pillar-missing-title-template",
        severity: "error",
        file: `packages/werkstatt-site/src/domain/ontology/blueprints/${bp.id}.yaml`,
        message: `depth-0 pillar level has no titleTemplate — the hub title must communicate the industry-hub function`,
        fixHint:
          "Add a titleTemplate to the depth-0 level that communicates the industry-hub function.",
      });
    }

    // pillar-no-published-industries
    const depth1Entries = surfaceEntries.filter((e) => e.depth === 1 && e.indexable && !e.noindex);
    if (depth0Entry && depth1Entries.length === 0) {
      diagnostics.push({
        ruleId: "pillar-no-published-industries",
        severity: "error",
        file: ARTIFACT_FILE,
        message: `surface "${bp.id}" has a pillar hub but no published depth-1 industry entries`,
        fixHint:
          "Ensure at least one industry has live demand records so the catalog is not empty.",
      });
    }

    // pillar-orphan-industry (warn)
    const industryAxis = bp.axes.find((a) => a.id === "industry");
    if (industryAxis && depth0Entry) {
      const _publishedSlugs = new Set(
        depth1Entries.map((e) => e.axes["industry"]).filter(Boolean) as string[],
      );
      // The universe is a collection or provider — we can only check entries that exist.
      // Orphan = a depth-1 entry exists in the artifact but is not indexable.
      const orphanEntries = surfaceEntries.filter((e) => e.depth === 1 && !e.indexable);
      for (const orphan of orphanEntries) {
        diagnostics.push({
          ruleId: "pillar-orphan-industry",
          severity: "warning",
          file: ARTIFACT_FILE,
          message: `industry "${orphan.axes["industry"]}" has a depth-1 entry but was dropped by the eligibility engine (not indexable)`,
          fixHint: "Add demand records for this industry or accept its removal from the catalog.",
          data: { pageId: orphan.pageId },
        });
      }
    }

    // pillar-commercial-promise
    for (const entry of depth1Entries) {
      const page = entry.pages?.[defaultLang] ?? entry.page;
      if (!page) continue;
      const desc = page.description ?? "";
      const lower = desc.toLowerCase();
      for (const phrase of COMMERCIAL_PROMISE_PHRASES) {
        if (lower.includes(phrase.toLowerCase())) {
          diagnostics.push({
            ruleId: "pillar-commercial-promise",
            severity: "error",
            file: ARTIFACT_FILE,
            message: `industry "${entry.axes["industry"]}" metaDescription contains unfulfillable promise phrase "${phrase}"`,
            fixHint: "Remove the commercial promise from the industry metaDescription.",
            data: { pageId: entry.pageId },
          });
        }
      }
    }

    // pillar-priceref-unresolvable (syntax fail, resolution warn)
    const priceRef = level0.pillar.productPrice.priceRef;
    const isBraceless = priceRef.startsWith("business-profile.");
    const isBraced = priceRef.startsWith("{business-profile.") && priceRef.endsWith("}");
    if (!isBraceless && !isBraced) {
      diagnostics.push({
        ruleId: "pillar-priceref-unresolvable",
        severity: "error",
        file: `packages/werkstatt-site/src/domain/ontology/blueprints/${bp.id}.yaml`,
        message: `pillar.productPrice.priceRef "${priceRef}" is not a valid PBP reference (expected "business-profile.…")`,
        fixHint: "Use a business-profile.offerings/… reference for the price.",
      });
    } else {
      // Syntax is valid — warn that resolution is not checked at validation time.
      diagnostics.push({
        ruleId: "pillar-priceref-unresolvable",
        severity: "warning",
        file: `packages/werkstatt-site/src/domain/ontology/blueprints/${bp.id}.yaml`,
        message: `pillar.productPrice.priceRef "${priceRef}" syntax is valid but PBP resolution is not checked at validation time`,
        fixHint: "Verify the PBP entity and field path exist in the render-time environment.",
      });
    }
  }

  if (diagnostics.length === 0) {
    return passResult("surface.hub.validate", "no pillar hub surfaces found or all checks passed");
  }

  return diagnosticsResult("surface.hub.validate", diagnostics);
}
