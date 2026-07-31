/*
<MODULE_CONTRACT>
<purpose>RFC-0620: regression tests verifying workspace-absolute generated files are filtered from mission materialization data-path copy.</purpose>
<keywords>RFC-0620, mission.materialize, ownership map, workspace-absolute, generated files, filter</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0620: initial regression tests — bordbuch files filtered, mock entry filtered, authored files preserved.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { createMaterializeWorkspace } from "./helpers/materialize-fixture.ts";

const mockPipeline = vi.hoisted(() => ({
  pipelineResult: {
    ok: true,
    steps: [{ ok: true, commandName: "config.regenerate", exitCode: 0 }],
  },
}));

const mockOwnershipMap = vi.hoisted(() => [
  // Real bordbuch entries (matching GENERATOR_OWNERSHIP_MAP)
  {
    path: "systems/{system}/public/.well-known/bordbuch.json",
    command: "bordbuch.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts",
  },
  {
    path: "systems/{system}/public/.well-known/bordbuch/index.html",
    command: "bordbuch.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts",
  },
  // Mock entry for test scenario 2 — a hypothetical workspace-absolute generator
  {
    path: "systems/{system}/public/test-generated.json",
    command: "test.generate",
    markerPolicy: "registry-only",
    module: "packages/os/test/src/test-generate.ts",
  },
]);

vi.mock("@warpgogol/site-kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@warpgogol/site-kernel")>();
  return {
    ...actual,
    executeKernelPipeline: vi.fn(async () => [mockPipeline.pipelineResult]),
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
  GENERATOR_OWNERSHIP_MAP: mockOwnershipMap,
}));

let tmpWorkspace: string;

beforeEach(() => {
  tmpWorkspace = mkdtempSync(join(process.cwd(), "tmp-rfc-0620-"));
});

afterEach(() => {
  rmSync(tmpWorkspace, { recursive: true, force: true });
});

function setupWorkspaceWithGeneratedFiles(): string {
  const systemDir = createMaterializeWorkspace(tmpWorkspace);

  // Add bordbuch generated files to cache clone's public/
  const wellKnownDir = join(systemDir, "public", ".well-known");
  mkdirSync(wellKnownDir, { recursive: true });
  writeFileSync(join(wellKnownDir, "bordbuch.json"), '{"test":true}');
  mkdirSync(join(wellKnownDir, "bordbuch"), { recursive: true });
  writeFileSync(join(wellKnownDir, "bordbuch", "index.html"), "<html>bordbuch</html>");

  // Add mock workspace-absolute generated file
  writeFileSync(join(systemDir, "public", "test-generated.json"), '{"mock":true}');

  // Add authored files that should be preserved
  mkdirSync(join(systemDir, "public", "textures"), { recursive: true });
  writeFileSync(join(systemDir, "public", "textures", "logo.svg"), "<svg>logo</svg>");
  writeFileSync(join(systemDir, "public", "favicon.ico"), "fake-icon");

  // Commit the new files to the cache clone
  execSync("git add -A && git commit -m add-generated", {
    cwd: tmpWorkspace,
    stdio: "pipe",
  });

  return systemDir;
}

test("RFC-0620: bordbuch generated files are filtered from workpiece public/", async () => {
  setupWorkspaceWithGeneratedFiles();

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  await runMissionMaterialize(input, context);

  const workpiecePublic = join(
    tmpWorkspace,
    "missions",
    "test-system-m000001",
    "workpiece",
    "public",
  );

  // Bordbuch files must NOT exist in workpiece
  expect(existsSync(join(workpiecePublic, ".well-known", "bordbuch.json"))).toBe(false);
  expect(existsSync(join(workpiecePublic, ".well-known", "bordbuch", "index.html"))).toBe(false);
});

test("RFC-0620: mock workspace-absolute generated file is filtered from workpiece", async () => {
  setupWorkspaceWithGeneratedFiles();

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  await runMissionMaterialize(input, context);

  const workpiecePublic = join(
    tmpWorkspace,
    "missions",
    "test-system-m000001",
    "workpiece",
    "public",
  );

  // Mock generated file must NOT exist in workpiece
  expect(existsSync(join(workpiecePublic, "test-generated.json"))).toBe(false);
});

test("RFC-0620: authored files in public/ are preserved in workpiece", async () => {
  setupWorkspaceWithGeneratedFiles();

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  await runMissionMaterialize(input, context);

  const workpiecePublic = join(
    tmpWorkspace,
    "missions",
    "test-system-m000001",
    "workpiece",
    "public",
  );

  // Authored files MUST exist in workpiece
  expect(existsSync(join(workpiecePublic, "textures", "logo.svg"))).toBe(true);
  expect(existsSync(join(workpiecePublic, "favicon.ico"))).toBe(true);
});

test("RFC-0620: filter is driven by ownership map, not hardcoded paths", async () => {
  // This test verifies that the mock entry (test-generated.json) — which is NOT
  // a bordbuch file — is also filtered. If the filter were hardcoded to only
  // remove bordbuch paths, this file would appear in the workpiece.
  setupWorkspaceWithGeneratedFiles();

  const { runMissionMaterialize } = await import("../mission/mission-materialize.ts");

  const input = {
    flags: { mission: "test-system-m000001" },
  } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: tmpWorkspace,
    logger: { info: () => {} },
  } as unknown as KernelRuntimeContext;

  await runMissionMaterialize(input, context);

  const workpiecePublic = join(
    tmpWorkspace,
    "missions",
    "test-system-m000001",
    "workpiece",
    "public",
  );

  // The mock entry proves the filter reads from GENERATOR_OWNERSHIP_MAP,
  // not from a hardcoded list of bordbuch paths.
  expect(existsSync(join(workpiecePublic, "test-generated.json"))).toBe(false);
  // Bordbuch files are also filtered (sanity check)
  expect(existsSync(join(workpiecePublic, ".well-known", "bordbuch.json"))).toBe(false);
});
