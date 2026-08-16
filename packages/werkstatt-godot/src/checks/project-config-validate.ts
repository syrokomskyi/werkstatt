/*
<MODULE_CONTRACT>
<purpose>godot.project.config.validate — warns on project.godot sensitive field presence (GODOT-04).</purpose>
<keywords>validator, project, godot, config, autoload, input</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not block — severity is warning only (exitCode 0 always).</item>
  <item>Does not diff against baseline — checks presence of sensitive sections, not changes. Future enhancement: compare against git HEAD.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Fix: make GODOT-04 warning-only (exitCode 0 always) to match described severity. Document presence-based limitation.</item>
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
  status: "pass" | "warn";
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
    return {
      data: { command: "godot.project.config.validate", status: "pass", violations },
      exitCode: 0,
      summary: `godot.project.config.validate: pass (no project.godot found, skipping)`,
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

  const status: ProjectConfigValidateData["status"] = violations.length === 0 ? "pass" : "warn";
  return {
    data: { command: "godot.project.config.validate", status, violations },
    exitCode: 0,
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
