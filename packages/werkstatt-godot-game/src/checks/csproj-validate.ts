/*
<MODULE_CONTRACT>
<purpose>godot.csproj.validate — checks Game.csproj for required Godot C# project settings (GODOT-06).</purpose>
<keywords>validator, csproj, dotnet, godot, csharp</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not validate .sln files — only .csproj.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial csproj validator — checks Godot.NET.Sdk, TargetFramework net8.0+, EnableDynamicLoading.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface CsprojValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface CsprojValidateData {
  command: string;
  status: "pass" | "fail";
  violations: CsprojValidateViolation[];
}

const GAME_CSPROJ = "Game.csproj";

export async function validateCsproj(
  projectRoot: string,
): Promise<KernelCommandResult<CsprojValidateData>> {
  const violations: CsprojValidateViolation[] = [];

  let content: string;
  try {
    content = await readFile(join(projectRoot, GAME_CSPROJ), "utf-8");
  } catch {
    return {
      data: { command: "godot.csproj.validate", status: "pass", violations },
      exitCode: 0,
      summary: `godot.csproj.validate: pass (no Game.csproj found, skipping)`,
    };
  }

  // Also read Directory.Build.props if it exists — MSBuild merges these properties
  const dbpPath = join(projectRoot, "Directory.Build.props");
  let dbpContent = "";
  if (existsSync(dbpPath)) {
    try {
      dbpContent = await readFile(dbpPath, "utf-8");
    } catch {
      // ignore read errors
    }
  }
  const combined = content + "\n" + dbpContent;

  if (!content.includes('Sdk="Godot.NET.Sdk"')) {
    violations.push({
      ruleId: "GODOT-06",
      file: GAME_CSPROJ,
      message: 'Game.csproj must use Sdk="Godot.NET.Sdk" for Godot C# projects',
    });
  }

  if (!/<TargetFramework>net(\d+)\.0/.test(combined)) {
    violations.push({
      ruleId: "GODOT-06",
      file: GAME_CSPROJ,
      message: "Game.csproj must target net8.0 or higher (Godot 4.x requires .NET 8+)",
    });
  } else {
    const tfmMatch = combined.match(/<TargetFramework>net(\d+)\.0/);
    if (tfmMatch && parseInt(tfmMatch[1]!, 10) < 8) {
      violations.push({
        ruleId: "GODOT-06",
        file: GAME_CSPROJ,
        message: "Game.csproj must target net8.0 or higher (Godot 4.x requires .NET 8+)",
      });
    }
  }

  if (!combined.includes("<EnableDynamicLoading>true</EnableDynamicLoading>")) {
    violations.push({
      ruleId: "GODOT-06",
      file: GAME_CSPROJ,
      message: "Game.csproj must set EnableDynamicLoading=true for Godot C# integration",
    });
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "godot.csproj.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `godot.csproj.validate: ${status} (${violations.length} violations)`,
  };
}

export function createCsprojValidateCommand(): KernelCommandDefinition<CsprojValidateData> {
  return {
    name: "godot.csproj.validate",
    description: "Validate Game.csproj Godot C# settings (GODOT-06)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateCsproj(context.workspaceRoot);
    },
  };
}
