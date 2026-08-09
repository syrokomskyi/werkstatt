/*
<MODULE_CONTRACT>
  <purpose>RFC-0497: unit tests for surface.intersection.validate — gate pass/fail,
  publication decision check, substance independence, pairwise similarity.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0497: initial tests for surface.intersection.validate.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { runSurfaceIntersectionValidate } from "../surface-intersection-validate.ts";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";

const WEBSITE_LOCAL_BLUEPRINT = `id: website-local
entitlement: pseo
dataset: { collection: demands }
axes:
  - id: industry
    universe: { collection: industries, field: slug }
    match: { recordField: industries }
  - id: city
    universe: { provider: geo.cities }
    match: { recordField: city }
  - id: demand
    universe: { collection: demands, field: slug }
    match: { recordField: slug }
levels:
  - depth: 0
    slug: { de: "website" }
    constellation: website-local
    geo: full
  - depth: 1
    slug: { de: "website/{industry}" }
    constellation: website-local
    geo: full
  - depth: 4
    slug: { de: "website/{industry}/{city}" }
    constellation: website-local
    geo: full
  - depth: 5
    slug: { de: "website/{industry}/{city}/{demand}" }
    constellation: website-local
    geo: full
    intersection:
      gate:
        minLocalServiceQuestions: 3
        minScenarios: 2
        minLocalEvidence: 2
        minUniqueContentBlocks: 1
        minUniqueFaq: 3
        minSources: 1
      similarity:
        similarityToIndustryPage: 0.70
        similarityToCityPage: 0.70
        similarityToServicePage: 0.70
        similarityToOtherIntersections: 0.70
      substanceIndependenceThreshold: 0.50
      mode: warn
policy:
  minRecordsPerDepth: { 0: 0, 1: 1, 4: 1, 5: 1 }
  trailingSlash: true
  maxStubDepth: 1
`;

async function withTempApp(
  fn: (
    root: string,
    appDir: string,
    context: ReturnType<typeof makeTestSiteContext>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "intersection-validate-"));
  const appDir = join(root, "apps", "test-app");
  const bpDir = join(root, "packages", "werkstatt-site", "src", "domain", "ontology", "blueprints");
  await mkdir(bpDir, { recursive: true });
  await writeFile(join(bpDir, "website-local.yaml"), WEBSITE_LOCAL_BLUEPRINT, "utf8");
  const context = makeTestSiteContext(root, appDir);
  try {
    await fn(root, appDir, context);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeIntersectionRecord(
  appDir: string,
  lang: string,
  filename: string,
  frontmatter: Record<string, unknown>,
): Promise<void> {
  const dir = join(appDir, "src", "content", "surface", "intersections", lang);
  await mkdir(dir, { recursive: true });
  const yaml = stringifyYaml(frontmatter);
  await writeFile(join(dir, `${filename}.md`), `---\n${yaml}---\n`, "utf8");
}

function fullRecord(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    intersectionId: "friseur/stuttgart/haarschnitt",
    industryId: "friseur",
    cityId: "stuttgart",
    serviceId: "haarschnitt",
    publicationDecision: "approved",
    localServiceQuestions: ["Q1?", "Q2?", "Q3?"],
    scenarios: ["Scenario 1.", "Scenario 2."],
    localEvidence: [
      {
        id: "ev1",
        text: "Evidence 1.",
        sourceRef: "external:city-stuttgart",
        asOf: "2026-07-06",
        reviewEvery: "P6M",
        provenance: "external",
      },
      {
        id: "ev2",
        text: "Evidence 2.",
        sourceRef: "external:city-stuttgart",
        asOf: "2026-07-06",
        reviewEvery: "P6M",
        provenance: "external",
      },
    ],
    uniqueContentBlocks: ["Unique block about Stuttgart."],
    uniqueFaq: [
      { question: "Q1?", answer: "A1." },
      { question: "Q2?", answer: "A2." },
      { question: "Q3?", answer: "A3." },
    ],
    sources: [{ ref: "external:city-stuttgart", asOf: "2026-07-06" }],
    ...overrides,
  };
}

describe("surface.intersection.validate", () => {
  it("passes when no intersections directory exists", async () => {
    await withTempApp(async (_root, _appDir, context) => {
      const result = await runSurfaceIntersectionValidate(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("passes when all gate fields meet thresholds", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeIntersectionRecord(appDir, "de", "friseur-stuttgart-haarschnitt", fullRecord());
      const result = await runSurfaceIntersectionValidate(testInput(), context);
      const data = unwrapData(result);
      const gateDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "intersection-gate-below-threshold",
      );
      expect(gateDiags).toHaveLength(0);
    });
  });

  it("warns when gate fields are below threshold", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeIntersectionRecord(
        appDir,
        "de",
        "friseur-stuttgart-haarschnitt",
        fullRecord({
          localServiceQuestions: ["Only one question?"],
          scenarios: ["Only one scenario."],
        }),
      );
      const result = await runSurfaceIntersectionValidate(testInput(), context);
      const data = unwrapData(result);
      const gateDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "intersection-gate-below-threshold",
      );
      expect(gateDiags.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("warns on non-approved publicationDecision", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeIntersectionRecord(
        appDir,
        "de",
        "friseur-stuttgart-haarschnitt",
        fullRecord({
          publicationDecision: "pending",
        }),
      );
      const result = await runSurfaceIntersectionValidate(testInput(), context);
      const data = unwrapData(result);
      const pubDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "intersection-publication-decision",
      );
      expect(pubDiags.length).toBeGreaterThan(0);
    });
  });

  it("warns on substance independence violation", async () => {
    await withTempApp(async (_root, appDir, context) => {
      const parentText =
        "Stuttgart ist eine grosse Stadt in Baden-Wuerttemberg mit vielen Friseuren und Salons.";
      await writeIntersectionRecord(
        appDir,
        "de",
        "friseur-stuttgart-haarschnitt",
        fullRecord({
          uniqueContentBlocks: [parentText],
          uniqueFaq: [
            { question: "Frage 1?", answer: parentText },
            { question: "Frage 2?", answer: parentText },
            { question: "Frage 3?", answer: parentText },
          ],
          industryDescription: parentText,
          cityDescription: parentText,
        }),
      );
      const result = await runSurfaceIntersectionValidate(testInput(), context);
      const data = unwrapData(result);
      const substanceDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "intersection-substance-independence",
      );
      expect(substanceDiags.length).toBeGreaterThan(0);
    });
  });

  it("warns on pairwise similarity between intersection records", async () => {
    await withTempApp(async (_root, appDir, context) => {
      const sharedText =
        "Der Friseur in dieser Stadt bietet Haarschnitt mit Online Terminbuchung und klaren Preisen.";
      const recordA = fullRecord({
        intersectionId: "friseur/stuttgart/haarschnitt",
        uniqueContentBlocks: [sharedText],
        uniqueFaq: [
          { question: "Q1?", answer: sharedText },
          { question: "Q2?", answer: sharedText },
          { question: "Q3?", answer: sharedText },
        ],
      });
      const recordB = fullRecord({
        intersectionId: "friseur/karlsruhe/haarschnitt",
        cityId: "karlsruhe",
        uniqueContentBlocks: [sharedText],
        uniqueFaq: [
          { question: "Q1?", answer: sharedText },
          { question: "Q2?", answer: sharedText },
          { question: "Q3?", answer: sharedText },
        ],
      });
      await writeIntersectionRecord(appDir, "de", "friseur-stuttgart-haarschnitt", recordA);
      await writeIntersectionRecord(appDir, "de", "friseur-karlsruhe-haarschnitt", recordB);
      const result = await runSurfaceIntersectionValidate(testInput(), context);
      const data = unwrapData(result);
      const simDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "intersection-similarity-exceeded",
      );
      expect(simDiags.length).toBeGreaterThan(0);
    });
  });

  it("does not flag similarity between records of different industries", async () => {
    await withTempApp(async (_root, appDir, context) => {
      const sharedText =
        "Der Dienstleister in dieser Stadt bietet Service mit Online Terminbuchung und klaren Preisen.";
      const recordA = fullRecord({
        intersectionId: "friseur/stuttgart/haarschnitt",
        uniqueContentBlocks: [sharedText],
        uniqueFaq: [
          { question: "Q1?", answer: sharedText },
          { question: "Q2?", answer: sharedText },
          { question: "Q3?", answer: sharedText },
        ],
      });
      const recordB = fullRecord({
        intersectionId: "elektriker/stuttgart/elektroinstallation",
        industryId: "elektriker",
        serviceId: "elektroinstallation",
        uniqueContentBlocks: [sharedText],
        uniqueFaq: [
          { question: "Q1?", answer: sharedText },
          { question: "Q2?", answer: sharedText },
          { question: "Q3?", answer: sharedText },
        ],
      });
      await writeIntersectionRecord(appDir, "de", "friseur-stuttgart-haarschnitt", recordA);
      await writeIntersectionRecord(
        appDir,
        "de",
        "elektriker-stuttgart-elektroinstallation",
        recordB,
      );
      const result = await runSurfaceIntersectionValidate(testInput(), context);
      const data = unwrapData(result);
      const simDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "intersection-similarity-exceeded",
      );
      expect(simDiags).toHaveLength(0);
    });
  });
});
