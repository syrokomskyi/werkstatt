/*
<MODULE_CONTRACT>
<purpose>RFC-0593: unit test verifying mission.validate inline gate in mission.close and state re-check inside locks.</purpose>
<keywords>RFC-0593, mission.close, validation, gate, lock, re-check</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0593: initial test for mission.validate inline gate in mission.close.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

function gitInit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
}

function gitCommit(dir: string, msg: string): void {
  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: dir, stdio: "pipe" });
}

let tmpWorkspace: string;

beforeEach(() => {
  tmpWorkspace = mkdtempSync(join(process.cwd(), "tmp-close-validate-gate-"));
});

afterEach(() => {
  rmSync(tmpWorkspace, { recursive: true, force: true });
});

function setupWorkspace(): void {
  gitInit(tmpWorkspace);
  writeFileSync(join(tmpWorkspace, "README.md"), "# test\n");
  gitCommit(tmpWorkspace, "initial");

  mkdirSync(join(tmpWorkspace, "systems"), { recursive: true });
  const registryContent = `schemaVersion: "1.0.0"
systems:
  - id: test-system
    cosmicStar: Vega
    mirrors:
      - path: "./systems/test-system"
        storageType: non-bare
    pinnedPlatform: "4.5.0"
    currentMission: test-system-m000001
    lastRelease: null
    status: active
    registeredAt: "2026-01-01T00:00:00Z"
    notes: ""
`;
  writeFileSync(join(tmpWorkspace, "systems", "registry.yaml"), registryContent);
  gitCommit(tmpWorkspace, "add registry");

  mkdirSync(join(tmpWorkspace, "systems", "test-system"), { recursive: true });
  writeFileSync(
    join(tmpWorkspace, "systems", "test-system", "system.pin.json"),
    JSON.stringify({ platform: { version: "1.0.0" } }, null, 2) + "\n",
  );

  mkdirSync(join(tmpWorkspace, "systems", "test-system", "bordbuch"), { recursive: true });
  gitCommit(tmpWorkspace, "add system");

  // Create mission directory with manifest in reconciled state
  const missionDir = join(tmpWorkspace, "missions", "test-system-m000001");
  mkdirSync(missionDir, { recursive: true });
  mkdirSync(join(missionDir, "workpiece"), { recursive: true });
  mkdirSync(join(missionDir, "evidence"), { recursive: true });

  const manifest = {
    schemaVersion: "1.0.0",
    missionId: "test-system-m000001",
    systemId: "test-system",
    state: "open",
    brief: "Test mission",
    openedAt: "2026-07-30T00:00:00.000Z",
    openedBy: "test-agent",
    closedAt: null,
    closedBy: null,
    pinAtOpen: "1.0.0",
    materializedAt: "2026-07-30T01:00:00.000Z",
    migratedAt: null,
    reconciledAt: "2026-07-30T02:00:00.000Z",
    releaseId: null,
    rfcId: null,
    operationId: "op-001",
  };
  writeFileSync(join(missionDir, "mission.yaml"), JSON.stringify(manifest, null, 2) + "\n");

  gitCommit(tmpWorkspace, "add mission");
}

test("mission.close refuses when validation fails", async () => {
  setupWorkspace();

  // Mock runMissionValidate to return failure
  const mockRunMissionValidate = vi.fn().mockResolvedValue({
    data: {
      missionId: "test-system-m000001",
      contractFull: {
        passed: false,
        validators: [
          { name: "semantic.targets.validate", status: "fail", exitCode: 1 },
        ],
      },
      build: { succeeded: false, routeCount: 0, sitemapHash: "", error: "build failed" },
    },
    exitCode: 1,
    summary: "Validation failed",
  });

  vi.doMock("../mission/mission-materialization-commands.ts", () => ({
    runMissionValidate: mockRunMissionValidate,
    runMissionMaterialize: vi.fn(),
    runMissionMigrate: vi.fn(),
    runMissionReconcile: vi.fn(),
  }));

  const { runMissionClose } = await import("../mission/mission-close.ts");

  const input = {
    flags: { mission: "test-system-m000001", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = { workspaceRoot: tmpWorkspace } as unknown as KernelRuntimeContext;

  await expect(runMissionClose(input, context)).rejects.toThrow(
    /validation failed for mission 'test-system-m000001'/,
  );

  // Verify mission remains open
  const manifestRaw = await import("node:fs/promises").then((fs) =>
    fs.readFile(join(tmpWorkspace, "missions", "test-system-m000001", "mission.yaml"), "utf8"),
  );
  const manifest = JSON.parse(manifestRaw);
  expect(manifest.state).toBe("open");

  vi.doUnmock("../mission/mission-materialization-commands.ts");
});

test("mission.close refuses when state changed during validation (re-check inside lock)", async () => {
  setupWorkspace();

  // Mock runMissionValidate to pass, but simulate state change during validation
  const { readMissionManifest } = await import("../mission/mission-io.ts");
  const { writeMissionManifest } = await import("../mission/mission-io.ts");

  const mockRunMissionValidate = vi.fn().mockImplementation(async () => {
    // Simulate another process aborting the mission during validation
    const manifest = await readMissionManifest(tmpWorkspace, "test-system-m000001");
    manifest.state = "aborted";
    await writeMissionManifest(tmpWorkspace, manifest);
    return {
      data: {
        missionId: "test-system-m000001",
        contractFull: { passed: true, validators: [] },
        build: { succeeded: true, routeCount: 5, sitemapHash: "abc" },
      },
      exitCode: 0,
      summary: "Validation passed",
    };
  });

  vi.doMock("../mission/mission-materialization-commands.ts", () => ({
    runMissionValidate: mockRunMissionValidate,
    runMissionMaterialize: vi.fn(),
    runMissionMigrate: vi.fn(),
    runMissionReconcile: vi.fn(),
  }));

  const { runMissionClose } = await import("../mission/mission-close.ts");

  const input = {
    flags: { mission: "test-system-m000001", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = { workspaceRoot: tmpWorkspace } as unknown as KernelRuntimeContext;

  await expect(runMissionClose(input, context)).rejects.toThrow(
    /state changed to 'aborted' during validation/,
  );

  vi.doUnmock("../mission/mission-materialization-commands.ts");
});
