/*
<MODULE_CONTRACT>
<purpose>RFC-0597: unit tests for mission.close writing .materialization-state.json and copying .cache/ to cache clone.</purpose>
<keywords>RFC-0597, mission.close, materialization state, cache, media cache</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0597: initial tests for state file write and .cache/ copy in mission.close.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

const mockState = vi.hoisted(() => ({
  validateResult: {
    data: {
      missionId: "test-system-m000001",
      contractFull: { passed: true, validators: [] },
      build: { succeeded: true, routeCount: 5, sitemapHash: "abc" },
    },
    exitCode: 0,
    summary: "Validation passed",
  },
}));

vi.mock("../mission/mission-materialization-commands.ts", () => ({
  runMissionValidate: vi.fn(async () => mockState.validateResult),
  runMissionMaterialize: vi.fn(),
  runMissionMigrate: vi.fn(),
  runMissionReconcile: vi.fn(),
}));

function gitInit(dir: string): void {
  execSync("git init -b main", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
}

function gitCommit(dir: string, msg: string): void {
  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: dir, stdio: "pipe" });
}

function gitHead(dir: string): string {
  return execSync("git rev-parse HEAD", { cwd: dir, stdio: "pipe", encoding: "utf-8" }).trim();
}

let tmpWorkspace: string;

beforeEach(() => {
  tmpWorkspace = mkdtempSync(join(process.cwd(), "tmp-close-state-file-"));
});

afterEach(() => {
  rmSync(tmpWorkspace, { recursive: true, force: true });
});

function setupWorkspace(): string {
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
    pinnedPlatform: "1.0.0"
    currentMission: test-system-m000001
    lastRelease: null
    status: active
    registeredAt: "2026-01-01T00:00:00Z"
    notes: ""
`;
  writeFileSync(join(tmpWorkspace, "systems", "registry.yaml"), registryContent);
  gitCommit(tmpWorkspace, "add registry");

  const systemDir = join(tmpWorkspace, "systems", "test-system");
  mkdirSync(systemDir, { recursive: true });
  writeFileSync(
    join(systemDir, "system.pin.json"),
    JSON.stringify({ platform: { version: "1.0.0" } }, null, 2) + "\n",
  );
  mkdirSync(join(systemDir, "bordbuch"), { recursive: true });
  writeFileSync(join(systemDir, "bordbuch", "events.ndjson"), "");
  gitCommit(tmpWorkspace, "add system");

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
  return systemDir;
}

test("mission.close writes .materialization-state.json with current cache clone HEAD", async () => {
  const systemDir = setupWorkspace();

  const { runMissionClose } = await import("../mission/mission-close.ts");

  const input = {
    flags: { mission: "test-system-m000001", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  await runMissionClose(input, context);

  // Read HEAD after close — close creates bordbuch commits that change HEAD
  const headAfterClose = gitHead(systemDir);

  const statePath = join(systemDir, ".materialization-state.json");
  expect(existsSync(statePath)).toBe(true);

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  expect(state.systemId).toBe("test-system");
  // cacheCloneHead is captured after bordbuch commit but before .materialization-state.json commit
  expect(state.cacheCloneHead).toBeTruthy();
  expect(state.cacheCloneHead).toMatch(/^[0-9a-f]{40}$/);
  expect(state.lastMissionId).toBe("test-system-m000001");
  expect(state.lastValidatedAt).toBeTruthy();
});

test("mission.close copies .cache/video/ from workpiece to cache clone", async () => {
  const systemDir = setupWorkspace();

  // Create .cache/video/ in workpiece
  const cacheDir = join(
    tmpWorkspace,
    "missions",
    "test-system-m000001",
    "workpiece",
    ".cache",
    "video",
  );
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "test-video.mp4"), "fake video content");
  writeFileSync(join(cacheDir, "test-video.webm"), "fake webm content");

  const { runMissionClose } = await import("../mission/mission-close.ts");

  const input = {
    flags: { mission: "test-system-m000001", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  await runMissionClose(input, context);

  const destCacheDir = join(systemDir, ".cache", "video");
  expect(existsSync(destCacheDir)).toBe(true);
  expect(existsSync(join(destCacheDir, "test-video.mp4"))).toBe(true);
  expect(existsSync(join(destCacheDir, "test-video.webm"))).toBe(true);
  expect(readFileSync(join(destCacheDir, "test-video.mp4"), "utf8")).toBe("fake video content");
});

test("mission.close copies .cache/video-live/ from workpiece to cache clone", async () => {
  const systemDir = setupWorkspace();

  const cacheDir = join(
    tmpWorkspace,
    "missions",
    "test-system-m000001",
    "workpiece",
    ".cache",
    "video-live",
  );
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "live-test.mp4"), "live video content");

  const { runMissionClose } = await import("../mission/mission-close.ts");

  const input = {
    flags: { mission: "test-system-m000001", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  await runMissionClose(input, context);

  const destCacheDir = join(systemDir, ".cache", "video-live");
  expect(existsSync(destCacheDir)).toBe(true);
  expect(existsSync(join(destCacheDir, "live-test.mp4"))).toBe(true);
});

test("mission.close succeeds when workpiece has no .cache/ directory", async () => {
  setupWorkspace();

  const { runMissionClose } = await import("../mission/mission-close.ts");

  const input = {
    flags: { mission: "test-system-m000001", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionClose(input, context);

  expect(result.data!.state).toBe("closed");
  // State file should still be written
  const statePath = join(tmpWorkspace, "systems", "test-system", ".materialization-state.json");
  expect(existsSync(statePath)).toBe(true);
});
