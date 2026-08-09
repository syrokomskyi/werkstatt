/*
<MODULE_CONTRACT>
<purpose>RFC-0619: regression test verifying force: true is passed to executeKernelPipeline during mission materialization, bypassing stale command-result cache from previous workpiece attempts.</purpose>
<keywords>RFC-0619, mission.materialize, force, cache bypass, regression</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0619: initial regression test — asserts force: true is passed to executeKernelPipeline.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { createMaterializeWorkspace } from "./helpers/materialize-fixture.ts";

const mockPipeline = vi.hoisted(() => ({
  forceUsed: undefined as boolean | undefined,
  pipelineNameUsed: "" as string,
}));

vi.mock("@warpgogol/werkstatt/kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@warpgogol/werkstatt/kernel")>();
  return {
    ...actual,
    executeKernelPipeline: vi.fn(async (opts: { pipelineName: string; force?: boolean }) => {
      mockPipeline.pipelineNameUsed = opts.pipelineName;
      mockPipeline.forceUsed = opts.force;
      return [
        {
          ok: true,
          steps: [{ ok: true, commandName: "config.regenerate", exitCode: 0 }],
        },
      ];
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
  tmpWorkspace = mkdtempSync(join(process.cwd(), "tmp-mat-force-bypass-"));
  mockPipeline.forceUsed = undefined;
  mockPipeline.pipelineNameUsed = "";
});

afterEach(() => {
  rmSync(tmpWorkspace, { recursive: true, force: true });
});

function setupWorkspace(): void {
  createMaterializeWorkspace(tmpWorkspace);
}

test("RFC-0619: force: true is passed to executeKernelPipeline during materialization", async () => {
  setupWorkspace();

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {}, warn: () => {} },
  } as unknown as KernelRuntimeContext;

  await runMissionMaterialize(input, context);

  expect(mockPipeline.pipelineNameUsed).toBe("build.prepare.dev");
  expect(mockPipeline.forceUsed).toBe(true);
});
