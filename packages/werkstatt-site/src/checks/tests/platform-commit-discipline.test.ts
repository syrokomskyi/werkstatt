import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runPlatformCommitDisciplineValidate } from "../platform-commit-discipline.ts";

const execFileAsync = promisify(execFile);

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

function input(flags: Record<string, unknown>): KernelCommandInput {
  return { argv: [], flags } as unknown as KernelCommandInput;
}

async function setupWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pcd-validate-"));
  await mkdir(join(root, "packages", "dummy"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "packages", "dummy", "index.ts"), "export const x = 1;\n", "utf8");
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });
  return root;
}

async function commitWithTrailer(
  root: string,
  filePath: string,
  content: string,
  trailer?: string,
): Promise<void> {
  const abs = join(root, filePath);
  await mkdir(join(root, ...filePath.split("/").slice(0, -1)), { recursive: true });
  await writeFile(abs, content, "utf8");
  await execFileAsync("git", ["add", filePath], { cwd: root });
  const message = trailer ? `feat: change ${filePath}\n\n${trailer}` : `feat: change ${filePath}`;
  await execFileAsync("git", ["commit", "-m", message], { cwd: root });
}

async function commitDocsOnly(root: string): Promise<void> {
  const filePath = "docs/readme.md";
  await writeFile(join(root, filePath), "# Docs\n", "utf8");
  await execFileAsync("git", ["add", filePath], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "docs: update readme"], { cwd: root });
}

async function getHeadSha(root: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
  return stdout.trim();
}

describe("platform.commit.discipline.validate", () => {
  it("PCD-PASS: passes when all platform-scope commits have X-Platform-Bump trailer", async () => {
    const root = await setupWorkspace();
    const baseSha = await getHeadSha(root);
    await commitWithTrailer(
      root,
      "packages/dummy/index.ts",
      "export const y = 2;\n",
      "X-Platform-Bump: patch",
    );

    const result = await runPlatformCommitDisciplineValidate(input({ base: baseSha }), ctx(root));

    expect(result.exitCode).toBe(0);
    expect(result.data!.status).toBe("pass");
    expect(result.data!.platformScopeCommits).toBe(1);
    expect(result.data!.violations).toHaveLength(0);
    await rm(root, { recursive: true, force: true });
  });

  it("PCD-FAIL: fails when platform-scope commit lacks X-Platform-Bump trailer", async () => {
    const root = await setupWorkspace();
    const baseSha = await getHeadSha(root);
    await commitWithTrailer(root, "packages/dummy/index.ts", "export const y = 2;\n");

    const result = await runPlatformCommitDisciplineValidate(input({ base: baseSha }), ctx(root));

    expect(result.exitCode).toBe(1);
    expect(result.data!.status).toBe("fail");
    expect(result.data!.platformScopeCommits).toBe(1);
    expect(result.data!.violations).toHaveLength(1);
    expect(result.data!.violations[0]!.message).toContain("X-Platform-Bump");
    await rm(root, { recursive: true, force: true });
  });

  it("PCD-BASE-NOT-FOUND: fails hard when base ref cannot be resolved", async () => {
    const root = await setupWorkspace();

    await expect(
      runPlatformCommitDisciplineValidate(input({ base: "nonexistent-ref" }), ctx(root)),
    ).rejects.toThrow("Could not resolve base ref 'nonexistent-ref'");
    await rm(root, { recursive: true, force: true });
  });

  it("PCD-NO-PLATFORM-COMMITS: passes with zero platform-scope commits", async () => {
    const root = await setupWorkspace();
    const baseSha = await getHeadSha(root);
    await commitDocsOnly(root);

    const result = await runPlatformCommitDisciplineValidate(input({ base: baseSha }), ctx(root));

    expect(result.exitCode).toBe(0);
    expect(result.data!.status).toBe("pass");
    expect(result.data!.platformScopeCommits).toBe(0);
    expect(result.data!.violations).toHaveLength(0);
    await rm(root, { recursive: true, force: true });
  });
});
