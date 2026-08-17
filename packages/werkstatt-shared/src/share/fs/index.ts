/*
<MODULE_CONTRACT>
<purpose>Canonical Node build-time filesystem primitives shared across every packages/os/* command and validator: recursive directory collection, existence checks, JSON reads.</purpose>
<non-goals>
  <item>Do not write files — all writes flow through writeFileAtomic / WorkspaceIO (RFC-0258/RFC-0267).</item>
  <item>Do not run in the browser — this module is server-only (Node fs/promises).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted as the single canonical home for fs helpers previously duplicated across packages/os/*.</item>
</CHANGE_SUMMARY>
*/

// Server-only. Do not import from browser/client scripts.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";

export interface CollectFilesOptions {
  /** Only include files whose name ends with one of these (e.g. [".md", ".astro"]). Omit = all files. */
  extensions?: string[];
  /** Return true to skip a directory or file entry by name. Default: name starts with "-" or "old-". */
  ignore?: (name: string) => boolean;
  /** Include directory paths in the result too. Default false (files only). */
  withDirs?: boolean;
}

function defaultIgnore(name: string): boolean {
  return name.startsWith("-") || name.startsWith("old-");
}

/**
 * Recursively collects file paths under `root`.
 * Swallows readdir errors per-branch by returning no entries for that branch.
 */
export async function collectFiles(
  root: string,
  options: CollectFilesOptions = {},
): Promise<string[]> {
  const { extensions, ignore = defaultIgnore, withDirs = false } = options;
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ignore(entry.name)) continue;

      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (withDirs) results.push(full);
        await walk(full);
        continue;
      }

      if (!entry.isFile()) continue;

      if (extensions && !extensions.some((ext) => entry.name.endsWith(ext))) continue;

      results.push(full);
    }
  }

  await walk(root);
  return results;
}

/**
 * Best-effort existence check for a path (file or directory).
 * Returns `false` on any filesystem error (ENOENT, EACCES, etc.).
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T = unknown>(path: string): Promise<T> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as T;
}

export async function readYamlFile<T = unknown>(path: string): Promise<T> {
  const raw = await readFile(path, "utf-8");
  return yamlParse(raw) as T;
}
