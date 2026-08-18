/*
<MODULE_CONTRACT>
<purpose>godot.addon.validate — checks Godot addons in addons/ directory (GODOT-12).</purpose>
<keywords>validator, addon, plugin, godot, mcp</keywords>
<responsibilities>
  <item>Scans addons/ directory for installed addons.</item>
  <item>Validates each addon has a valid plugin.cfg with required fields.</item>
  <item>Checks if addon is enabled in project.godot [editor_plugins] section.</item>
  <item>For C# addons, checks that NuGet dependencies are declared in Game.csproj.</item>
</responsibilities>
<non-goals>
  <item>Does not validate NuGet packages generally — that is nuget-validate's job.</item>
  <item>Does not install or remove addons.</item>
  <item>Does not validate addon functionality — only structural presence.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial addon validator — GODOT-12.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface AddonValidateViolation {
  ruleId: string;
  addon: string;
  message: string;
}

export interface AddonValidateData {
  command: string;
  status: "pass" | "fail";
  addons: { name: string; enabled: boolean; hasPluginCfg: boolean; hasCsproj: boolean }[];
  violations: AddonValidateViolation[];
}

const ADDONS_DIR = "addons";
const PLUGIN_CFG = "plugin.cfg";
const PROJECT_GODOT = "project.godot";
const GAME_CSPROJ = "Game.csproj";

export async function validateAddons(
  projectRoot: string,
): Promise<KernelCommandResult<AddonValidateData>> {
  const violations: AddonValidateViolation[] = [];
  const addonsDir = join(projectRoot, ADDONS_DIR);

  if (!existsSync(addonsDir)) {
    return {
      data: {
        command: "godot.addon.validate",
        status: "pass",
        addons: [],
        violations,
      },
      exitCode: 0,
      summary: "godot.addon.validate: pass (no addons/ directory, skipping)",
    };
  }

  // Read project.godot to find enabled plugins
  const projectGodotPath = join(projectRoot, PROJECT_GODOT);
  let projectGodotContent = "";
  if (existsSync(projectGodotPath)) {
    projectGodotContent = await readFile(projectGodotPath, "utf-8");
  }

  // Read Game.csproj for NuGet dependency check
  const csprojPath = join(projectRoot, GAME_CSPROJ);
  let csprojContent = "";
  if (existsSync(csprojPath)) {
    csprojContent = await readFile(csprojPath, "utf-8");
  }

  // List addon directories
  const entries = await readdir(addonsDir, { withFileTypes: true });
  const addonDirs = entries.filter((e) => e.isDirectory());

  const addons: AddonValidateData["addons"] = [];

  for (const addonDir of addonDirs) {
    const addonName = addonDir.name;
    const addonPath = join(addonsDir, addonName);
    const pluginCfgPath = join(addonPath, PLUGIN_CFG);
    const addonCsprojPath = join(addonPath, `${addonName}.csproj`);

    const hasPluginCfg = existsSync(pluginCfgPath);
    const hasCsproj = existsSync(addonCsprojPath);

    // Check if addon is enabled in project.godot
    const enabledPattern = new RegExp(
      `^\\[editor_plugins\\][^[]*enabled=.*"res://addons/${addonName}"`,
      "ms",
    );
    const enabled = enabledPattern.test(projectGodotContent);

    addons.push({ name: addonName, enabled, hasPluginCfg, hasCsproj });

    // Violation: missing plugin.cfg
    if (!hasPluginCfg) {
      violations.push({
        ruleId: "GODOT-12",
        addon: addonName,
        message: `Addon "${addonName}" is missing plugin.cfg — Godot cannot load it without this file`,
      });
      continue;
    }

    // Validate plugin.cfg has required fields
    const pluginCfgContent = await readFile(pluginCfgPath, "utf-8");
    const requiredFields = ["name", "author", "version", "description"];
    for (const field of requiredFields) {
      const fieldPattern = new RegExp(`^${field}=`, "m");
      if (!fieldPattern.test(pluginCfgContent)) {
        violations.push({
          ruleId: "GODOT-12",
          addon: addonName,
          message: `Addon "${addonName}" plugin.cfg is missing required field "${field}"`,
        });
      }
    }

    // For C# addons with .csproj, check that their NuGet deps are in Game.csproj
    if (hasCsproj) {
      const addonCsprojContent = await readFile(addonCsprojPath, "utf-8");
      const packageRefPattern = /<PackageReference\s+Include="([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = packageRefPattern.exec(addonCsprojContent)) !== null) {
        const pkgName = match[1]!;
        // Check if this package is also in Game.csproj
        const gameHasPkg = new RegExp(
          `<PackageReference\\s+Include="${pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
        ).test(csprojContent);
        if (!gameHasPkg) {
          violations.push({
            ruleId: "GODOT-12",
            addon: addonName,
            message: `C# addon "${addonName}" references NuGet package "${pkgName}" in its .csproj but it is not declared in Game.csproj — the addon will fail to compile`,
          });
        }
      }
    }
  }

  return {
    data: {
      command: "godot.addon.validate",
      status: violations.length === 0 ? "pass" : "fail",
      addons,
      violations,
    },
    exitCode: violations.length === 0 ? 0 : 1,
    summary: `godot.addon.validate: ${violations.length === 0 ? "pass" : `${violations.length} violation(s)`} (${addons.length} addon(s))`,
  };
}

export function createAddonValidateCommand(): KernelCommandDefinition<AddonValidateData> {
  return {
    name: "godot.addon.validate",
    description: "Validate Godot addons in addons/ directory (GODOT-12)",
    scope: "workspace",
    cacheable: true,
    async execute(_input, context) {
      return validateAddons(context.workspaceRoot);
    },
  };
}
