/*
<MODULE_CONTRACT>
<purpose>godot.uid.validate — checks UID uniqueness in .tscn and .tres files (GODOT-10).</purpose>
<keywords>validator, uid, uniqueness, godot, scene, resource</keywords>
<responsibilities>
  <item>Scans .tscn and .tres files for uid="uid://..." declarations.</item>
  <item>Reports duplicate UIDs — Godot loads the wrong resource when UIDs collide.</item>
  <item>Reports missing UIDs — Godot generates them on first open, causing unnecessary diffs.</item>
</responsibilities>
<non-goals>
  <item>Does not validate res:// references — that is scene-reference-validate's job.</item>
  <item>Does not generate UIDs — use the Godot editor for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial UID uniqueness validator — GODOT-10.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";
import { listFilesRecursive } from "../utils/list-files-recursive.ts";

export interface UidValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface UidValidateData {
  command: string;
  status: "pass" | "fail";
  violations: UidValidateViolation[];
}

const SKIP_DIRS = ["bin", "obj", ".godot", ".git", "node_modules"];
const UID_PATTERN = /uid="uid:\/\/([^"]+)"/;

export async function validateUids(
  projectRoot: string,
): Promise<KernelCommandResult<UidValidateData>> {
  const violations: UidValidateViolation[] = [];
  const uidMap = new Map<string, string>(); // uid -> first file seen

  const tscnFiles = await listFilesRecursive(projectRoot, ".tscn", SKIP_DIRS);
  const tresFiles = await listFilesRecursive(projectRoot, ".tres", SKIP_DIRS);
  const allFiles = [...tscnFiles, ...tresFiles];

  for (const file of allFiles) {
    const relPath = relative(projectRoot, file);
    const content = await readFile(file, "utf-8");
    const uidMatch = content.match(UID_PATTERN);

    if (!uidMatch) {
      violations.push({
        ruleId: "GODOT-10",
        file: relPath,
        message: "Missing uid:// declaration — Godot will generate one on first open, causing unnecessary git diffs",
      });
      continue;
    }

    const uid = uidMatch[1]!;
    const existingFile = uidMap.get(uid);
    if (existingFile) {
      violations.push({
        ruleId: "GODOT-10",
        file: relPath,
        message: `Duplicate UID "uid://${uid}" — also declared in ${existingFile}. Godot will load the wrong resource.`,
      });
    } else {
      uidMap.set(uid, relPath);
    }
  }

  return {
    data: {
      command: "godot.uid.validate",
      status: violations.length === 0 ? "pass" : "fail",
      violations,
    },
    exitCode: violations.length === 0 ? 0 : 1,
    summary: `godot.uid.validate: ${violations.length === 0 ? "pass" : `${violations.length} violation(s)`}`,
  };
}

export function createUidValidateCommand(): KernelCommandDefinition<UidValidateData> {
  return {
    name: "godot.uid.validate",
    description: "Validate UID uniqueness in .tscn and .tres files (GODOT-10)",
    scope: "workspace",
    cacheable: true,
    async execute(_input, context) {
      return validateUids(context.workspaceRoot);
    },
  };
}
