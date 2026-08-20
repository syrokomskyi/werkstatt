/*
<MODULE_CONTRACT>
<purpose>Build hook for the Godot plugin — runs dotnet build then Godot export for each preset.</purpose>
<keywords>build, dotnet, godot, export</keywords>
<responsibilities>
  <item>Runs `dotnet build ./Game.csproj` in the workpiece directory.</item>
  <item>Reads export_presets.cfg and runs `godot --headless --export-release` for each preset.</item>
  <item>Reports success/failure via HookResult.</item>
</responsibilities>
<non-goals>
  <item>Does not manage deploy — that is the deploy adapter's job.</item>
  <item>Does not run checkGate — that is a separate hook.</item>
  <item>Does not install Godot or dotnet — both must be on PATH.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial dotnet build hook — runs dotnet build via child_process.</item>
  <item>Enhancement: add Godot export step — reads export_presets.cfg and runs godot --headless --export-release for each preset.</item>
  <item>Fix: use shared parseExportPresets from utils/parse-export-presets.ts instead of local duplicate.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { parseExportPresets } from "../utils/parse-export-presets.ts";

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("dotnet-build: build failed", { error: message });
    return {
      success: false,
      errors: [`dotnet build failed: ${message}`],
    };
  }

  const presetsPath = join(cwd, "export_presets.cfg");
  if (!existsSync(presetsPath)) {
    ctx.logger.info("dotnet-build: no export_presets.cfg found, skipping Godot export");
    return { success: true };
  }

  const presets = parseExportPresets(presetsPath);
  if (presets.length === 0) {
    ctx.logger.info("dotnet-build: no export presets found, skipping Godot export");
    return { success: true };
  }

  const exportErrors: string[] = [];
  for (const preset of presets) {
    ctx.logger.info(`dotnet-build: exporting preset "${preset.name}" (${preset.platform})`);

    try {
      const exportOutput = execFileSync(
        "godot",
        ["--headless", "--export-release", preset.name, preset.exportPath],
        {
          cwd,
          encoding: "utf-8",
          timeout: 300_000,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      ctx.logger.info(`dotnet-build: export "${preset.name}" completed`, {
        output: exportOutput.slice(-200),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`dotnet-build: export "${preset.name}" failed`, { error: message });
      exportErrors.push(`Godot export failed for preset "${preset.name}": ${message}`);
    }
  }

  if (exportErrors.length > 0) {
    return { success: false, errors: exportErrors };
  }

  return { success: true };
}
