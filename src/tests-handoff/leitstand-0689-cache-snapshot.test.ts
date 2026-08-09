/*
<MODULE_CONTRACT>
  <purpose>RFC-0689: tests for Axiom cache clearing and behavior snapshot auto-regeneration in leitstand.dev-deploy.</purpose>
  <keywords>RFC-0689, leitstand, dev-deploy, axiom-cache, behavior-snapshot, SNAP-01, auto-regeneration, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0689: add tests for cache clearing before mission.check, SNAP-01 auto-regeneration on build failure, non-SNAP-01 build failure, build-skip stale snapshot, and missing cache directory.</item>
  <item>RFC-0697: add test for cache size logging before clearing; verify orchestrateSnap01Recovery is used via behavior.snapshot.generate calls.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runLeitstandDevDeploy } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/site-kernel";

const { mockExecSync, mockExecuteKernelCommand } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockExecuteKernelCommand: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "3.99.0", ""),
  execSync: mockExecSync,
}));

vi.mock("@warpgogol/site-kernel", async (importOriginal) => {
  const original = await importOriginal<typeof import("@warpgogol/site-kernel")>();
  return {
    ...original,
    executeKernelCommand: mockExecuteKernelCommand,
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

function createRegistryWithDevChannel(
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

function createWorkpieceWithDist(workspaceRoot: string, missionId: string): string {
  const workpieceDir = join(workspaceRoot, "missions", missionId, "workpiece");
  mkdirSync(workpieceDir, { recursive: true });
  const distDir = join(workpieceDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Workpiece</body></html>");
  writeFileSync(
    join(workpieceDir, "package.json"),
    JSON.stringify({ name: "workpiece", version: "1.0.0" }) + "\n",
  );
  return workpieceDir;
}

function createAxiomCacheDir(workspaceRoot: string, missionId: string): string {
  const cacheDir = join(workspaceRoot, "missions", missionId, "evidence", "axiom", ".cache");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "capture-1.json"), "{}");
  return cacheDir;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-leitstand-0689-"));
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  mockExecSync.mockReset();
  mockExecuteKernelCommand.mockReset();
  // Default: git rev-parse HEAD
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === "git rev-parse HEAD") return "abc123def456\n";
    return "";
  });
  // Default: mission.check passes
  mockExecuteKernelCommand.mockResolvedValue({
    ok: true,
    exitCode: 0,
    data: { findings: { errors: 0, warnings: 0 } },
    summary: "mission.check: pass",
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// --- Test 1: Cache clearing ---

test("RFC-0689: clears Axiom browser evidence cache before mission.check", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(tmpDir, systemId, missionId);
  createWorkpieceWithDist(tmpDir, missionId);
  const cacheDir = createAxiomCacheDir(tmpDir, missionId);

  // Verify cache exists before deploy
  expect(existsSync(cacheDir)).toBe(true);

  await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));

  // Cache directory should be cleared (removed) by the deploy
  expect(existsSync(cacheDir)).toBe(false);
}, 15_000);

// --- Test 2: SNAP-01 auto-regeneration on build failure ---

test("RFC-0689: auto-regenerates snapshot and re-runs build when SNAP-01 detected on build failure", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(tmpDir, systemId, missionId);
  createWorkpieceWithDist(tmpDir, missionId);

  let buildCallCount = 0;
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === "git rev-parse HEAD") return "abc123def456\n";
    if (cmd === "pnpm build") {
      buildCallCount++;
      if (buildCallCount === 1) {
        throw new Error("build failed: SNAP-01 in behavior.snapshot.validate");
      }
      return "";
    }
    return "";
  });

  // behavior.snapshot.validate returns SNAP-01 diagnostics
  mockExecuteKernelCommand.mockImplementation(async (opts: { commandName: string }) => {
    if (opts.commandName === "behavior.snapshot.validate") {
      return {
        ok: false,
        exitCode: 1,
        data: { diagnostics: [{ ruleId: "SNAP-01" }] },
        summary: "behavior.snapshot.validate: SNAP-01 detected",
      };
    }
    if (opts.commandName === "behavior.snapshot.generate") {
      return { ok: true, exitCode: 0, data: {}, summary: "snapshot generated" };
    }
    if (opts.commandName === "mission.git.commit") {
      return { ok: true, exitCode: 0, data: {}, summary: "committed" };
    }
    // mission.check
    return {
      ok: true,
      exitCode: 0,
      data: { findings: { errors: 0, warnings: 0 } },
      summary: "mission.check: pass",
    };
  });

  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));
  const data = result.data as Record<string, unknown> | undefined;

  // Build should have been called twice (first fail, second succeed)
  expect(buildCallCount).toBe(2);
  // behavior.snapshot.generate should have been called
  expect(
    mockExecuteKernelCommand.mock.calls.some(
      (c) => c[0]?.commandName === "behavior.snapshot.generate",
    ),
  ).toBe(true);
  // Build state should be succeeded
  expect(data?.buildState).toBe("succeeded");
}, 15_000);

// --- Test 3: Non-SNAP-01 build failure ---

test("RFC-0689: does not regenerate snapshot when build fails for non-SNAP-01 reasons", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(tmpDir, systemId, missionId);
  createWorkpieceWithDist(tmpDir, missionId);

  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === "git rev-parse HEAD") return "abc123def456\n";
    if (cmd === "pnpm build") {
      throw new Error("build failed: syntax error in component.astro");
    }
    return "";
  });

  // behavior.snapshot.validate returns no SNAP-01
  mockExecuteKernelCommand.mockImplementation(async (opts: { commandName: string }) => {
    if (opts.commandName === "behavior.snapshot.validate") {
      return {
        ok: true,
        exitCode: 0,
        data: { diagnostics: [] },
        summary: "behavior.snapshot.validate: pass",
      };
    }
    return {
      ok: true,
      exitCode: 0,
      data: { findings: { errors: 0, warnings: 0 } },
      summary: "ok",
    };
  });

  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));
  const data = result.data as Record<string, unknown> | undefined;

  // Build state should be failed
  expect(data?.buildState).toBe("failed");
  // behavior.snapshot.generate should NOT have been called
  expect(
    mockExecuteKernelCommand.mock.calls.some(
      (c) => c[0]?.commandName === "behavior.snapshot.generate",
    ),
  ).toBe(false);
}, 15_000);

// --- Test 4: Build-skip stale snapshot ---

test("RFC-0689: checks stale snapshot and regenerates when build is skipped (RFC-0653)", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(tmpDir, systemId, missionId);
  createWorkpieceWithDist(tmpDir, missionId);

  // First run — writes build-skip cache with real platformSemanticHash
  await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));

  // Reset mocks for second run
  mockExecSync.mockClear();
  mockExecuteKernelCommand.mockClear();
  mockExecSync.mockImplementation((cmd: string) => {
    if (cmd === "git rev-parse HEAD") return "abc123def456\n";
    return "";
  });

  // Second run — build should be skipped, but behavior.snapshot.validate detects SNAP-01
  let generateCalled = false;
  mockExecuteKernelCommand.mockImplementation(async (opts: { commandName: string }) => {
    if (opts.commandName === "behavior.snapshot.validate") {
      return {
        ok: false,
        exitCode: 1,
        data: { diagnostics: [{ ruleId: "SNAP-01" }] },
        summary: "SNAP-01 detected",
      };
    }
    if (opts.commandName === "behavior.snapshot.generate") {
      generateCalled = true;
      return { ok: true, exitCode: 0, data: {}, summary: "generated" };
    }
    if (opts.commandName === "mission.git.commit") {
      return { ok: true, exitCode: 0, data: {}, summary: "committed" };
    }
    return {
      ok: true,
      exitCode: 0,
      data: { findings: { errors: 0, warnings: 0 } },
      summary: "ok",
    };
  });

  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));
  const data = result.data as Record<string, unknown> | undefined;

  // Build should have been skipped
  expect(data?.buildSkipped).toBe(true);
  // behavior.snapshot.generate should have been called during build-skip
  expect(generateCalled).toBe(true);
  // pnpm build should NOT have been called (build was skipped)
  expect(mockExecSync.mock.calls.some((c) => c[0] === "pnpm build")).toBe(false);
}, 30_000);

// --- Test 5: Cache directory does not exist ---

test("RFC-0689: does not error when Axiom cache directory does not exist", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(tmpDir, systemId, missionId);
  createWorkpieceWithDist(tmpDir, missionId);

  // Do NOT create the cache directory — verify no error
  const cacheDir = join(tmpDir, "missions", missionId, "evidence", "axiom", ".cache");
  expect(existsSync(cacheDir)).toBe(false);

  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));
  const data = result.data as Record<string, unknown> | undefined;

  // Deploy should succeed — no error from missing cache
  expect(data?.deployState).toBe("succeeded");
  expect(data?.buildState).toBe("succeeded");
}, 15_000);

// --- Test 6: Cache size logging before clearing (RFC-0697) ---

test("RFC-0697: logs cache file count and total size before clearing", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(tmpDir, systemId, missionId);
  createWorkpieceWithDist(tmpDir, missionId);

  const cacheDir = join(tmpDir, "missions", missionId, "evidence", "axiom", ".cache");
  mkdirSync(cacheDir, { recursive: true });
  // Create cache files of known sizes
  writeFileSync(join(cacheDir, "capture-1.json"), '{"id":1}');
  writeFileSync(join(cacheDir, "capture-2.json"), '{"id":2,"data":"extra"}');
  writeFileSync(join(cacheDir, "capture-3.json"), '{"id":3}');

  const infoMessages: string[] = [];
  const context = makeContext(tmpDir);
  context.logger.info = (msg: string) => {
    infoMessages.push(msg);
  };

  await runLeitstandDevDeploy(makeInput({ site: systemId }), context);

  // Verify cache size was logged before clearing
  const cacheSizeLog = infoMessages.find((m) => m.includes("Axiom cache:"));
  expect(cacheSizeLog).toBeDefined();
  expect(cacheSizeLog).toContain("3 file(s)");
  expect(cacheSizeLog).toContain("MiB");
  // Verify the clearing message still appears
  expect(infoMessages.some((m) => m.includes("Cleared Axiom browser evidence cache"))).toBe(true);
}, 15_000);
