/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0601: fixture coverage for generated.drift.validate — proves
    DRIFT-01 fires when committed content differs from generator output,
    DRIFT-02 is emitted when a generator lacks renderedFiles, and clean-pass
    when content matches.
  </purpose>
  <keywords>RFC-0601, generated.drift.validate, DRIFT-01, DRIFT-02, fixtures</keywords>
  <responsibilities>
    <item>Red: committed file differs from rendered -> DRIFT-01, exitCode 1.</item>
    <item>Green: committed file matches rendered -> no DRIFT-01, exitCode 0.</item>
    <item>Green: generator without renderedFiles -> DRIFT-02 info, exitCode 0.</item>
    <item>Green: binary files are skipped.</item>
    <item>Green: non-git-tracked files are skipped.</item>
  </responsibilities>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0601: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  KernelCommandInput,
  KernelRuntimeContext,
  KernelExecutionReport,
} from "@warpgogol/site-kernel";
import { createDefaultIO } from "@warpgogol/site-kernel";

const execFileAsync = promisify(execFile);

const mockState = vi.hoisted(() => ({
  renderedFiles: {} as Record<string, string> | undefined,
}));

vi.mock("@warpgogol/site-kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@warpgogol/site-kernel")>();
  return {
    ...actual,
    executeKernelCommand: vi.fn(
      async () =>
        ({
          commandName: "mock",
          data: { renderedFiles: mockState.renderedFiles },
          exitCode: 0,
          ok: true,
          metadata: {},
          logs: [],
          timing: { durationMs: 0, exceededTimeout: false },
        }) as unknown as KernelExecutionReport,
    ),
  };
});

const { runGeneratedDriftValidate } = await import("../generated-drift-validate.ts");

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

const input = { argv: [], args: [], flags: { site: "test-app" } } as unknown as KernelCommandInput;

function ctx(root: string, siteDir?: string): KernelRuntimeContext {
  const { io } = createDefaultIO();
  return {
    workspaceRoot: root,
    site: siteDir ? { name: "test-app", directory: siteDir } : undefined,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
    io,
  } as unknown as KernelRuntimeContext;
}

async function gitInit(dir: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: dir });
}

async function gitAddAndCommit(dir: string, message: string): Promise<void> {
  await execFileAsync("git", ["add", "."], { cwd: dir });
  await execFileAsync("git", ["commit", "-m", message], {
    cwd: dir,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00",
      GIT_COMMITTER_DATE: "2026-01-01T00:00:00",
    },
  });
}

beforeEach(() => {
  mockState.renderedFiles = {};
});

describe("generated.drift.validate (RFC-0601)", () => {
  it("red: reports DRIFT-01 when committed file differs from rendered output", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-drift-red-"));
    try {
      const appDir = join(root, "apps", "test-app");
      await mkdir(join(appDir, "public"), { recursive: true });
      const robotsPath = join(appDir, "public", "robots.txt");
      await writeFile(robotsPath, "User-agent: *\nDisallow: /edited\n", "utf8");

      await gitInit(root);
      await gitAddAndCommit(root, "init");

      mockState.renderedFiles = {
        "apps/test-app/public/robots.txt": "User-agent: *\nDisallow: /\n",
      };

      const result = await runGeneratedDriftValidate(input, ctx(root, appDir));
      expect(result.exitCode).toBe(1);
      const driftDiags = result.data?.diagnostics.filter((d) => d.ruleId === "DRIFT-01") ?? [];
      expect(driftDiags.length).toBeGreaterThanOrEqual(1);
      expect(driftDiags.some((d) => d.file === "apps/test-app/public/robots.txt")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: no DRIFT-01 when committed file matches rendered output", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-drift-green-"));
    try {
      const appDir = join(root, "apps", "test-app");
      await mkdir(join(appDir, "public"), { recursive: true });
      const robotsPath = join(appDir, "public", "robots.txt");
      const content = "User-agent: *\nDisallow: /\n";
      await writeFile(robotsPath, content, "utf8");

      await gitInit(root);
      await gitAddAndCommit(root, "init");

      mockState.renderedFiles = { "apps/test-app/public/robots.txt": content };

      const result = await runGeneratedDriftValidate(input, ctx(root, appDir));
      expect(result.exitCode).toBe(0);
      const driftDiags = result.data?.diagnostics.filter((d) => d.ruleId === "DRIFT-01") ?? [];
      expect(driftDiags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: DRIFT-02 info when generator lacks renderedFiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-drift-no-render-"));
    try {
      const appDir = join(root, "apps", "test-app");
      await mkdir(join(appDir, "public"), { recursive: true });
      const robotsPath = join(appDir, "public", "robots.txt");
      await writeFile(robotsPath, "User-agent: *\nDisallow: /\n", "utf8");

      await gitInit(root);
      await gitAddAndCommit(root, "init");

      mockState.renderedFiles = undefined;

      const result = await runGeneratedDriftValidate(input, ctx(root, appDir));
      const infoDiags = result.data?.diagnostics.filter((d) => d.ruleId === "DRIFT-02") ?? [];
      expect(infoDiags.length).toBeGreaterThanOrEqual(1);
      expect(infoDiags.every((d) => d.severity === "info")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: binary files are skipped", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-drift-binary-"));
    try {
      const appDir = join(root, "apps", "test-app");
      await mkdir(join(appDir, "public"), { recursive: true });
      const iconPath = join(appDir, "public", "favicon.ico");
      await writeFile(iconPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));

      await gitInit(root);
      await gitAddAndCommit(root, "init");

      mockState.renderedFiles = { "apps/test-app/public/favicon.ico": "different" };

      const result = await runGeneratedDriftValidate(input, ctx(root, appDir));
      const driftDiags = result.data?.diagnostics.filter((d) => d.ruleId === "DRIFT-01") ?? [];
      expect(driftDiags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: non-git-tracked files are skipped", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-drift-untracked-"));
    try {
      const appDir = join(root, "apps", "test-app");
      await mkdir(join(appDir, "public"), { recursive: true });
      const robotsPath = join(appDir, "public", "robots.txt");
      await writeFile(robotsPath, "untracked content", "utf8");

      await gitInit(root);
      // Do NOT add or commit — file is untracked

      mockState.renderedFiles = { "apps/test-app/public/robots.txt": "different" };

      const result = await runGeneratedDriftValidate(input, ctx(root, appDir));
      const driftDiags = result.data?.diagnostics.filter((d) => d.ruleId === "DRIFT-01") ?? [];
      expect(driftDiags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
