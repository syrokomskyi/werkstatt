/*
<MODULE_CONTRACT>
<purpose>godot.scene.validate — checks scene/script directory structure (GODOT-01).</purpose>
<keywords>validator, scenes, scripts, godot</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial scene validator — scans for .tscn in Scenes/ and .cs in Scripts/.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Dirent } from "node:fs";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface SceneValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface SceneValidateData {
  command: string;
  status: "pass" | "fail";
  violations: SceneValidateViolation[];
}

const SCENES_DIR = "Scenes";
const SCRIPTS_DIR = "Scripts";

export async function validateSceneStructure(
  projectRoot: string,
): Promise<KernelCommandResult<SceneValidateData>> {
  const violations: SceneValidateViolation[] = [];

  const tscnFiles = await listFilesRecursive(join(projectRoot, SCENES_DIR), ".tscn");
  const csFiles = await listFilesRecursive(join(projectRoot, SCRIPTS_DIR), ".cs");

  for (const filePath of tscnFiles) {
    const relPath = relative(projectRoot, filePath);
    if (!relPath.startsWith(`${SCENES_DIR}/`)) {
      violations.push({
        ruleId: "GODOT-01",
        file: relPath,
        message: `Scene file "${relPath}" must reside in ${SCENES_DIR}/`,
      });
    }
  }

  for (const filePath of csFiles) {
    const relPath = relative(projectRoot, filePath);
    if (!relPath.startsWith(`${SCRIPTS_DIR}/`)) {
      violations.push({
        ruleId: "GODOT-01",
        file: relPath,
        message: `Script file "${relPath}" must reside in ${SCRIPTS_DIR}/`,
      });
    }
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "godot.scene.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `godot.scene.validate: ${status} (${violations.length} violations)`,
  };
}

async function listFilesRecursive(dir: string, ext: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(fullPath, ext)));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function createSceneValidateCommand(): KernelCommandDefinition<SceneValidateData> {
  return {
    name: "godot.scene.validate",
    description: "Validate scene/script directory structure (GODOT-01)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateSceneStructure(context.workspaceRoot);
    },
  };
}
