import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateVideoEvidence } from "../video-evidence.ts";

describe("video.releaseEvidence", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "video-evidence-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("generates evidence with hashes", async () => {
    await mkdir(join(projectRoot, "src", "assets"), { recursive: true });
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    await writeFile(join(projectRoot, "src", "composition.tsx"), "export default {};");
    await writeFile(join(projectRoot, "src", "assets", "manifest.yaml"), "assets: []");
    await writeFile(join(projectRoot, "dist", "output.mp4"), "fake-video");

    const ctx = {
      workspaceRoot: projectRoot,
      workpiecePath: projectRoot,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    const result = await generateVideoEvidence(ctx);

    expect(result.success).toBe(true);
    const evidence = result.data as {
      renderHash: string;
      compositionHash: string;
      assetManifestHash: string;
      renderBytes: number;
      generatedAt: string;
    };
    expect(evidence.renderHash).toHaveLength(64);
    expect(evidence.compositionHash).toHaveLength(64);
    expect(evidence.assetManifestHash).toHaveLength(64);
    expect(evidence.renderBytes).toBeGreaterThan(0);
    expect(evidence.generatedAt).toBeDefined();
  });

  it("returns zero hash for missing dist/", async () => {
    await mkdir(join(projectRoot, "src", "assets"), { recursive: true });
    await writeFile(join(projectRoot, "src", "composition.tsx"), "export default {};");
    await writeFile(join(projectRoot, "src", "assets", "manifest.yaml"), "assets: []");

    const ctx = {
      workspaceRoot: projectRoot,
      workpiecePath: projectRoot,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    const result = await generateVideoEvidence(ctx);

    expect(result.success).toBe(true);
    const evidence = result.data as { renderHash: string; renderBytes: number };
    expect(evidence.renderHash).toBe("0".repeat(64));
    expect(evidence.renderBytes).toBe(0);
  });
});
