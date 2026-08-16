/*
<MODULE_CONTRACT>
<purpose>godot.context.generate — produces a structured summary of a Godot project for AI agent context.</purpose>
<keywords>context, ai, summary, godot, agent</keywords>
<responsibilities>
  <item>Reads project.godot and extracts: main scene, autoloads, input actions, rendering settings, display/stretch settings.</item>
  <item>Lists all .tscn scenes, .cs scripts, .tres resources with their paths.</item>
  <item>Lists installed addons with enabled status from project.godot [editor_plugins].</item>
  <item>Returns a structured object that agents can use as project context.</item>
</responsibilities>
<non-goals>
  <item>Does not validate the project — use validators for that.</item>
  <item>Does not read file contents beyond project.godot — only lists paths.</item>
  <item>Does not generate AI prompts — the structured data is the output.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial AI context generator — godot.context.generate.</item>
  <item>Enhancement: add addons list, enabled plugins, display/stretch settings.
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";
import { listFilesRecursive } from "../utils/list-files-recursive.ts";

export interface GodotAddonInfo {
  name: string;
  enabled: boolean;
  hasPluginCfg: boolean;
  hasCsproj: boolean;
}

export interface GodotProjectContext {
  command: string;
  projectRoot: string;
  mainScene: string | null;
  autoloads: { name: string; path: string }[];
  inputActions: string[];
  renderer: string | null;
  stretchMode: string | null;
  stretchAspect: string | null;
  windowWidth: number | null;
  windowHeight: number | null;
  scenes: string[];
  scripts: string[];
  resources: string[];
  addons: GodotAddonInfo[];
  csprojExists: boolean;
  slnExists: boolean;
  exportPresetsExist: boolean;
}

export type ContextGenerateData = GodotProjectContext;

const SKIP_DIRS = ["bin", "obj", ".godot", ".git", "node_modules"];

export async function generateContext(
  projectRoot: string,
): Promise<KernelCommandResult<ContextGenerateData>> {
  const projectGodotPath = join(projectRoot, "project.godot");

  if (!existsSync(projectGodotPath)) {
    return {
      data: {
        command: "godot.context.generate",
        projectRoot,
        mainScene: null,
        autoloads: [],
        inputActions: [],
        renderer: null,
        stretchMode: null,
        stretchAspect: null,
        windowWidth: null,
        windowHeight: null,
        scenes: [],
        scripts: [],
        resources: [],
        addons: [],
        csprojExists: false,
        slnExists: false,
        exportPresetsExist: false,
      },
      exitCode: 1,
      summary: "godot.context.generate: fail (no project.godot)",
    };
  }

  const projectGodot = await readFile(projectGodotPath, "utf-8");

  // Extract main scene
  const mainSceneMatch = projectGodot.match(/^run\/main_scene="([^"]+)"/m);
  const mainScene = mainSceneMatch?.[1] ?? null;

  // Extract autoloads
  const autoloads: { name: string; path: string }[] = [];
  const autoloadPattern = /^autoload\/([^=]+)="([^"]+)"/gm;
  let match: RegExpExecArray | null;
  while ((match = autoloadPattern.exec(projectGodot)) !== null) {
    autoloads.push({ name: match[1]!, path: match[2]! });
  }

  // Extract input actions
  const inputActions: string[] = [];
  const inputPattern = /^input\/([^=]+)=/gm;
  while ((match = inputPattern.exec(projectGodot)) !== null) {
    inputActions.push(match[1]!);
  }

  // Extract renderer
  const rendererMatch = projectGodot.match(
    /^rendering\/renderer\/rendering_method="([^"]+)"/m,
  );
  const renderer = rendererMatch?.[1] ?? null;

  // Extract stretch mode
  const stretchModeMatch = projectGodot.match(
    /^display\/window\/stretch\/mode="([^"]+)"/m,
  );
  const stretchMode = stretchModeMatch?.[1] ?? null;

  // Extract stretch aspect
  const stretchAspectMatch = projectGodot.match(
    /^display\/window\/stretch\/aspect="([^"]+)"/m,
  );
  const stretchAspect = stretchAspectMatch?.[1] ?? null;

  // Extract window size
  const windowWidthMatch = projectGodot.match(
    /^display\/window\/size\/viewport_width=(\d+)/m,
  );
  const windowWidth = windowWidthMatch ? parseInt(windowWidthMatch[1]!, 10) : null;
  const windowHeightMatch = projectGodot.match(
    /^display\/window\/size\/viewport_height=(\d+)/m,
  );
  const windowHeight = windowHeightMatch ? parseInt(windowHeightMatch[1]!, 10) : null;

  // List files
  const [scenes, scripts, resources] = await Promise.all([
    listFilesRecursive(projectRoot, ".tscn", SKIP_DIRS),
    listFilesRecursive(projectRoot, ".cs", SKIP_DIRS),
    listFilesRecursive(projectRoot, ".tres", SKIP_DIRS),
  ]);

  // List addons
  const addons: GodotAddonInfo[] = [];
  const addonsDir = join(projectRoot, "addons");
  if (existsSync(addonsDir)) {
    const addonEntries = await readdir(addonsDir, { withFileTypes: true });
    for (const entry of addonEntries.filter((e) => e.isDirectory())) {
      const addonName = entry.name;
      const addonPath = join(addonsDir, addonName);
      const hasPluginCfg = existsSync(join(addonPath, "plugin.cfg"));
      const hasCsproj = existsSync(join(addonPath, `${addonName}.csproj`));
      const enabledPattern = new RegExp(
        `^\\[editor_plugins\\][^[]*enabled=.*"res://addons/${addonName}"`,
        "ms",
      );
      const enabled = enabledPattern.test(projectGodot);
      addons.push({ name: addonName, enabled, hasPluginCfg, hasCsproj });
    }
  }

  const data: GodotProjectContext = {
    command: "godot.context.generate",
    projectRoot: relative(projectRoot, projectRoot) || ".",
    mainScene,
    autoloads,
    inputActions,
    renderer,
    stretchMode,
    stretchAspect,
    windowWidth,
    windowHeight,
    scenes: scenes.map((f) => relative(projectRoot, f)),
    scripts: scripts.map((f) => relative(projectRoot, f)),
    resources: resources.map((f) => relative(projectRoot, f)),
    addons,
    csprojExists: existsSync(join(projectRoot, "Game.csproj")),
    slnExists: existsSync(join(projectRoot, "Game.sln")),
    exportPresetsExist: existsSync(join(projectRoot, "export_presets.cfg")),
  };

  return {
    data,
    exitCode: 0,
    summary: `godot.context.generate: ${data.scenes.length} scenes, ${data.scripts.length} scripts, ${data.resources.length} resources, ${data.autoloads.length} autoloads, ${data.inputActions.length} input actions, ${data.addons.length} addons`,
  };
}

export function createContextGenerateCommand(): KernelCommandDefinition<ContextGenerateData> {
  return {
    name: "godot.context.generate",
    description: "Generate structured project context for AI agents",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return generateContext(context.workspaceRoot);
    },
  };
}
