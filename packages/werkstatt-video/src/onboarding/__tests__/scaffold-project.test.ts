import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldEditframeProject } from "../scaffold-project.ts";

describe("video.scaffoldProject", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "video-scaffold-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("creates all expected files", async () => {
    const ctx = {
      workspaceRoot: projectRoot,
      workpiecePath: projectRoot,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    const result = await scaffoldEditframeProject(ctx);

    expect(result.success).toBe(true);
    const data = result.data as { projectPath: string; filesCreated: string[] };
    const filesCreated = data.filesCreated;
    expect(filesCreated).toContain("src/composition.tsx");
    expect(filesCreated).toContain("editframe.config.ts");
    expect(filesCreated).toContain("src/assets/manifest.yaml");
    expect(filesCreated).toContain("package.json");
    expect(filesCreated).toContain("tsconfig.json");
    expect(filesCreated).toContain("vite.config.ts");
  });

  it("writes composition.tsx with Timegroup and duration", async () => {
    const ctx = {
      workspaceRoot: projectRoot,
      workpiecePath: projectRoot,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    await scaffoldEditframeProject(ctx);

    const content = await readFile(join(projectRoot, "src", "composition.tsx"), "utf-8");
    expect(content).toContain("Timegroup");
    expect(content).toContain('duration="10s"');
  });

  it("writes editframe.config.ts with codec, container, and resolution", async () => {
    const ctx = {
      workspaceRoot: projectRoot,
      workpiecePath: projectRoot,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    await scaffoldEditframeProject(ctx);

    const content = await readFile(join(projectRoot, "editframe.config.ts"), "utf-8");
    expect(content).toContain("codec");
    expect(content).toContain("container");
    expect(content).toContain("resolution");
  });

  it("writes package.json with projectId as name", async () => {
    const ctx = {
      workspaceRoot: projectRoot,
      workpiecePath: projectRoot,
      projectId: "brand-intro",
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    await scaffoldEditframeProject(ctx);

    const pkg = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf-8"));
    expect(pkg.name).toBe("brand-intro");
  });

  it("writes empty asset manifest", async () => {
    const ctx = {
      workspaceRoot: projectRoot,
      workpiecePath: projectRoot,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    await scaffoldEditframeProject(ctx);

    const content = await readFile(join(projectRoot, "src", "assets", "manifest.yaml"), "utf-8");
    expect(content).toContain("assets: []");
  });
});
