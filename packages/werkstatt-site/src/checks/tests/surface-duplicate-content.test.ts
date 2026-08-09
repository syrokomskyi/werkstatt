/*
<MODULE_CONTRACT>
  <purpose>RFC-0492: unit tests for surface.duplicate-content.report — pairwise
  similarity, depth-1 filtering, and threshold behavior.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0492: initial tests for surface.duplicate-content.report.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSurfaceDuplicateContentReport } from "../surface-duplicate-content.ts";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";

async function withTempApp(
  fn: (
    root: string,
    appDir: string,
    context: ReturnType<typeof makeTestSiteContext>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "dup-content-"));
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

function depth1Entry(pageId: string, industry: string): Record<string, unknown> {
  return {
    surfaceId: "website-local",
    pageId,
    routes: { de: `website/${industry}` },
    axes: { industry },
    depth: 1,
    recordCount: 1,
    indexable: true,
    noindex: false,
  };
}

function depth4Entry(pageId: string, industry: string, city: string): Record<string, unknown> {
  return {
    surfaceId: "website-local",
    pageId,
    routes: { de: `website/${industry}/deu/bw/${city}` },
    axes: { industry, country: "deu", region: "bw", city },
    depth: 4,
    recordCount: 1,
    indexable: true,
    noindex: false,
  };
}

describe("surface.duplicate-content.report", () => {
  it("skips when no surface artifact exists", async () => {
    await withTempApp(async (_root, _appDir, context) => {
      const result = await runSurfaceDuplicateContentReport(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("skips when fewer than 2 depth-1 entries", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeSurfaceArtifact(appDir, [depth1Entry("wl:elektriker", "elektriker")]);
      const result = await runSurfaceDuplicateContentReport(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("filters to depth-1 only (ignores depth-4 entries)", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeSurfaceArtifact(appDir, [
        depth1Entry("wl:elektriker", "elektriker"),
        depth4Entry("wl:elektriker:deu:bw:stuttgart", "elektriker", "stuttgart"),
        depth4Entry("wl:elektriker:deu:bw:karlsruhe", "elektriker", "karlsruhe"),
      ]);
      const result = await runSurfaceDuplicateContentReport(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("flags depth-1 entries with identical (empty) content as duplicates", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeSurfaceArtifact(appDir, [
        depth1Entry("wl:elektriker", "elektriker"),
        depth1Entry("wl:friseur", "friseur"),
      ]);
      const result = await runSurfaceDuplicateContentReport(testInput(), context);
      // No baked pages in temp app → both shingle sets empty → jaccard=1.0 > threshold
      expect(result.exitCode).toBe(1);
      const data = unwrapData(result);
      const dupDiags = data.diagnostics.filter(
        (d: { ruleId: string }) => d.ruleId === "industry-duplicate-content",
      );
      expect(dupDiags.length).toBeGreaterThan(0);
    });
  });
});
