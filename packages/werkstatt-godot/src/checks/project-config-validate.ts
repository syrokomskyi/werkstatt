/*
<MODULE_CONTRACT>
<purpose>godot.project.config.validate — warns on project.godot sensitive field changes (GODOT-04).</purpose>
<keywords>validator, project, godot, config, autoload, input</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not block — severity is warning only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial project config validator — checks for autoload/input_map sections in project.godot.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ProjectConfigValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface ProjectConfigValidateData {
  command: string;
  status: "pass" | "fail";
  violations: ProjectConfigValidateViolation[];
}

const PROJECT_GODOT = "project.godot";

const SENSITIVE_SECTIONS = ["[autoload]", "[input]", "[layer_names]", "[rendering]"];

export async function validateProjectConfig(
  projectRoot: string,
): Promise<KernelCommandResult<ProjectConfigValidateData>> {
  const violations: ProjectConfigValidateViolation[] = [];

  let content = "";
  try {
    content = await readFile(join(projectRoot, PROJECT_GODOT), "utf-8");
  } catch {
    const status = "pass";
    return {
      data: { command: "godot.project.config.validate", status, violations },
      exitCode: 0,
      summary: `godot.project.config.validate: ${status} (no project.godot found, skipping)`,
    };
  }

  for (const section of SENSITIVE_SECTIONS) {
    if (content.includes(section)) {
      violations.push({
        ruleId: "GODOT-04",
        file: PROJECT_GODOT,
        message: `project.godot contains "${section}" — changes to autoloads, input map, physics layers, or rendering settings require explicit confirmation`,
      });
    }
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "godot.project.config.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `godot.project.config.validate: ${status} (${violations.length} warnings)`,
  };
}

export function createProjectConfigValidateCommand(): KernelCommandDefinition<ProjectConfigValidateData> {
  return {
    name: "godot.project.config.validate",
    description: "Validate project.godot sensitive fields (GODOT-04)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateProjectConfig(context.workspaceRoot);
    },
  };
}
