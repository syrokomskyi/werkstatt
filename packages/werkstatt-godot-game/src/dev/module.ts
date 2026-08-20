/*
<MODULE_CONTRACT>
<purpose>Godot dev module — registers dev server, test, smoke test, context generate, playtest, and screenshot commands as kernel commands.</purpose>
<keywords>dev, server, test, godot, module</keywords>
<non-goals>
  <item>Do not implement logic here — delegate to build/ files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot dev module — registers godot.dev.server and godot.test commands.</item>
  <item>Enhancement: register godot.smoke.test and godot.context.generate commands.</item>
  <item>Enhancement: register godot.playtest and godot.screenshot commands.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelModule,
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";
import { runGodotDevServer } from "../build/godot-dev-server.ts";
import { runDotnetTest } from "../build/dotnet-test.ts";
import { runSmokeTest } from "../build/godot-smoke-test.ts";
import { generateContext } from "../build/godot-context-generate.ts";
import { runPlaytest } from "../build/godot-playtest.ts";
import { captureScreenshot } from "../build/godot-screenshot.ts";

interface DevServerData {
  command: string;
  status: "pass" | "fail";
  pid?: number;
}

interface TestData {
  command: string;
  status: "pass" | "fail";
}

interface SmokeTestData {
  command: string;
  status: "pass" | "fail";
  duration: number;
  errors: string[];
  warnings: string[];
}

interface ContextData {
  command: string;
  projectRoot: string;
  mainScene: string | null;
  autoloads: { name: string; path: string }[];
  inputActions: string[];
  renderer: string | null;
  stretchMode: string | null;
  stretchAspect: string | null;
  windowWidth: number | null;
  windowHeight: number | null;
  scenes: string[];
  scripts: string[];
  resources: string[];
  addons: { name: string; enabled: boolean; hasPluginCfg: boolean; hasCsproj: boolean }[];
  csprojExists: boolean;
  slnExists: boolean;
  exportPresetsExist: boolean;
}

interface PlaytestData {
  command: string;
  status: "pass" | "fail";
  duration: number;
  errors: string[];
  warnings: string[];
  startupErrors: string[];
  gameplayErrors: string[];
  output: string;
}

interface ScreenshotData {
  command: string;
  status: "pass" | "fail";
  screenshotPath: string | null;
  display: string | null;
  width: number;
  height: number;
  errors: string[];
}

function createDevServerCommand(): KernelCommandDefinition<DevServerData> {
  return {
    name: "godot.dev.server",
    description: "Launch godot --editor for local development",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      const result = await runGodotDevServer(context);
      const pid =
        typeof result.data === "object" && result.data !== null && "pid" in result.data
          ? (result.data as { pid?: number }).pid
          : undefined;
      const data: DevServerData = {
        command: "godot.dev.server",
        status: result.success ? "pass" : "fail",
        pid,
      };
      return {
        data,
        exitCode: result.success ? 0 : 1,
        summary: `godot.dev.server: ${data.status}`,
      } satisfies KernelCommandResult<DevServerData>;
    },
  };
}

function createTestCommand(): KernelCommandDefinition<TestData> {
  return {
    name: "godot.test",
    description: "Run dotnet test for C# unit tests",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      const result = await runDotnetTest(context);
      const data: TestData = {
        command: "godot.test",
        status: result.success ? "pass" : "fail",
      };
      return {
        data,
        exitCode: result.success ? 0 : 1,
        summary: `godot.test: ${data.status}`,
      };
    },
  };
}

function createSmokeTestCommand(): KernelCommandDefinition<SmokeTestData> {
  return {
    name: "godot.smoke.test",
    description: "Run Godot headless smoke test to catch runtime errors",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      const result = runSmokeTest(context.workspaceRoot);
      return {
        data: result.data!,
        exitCode: result.exitCode,
        summary: result.summary,
      } satisfies KernelCommandResult<SmokeTestData>;
    },
  };
}

function createContextGenerateCommand(): KernelCommandDefinition<ContextData> {
  return {
    name: "godot.context.generate",
    description: "Generate structured project context for AI agents",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      const result = await generateContext(context.workspaceRoot);
      return {
        data: result.data!,
        exitCode: result.exitCode,
        summary: result.summary,
      } satisfies KernelCommandResult<ContextData>;
    },
  };
}

function createPlaytestCommand(): KernelCommandDefinition<PlaytestData> {
  return {
    name: "godot.playtest",
    description: "Run Godot playtest with deterministic input to catch gameplay runtime errors",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      const result = runPlaytest(context.workspaceRoot);
      return {
        data: result.data!,
        exitCode: result.exitCode,
        summary: result.summary,
      } satisfies KernelCommandResult<PlaytestData>;
    },
  };
}

function createScreenshotCommand(): KernelCommandDefinition<ScreenshotData> {
  return {
    name: "godot.screenshot",
    description: "Capture a screenshot of the Godot game viewport via Xvfb",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      const result = captureScreenshot(context.workspaceRoot);
      return {
        data: result.data!,
        exitCode: result.exitCode,
        summary: result.summary,
      } satisfies KernelCommandResult<ScreenshotData>;
    },
  };
}

export function createGodotDevModule(): KernelModule {
  return {
    name: "godot-dev",
    version: "0.3.0",
    register(registry) {
      registry.registerCommand(createDevServerCommand());
      registry.registerCommand(createTestCommand());
      registry.registerCommand(createSmokeTestCommand());
      registry.registerCommand(createContextGenerateCommand());
      registry.registerCommand(createPlaytestCommand());
      registry.registerCommand(createScreenshotCommand());
    },
  };
}
