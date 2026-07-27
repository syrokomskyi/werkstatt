import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  snapshotCacheParityFiles,
  compareCacheParitySnapshots,
  buildCacheParityDiagnostics,
  hashCacheParitySnapshot,
} from "../pipeline/pipeline-cache-parity.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0259: fixture tests for pipeline.cache.parity's pure snapshot-diff and
    diagnostic-projection logic. The full runPipelineCacheParity command
    spawns real cold/warm turbo builds and is exercised by the scheduled CI
    job, not per-PR unit tests (see the RFC's Design/Rollout).
  </purpose>
</MODULE_CONTRACT>
*/

async function fixtureAppDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cache-parity-"));
  const appDir = join(root, "apps", "demo");
  await mkdir(join(appDir, "dist"), { recursive: true });
  await mkdir(join(appDir, "src"), { recursive: true });
  await mkdir(join(appDir, "src", "styles"), { recursive: true });
  await mkdir(join(appDir, "public"), { recursive: true });
  return appDir;
}

describe("pipeline.cache.parity: snapshotCacheParityFiles (RFC-0259)", () => {
  it("only captures files inside the declared generated-artifact scope", async () => {
    const appDir = await fixtureAppDir();
    await writeFile(join(appDir, "dist", "index.html"), "<html></html>", "utf8");
    await writeFile(join(appDir, "src", "entitlements.generated.json"), "{}", "utf8");
    await writeFile(join(appDir, "src", "styles", "biome.generated.css"), "body{}", "utf8");
    await writeFile(join(appDir, "public", "sitemap.xml"), "<urlset/>", "utf8");
    // Out of scope — must NOT be captured.
    await writeFile(join(appDir, "src", "not-generated.ts"), "export {}", "utf8");

    const snapshot = await snapshotCacheParityFiles(appDir);
    const files = Object.keys(snapshot.files).sort();
    expect(files).toEqual([
      "dist/index.html",
      "public/sitemap.xml",
      "src/entitlements.generated.json",
      "src/styles/biome.generated.css",
    ]);
    await rm(appDir, { recursive: true, force: true });
  });
});

describe("pipeline.cache.parity: compareCacheParitySnapshots + buildCacheParityDiagnostics (RFC-0259)", () => {
  it("CACHE-PARITY-02: a file whose content differs after the warm build is flagged", () => {
    const cold = { files: { "dist/index.html": "hash-a" } };
    const warm = { files: { "dist/index.html": "hash-b" } };
    const { missingAfterWarm, differingAfterWarm } = compareCacheParitySnapshots(cold, warm);
    expect(missingAfterWarm).toEqual([]);
    expect(differingAfterWarm).toEqual(["dist/index.html"]);

    const diagnostics = buildCacheParityDiagnostics("demo", missingAfterWarm, differingAfterWarm);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe("CACHE-PARITY-02");
    expect(diagnostics[0]?.severity).toBe("error");
  });

  it("CACHE-PARITY-01: a file present cold but missing warm is flagged", () => {
    const cold = { files: { "src/entitlements.generated.yaml": "hash-a" } };
    const warm = { files: {} };
    const { missingAfterWarm, differingAfterWarm } = compareCacheParitySnapshots(cold, warm);
    expect(missingAfterWarm).toEqual(["src/entitlements.generated.yaml"]);
    expect(differingAfterWarm).toEqual([]);

    const diagnostics = buildCacheParityDiagnostics("demo", missingAfterWarm, differingAfterWarm);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe("CACHE-PARITY-01");
  });

  it("passes (no diagnostics) when cold and warm snapshots are identical", () => {
    const cold = { files: { "dist/index.html": "hash-a", "public/sitemap.xml": "hash-b" } };
    const warm = { files: { "dist/index.html": "hash-a", "public/sitemap.xml": "hash-b" } };
    const { missingAfterWarm, differingAfterWarm } = compareCacheParitySnapshots(cold, warm);
    const diagnostics = buildCacheParityDiagnostics("demo", missingAfterWarm, differingAfterWarm);
    expect(diagnostics).toEqual([]);
    expect(hashCacheParitySnapshot(cold)).toBe(hashCacheParitySnapshot(warm));
  });
});
