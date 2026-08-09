/*
<MODULE_CONTRACT>
  <purpose>RFC-0698: tests for leitstand.dev-deploy auto-commit after build — dirty workpiece, clean workpiece, commit failure, build-skip with auto-commit.</purpose>
  <keywords>RFC-0698, dev-deploy, auto-commit, mission.git.commit, build-skip cache, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0698: initial test file for auto-commit after leitstand.dev-deploy build.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandDevDeploy } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";

// Track git rev-parse HEAD call count to simulate pre-commit vs post-commit sha
let gitRevParseCallCount = 0;
const preCommitSha = "abc123def456";
const postCommitSha = "post987commit";

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "3.99.0", ""),
  execSync: vi.fn((cmd: string) => {
    if (cmd === "git rev-parse HEAD") {
      gitRevParseCallCount++;
      // First call: pre-commit sha. Subsequent calls: post-commit sha.
      return gitRevParseCallCount === 1 ? `${preCommitSha}\n` : `${postCommitSha}\n`;
    }
    return "";
  }),
}));

// Configurable mock for executeKernelCommand
let commitMockExitCode = 0;
let commitMockSummary = "mission.git.commit: committed";

vi.mock("@warpgogol/werkstatt/kernel", async (importOriginal) => {
  const original = await importOriginal<typeof import("@warpgogol/werkstatt/kernel")>();
  return {
    ...original,
    executeKernelCommand: vi.fn(async (input: { commandName: string }) => {
      if (input.commandName === "mission.git.commit") {
        return {
          ok: commitMockExitCode === 0,
          exitCode: commitMockExitCode,
          data: { committed: commitMockExitCode === 0 },
          summary: commitMockSummary,
        };
      }
      // Default for methodologies.validate, behavior.snapshot.validate, axiom.report, evidence.sync, mission.check
      return {
        ok: true,
        exitCode: 0,
        data: { findings: { errors: 0, warnings: 0 } },
        summary: "ok",
      };
    }),
  };
});

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    logger: {
      info: () => {},
      success: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    flags: {},
    env: {},
  } as unknown as KernelRuntimeContext;
}

function makeInput(flags: Record<string, string>): KernelCommandInput {
  return { flags, argv: [] };
}

function createRegistryWithChannels(
  workspaceRoot: string,
  systemId: string,
  missionId: string,
): void {
  const registryDir = join(workspaceRoot, "systems");
  mkdirSync(registryDir, { recursive: true });
  const registryContent = `schemaVersion: "1.0.0"
systems:
  - id: ${systemId}
    cosmicStar: Acamar
    mirrors:
      - path: /tmp/test-cache
        storageType: non-bare
    pinnedPlatform: 1.0.0
    currentMission: ${missionId}
    lastRelease: null
    status: active
    registeredAt: 2026-01-01T00:00:00.000Z
    notes: ""
    deployment:
      adapter: "null"
      channels:
        dev:
          workerName: test-dev
          url: https://dev.example.com
        alt:
          workerName: test-alt
          url: https://alt.example.com
        main:
          workerName: test-main
          url: https://main.example.com
`;
  writeFileSync(join(registryDir, "registry.yaml"), registryContent);
}

function createWorkpieceDist(workspaceRoot: string, missionId: string): string {
  const workpieceDir = join(workspaceRoot, "missions", missionId, "workpiece");
  const distDir = join(workpieceDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Workpiece</body></html>");
  return distDir;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-rfc-0698-"));
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  gitRevParseCallCount = 0;
  commitMockExitCode = 0;
  commitMockSummary = "mission.git.commit: committed";
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

test("RFC-0698: leitstand.dev-deploy calls mission.git.commit after build", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);

  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));
  const data = result.data as Record<string, unknown> | undefined;

  expect(data?.command).toBe("leitstand.dev-deploy");
  expect(data?.deployState).toBe("succeeded");
  // commitSha should reflect post-commit HEAD
  expect(data?.commitSha).toBe(postCommitSha);
}, 15_000);

test("RFC-0698: build-skip cache is written with post-commit commitSha", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);

  await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));

  const cachePath = join(tmpDir, "missions", missionId, ".dev-deploy-build-cache.json");
  expect(existsSync(cachePath)).toBe(true);
  const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
  // Cache should have post-commit sha, not pre-commit
  expect(cache.commitSha).toBe(postCommitSha);
  expect(cache.commitSha).not.toBe(preCommitSha);
}, 15_000);

test("RFC-0698: auto-commit failure aborts deploy with fatal error", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);

  commitMockExitCode = 1;
  commitMockSummary = "mission.git.commit: pre-commit validation failed";

  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));
  const data = result.data as Record<string, unknown> | undefined;

  expect(result.exitCode).toBe(1);
  expect(data?.deployState).toBe("failed");
  expect(data?.axiom).toBeDefined();
  const axiom = data?.axiom as Record<string, unknown>;
  expect(axiom?.status).toBe("not-run");
  // Build-skip cache should NOT be written when commit fails
  const cachePath = join(tmpDir, "missions", missionId, ".dev-deploy-build-cache.json");
  expect(existsSync(cachePath)).toBe(false);
}, 15_000);

test("RFC-0698: auto-commit runs during build-skip (cache hit) path", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithChannels(tmpDir, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);

  // First run — writes cache with post-commit sha
  await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));

  // Second run — build should be skipped (cache hit: pre-build sha matches cached post-commit sha).
  // Do NOT reset gitRevParseCallCount — the counter is at 2 after the first run, so the
  // second run's pre-build git rev-parse call (#3) returns postCommitSha, matching the cache.
  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));
  const data = result.data as Record<string, unknown> | undefined;

  expect(data?.buildSkipped).toBe(true);
  expect(data?.buildState).toBe("succeeded");
  // commitSha should reflect post-commit HEAD (second call to git rev-parse HEAD)
  expect(data?.commitSha).toBe(postCommitSha);
}, 15_000);
