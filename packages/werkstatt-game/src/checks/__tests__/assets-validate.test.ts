import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateAssets } from "../assets-validate.ts";

describe("game.assets.validate", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "game-assets-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("passes with empty manifest (freshly scaffolded project)", async () => {
    await mkdir(join(projectRoot, "src", "assets"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "assets", "manifest.yaml"),
      "assets: []\n",
    );

    const result = await validateAssets(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("passes with no manifest at all", async () => {
    await mkdir(join(projectRoot, "src", "assets"), { recursive: true });

    const result = await validateAssets(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("passes when all manifest entries exist on disk", async () => {
    await mkdir(join(projectRoot, "src", "assets", "sprites"), { recursive: true });
    await writeFile(join(projectRoot, "src", "assets", "sprites", "player.png"), "fake-png");
    await writeFile(
      join(projectRoot, "src", "assets", "manifest.yaml"),
      "assets:\n  - path: sprites/player.png\n    type: image\n",
    );

    const result = await validateAssets(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when manifest entry does not exist on disk (GAME-02)", async () => {
    await mkdir(join(projectRoot, "src", "assets"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "assets", "manifest.yaml"),
      "assets:\n  - path: missing.png\n    type: image\n",
    );

    const result = await validateAssets(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]!.ruleId).toBe("GAME-02");
  });

  it("fails when asset file exists but is not in manifest (GAME-02)", async () => {
    await mkdir(join(projectRoot, "src", "assets"), { recursive: true });
    await writeFile(join(projectRoot, "src", "assets", "orphan.png"), "fake-png");
    await writeFile(
      join(projectRoot, "src", "assets", "manifest.yaml"),
      "assets: []\n",
    );

    const result = await validateAssets(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]!.ruleId).toBe("GAME-02");
    expect(result.data?.violations[0]!.message).toContain("not listed in manifest");
  });
});
