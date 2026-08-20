/*
<MODULE_CONTRACT>
<purpose>Shared recursive file listing utility for Godot validators and evidence hooks.</purpose>
<keywords>utility, files, recursive, shared</keywords>
<non-goals>
  <item>Do not import from any @warpgogol/* package — pure filesystem utility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial shared listFilesRecursive — extracted from scene-validate and godot-evidence to remove duplication.</item>
</CHANGE_SUMMARY>
*/

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";

export async function listFilesRecursive(
  dir: string,
  ext: string,
  skipDirs: string[] = [],
): Promise<string[]> {
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
      if (skipDirs.includes(entry.name)) {
        continue;
      }
      results.push(...(await listFilesRecursive(fullPath, ext, skipDirs)));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}
