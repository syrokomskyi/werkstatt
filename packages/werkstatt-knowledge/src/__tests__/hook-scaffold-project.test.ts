import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runKnowledgeScaffoldProject } from "../hooks/scaffold-project.ts";

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

describe("runKnowledgeScaffoldProject", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "knowledge-scaffold-"));
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("creates all expected directories", async () => {
    const result = await runKnowledgeScaffoldProject(makeCtx(projectPath, "test-kb"));
    expect(result.success).toBe(true);

    for (const dir of ["knowledge/ontology", "staging", "laboratory", "projections", "apps", "packages", "docs/rfc", "docs/adr"]) {
      await expect(access(join(projectPath, dir))).resolves.toBeUndefined();
    }
  });

  it("creates knowledge/manifest.yaml", async () => {
    await runKnowledgeScaffoldProject(makeCtx(projectPath));
    const content = await readFile(join(projectPath, "knowledge", "manifest.yaml"), "utf-8");
    expect(content).toContain("id:");
    expect(content).toContain("modelVersion");
  });

  it("creates knowledge/ontology/schema-registry.yaml", async () => {
    await runKnowledgeScaffoldProject(makeCtx(projectPath));
    const content = await readFile(join(projectPath, "knowledge", "ontology", "schema-registry.yaml"), "utf-8");
    expect(content).toContain("schemas: []");
  });

  it("creates knowledge.config.yaml", async () => {
    await runKnowledgeScaffoldProject(makeCtx(projectPath));
    const content = await readFile(join(projectPath, "knowledge.config.yaml"), "utf-8");
    expect(content).toContain("source:");
    expect(content).toContain("extractors: []");
    expect(content).toContain("projections:");
  });

  it("creates turbo.json", async () => {
    await runKnowledgeScaffoldProject(makeCtx(projectPath));
    const content = await readFile(join(projectPath, "turbo.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.tasks.build).toBeDefined();
    expect(parsed.tasks.dev).toBeDefined();
  });

  it("creates pnpm-workspace.yaml", async () => {
    await runKnowledgeScaffoldProject(makeCtx(projectPath));
    const content = await readFile(join(projectPath, "pnpm-workspace.yaml"), "utf-8");
    expect(content).toContain("apps/*");
    expect(content).toContain("packages/*");
  });

  it("creates .gitignore", async () => {
    await runKnowledgeScaffoldProject(makeCtx(projectPath));
    const content = await readFile(join(projectPath, ".gitignore"), "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".generated/");
  });

  it("returns filesCreated list in result data", async () => {
    const result = await runKnowledgeScaffoldProject(makeCtx(projectPath, "my-kb"));
    expect(result.success).toBe(true);
    const data = result.data as { filesCreated: string[]; directoriesCreated: string[] };
    expect(data.filesCreated).toContain("knowledge/manifest.yaml");
    expect(data.filesCreated).toContain("knowledge/ontology/schema-registry.yaml");
    expect(data.filesCreated).toContain("knowledge.config.yaml");
    expect(data.filesCreated).toContain("turbo.json");
    expect(data.filesCreated).toContain("pnpm-workspace.yaml");
    expect(data.filesCreated).toContain(".gitignore");
    expect(data.directoriesCreated).toContain("knowledge/");
    expect(data.directoriesCreated).toContain("staging/");
    expect(data.directoriesCreated).toContain("laboratory/");
    expect(data.directoriesCreated).toContain("projections/");
  });

  it("uses default projectId when not provided", async () => {
    const result = await runKnowledgeScaffoldProject(makeCtx(projectPath));
    expect(result.success).toBe(true);
    const data = result.data as { projectId: string };
    expect(data.projectId).toBe("my-knowledge-base");
  });

  it("uses provided projectId", async () => {
    const result = await runKnowledgeScaffoldProject(makeCtx(projectPath, "custom-kb"));
    expect(result.success).toBe(true);
    const data = result.data as { projectId: string };
    expect(data.projectId).toBe("custom-kb");
  });
});
