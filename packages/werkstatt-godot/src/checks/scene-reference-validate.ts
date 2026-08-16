/*
<MODULE_CONTRACT>
<purpose>godot.scene.reference.validate — checks that res:// references in .tscn files point to existing files (GODOT-05).</purpose>
<keywords>validator, scene, reference, integrity, godot</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not validate .tres resource references — that is resource-validate's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial scene reference validator — parses .tscn files for res:// paths and checks existence.</item>
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

export interface SceneReferenceViolation {
  ruleId: string;
  file: string;
  reference: string;
  message: string;
}

export interface SceneReferenceValidateData {
  command: string;
  status: "pass" | "fail";
  violations: SceneReferenceViolation[];
}

const SKIP_DIRS = ["bin", "obj", ".godot", ".git", "node_modules"];

export async function validateSceneReferences(
  projectRoot: string,
): Promise<KernelCommandResult<SceneReferenceValidateData>> {
  const violations: SceneReferenceViolation[] = [];
  const tscnFiles = await listFilesRecursive(projectRoot, ".tscn", SKIP_DIRS);

  for (const tscnFile of tscnFiles) {
    const content = await readFile(tscnFile, "utf-8");
    const relFile = relative(projectRoot, tscnFile);
    const references = extractResReferences(content);

    for (const resPath of references) {
      const absPath = join(projectRoot, resPath);

      if (!existsSync(absPath)) {
        violations.push({
          ruleId: "GODOT-05",
          file: relFile,
          reference: `res://${resPath}`,
          message: `Scene references "res://${resPath}" but file does not exist`,
        });
      }
    }
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "godot.scene.reference.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `godot.scene.reference.validate: ${status} (${violations.length} violations)`,
  };
}

export function createSceneReferenceValidateCommand(): KernelCommandDefinition<SceneReferenceValidateData> {
  return {
    name: "godot.scene.reference.validate",
    description: "Validate scene res:// references exist (GODOT-05)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateSceneReferences(context.workspaceRoot);
    },
  };
}
