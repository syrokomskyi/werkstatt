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
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

interface ExportPreset {
  name: string;
  platform: string;
  outputPath: string;
}

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
        ["--headless", "--export-release", preset.name, preset.outputPath],
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

function parseExportPresets(presetsPath: string): ExportPreset[] {
  const content = readFileSync(presetsPath, "utf-8");
  const presets: ExportPreset[] = [];
  const sections = content.split(/\[preset_(\d+)\]/);

  for (let i = 1; i < sections.length; i += 2) {
    const body = sections[i + 1];
    if (!body) continue;

    const nameMatch = body.match(/^name="([^"]+)"/m);
    const platformMatch = body.match(/^platform="([^"]+)"/m);
    const pathMatch = body.match(/^export_path="([^"]+)"/m);

    if (nameMatch && platformMatch && pathMatch) {
      presets.push({
        name: nameMatch[1]!,
        platform: platformMatch[1]!,
        outputPath: pathMatch[1]!,
      });
    }
  }

  return presets;
}
