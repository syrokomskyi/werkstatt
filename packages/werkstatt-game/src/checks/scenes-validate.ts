/*
<MODULE_CONTRACT>
<purpose>game.scenes.validate — checks scene registry consistency (GAME-01, RFC-0777).</purpose>
<keywords>validator, scenes, game, registry</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: initial scenes validator — scans src/scenes/, checks phaser.config.ts registration.</item>
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

  // Scan src/scenes/*.ts and extract exported class names
  const sceneFiles = await listSceneFiles(join(projectRoot, SCENES_DIR));
  const sceneClassNames = await extractSceneClassNames(projectRoot, sceneFiles);

  // Read phaser.config.ts to find registered scenes
  const configContent = await readPhaserConfig(projectRoot);
  const registeredScenes = extractRegisteredScenes(configContent);

  // GAME-01: every scene class must be registered in phaser.config.ts
  for (const { fileName, className } of sceneClassNames) {
    if (!registeredScenes.has(className)) {
      violations.push({
        ruleId: "GAME-01",
        file: `${SCENES_DIR}/${fileName}`,
        message: `Scene class "${className}" not registered in ${PHASER_CONFIG}`,
      });
    }
  }

  // Zero scenes = GAME-01 violation
  if (sceneClassNames.length === 0) {
    violations.push({
      ruleId: "GAME-01",
      file: SCENES_DIR,
      message: `No scenes found in ${SCENES_DIR}/ — at least one scene (boot) is required`,
    });
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "game.scenes.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `game.scenes.validate: ${status} (${violations.length} violations)`,
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
  // Match scene class references: { key: "SceneName", scene: SceneName }
  // or scene imports/registrations like `scene: BootScene` or `"BootScene"`
  const sceneRegex = /scene\s*:\s*([A-Z][A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = sceneRegex.exec(configContent)) !== null) {
    scenes.add(match[1]!);
  }
  // Also match key: "scene-name" patterns
  const keyRegex = /key\s*:\s*["']([A-Za-z0-9_-]+)["']/g;
  while ((match = keyRegex.exec(configContent)) !== null) {
    scenes.add(match[1]!);
  }
  return scenes;
}

export function createScenesValidateCommand(): KernelCommandDefinition<ScenesValidateData> {
  return {
    name: "game.scenes.validate",
    description: "Validate scene registry consistency (GAME-01)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateScenes(context.workspaceRoot);
    },
  };
}
