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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { createMaterializeWorkspace, gitHead } from "./helpers/materialize-fixture.ts";
import { expectData } from "./helpers/kernel-result-helpers.ts";

const mockPipeline = vi.hoisted(() => ({
  pipelineResult: {
    ok: true,
    steps: [{ ok: true, commandName: "config.regenerate", exitCode: 0 }],
  },
  pipelineNameUsed: "" as string,
}));

vi.mock("@warpgogol/werkstatt/kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@warpgogol/werkstatt/kernel")>();
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

vi.mock("@warpgogol/werkstatt-site/codegen", () => ({
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

vi.mock("@warpgogol/werkstatt-site/onboarding", () => ({
  applyTokens: vi.fn((s: string) => s),
  readTemplate: vi.fn(() => ""),
  readRuntimeTemplate: vi.fn(() => ""),
}));

vi.mock("@warpgogol/werkstatt-site/checks", () => ({
  runEnvExampleGenerate: vi.fn(async () => []),
  MISSION_PREFLIGHT_CRITICAL: [],
  MISSION_PREFLIGHT_WARNING: [],
  GENERATOR_OWNERSHIP_MAP: [],
}));

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
  return createMaterializeWorkspace(tmpWorkspace);
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
    logger: { info: () => {}, warn: () => {}, error: () => {}, success: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(expectData(result).preflightSkipped).toBe(true);
  expect(expectData(result).preflightSkipReason).toBe("cache-clone-head-unchanged");
  expect(expectData(result).pipelineUsed).toBe("build.prepare.dev");
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
    logger: { info: () => {}, warn: () => {}, error: () => {}, success: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(expectData(result).preflightSkipped).toBe(false);
  expect(expectData(result).preflightSkipReason).toBe(null);
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
    logger: { info: () => {}, warn: () => {}, error: () => {}, success: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(expectData(result).preflightSkipped).toBe(false);
  expect(expectData(result).preflightSkipReason).toBe(null);
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
    logger: { info: () => {}, warn: () => {}, error: () => {}, success: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(expectData(result).preflightSkipped).toBe(false);
  expect(expectData(result).preflightSkipReason).toBe(null);
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
    logger: { info: () => {}, warn: () => {}, error: () => {}, success: () => {} },
  } as unknown as KernelRuntimeContext;

  const result = await runMissionMaterialize(input, context);

  expect(expectData(result).preflightSkipped).toBe(true);
  expect(expectData(result).preflightSkipReason).toBe("operator-override");
});
