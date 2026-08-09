import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateAssets } from "../assets-validate.ts";

describe("video.assets.validate", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "video-assets-"));
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

  it("passes when all manifest entries exist on disk", async () => {
    await mkdir(join(projectRoot, "src", "assets", "images"), { recursive: true });
    await writeFile(join(projectRoot, "src", "assets", "images", "logo.svg"), "<svg/>");
    await writeFile(
      join(projectRoot, "src", "assets", "manifest.yaml"),
      "assets:\n  - path: images/logo.svg\n    type: image\n",
    );

    const result = await validateAssets(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when manifest entry does not exist on disk (WV-02)", async () => {
    await mkdir(join(projectRoot, "src", "assets"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "assets", "manifest.yaml"),
      "assets:\n  - path: missing.png\n    type: image\n",
    );

    const result = await validateAssets(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations[0]!.ruleId).toBe("WV-02");
  });

  it("fails when asset file exists but is not in manifest (WV-07)", async () => {
    await mkdir(join(projectRoot, "src", "assets"), { recursive: true });
    await writeFile(join(projectRoot, "src", "assets", "orphan.png"), "fake-png");
    await writeFile(
      join(projectRoot, "src", "assets", "manifest.yaml"),
      "assets: []\n",
    );

    const result = await validateAssets(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.violations[0]!.ruleId).toBe("WV-07");
    expect(result.data?.violations[0]!.message).toContain("not listed in manifest");
  });
});
