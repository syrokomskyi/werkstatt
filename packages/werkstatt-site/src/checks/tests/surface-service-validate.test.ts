/*
<MODULE_CONTRACT>
  <purpose>RFC-0496: unit tests for surface.service.validate — gate pass/fail,
  claim violation detection, review/publication status checks.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0496: initial tests for surface.service.validate.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { runSurfaceServiceValidate } from "../surface-service-validate.ts";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";

const SERVICE_BLUEPRINT = `id: website-service
entitlement: pseo
dataset: { collection: services }
axes:
  - id: industry
    universe: { collection: industries, field: slug }
    match: { recordField: industryId }
  - id: service
    universe: { collection: services, field: slug }
    match: { recordField: slug }
levels:
  - depth: 2
    slug: { de: "website/{industry}/{service}", uk: "sait/{industry}/{service}" }
    constellation: website-service
    geo: full
    titleTemplate: { de: "{service.name}" }
    service:
      gate:
        minServiceVariants: 3
        minCustomerQuestions: 3
        minPriceModels: 3
        minFaq: 5
        minPageStructure: 1
      claimRestrictions:
        - "mehr Anfragen"
        - "echte Aufträge"
      mode: warn
policy:
  minRecordsPerDepth: { 2: 1 }
  trailingSlash: true
  maxStubDepth: 2
linking:
  parent:
    surface: website-local
    depth: 1
    joinField: industryId
`;

async function withTempApp(
  fn: (
    root: string,
    appDir: string,
    context: ReturnType<typeof makeTestSiteContext>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "service-validate-"));
  const appDir = join(root, "apps", "test-app");
  const bpDir = join(root, "packages", "werkstatt-site", "src", "domain", "ontology", "blueprints");
  await mkdir(bpDir, { recursive: true });
  await writeFile(join(bpDir, "website-service.yaml"), SERVICE_BLUEPRINT, "utf8");
  const context = makeTestSiteContext(root, appDir);
  try {
    await fn(root, appDir, context);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeServiceRecord(
  appDir: string,
  slug: string,
  frontmatter: Record<string, unknown>,
): Promise<void> {
  const dir = join(appDir, "src", "content", "surface", "services", "de");
  await mkdir(dir, { recursive: true });
  const yaml = stringifyYaml(frontmatter);
  await writeFile(join(dir, `${slug}.md`), `---\n${yaml}---\n`, "utf8");
}

describe("surface.service.validate", () => {
  it("passes when no services directory exists", async () => {
    await withTempApp(async (_root, _appDir, context) => {
      const result = await runSurfaceServiceValidate(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("warns when gate fields are below threshold", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeServiceRecord(appDir, "website-erstellung", {
        name: "Website-Erstellung",
        slug: "website-erstellung",
        industryId: "elektriker",
        serviceVariants: [{ displayName: "Basic", description: "Basic package" }],
        customerQuestions: ["What?"],
        pricePresentationModels: ["Flat rate"],
        faq: [{ question: "Q?", answer: "A." }],
        recommendedPageStructure: [{ page: "Home", description: "Homepage" }],
      });
      const result = await runSurfaceServiceValidate(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      const gateDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "service-gate-below-threshold",
      );
      expect(gateDiags.length).toBeGreaterThan(0);
    });
  });

  it("detects prohibited claim phrases", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeServiceRecord(appDir, "website-erstellung", {
        name: "Website-Erstellung",
        slug: "website-erstellung",
        industryId: "elektriker",
        servicePurpose: "Mehr Anfragen durch professionelle Website",
        serviceVariants: Array.from({ length: 3 }, (_, i) => ({
          displayName: `Variant ${i}`,
          description: `Description ${i}`,
        })),
        customerQuestions: Array.from({ length: 3 }, (_, i) => `Question ${i}`),
        pricePresentationModels: Array.from({ length: 3 }, (_, i) => `Model ${i}`),
        faq: Array.from({ length: 5 }, (_, i) => ({
          question: `Q${i}?`,
          answer: `A${i}.`,
        })),
        recommendedPageStructure: [{ page: "Home", description: "Homepage" }],
      });
      const result = await runSurfaceServiceValidate(testInput(), context);
      const data = unwrapData(result);
      const claimDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "service-claim-restriction",
      );
      expect(claimDiags.length).toBeGreaterThan(0);
    });
  });

  it("passes when all gate fields meet thresholds and no claim phrases", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeServiceRecord(appDir, "website-erstellung", {
        name: "Website-Erstellung",
        slug: "website-erstellung",
        industryId: "elektriker",
        servicePurpose: "Professionelle Website-Struktur fuer Handwerksbetriebe",
        serviceVariants: Array.from({ length: 3 }, (_, i) => ({
          displayName: `Variant ${i}`,
          description: `Description ${i}`,
        })),
        customerQuestions: Array.from({ length: 3 }, (_, i) => `Question ${i}`),
        pricePresentationModels: Array.from({ length: 3 }, (_, i) => `Model ${i}`),
        faq: Array.from({ length: 5 }, (_, i) => ({
          question: `Q${i}?`,
          answer: `A${i}.`,
        })),
        recommendedPageStructure: [{ page: "Home", description: "Homepage" }],
      });
      const result = await runSurfaceServiceValidate(testInput(), context);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("warns on non-approved review status", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeServiceRecord(appDir, "website-erstellung", {
        name: "Website-Erstellung",
        slug: "website-erstellung",
        industryId: "elektriker",
        reviewStatus: "draft",
        serviceVariants: Array.from({ length: 3 }, (_, i) => ({
          displayName: `Variant ${i}`,
          description: `Description ${i}`,
        })),
        customerQuestions: Array.from({ length: 3 }, (_, i) => `Question ${i}`),
        pricePresentationModels: Array.from({ length: 3 }, (_, i) => `Model ${i}`),
        faq: Array.from({ length: 5 }, (_, i) => ({
          question: `Q${i}?`,
          answer: `A${i}.`,
        })),
        recommendedPageStructure: [{ page: "Home", description: "Homepage" }],
      });
      const result = await runSurfaceServiceValidate(testInput(), context);
      const data = unwrapData(result);
      const reviewDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "service-review-status",
      );
      expect(reviewDiags.length).toBeGreaterThan(0);
    });
  });
});
