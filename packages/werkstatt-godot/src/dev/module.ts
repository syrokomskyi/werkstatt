/*
<MODULE_CONTRACT>
<purpose>Godot dev module — registers dev server and test commands as kernel commands.</purpose>
<keywords>dev, server, test, godot, module</keywords>
<non-goals>
  <item>Do not implement logic here — delegate to build/godot-dev-server.ts and build/dotnet-test.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot dev module — registers godot.dev.server and godot.test commands.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelModule,
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";
import { runGodotDevServer } from "../build/godot-dev-server.ts";
import { runDotnetTest } from "../build/dotnet-test.ts";

interface DevServerData {
  command: string;
  status: "pass" | "fail";
  pid?: number;
}

interface TestData {
  command: string;
  status: "pass" | "fail";
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

export function createGodotDevModule(): KernelModule {
  return {
    name: "godot-dev",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand(createDevServerCommand());
      registry.registerCommand(createTestCommand());
    },
  };
}
