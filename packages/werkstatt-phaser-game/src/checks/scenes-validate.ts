/*
<MODULE_CONTRACT>
<purpose>phaser.scenes.validate — checks scene registry consistency (PHASER-01).</purpose>
<keywords>validator, scenes, phaser, registry</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial scenes validator — scans src/scenes/, checks phaser.config.ts registration.</item>
  <item>Migration from werkstatt-game: renamed command and rule IDs from game.* to phaser.*.</item>
  <item>Restrict keyRegex to only match keys inside scene arrays to prevent false positives from other config objects.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ScenesValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface ScenesValidateData {
  command: string;
  status: "pass" | "fail";
  violations: ScenesValidateViolation[];
}

const SCENES_DIR = "src/scenes";
const PHASER_CONFIG = "phaser.config.ts";

export async function validateScenes(
  projectRoot: string,
): Promise<KernelCommandResult<ScenesValidateData>> {
  const violations: ScenesValidateViolation[] = [];

  const sceneFiles = await listSceneFiles(join(projectRoot, SCENES_DIR));
  const sceneClassNames = await extractSceneClassNames(projectRoot, sceneFiles);

  const configContent = await readPhaserConfig(projectRoot);
  const registeredScenes = extractRegisteredScenes(configContent);

  for (const { fileName, className } of sceneClassNames) {
    if (!registeredScenes.has(className)) {
      violations.push({
        ruleId: "PHASER-01",
        file: `${SCENES_DIR}/${fileName}`,
        message: `Scene class "${className}" not registered in ${PHASER_CONFIG}`,
      });
    }
  }

  if (sceneClassNames.length === 0) {
    violations.push({
      ruleId: "PHASER-01",
      file: SCENES_DIR,
      message: `No scenes found in ${SCENES_DIR}/ — at least one scene (boot) is required`,
    });
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "phaser.scenes.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `phaser.scenes.validate: ${status} (${violations.length} violations)`,
  };
}

async function listSceneFiles(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts"))
    .map((e) => e.name);
}

async function extractSceneClassNames(
  projectRoot: string,
  fileNames: string[],
): Promise<Array<{ fileName: string; className: string }>> {
  const results: Array<{ fileName: string; className: string }> = [];
  for (const fileName of fileNames) {
    const content = await readFile(join(projectRoot, SCENES_DIR, fileName), "utf-8");
    const match = content.match(/export\s+class\s+([A-Z][A-Za-z0-9_]*)/);
    if (match) {
      results.push({ fileName, className: match[1]! });
    }
  }
  return results;
}

async function readPhaserConfig(projectRoot: string): Promise<string> {
  try {
    return await readFile(join(projectRoot, PHASER_CONFIG), "utf-8");
  } catch {
    return "";
  }
}

function extractRegisteredScenes(configContent: string): Set<string> {
  const scenes = new Set<string>();
  const sceneRegex = /scene\s*:\s*([A-Z][A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = sceneRegex.exec(configContent)) !== null) {
    scenes.add(match[1]!);
  }
  const sceneKeyRegex = /scenes?\s*:\s*\[[\s\S]*?\{\s*key\s*:\s*["']([A-Za-z0-9_-]+)["']/g;
  while ((match = sceneKeyRegex.exec(configContent)) !== null) {
    scenes.add(match[1]!);
  }
  return scenes;
}

export function createScenesValidateCommand(): KernelCommandDefinition<ScenesValidateData> {
  return {
    name: "phaser.scenes.validate",
    description: "Validate scene registry consistency (PHASER-01)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateScenes(context.workspaceRoot);
    },
  };
}
