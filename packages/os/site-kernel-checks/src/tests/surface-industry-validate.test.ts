/*
<MODULE_CONTRACT>
  <purpose>RFC-0492: unit tests for surface.industry.validate — gate pass/fail,
  claim violation detection, deprecated field warning.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0492: initial tests for surface.industry.validate.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { runSurfaceIndustryValidate } from "../surface-industry-validate.ts";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";

const MINIMAL_BLUEPRINT = `id: website-local
entitlement: pseo
dataset: { collection: industries }
axes:
  - id: industry
    universe: { collection: industries, field: slug }
    match: { recordField: industries }
  - id: country
    universe: { provider: geo.countries }
    match: { recordField: country }
  - id: region
    universe: { provider: geo.regions }
    match: { recordField: region }
  - id: city
    universe: { provider: geo.cities }
    match: { recordField: city }
  - id: demand
    universe: { collection: demands, field: slug }
    match: { recordField: slug }
levels:
  - depth: 0
    slug: { de: website }
    constellation: website-pillar
    geo: twin-only
    semanticType: collection
    titleTemplate: { de: "Website" }
  - depth: 1
    slug: { de: "website/{industry}" }
    constellation: website-industry
    geo: full
    titleTemplate: { de: "Website" }
    dossier:
      gate:
        minServiceCategories: 5
        minCustomerJourneys: 3
        minTrustSignals: 4
        minArchitectureEntries: 1
        minModuleMappings: 3
        minUniqueFaq: 5
      claimRestrictions:
        - "mehr Anfragen"
        - "echte Aufträge"
      doorwayMaxFlaggedShare: 0.30
      duplicateMaxSimilarity: 0.70
      mode: warn
policy:
  minRecordsPerDepth: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }
  noindexBelowPerDepth: { 5: 1 }
  redirectPolicy: nearest-ancestor
  trailingSlash: true
  maxStubDepth: 1
  substanceMin: 24
  substanceMinPerDepth: { 0: 24, 1: 36, 4: 52, 5: 64 }
  maxThinShare: 0.4
  regionalGateDepths: [3]
linking:
  children: { limit: 12 }
  siblings: { limit: 8 }
freshness:
  field: lastVerified
  slaDaysPerDepth: { 0: 3650, 1: 540, 2: 540, 3: 540, 4: 365, 5: 270 }
  mode: all
rotation:
  variantsByTupleHash: true
`;

async function withTempApp(
  fn: (
    root: string,
    appDir: string,
    context: ReturnType<typeof makeTestSiteContext>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "industry-validate-"));
  const appDir = join(root, "apps", "test-app");
  const bpDir = join(root, "packages", "ontology", "blueprints");
  await mkdir(bpDir, { recursive: true });
  await writeFile(join(bpDir, "website-local.yaml"), MINIMAL_BLUEPRINT, "utf8");
  const context = makeTestSiteContext(root, appDir);
  try {
    await fn(root, appDir, context);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeIndustryRecord(
  appDir: string,
  slug: string,
  frontmatter: Record<string, unknown>,
): Promise<void> {
  const dir = join(appDir, "src", "content", "surface", "industries", "de");
  await mkdir(dir, { recursive: true });
  const yaml = stringifyYaml(frontmatter);
  await writeFile(join(dir, `${slug}.md`), `---\n${yaml}---\n`, "utf8");
}

describe("surface.industry.validate", () => {
  it("passes when no industries directory exists", async () => {
    await withTempApp(async (_root, appDir, context) => {
      const result = await runSurfaceIndustryValidate(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("warns when gate fields are below threshold", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeIndustryRecord(appDir, "elektriker", {
        name: "Elektriker",
        slug: "elektriker",
        serviceTaxonomy: ["Installation"],
        customerJourneys: ["journey1"],
        trustSignals: ["signal1"],
        recommendedArchitecture: [{ module: "test", applicability: "test" }],
        suitableModules: [{ module: "test", applicability: "test" }],
        industryFaq: [{ question: "Q?", answer: "A." }],
      });
      const result = await runSurfaceIndustryValidate(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      const gateDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "industry-gate-below-threshold",
      );
      expect(gateDiags.length).toBeGreaterThan(0);
    });
  });

  it("detects prohibited claim phrases", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeIndustryRecord(appDir, "elektriker", {
        name: "Elektriker",
        slug: "elektriker",
        heroLead: "Mehr Anfragen durch professionelle Website",
        serviceTaxonomy: Array.from({ length: 5 }, (_, i) => `service-${i}`),
        customerJourneys: Array.from({ length: 3 }, (_, i) => `journey-${i}`),
        trustSignals: Array.from({ length: 4 }, (_, i) => `signal-${i}`),
        recommendedArchitecture: [{ module: "test", applicability: "test" }],
        suitableModules: Array.from({ length: 3 }, (_, i) => ({
          module: `mod-${i}`,
          applicability: "test",
        })),
        industryFaq: Array.from({ length: 5 }, (_, i) => ({
          question: `Q${i}?`,
          answer: `A${i}.`,
        })),
      });
      const result = await runSurfaceIndustryValidate(testInput(), context);
      const data = unwrapData(result);
      const claimDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "industry-claim-restriction",
      );
      expect(claimDiags.length).toBeGreaterThan(0);
    });
  });

  it("warns when deprecated fields are used and new fields are missing", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeIndustryRecord(appDir, "friseur", {
        name: "Friseur",
        slug: "friseur",
        proofSignals: ["Meisterbetrieb"],
        faqs: [{ question: "Q?", answer: "A." }],
        painPoints: ["point1"],
        serviceTaxonomy: Array.from({ length: 5 }, (_, i) => `service-${i}`),
        customerJourneys: Array.from({ length: 3 }, (_, i) => `journey-${i}`),
        trustSignals: Array.from({ length: 4 }, (_, i) => `signal-${i}`),
        recommendedArchitecture: [{ module: "test", applicability: "test" }],
        suitableModules: Array.from({ length: 3 }, (_, i) => ({
          module: `mod-${i}`,
          applicability: "test",
        })),
        industryFaq: Array.from({ length: 5 }, (_, i) => ({
          question: `Q${i}?`,
          answer: `A${i}.`,
        })),
      });
      const result = await runSurfaceIndustryValidate(testInput(), context);
      const data = unwrapData(result);
      const depDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "industry-deprecated-field",
      );
      expect(depDiags.length).toBeGreaterThan(0);
    });
  });
});
