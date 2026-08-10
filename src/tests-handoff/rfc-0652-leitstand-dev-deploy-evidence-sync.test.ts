/*
<MODULE_CONTRACT>
  <purpose>RFC-0652: unit tests for leitstand.dev-deploy best-effort evidence.sync integration.</purpose>
  <keywords>RFC-0652, leitstand, dev-deploy, evidence.sync, best-effort, skip-evidence-sync</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0652: initial tests for best-effort evidence sync in leitstand.dev-deploy.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";
import { createLeitstandSystem } from "./helpers/leitstand-fixture.ts";

const mockState = vi.hoisted(() => ({
  syncCalled: false,
  syncShouldFail: false,
  syncCallCount: 0,
}));

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "3.99.0", ""),
  execSync: vi.fn((cmd: string) => {
    if (cmd === "git rev-parse HEAD") return "abc123def456\n";
    return "";
  }),
}));

vi.mock("@warpgogol/werkstatt/kernel", async (importOriginal) => {
  const original = await importOriginal<typeof import("@warpgogol/werkstatt/kernel")>();
  return {
    ...original,
    executeKernelCommand: vi.fn(
      async (opts: { workspaceRoot: string; commandName: string; argv?: string[] }) => {
        if (opts.commandName === "evidence.sync") {
          mockState.syncCalled = true;
          mockState.syncCallCount++;
          if (mockState.syncShouldFail) {
            throw new Error("R2_UPLOAD_ERROR: failed to upload");
          }
          return {
            ok: true,
            exitCode: 0,
            data: {
              missionId: "test-sys-m000001",
              systemId: "test-sys",
              r2KeyPrefix: "test-sys/test-sys-m000001/2026-08-02T00-00-00-000Z",
              uploadedFiles: ["evidence-metadata.json"],
            },
            summary: "[evidence.sync] uploaded 1 file to R2",
          };
        }
        return {
          ok: true,
          exitCode: 0,
          data: { findings: { errors: 0, warnings: 0 } },
          summary: "ok",
        };
      },
    ),
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

function makeInput(flags: Record<string, unknown>): KernelCommandInput {
  return { flags, argv: [] } as unknown as KernelCommandInput;
}

function createRegistryWithDevChannel(testRoot: string, systemId: string, missionId: string): void {
  createLeitstandSystem(testRoot, systemId, { currentMission: missionId });
}

function createWorkpieceDist(workspaceRoot: string, missionId: string): void {
  const workpieceDir = join(workspaceRoot, "missions", missionId, "workpiece");
  const distDir = join(workpieceDir, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<html><body>Workpiece</body></html>");
}

let testRoot: string;
let tmpDir: string;

beforeEach(() => {
  testRoot = mkdtempSync(join(process.cwd(), "tmp-leitstand-0652-"));
  tmpDir = join(testRoot, "workspace");
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  mockState.syncCalled = false;
  mockState.syncShouldFail = false;
  mockState.syncCallCount = 0;
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

test("leitstand.dev-deploy invokes evidence.sync after axiom.report", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(testRoot, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);

  const { runLeitstandDevDeploy } = await import("../leitstand/leitstand-commands.ts");
  await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));

  expect(mockState.syncCalled).toBe(true);
}, 15_000);

test("leitstand.dev-deploy does not fail when evidence.sync fails", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(testRoot, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);
  mockState.syncShouldFail = true;

  const { runLeitstandDevDeploy } = await import("../leitstand/leitstand-commands.ts");
  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));

  expect(mockState.syncCalled).toBe(true);
  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.evidenceSynced).toBe(false);
  expect(data?.evidenceSyncError).toBe("R2_UPLOAD_ERROR: failed to upload");
}, 15_000);

test("leitstand.dev-deploy --json includes evidenceSynced and evidenceSyncError fields", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(testRoot, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);

  const { runLeitstandDevDeploy } = await import("../leitstand/leitstand-commands.ts");
  const result = await runLeitstandDevDeploy(makeInput({ site: systemId }), makeContext(tmpDir));

  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.evidenceSynced).toBe(true);
  expect(data?.evidenceSyncError).toBe(null);
}, 15_000);

test("leitstand.dev-deploy --skip-evidence-sync skips sync silently", async () => {
  const systemId = "test-sys";
  const missionId = "test-sys-m000001";

  createRegistryWithDevChannel(testRoot, systemId, missionId);
  createWorkpieceDist(tmpDir, missionId);

  const { runLeitstandDevDeploy } = await import("../leitstand/leitstand-commands.ts");
  const result = await runLeitstandDevDeploy(
    makeInput({ site: systemId, "skip-evidence-sync": true }),
    makeContext(tmpDir),
  );

  expect(mockState.syncCalled).toBe(false);
  const data = result.data as Record<string, unknown> | undefined;
  expect(data?.evidenceSynced).toBe(false);
  expect(data?.evidenceSyncError).toBe(null);
}, 15_000);
