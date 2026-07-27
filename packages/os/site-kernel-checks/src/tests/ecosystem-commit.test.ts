import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runEcosystemCommit } from "../ecosystem-commit.ts";

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
  return { argv: [], args: [], flags } as unknown as KernelCommandInput;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function setupWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ecosystem-commit-"));
  await mkdir(join(root, "packages", "dummy"), { recursive: true });
  await mkdir(join(root, "docs", "rfcs"), { recursive: true });
  await writeJson(join(root, "package.json"), { name: "test-platform", version: "1.0.0" });
  await writeFile(join(root, "packages", "dummy", "index.ts"), "export const x = 1;\n", "utf8");
  // Init git repo
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });
  return root;
}

async function stageFile(root: string, relPath: string, content: string): Promise<void> {
  const abs = join(root, relPath);
  await mkdir(join(root, relPath.split("/").slice(0, -1).join("/")), { recursive: true });
  await writeFile(abs, content, "utf8");
  await execFileAsync("git", ["add", relPath], { cwd: root });
}

async function writeRfc(root: string, rfcId: string, versionBump?: string): Promise<void> {
  const slug = rfcId.toLowerCase();
  const content = `---
id: ${rfcId}
title: "Test RFC"
status: accepted
versionBump: ${versionBump ?? "patch"}
---

# ${rfcId}
`;
  await writeFile(join(root, "docs", "rfcs", `${slug}-test.md`), content, "utf8");
}

describe("ecosystem.commit", () => {
  it("EC-01: blocks when no staged files match platform scope", async () => {
    const root = await setupWorkspace();
    try {
      // Stage a non-platform file
      await stageFile(root, "docs/readme.md", "# readme\n");
      const result = await runEcosystemCommit(input({ message: "test" }), ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.status).toBe("blocked");
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-01");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-02: blocks when package.json is already staged", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      // Modify and stage package.json
      await writeJson(join(root, "package.json"), {
        name: "test-platform",
        version: "1.0.0",
        custom: true,
      });
      await execFileAsync("git", ["add", "package.json"], { cwd: root });
      const result = await runEcosystemCommit(input({ message: "test" }), ctx(root));
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-02");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-04: blocks when RFC not found", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test", rfc: "RFC-9999" }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-04");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-05: blocks when versionBump absent in RFC", async () => {
    const root = await setupWorkspace();
    try {
      // Write an RFC without versionBump
      const content = `---
id: RFC-9001
title: "No versionBump"
status: accepted
---

# RFC-9001
`;
      await writeFile(join(root, "docs", "rfcs", "rfc-9001-test.md"), content, "utf8");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test", rfc: "RFC-9001" }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-05");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-06: blocks when versionBump is none", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9002", "none");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test", rfc: "RFC-9002" }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-06");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("default patch bump without --rfc", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.bumpType).toBe("patch");
      expect(result.data?.previousVersion).toBe("1.0.0");
      expect(result.data?.newVersion).toBe("1.0.1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--rfc reads versionBump from frontmatter", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9003", "minor");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", rfc: "RFC-9003", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.bumpType).toBe("minor");
      expect(result.data?.newVersion).toBe("1.1.0");
      expect(result.data?.rfcId).toBe("RFC-9003");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--dry-run returns forecast without committing", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.commitSha).toBeNull();
      // Verify no commit was made
      const { stdout } = await execFileAsync("git", ["log", "--oneline"], { cwd: root });
      expect(stdout.trim().split("\n").length).toBe(1); // only initial commit
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("actual commit bumps version and writes trailers", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(input({ message: "feat: add y" }), ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("ok");
      expect(result.data?.newVersion).toBe("1.0.1");
      expect(result.data?.commitSha).toBeTruthy();
      // Verify commit message has trailers
      const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%B"], { cwd: root });
      expect(stdout).toContain("X-Platform-Bump: patch");
      expect(stdout).toContain("X-Platform-Version: 1.0.1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
