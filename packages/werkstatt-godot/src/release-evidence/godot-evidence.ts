/*
<MODULE_CONTRACT>
<purpose>Godot release evidence hook — generates project hash, scene hash, script hash.</purpose>
<keywords>release, evidence, godot, hash</keywords>
<responsibilities>
  <item>Computes SHA-256 hash of project.godot.</item>
  <item>Computes SHA-256 hash of all .tscn scene files.</item>
  <item>Computes SHA-256 hash of all .cs script files.</item>
  <item>Returns evidence object with all hashes.</item>
</responsibilities>
<non-goals>
  <item>Does not verify hashes — that is the integrity module's job.</item>
  <item>Does not modify files — read-only hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial release evidence hook — project hash, scene hash, script hash.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

export interface GodotReleaseEvidence {
  projectHash: string;
  scenesHash: string;
  scriptsHash: string;
  sceneCount: number;
  scriptCount: number;
  generatedAt: string;
}

export async function generateGodotEvidence(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;

  const projectHash = await hashFile(join(projectRoot, "project.godot"));
  const sceneFiles = await listFilesRecursive(join(projectRoot, "Scenes"), ".tscn");
  const scriptFiles = await listFilesRecursive(join(projectRoot, "Scripts"), ".cs");

  const scenesHash = await hashFiles(sceneFiles);
  const scriptsHash = await hashFiles(scriptFiles);

  const evidence: GodotReleaseEvidence = {
    projectHash,
    scenesHash,
    scriptsHash,
    sceneCount: sceneFiles.length,
    scriptCount: scriptFiles.length,
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
