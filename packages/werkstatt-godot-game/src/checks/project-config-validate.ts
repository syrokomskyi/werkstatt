/*
<MODULE_CONTRACT>
<purpose>godot.project.config.validate — warns on project.godot sensitive field changes vs git HEAD (GODOT-04).</purpose>
<keywords>validator, project, godot, config, autoload, input, diff</keywords>
<responsibilities>
  <item>Reads current project.godot and compares sensitive sections against git HEAD baseline.</item>
  <item>Warns only when sensitive sections are added or modified, not on initial presence.</item>
</responsibilities>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not block — severity is warning only (exitCode 0 always).</item>
  <item>Does not validate section content semantics — only detects changes in sensitive section blocks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Fix: make GODOT-04 warning-only (exitCode 0 always) to match described severity. Document presence-based limitation.</item>
  <item>Enhancement: diff sensitive sections against git HEAD instead of presence check — eliminates false-positives on new projects.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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

  let currentContent: string;
  try {
    currentContent = await readFile(join(projectRoot, PROJECT_GODOT), "utf-8");
  } catch {
    return {
      data: { command: "godot.project.config.validate", status: "pass", violations },
      exitCode: 0,
      summary: `godot.project.config.validate: pass (no project.godot found, skipping)`,
    };
  }

  const baselineContent = readGitHeadProjectGodot(projectRoot);

  if (baselineContent === null) {
    return {
      data: { command: "godot.project.config.validate", status: "pass", violations },
      exitCode: 0,
      summary: `godot.project.config.validate: pass (no git HEAD baseline, skipping)`,
    };
  }

  for (const section of SENSITIVE_SECTIONS) {
    const currentBlock = extractSection(currentContent, section);
    const baselineBlock = extractSection(baselineContent, section);

    if (currentBlock !== baselineBlock) {
      violations.push({
        ruleId: "GODOT-04",
        file: PROJECT_GODOT,
        message: `project.godot "${section}" section changed — autoloads, input map, physics layers, or rendering settings require explicit confirmation`,
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

function readGitHeadProjectGodot(projectRoot: string): string | null {
  try {
    const output = execFileSync("git", ["show", "HEAD:project.godot"], {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output;
  } catch {
    return null;
  }
}

function extractSection(content: string, sectionHeader: string): string {
  const lines = content.split("\n");
  const sectionLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.trim() === sectionHeader) {
      inSection = true;
      sectionLines.push(line);
      continue;
    }
    if (inSection) {
      if (line.startsWith("[") && line.trim().endsWith("]")) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n");
}

export function createProjectConfigValidateCommand(): KernelCommandDefinition<ProjectConfigValidateData> {
  return {
    name: "godot.project.config.validate",
    description: "Validate project.godot sensitive field changes vs git HEAD (GODOT-04)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateProjectConfig(context.workspaceRoot);
    },
  };
}
