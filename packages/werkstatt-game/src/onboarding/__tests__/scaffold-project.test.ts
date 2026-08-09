import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldPhaserProject } from "../scaffold-project.ts";

function makeCtx(projectPath: string, projectId?: string) {
  return {
    workspaceRoot: projectPath,
    workpiecePath: projectPath,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    ...(projectId ? { projectId } : {}),
  };
}

describe("scaffoldPhaserProject", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "scaffold-"));
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("creates all expected files", async () => {
    const result = await scaffoldPhaserProject(makeCtx(projectPath, "test-game"));

    expect(result.success).toBe(true);
    const files = result.data as { filesCreated: string[] };
    expect(files.filesCreated).toContain("src/scenes/boot.ts");
    expect(files.filesCreated).toContain("src/assets/manifest.yaml");
    expect(files.filesCreated).toContain("phaser.config.ts");
    expect(files.filesCreated).toContain("vite.config.ts");
    expect(files.filesCreated).toContain("package.json");
    expect(files.filesCreated).toContain("tsconfig.json");
  });

  it("creates boot scene with BootScene class", async () => {
    await scaffoldPhaserProject(makeCtx(projectPath));

    const bootContent = await readFile(join(projectPath, "src", "scenes", "boot.ts"), "utf-8");
    expect(bootContent).toContain("export class BootScene");
    expect(bootContent).toContain("Phaser.Scene");
  });

  it("creates phaser.config.ts with boot scene registered", async () => {
    await scaffoldPhaserProject(makeCtx(projectPath));

    const configContent = await readFile(join(projectPath, "phaser.config.ts"), "utf-8");
    expect(configContent).toContain("BootScene");
    expect(configContent).toContain("bundleBudget");
    expect(configContent).toContain("5242880");
  });

  it("creates empty asset manifest", async () => {
    await scaffoldPhaserProject(makeCtx(projectPath));

    const manifestContent = await readFile(
      join(projectPath, "src", "assets", "manifest.yaml"),
      "utf-8",
    );
    expect(manifestContent).toContain("assets: []");
  });

  it("creates package.json with project name", async () => {
    await scaffoldPhaserProject(makeCtx(projectPath, "my-cool-game"));

    const pkgContent = await readFile(join(projectPath, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgContent);
    expect(pkg.name).toBe("my-cool-game");
    expect(pkg.dependencies.phaser).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
  });

  it("creates vite.config.ts", async () => {
    await scaffoldPhaserProject(makeCtx(projectPath));

    const viteContent = await readFile(join(projectPath, "vite.config.ts"), "utf-8");
    expect(viteContent).toContain("defineConfig");
    expect(viteContent).toContain("outDir");
  });

  it("creates tsconfig.json", async () => {
    await scaffoldPhaserProject(makeCtx(projectPath));

    const tsconfigContent = await readFile(join(projectPath, "tsconfig.json"), "utf-8");
    const tsconfig = JSON.parse(tsconfigContent);
    expect(tsconfig.compilerOptions.target).toBe("ES2022");
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("creates public/ directory", async () => {
    await scaffoldPhaserProject(makeCtx(projectPath));

    await expect(access(join(projectPath, "public"))).resolves.toBeUndefined();
  });
});
