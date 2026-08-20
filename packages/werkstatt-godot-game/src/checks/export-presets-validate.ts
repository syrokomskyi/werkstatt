/*
<MODULE_CONTRACT>
<purpose>godot.export.presets.validate — checks export_presets.cfg for common misconfigurations (GODOT-09).</purpose>
<keywords>validator, export, presets, godot, deploy</keywords>
<responsibilities>
  <item>Validates export_presets.cfg structure and preset entries.</item>
  <item>Checks: at least one preset exists, each preset has name/platform/export_path, no empty paths.</item>
  <item>Checks: export paths are relative (res:// or relative), not absolute filesystem paths.</item>
</responsibilities>
<non-goals>
  <item>Does not run Godot export — that is the build hook's job.</item>
  <item>Does not validate deploy channel mapping — that is the deploy adapter's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export presets validator — GODOT-09.</item>
  <item>Fix: change [preset_N] to [preset.N] (Godot 4.x dot notation) — pre-existing regex bug exposed by scaffolded export_presets.cfg.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";
import { parseExportPresets } from "../utils/parse-export-presets.ts";

export interface ExportPresetsValidateViolation {
  ruleId: string;
  message: string;
}

export interface ExportPresetsValidateData {
  command: string;
  status: "pass" | "fail";
  violations: ExportPresetsValidateViolation[];
}

const EXPORT_PRESETS_FILE = "export_presets.cfg";

export async function validateExportPresets(
  projectRoot: string,
): Promise<KernelCommandResult<ExportPresetsValidateData>> {
  const violations: ExportPresetsValidateViolation[] = [];
  const presetsPath = join(projectRoot, EXPORT_PRESETS_FILE);

  if (!existsSync(presetsPath)) {
    return {
      data: {
        command: "godot.export.presets.validate",
        status: "pass",
        violations,
      },
      exitCode: 0,
      summary: "godot.export.presets.validate: pass (no export_presets.cfg found, skipping)",
    };
  }

  const content = await readFile(presetsPath, "utf-8");

  // Check: at least one [preset.N] section exists (Godot 4.x dot notation)
  if (!/\[preset\.\d+\]/.test(content)) {
    violations.push({
      ruleId: "GODOT-09",
      message:
        "export_presets.cfg contains no preset sections — at least one export preset is required for deployment",
    });
    return {
      data: {
        command: "godot.export.presets.validate",
        status: "fail",
        violations,
      },
      exitCode: 1,
      summary: `godot.export.presets.validate: ${violations.length} violation(s)`,
    };
  }

  // Parse presets using shared utility
  const presets = parseExportPresets(presetsPath);

  if (presets.length === 0) {
    violations.push({
      ruleId: "GODOT-09",
      message:
        "export_presets.cfg has preset sections but none are complete (missing name, platform, or export_path)",
    });
  }

  for (const preset of presets) {
    // Check: export path is not empty
    if (!preset.exportPath || preset.exportPath.trim() === "") {
      violations.push({
        ruleId: "GODOT-09",
        message: `Preset "${preset.name}" has empty export_path — Godot cannot export without a target file`,
      });
    }

    // Check: export path is not an absolute filesystem path
    if (preset.exportPath.startsWith("/") || /^[A-Za-z]:/.test(preset.exportPath)) {
      violations.push({
        ruleId: "GODOT-09",
        message: `Preset "${preset.name}" uses absolute path "${preset.exportPath}" — use relative paths (e.g., "bin/Game.exe") for portability`,
      });
    }

    // Check: platform is a known Godot platform
    const knownPlatforms = [
      "Windows Desktop",
      "Linux/X11",
      "macOS",
      "Android",
      "iOS",
      "Web",
      "HTML5",
    ];
    if (!knownPlatforms.includes(preset.platform)) {
      violations.push({
        ruleId: "GODOT-09",
        message: `Preset "${preset.name}" has unknown platform "${preset.platform}" — expected one of: ${knownPlatforms.join(", ")}`,
      });
    }
  }

  return {
    data: {
      command: "godot.export.presets.validate",
      status: violations.length === 0 ? "pass" : "fail",
      violations,
    },
    exitCode: violations.length === 0 ? 0 : 1,
    summary: `godot.export.presets.validate: ${violations.length === 0 ? "pass" : `${violations.length} violation(s)`}`,
  };
}

export function createExportPresetsValidateCommand(): KernelCommandDefinition<ExportPresetsValidateData> {
  return {
    name: "godot.export.presets.validate",
    description: "Validate export_presets.cfg for common misconfigurations (GODOT-09)",
    scope: "workspace",
    cacheable: true,
    async execute(_input, context) {
      return validateExportPresets(context.workspaceRoot);
    },
  };
}
