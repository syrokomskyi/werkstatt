/*
<MODULE_CONTRACT>
<purpose>Dotnet build hook for the Godot plugin — runs dotnet build in the workpiece.</purpose>
<keywords>build, dotnet, godot</keywords>
<responsibilities>
  <item>Runs `dotnet build ./Game.csproj` in the workpiece directory.</item>
  <item>Reports success/failure via HookResult.</item>
</responsibilities>
<non-goals>
  <item>Does not manage deploy — that is the deploy adapter's job.</item>
  <item>Does not run checkGate — that is a separate hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial dotnet build hook — runs dotnet build via child_process.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

export async function runDotnetBuild(ctx: PluginHookContext): Promise<HookResult> {
  const cwd = ctx.workpiecePath ?? ctx.workspaceRoot;
  const csprojPath = join(cwd, "Game.csproj");

  if (!existsSync(csprojPath)) {
    return {
      success: false,
      errors: [`Game.csproj not found at ${csprojPath}`],
    };
  }

  ctx.logger.info(`dotnet-build: running dotnet build in ${cwd}`);

  try {
    const output = execFileSync("dotnet", ["build", "./Game.csproj"], {
      cwd,
      encoding: "utf-8",
      timeout: 180_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    ctx.logger.info("dotnet-build: build completed", { output: output.slice(-200) });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("dotnet-build: build failed", { error: message });
    return {
      success: false,
      errors: [`dotnet build failed: ${message}`],
    };
  }
}
