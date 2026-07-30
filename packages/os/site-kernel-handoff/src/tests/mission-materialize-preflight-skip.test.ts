/*
<MODULE_CONTRACT>
<purpose>RFC-0597: unit tests for materialization state file preflight skip logic in mission.materialize.</purpose>
<keywords>RFC-0597, mission.materialize, preflight, skip, state file, cache clone HEAD</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0597: initial tests for state-file-based preflight skip and --skip-preflight flag precedence.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

const mockPipeline = vi.hoisted(() => ({
  pipelineResult: {
    ok: true,
    steps: [{ ok: true, commandName: "config.regenerate", exitCode: 0 }],
  },
  pipelineNameUsed: "" as string,
}));

vi.mock("@warpgogol/site-kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@warpgogol/site-kernel")>();
  return {
    ...actual,
    executeKernelPipeline: vi.fn(async (opts: { pipelineName: string }) => {
      mockPipeline.pipelineNameUsed = opts.pipelineName;
      return [mockPipeline.pipelineResult];
    }),
    executeKernelCommand: vi.fn(async () => [{ ok: true, exitCode: 0, summary: "" }]),
    runKernelWire: vi.fn(async () => ({ data: { generated: [] } })),
  };
});

vi.mock("@warpgogol/site-kernel-codegen", () => ({
  runGenerateAgentsDocs: vi.fn(async () => []),
  runGenerateApiRoutes: vi.fn(async () => []),
  runGenerateGlobalStyles: vi.fn(async () => []),
  runGenerateI18nMiddleware: vi.fn(async () => []),
  runGenerateOverlayPages: vi.fn(async () => []),
  runGeneratePublicInfrastructure: vi.fn(async () => []),
  runGenerateRoutes: vi.fn(async () => []),
  runGenerateScriptsOrchestrator: vi.fn(async () => []),
  runFontsImportsGenerate: vi.fn(async () => []),
  runBiomeCssGenerate: vi.fn(async () => []),
}));

vi.mock("@warpgogol/site-kernel-onboarding", () => ({
  applyTokens: vi.fn((s: string) => s),
  readTemplate: vi.fn(() => ""),
  readRuntimeTemplate: vi.fn(() => ""),
}));

vi.mock("@warpgogol/site-kernel-checks", () => ({
  runEnvExampleGenerate: vi.fn(async () => []),
  MISSION_PREFLIGHT_CRITICAL: [],
  MISSION_PREFLIGHT_WARNING: [],
}));

function gitInit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
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
  tmpWorkspace = mkdtempSync(join(process.cwd(), "tmp-mat-preflight-skip-"));
  mockPipeline.pipelineResult = {
    ok: true,
    steps: [{ ok: true, commandName: "config.regenerate", exitCode: 0 }],
  };
  mockPipeline.pipelineNameUsed = "";
});

afterEach(() => {
  rmSync(tmpWorkspace, { recursive: true, force: true });
});

function setupWorkspace(): string {
  gitInit(tmpWorkspace);
  writeFileSync(join(tmpWorkspace, "README.md"), "# test\n");
  writeFileSync(join(tmpWorkspace, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  writeFileSync(join(tmpWorkspace, "pnpm-workspace.yaml"), "packages: []\n");
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
  mkdirSync(join(systemDir, "src", "content"), { recursive: true });
  writeFileSync(
    join(systemDir, "src", "content", "system.md"),
    "---\n  domain: test\n  i18n:\n    default: de\n    languages:\n      - de\n---\n",
  );
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
    materializedAt: null,
    migratedAt: null,
    reconciledAt: null,
    releaseId: null,
    rfcId: null,
    operationId: "op-001",
  };
  writeFileSync(join(missionDir, "mission.yaml"), JSON.stringify(manifest, null, 2) + "\n");

  gitCommit(tmpWorkspace, "add mission");
  return systemDir;
}

test("preflight is skipped when state file HEAD matches cache clone HEAD", async () => {
  const systemDir = setupWorkspace();
  const head = gitHead(systemDir);

  // Write state file with matching HEAD
  writeFileSync(
    join(systemDir, ".materialization-state.json"),
    JSON.stringify(
      {
        systemId: "test-system",
        cacheCloneHead: head,
        lastValidatedAt: "2026-07-29T00:00:00Z",
        lastMissionId: "test-system-m000000",
      },
      null,
      2,
    ) + "\n",
  );

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(result.data!.preflightSkipped).toBe(true);
  expect(result.data!.preflightSkipReason).toBe("cache-clone-head-unchanged");
  expect(result.data!.pipelineUsed).toBe("build.prepare.dev");
  expect(mockPipeline.pipelineNameUsed).toBe("build.prepare.dev");
});

test("preflight runs normally when state file is missing", async () => {
  setupWorkspace();

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(result.data!.preflightSkipped).toBe(false);
  expect(result.data!.preflightSkipReason).toBe(null);
});

test("preflight runs normally when state file HEAD does not match", async () => {
  const systemDir = setupWorkspace();

  // Write state file with non-matching HEAD
  writeFileSync(
    join(systemDir, ".materialization-state.json"),
    JSON.stringify(
      {
        systemId: "test-system",
        cacheCloneHead: "0".repeat(40),
        lastValidatedAt: "2026-07-29T00:00:00Z",
        lastMissionId: "test-system-m000000",
      },
      null,
      2,
    ) + "\n",
  );

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(result.data!.preflightSkipped).toBe(false);
  expect(result.data!.preflightSkipReason).toBe(null);
});

test("preflight runs normally when state file is corrupt", async () => {
  const systemDir = setupWorkspace();

  // Write corrupt state file
  writeFileSync(join(systemDir, ".materialization-state.json"), "{ invalid json }}}");

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(result.data!.preflightSkipped).toBe(false);
  expect(result.data!.preflightSkipReason).toBe(null);
});

test("--skip-preflight flag takes precedence over state file and does not consult it", async () => {
  const systemDir = setupWorkspace();
  const head = gitHead(systemDir);

  // Write state file with matching HEAD
  writeFileSync(
    join(systemDir, ".materialization-state.json"),
    JSON.stringify(
      {
        systemId: "test-system",
        cacheCloneHead: head,
        lastValidatedAt: "2026-07-29T00:00:00Z",
        lastMissionId: "test-system-m000000",
      },
      null,
      2,
    ) + "\n",
  );

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001", "skip-preflight": true },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(result.data!.preflightSkipped).toBe(true);
  expect(result.data!.preflightSkipReason).toBe("operator-override");
});
