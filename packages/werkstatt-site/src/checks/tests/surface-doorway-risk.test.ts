/*
<MODULE_CONTRACT>
  <purpose>RFC-0492: unit tests for surface.doorway-risk.report — missing field
  detection and threshold computation for depth-4 city pages.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0492: initial tests for surface.doorway-risk.report.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { runSurfaceDoorwayRiskReport } from "../surface-doorway-risk.ts";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";

async function withTempApp(
  fn: (
    root: string,
    appDir: string,
    context: ReturnType<typeof makeTestSiteContext>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "doorway-risk-"));
  const appDir = join(root, "apps", "test-app");
  const context = makeTestSiteContext(root, appDir);
  try {
    await fn(root, appDir, context);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeSurfaceArtifact(
  appDir: string,
  entries: Array<Record<string, unknown>>,
): Promise<void> {
  const artifact = { generatedAt: "2026-01-01T00:00:00Z", entries };
  await mkdir(join(appDir, "src"), { recursive: true });
  await writeFile(
    join(appDir, "src", "surface.generated.yaml"),
    JSON.stringify(artifact, null, 2) + "\n",
    "utf8",
  );
}

async function writeCityRecord(
  appDir: string,
  slug: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = join(appDir, "src", "content", "surface", "cities", "de");
  await mkdir(dir, { recursive: true });
  const yaml = stringifyYaml(data);
  await writeFile(join(dir, `${slug}.md`), `---\n${yaml}---\n`, "utf8");
}

async function writeDemandRecord(
  appDir: string,
  slug: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = join(appDir, "src", "content", "surface", "demands", "de");
  await mkdir(dir, { recursive: true });
  const yaml = stringifyYaml(data);
  await writeFile(join(dir, `${slug}.md`), `---\n${yaml}---\n`, "utf8");
}

function depth4Entry(
  pageId: string,
  industry: string,
  city: string,
  demand: string,
): Record<string, unknown> {
  return {
    surfaceId: "website-local",
    pageId,
    routes: { de: `website/${industry}/deu/bw/${city}/${demand}` },
    axes: { industry, country: "deu", region: "bw", city, demand },
    depth: 4,
    recordCount: 1,
    indexable: true,
    noindex: false,
  };
}

describe("surface.doorway-risk.report", () => {
  it("skips when no surface artifact exists", async () => {
    await withTempApp(async (_root, _appDir, context) => {
      const result = await runSurfaceDoorwayRiskReport(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("flags pages missing local context fields", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeSurfaceArtifact(appDir, [
        depth4Entry(
          "wl:elektriker:deu:bw:stuttgart",
          "elektriker",
          "stuttgart",
          "wallbox-installation",
        ),
        depth4Entry("wl:friseur:deu:bw:karlsruhe", "friseur", "karlsruhe", "haarschnitt"),
      ]);

      // Stuttgart — has all fields
      await writeCityRecord(appDir, "stuttgart", {
        uniqueIntro: "Stuttgart intro",
        uniqueFaq: [{ question: "Q?", answer: "A." }],
        localEvidence: ["fact1", "fact2", "fact3"],
      });
      await writeDemandRecord(appDir, "wallbox-installation", {
        industries: ["elektriker"],
        country: "deu",
        region: "bw",
        city: "stuttgart",
        localDemandContext: "Context for Stuttgart",
      });

      // Karlsruhe — missing all local context fields
      await writeCityRecord(appDir, "karlsruhe", {});

      const result = await runSurfaceDoorwayRiskReport(testInput(), context);
      const data = unwrapData(result);
      const doorwayDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "doorway-risk-missing-local-context",
      );
      expect(doorwayDiags.length).toBeGreaterThan(0);
    });
  });

  it("passes when all depth-4 pages have local context", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeSurfaceArtifact(appDir, [
        depth4Entry(
          "wl:elektriker:deu:bw:stuttgart",
          "elektriker",
          "stuttgart",
          "wallbox-installation",
        ),
      ]);

      await writeCityRecord(appDir, "stuttgart", {
        uniqueIntro: "Stuttgart intro",
        uniqueFaq: [{ question: "Q?", answer: "A." }],
        localEvidence: ["fact1", "fact2", "fact3"],
      });
      await writeDemandRecord(appDir, "wallbox-installation", {
        industries: ["elektriker"],
        country: "deu",
        region: "bw",
        city: "stuttgart",
        localDemandContext: "Context for Stuttgart",
      });

      const result = await runSurfaceDoorwayRiskReport(testInput(), context);
      expect(result.exitCode).toBe(0);
    });
  });

  it("finds localDemandContext via city+industry, not demand slug (RFC-0516)", async () => {
    await withTempApp(async (_root, appDir, context) => {
      // Depth-4 entry has no demand axis — only industry + city
      await writeSurfaceArtifact(appDir, [
        {
          surfaceId: "website-local",
          pageId: "wl:friseur:deu:bw:karlsruhe",
          routes: { de: "website/friseur/deu/bw/karlsruhe" },
          axes: { industry: "friseur", country: "deu", region: "bw", city: "karlsruhe" },
          depth: 4,
          recordCount: 1,
          indexable: true,
          noindex: false,
        },
      ]);

      await writeCityRecord(appDir, "karlsruhe", {
        uniqueIntro: "Karlsruhe intro",
        uniqueFaq: [{ question: "Q?", answer: "A." }],
        localEvidence: ["fact1", "fact2", "fact3"],
      });
      // Demand slug is "haarschnitt" but entry has no demand axis
      await writeDemandRecord(appDir, "haarschnitt", {
        industries: ["friseur"],
        country: "deu",
        region: "bw",
        city: "karlsruhe",
        localDemandContext: "Context for Karlsruhe",
      });

      const result = await runSurfaceDoorwayRiskReport(testInput(), context);
      expect(result.exitCode).toBe(0);
    });
  });

  it("emits warnings (not errors) when dossier mode is warn (RFC-0516)", async () => {
    await withTempApp(async (root, appDir, context) => {
      // Write a valid blueprint with mode: warn
      const bpDir = join(root, "packages", "werkstatt-site", "src", "domain", "ontology", "blueprints");
      await mkdir(bpDir, { recursive: true });
      await writeFile(
        join(bpDir, "website-local.yaml"),
        [
          "id: website-local",
          "entitlement: pseo",
          "dataset: { collection: demands, status: active }",
          "axes:",
          "  - id: industry",
          "    universe: { collection: industries, field: slug }",
          "    match: { recordField: industries }",
          "levels:",
          "  - depth: 0",
          "    slug: { de: website }",
          "    constellation: website-pillar",
          "  - depth: 1",
          "    slug: { de: 'website/{industry}' }",
          "    constellation: website-industry",
          "    dossier:",
          "      gate:",
          "        minServiceCategories: 0",
          "        minCustomerJourneys: 0",
          "        minTrustSignals: 0",
          "        minArchitectureEntries: 0",
          "        minModuleMappings: 0",
          "        minUniqueFaq: 0",
          "      claimRestrictions: ['no-claims']",
          "      doorwayMaxFlaggedShare: 0.3",
          "      duplicateMaxSimilarity: 0.7",
          "      mode: warn",
          "policy:",
          "  minRecordsPerDepth: { 0: 0, 1: 1 }",
        ].join("\n") + "\n",
        "utf8",
      );

      await writeSurfaceArtifact(appDir, [
        depth4Entry("wl:friseur:deu:bw:karlsruhe", "friseur", "karlsruhe", "haarschnitt"),
      ]);
      // No city record, no demand record → all fields missing
      const result = await runSurfaceDoorwayRiskReport(testInput(), context);
      const data = unwrapData(result);
      const doorwayDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "doorway-risk-missing-local-context",
      );
      expect(doorwayDiags.length).toBeGreaterThan(0);
      for (const d of doorwayDiags) {
        expect(d.severity).toBe("warning");
      }
      // No threshold-exceeded error diagnostic
      const thresholdDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "doorway-risk-threshold-exceeded",
      );
      expect(thresholdDiags.length).toBe(0);
    });
  });
});
