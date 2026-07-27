/*
<MODULE_CONTRACT>
<purpose>Shared text/file helpers used across the checks/* validator suite: the reserved
directory ignore predicate, the extension-filtered file collector, and comment/url
length-preserving strippers used by the token/color lints.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of checks.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { collectFiles } from "@warpgogol/share/fs";
import { getLineColumn } from "@warpgogol/share/text-position";
import type { KernelCommandInput } from "@warpgogol/site-kernel";
export { getLineColumn };

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  ".astro",
  ".wrangler",
  ".vscode",
]);

export function shouldIgnoreDir(dirName: string): boolean {
  if (IGNORED_DIRECTORY_NAMES.has(dirName)) return true;
  if (dirName.startsWith("old-")) return true;
  if (dirName.startsWith("-")) return true;
  return false;
}

export async function collectFilesByExtensions(
  dirPath: string,
  extensions: Set<string>,
): Promise<string[]> {
  return collectFiles(dirPath, {
    extensions: [...extensions],
    ignore: shouldIgnoreDir,
  });
}

export function stripBlockCommentsPreserveLength(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    let replaced = "";
    for (const ch of match) {
      replaced += ch === "\n" ? "\n" : " ";
    }
    return replaced;
  });
}

export function stripUrlsPreserveLength(text: string): string {
  return text.replace(/\burl\(\s*(?:[^)"']+|"[^"]*"|'[^']*')\s*\)/g, (match) => {
    let replaced = "";
    for (const ch of match) {
      replaced += ch === "\n" ? "\n" : " ";
    }
    return replaced;
  });
}

export function getFlagValues(input: KernelCommandInput, key: string): string[] {
  const value = input.flags[key];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return typeof value === "string" ? [value] : [];
}
