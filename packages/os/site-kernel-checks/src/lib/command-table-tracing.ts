/*
<MODULE_CONTRACT>
<purpose>
Shared utilities for command-table handler tracing and TypeScript file
collection. Used by kernel-flags-lint.ts (RFC-0260) and command-args-validate.ts
(RFC-0610) to avoid duplication of brace-matching, function-body extraction,
and file-discovery logic.
</purpose>
<non-goals>
  <item>Do not include domain-specific patterns or rule logic — this module is purely structural.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0610: extracted from kernel-flags-lint.ts and command-args-validate.ts to eliminate duplication.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_IGNORED_DIRS = new Set([
  ".astro",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export async function collectTsFiles(
  workspaceRoot: string,
  relativeDir: string,
  ignoredDirs: Set<string> = DEFAULT_IGNORED_DIRS,
): Promise<string[]> {
  const absoluteDir = join(workspaceRoot, relativeDir);
  const files: string[] = [];

  async function visit(currentAbsoluteDir: string, currentRelativeDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentAbsoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        await visit(join(currentAbsoluteDir, entry.name), `${currentRelativeDir}/${entry.name}`);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".pbt.test.ts")) continue;
      files.push(toPosixPath(`${currentRelativeDir}/${entry.name}`));
    }
  }

  await visit(absoluteDir, relativeDir);
  return files;
}

export function extractObjectBlock(source: string, markerIndex: number): string | undefined {
  const start = source.lastIndexOf("{", markerIndex);
  if (start === -1) return undefined;

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return undefined;
}

export function extractCommandTableHandlers(
  source: string,
): Array<{ command: string; functionName: string }> {
  const handlers: Array<{ command: string; functionName: string }> = [];
  const namePattern = /name:\s*"([^"]+)"/g;

  for (const match of source.matchAll(namePattern)) {
    const command = match[1];
    if (!command || match.index === undefined) continue;

    const block = extractObjectBlock(source, match.index);
    if (!block) continue;

    const executeMatch = block.match(/\bexecute:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    const functionName = executeMatch?.[1];
    if (!functionName) continue;

    handlers.push({ command, functionName });
  }

  return handlers;
}

export function extractFunctionBody(source: string, functionName: string): string | undefined {
  const marker = `function ${functionName}(`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return undefined;
  const braceStart = source.indexOf("{", markerIndex);
  if (braceStart === -1) return undefined;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, index + 1);
    }
  }
  return source.slice(braceStart);
}

export async function indexFunctionSources(
  workspaceRoot: string,
  functionNames: Set<string>,
): Promise<Map<string, string>> {
  const sourcesByFunction = new Map<string, Set<string>>();
  const candidateFiles = await collectTsFiles(workspaceRoot, "packages");
  const functionDeclarationPattern = /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;

  for (const file of candidateFiles) {
    let source: string;
    try {
      source = await readFile(join(workspaceRoot, file), "utf8");
    } catch {
      continue;
    }

    for (const match of source.matchAll(functionDeclarationPattern)) {
      const functionName = match[1];
      if (!functionName || !functionNames.has(functionName)) continue;
      if (!extractFunctionBody(source, functionName)) continue;

      const files = sourcesByFunction.get(functionName) ?? new Set<string>();
      files.add(file);
      sourcesByFunction.set(functionName, files);
    }
  }

  const uniqueSources = new Map<string, string>();
  for (const [functionName, files] of sourcesByFunction) {
    if (files.size === 1) uniqueSources.set(functionName, [...files][0] ?? "");
  }
  return uniqueSources;
}
