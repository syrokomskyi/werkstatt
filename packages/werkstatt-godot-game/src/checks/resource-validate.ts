/*
<MODULE_CONTRACT>
<purpose>godot.resource.validate — checks .tres files are in Resources/ and their res:// references exist (GODOT-07).</purpose>
<keywords>validator, resource, tres, godot</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not validate .tscn scene references — that is scene-reference-validate's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial resource validator — checks .tres files in Resources/ and res:// reference integrity.</item>
  <item>Fix: use shared extractResReferences from utils/extract-res-references.ts instead of local duplicate.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";
import { listFilesRecursive } from "../utils/list-files-recursive.ts";
import { extractResReferences } from "../utils/extract-res-references.ts";

export interface ResourceValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface ResourceValidateData {
  command: string;
  status: "pass" | "fail";
  violations: ResourceValidateViolation[];
}

const RESOURCES_DIR = "Resources";
const SKIP_DIRS = ["bin", "obj", ".godot", ".git", "node_modules"];

export async function validateResources(
  projectRoot: string,
): Promise<KernelCommandResult<ResourceValidateData>> {
  const violations: ResourceValidateViolation[] = [];
  const tresFiles = await listFilesRecursive(projectRoot, ".tres", SKIP_DIRS);

  for (const tresFile of tresFiles) {
    const relPath = relative(projectRoot, tresFile);

    if (!relPath.startsWith(`${RESOURCES_DIR}/`)) {
      violations.push({
        ruleId: "GODOT-07",
        file: relPath,
        message: `Resource file "${relPath}" must reside in ${RESOURCES_DIR}/`,
      });
    }

    const content = await readFile(tresFile, "utf-8");
    const references = extractResReferences(content);

    for (const resPath of references) {
      const absPath = join(projectRoot, resPath);

      if (!existsSync(absPath)) {
        violations.push({
          ruleId: "GODOT-07",
          file: relPath,
          message: `Resource references "res://${resPath}" but file does not exist`,
        });
      }
    }
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "godot.resource.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `godot.resource.validate: ${status} (${violations.length} violations)`,
  };
}

export function createResourceValidateCommand(): KernelCommandDefinition<ResourceValidateData> {
  return {
    name: "godot.resource.validate",
    description: "Validate .tres resource location and references (GODOT-07)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateResources(context.workspaceRoot);
    },
  };
}
