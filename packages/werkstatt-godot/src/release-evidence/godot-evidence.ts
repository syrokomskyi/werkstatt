/*
<MODULE_CONTRACT>
<purpose>Godot release evidence hook — generates hashes for all project artifacts.</purpose>
<keywords>release, evidence, godot, hash</keywords>
<responsibilities>
  <item>Computes SHA-256 hash of project.godot.</item>
  <item>Computes SHA-256 hash of all .tscn scene files.</item>
  <item>Computes SHA-256 hash of all .cs script files.</item>
  <item>Computes SHA-256 hash of all .tres resource files.</item>
  <item>Computes SHA-256 hash of .csproj and .sln project files.</item>
  <item>Computes SHA-256 hash of .import files in .godot/imported/.</item>
  <item>Returns evidence object with all hashes and counts.</item>
</responsibilities>
<non-goals>
  <item>Does not verify hashes — that is the integrity module's job.</item>
  <item>Does not modify files — read-only hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial release evidence hook — project hash, scene hash, script hash.</item>
  <item>Fix: use shared listFilesRecursive from utils/list-files-recursive.ts, remove duplicated local function.</item>
  <item>Enhancement: add .tres, .csproj, .sln, and .import file hashing for complete evidence coverage.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { listFilesRecursive } from "../utils/list-files-recursive.ts";

export interface GodotReleaseEvidence {
  projectHash: string;
  scenesHash: string;
  scriptsHash: string;
  resourcesHash: string;
  projectFilesHash: string;
  importHash: string;
  sceneCount: number;
  scriptCount: number;
  resourceCount: number;
  importCount: number;
  generatedAt: string;
}

const SKIP_DIRS = ["bin", "obj", ".git", "node_modules"];

export async function generateGodotEvidence(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;

  const projectHash = await hashFile(join(projectRoot, "project.godot"));
  const sceneFiles = await listFilesRecursive(join(projectRoot, "Scenes"), ".tscn");
  const scriptFiles = await listFilesRecursive(join(projectRoot, "Scripts"), ".cs");
  const resourceFiles = await listFilesRecursive(join(projectRoot, "Resources"), ".tres");
  const csprojFiles = await listFilesRecursive(projectRoot, ".csproj", SKIP_DIRS);
  const slnFiles = await listFilesRecursive(projectRoot, ".sln", SKIP_DIRS);
  const importFiles = await listFilesRecursive(join(projectRoot, ".godot", "imported"), ".import");

  const scenesHash = await hashFiles(sceneFiles);
  const scriptsHash = await hashFiles(scriptFiles);
  const resourcesHash = await hashFiles(resourceFiles);
  const projectFilesHash = await hashFiles([...csprojFiles, ...slnFiles]);
  const importHash = await hashFiles(importFiles);

  const evidence: GodotReleaseEvidence = {
    projectHash,
    scenesHash,
    scriptsHash,
    resourcesHash,
    projectFilesHash,
    importHash,
    sceneCount: sceneFiles.length,
    scriptCount: scriptFiles.length,
    resourceCount: resourceFiles.length,
    importCount: importFiles.length,
    generatedAt: new Date().toISOString(),
  };

  ctx.logger.info("release-evidence: generated", evidence);

  return {
    success: true,
    data: evidence,
  };
}

async function hashFile(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

async function hashFiles(filePaths: string[]): Promise<string> {
  if (filePaths.length === 0) {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
  const hasher = createHash("sha256");
  for (const filePath of filePaths.sort()) {
    const content = await readFile(filePath);
    hasher.update(content);
  }
  return hasher.digest("hex");
}
