import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateGameEvidence } from "../game-evidence.ts";

function makeCtx(projectPath: string) {
  return {
    workspaceRoot: projectPath,
    workpiecePath: projectPath,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}

describe("generateGameEvidence", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "evidence-"));
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("generates evidence with all three hashes", async () => {
    await mkdir(join(projectPath, "dist"), { recursive: true });
    await mkdir(join(projectPath, "src", "assets"), { recursive: true });
    await mkdir(join(projectPath, "src", "scenes"), { recursive: true });
    await writeFile(join(projectPath, "dist", "game.js"), "console.log('game');");
    await writeFile(join(projectPath, "src", "assets", "manifest.yaml"), "assets: []\n");
    await writeFile(
      join(projectPath, "phaser.config.ts"),
      `export default { scenes: [] };`,
    );

    const result = await generateGameEvidence(makeCtx(projectPath));

    expect(result.success).toBe(true);
    const evidence = result.data as {
      bundleHash: string;
      assetManifestHash: string;
      sceneRegistryHash: string;
      bundleBytes: number;
      generatedAt: string;
    };
    expect(evidence.bundleHash).toHaveLength(64);
    expect(evidence.assetManifestHash).toHaveLength(64);
    expect(evidence.sceneRegistryHash).toHaveLength(64);
    expect(evidence.bundleBytes).toBeGreaterThan(0);
    expect(evidence.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns zero hash for missing dist/", async () => {
    await mkdir(join(projectPath, "src", "assets"), { recursive: true });
    await writeFile(join(projectPath, "src", "assets", "manifest.yaml"), "assets: []\n");
    await writeFile(join(projectPath, "phaser.config.ts"), `export default {}`);

    const result = await generateGameEvidence(makeCtx(projectPath));

    expect(result.success).toBe(true);
    const evidence = result.data as { bundleHash: string; bundleBytes: number };
    expect(evidence.bundleHash).toBe("0".repeat(64));
    expect(evidence.bundleBytes).toBe(0);
  });

  it("returns zero hash for missing manifest", async () => {
    await mkdir(join(projectPath, "dist"), { recursive: true });
    await writeFile(join(projectPath, "dist", "game.js"), "console.log('game');");
    await writeFile(join(projectPath, "phaser.config.ts"), `export default {}`);

    const result = await generateGameEvidence(makeCtx(projectPath));

    expect(result.success).toBe(true);
    const evidence = result.data as { assetManifestHash: string };
    expect(evidence.assetManifestHash).toBe("0".repeat(64));
  });

  it("produces different hashes for different content", async () => {
    await mkdir(join(projectPath, "dist"), { recursive: true });
    await mkdir(join(projectPath, "src", "assets"), { recursive: true });
    await writeFile(join(projectPath, "dist", "game.js"), "content-v1");
    await writeFile(join(projectPath, "src", "assets", "manifest.yaml"), "assets: []\n");
    await writeFile(join(projectPath, "phaser.config.ts"), `export default {}`);

    const result1 = await generateGameEvidence(makeCtx(projectPath));
    const hash1 = (result1.data as { bundleHash: string }).bundleHash;

    await writeFile(join(projectPath, "dist", "game.js"), "content-v2");
    const result2 = await generateGameEvidence(makeCtx(projectPath));
    const hash2 = (result2.data as { bundleHash: string }).bundleHash;

    expect(hash1).not.toBe(hash2);
  });
});
