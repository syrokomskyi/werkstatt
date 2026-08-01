/*
<MODULE_CONTRACT>
<purpose>
RFC-0390: Command-result cache helpers. Computes cache keys from declared
`reads` file hashes and command module source hashes, and provides get/set
helpers for storing and retrieving KernelExecutionReport objects in the
`command_results` cache namespace. All hashing uses @warpgogol/fingerprint (DNA-53).
</purpose>
<non-goals>
  <item>Do not implement cache storage — that lives in cache-layer.ts and sqlite-cache-layer.ts.</item>
  <item>Do not implement pipeline execution logic — that lives in runtime/execute-pipeline.ts.</item>
  <item>Do not validate `reads` declarations — that lives in command.reads.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0390: initial implementation — COMMAND_RESULT_CACHE_NAMESPACE, CommandResultCacheKey, buildCommandResultCacheKey, computeInputsHash, computeModuleHash, getCachedCommandResult, setCachedCommandResult.</item>
  <item>RFC-0637: add modulePaths parameter to computeModuleHash for granular per-command module hashing.</item>
</CHANGE_SUMMARY>
*/

import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Dirent } from "node:fs";
import picomatch from "picomatch";

import { byteHash, stableJsonHash } from "@warpgogol/fingerprint";
import { fingerprintFile, fingerprintTree } from "@warpgogol/fingerprint/semantic";

import type { CacheLayer } from "./cache-layer.ts";
import type { KernelExecutionReport } from "../types.ts";

export const COMMAND_RESULT_CACHE_NAMESPACE = "command_results";
export const COMMAND_RESULT_CACHE_SCHEMA_VERSION = 1;

export interface CommandResultCacheKey {
  schemaVersion: number;
  commandName: string;
  siteName: string | null;
  inputsHash: string;
  moduleHash: string;
}

/**
 * Build a stable string key from a CommandResultCacheKey for CacheLayer.get/set.
 */
export function buildCommandResultCacheKey(key: CommandResultCacheKey): string {
  return stableJsonHash({
    v: key.schemaVersion,
    cmd: key.commandName,
    site: key.siteName,
    in: key.inputsHash,
    mod: key.moduleHash,
  });
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/**
 * Resolve `<app>` token in a read pattern relative to the base directory,
 * then return the workspace-root-relative POSIX path.
 */
function resolvePattern(pattern: string, baseDir: string, workspaceRoot: string): string {
  const resolved = pattern.replace("<app>", toPosix(relative(workspaceRoot, baseDir)));
  return resolved;
}

/**
 * Expand picomatch globs relative to the workspace root and return matching
 * absolute file paths.
 */
async function expandGlobs(
  patterns: string[],
  baseDir: string,
  workspaceRoot: string,
): Promise<string[]> {
  const resolvedPatterns = patterns.map((p) => resolvePattern(p, baseDir, workspaceRoot));
  const isMatch = picomatch(resolvedPatterns, { dot: true, nocase: false });
  const matched = new Set<string>();

  // fs.walk.lint: allow — this walker matches files against picomatch glob
  // patterns relative to the workspace root, a contract collectFiles does not support (RFC-0390).
  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = toPosix(relative(workspaceRoot, abs));
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile() && isMatch(rel)) {
        matched.add(abs);
      }
    }
  }

  await walk(workspaceRoot);
  return [...matched].sort();
}

/**
 * Compute a deterministic hash of all files matching the declared `reads`
 * patterns. Uses @warpgogol/fingerprint semantic mode for supported file types
 * and byte mode for others. Returns a stable composite hash.
 *
 * Returns a constant hash for empty `reads` (should not be called with empty
 * reads in practice — the pipeline executor checks cacheable/reads first).
 */
export async function computeInputsHash(
  reads: string[],
  baseDir: string,
  workspaceRoot: string,
): Promise<string> {
  if (reads.length === 0) {
    return stableJsonHash({ reads: [] });
  }

  const files = await expandGlobs(reads, baseDir, workspaceRoot);
  const hashes: { path: string; hash: string }[] = [];
  for (const abs of files) {
    const rel = toPosix(relative(workspaceRoot, abs));
    const result = await fingerprintFile(abs, { mode: "semantic" });
    hashes.push({ path: rel, hash: result.hash });
  }
  return stableJsonHash({ files: hashes });
}

/**
 * Compute a deterministic hash of a command module's source directory.
 * Uses @warpgogol/fingerprint fingerprintTree in semantic mode.
 * The caller should cache this per-package per-pipeline-run.
 *
 * RFC-0637: when `modulePaths` is provided and non-empty, fingerprints only
 * the listed paths (files and/or directories relative to `moduleSrcDir`)
 * instead of the full `src/` directory. Non-existent paths are silently
 * skipped. When `modulePaths` is absent or empty, falls back to full `src/`
 * directory fingerprint (backward compatible).
 */
export async function computeModuleHash(
  moduleSrcDir: string,
  modulePaths?: string[],
): Promise<string> {
  if (modulePaths && modulePaths.length > 0) {
    const hashes: string[] = [];
    for (const p of modulePaths) {
      const abs = join(moduleSrcDir, p);
      if (!existsSync(abs)) continue;
      const s = await stat(abs);
      if (s.isDirectory()) {
        const result = await fingerprintTree(abs, {
          mode: "semantic",
          ignore: ["__tests__", "node_modules", "dist"],
        });
        hashes.push(`${p}:${result.value}`);
      } else {
        const result = await fingerprintFile(abs, { mode: "semantic" });
        hashes.push(`${p}:${result.hash}`);
      }
    }
    return stableJsonHash({ paths: hashes });
  }
  try {
    const result = await fingerprintTree(moduleSrcDir, {
      mode: "semantic",
      ignore: ["__tests__", "node_modules", "dist"],
    });
    return result.value;
  } catch {
    return byteHash(`module-hash-fallback:${moduleSrcDir}`);
  }
}

/**
 * Retrieve a cached command result. Returns null on miss, unavailable cache,
 * or schema version mismatch. Sets `cached: true` on the returned report.
 */
export async function getCachedCommandResult(
  cache: CacheLayer,
  key: CommandResultCacheKey,
): Promise<KernelExecutionReport | null> {
  if (!cache.available) return null;

  const cacheKey = buildCommandResultCacheKey(key);
  const entry = await cache.get(COMMAND_RESULT_CACHE_NAMESPACE, cacheKey);
  if (!entry) return null;

  const report = entry.data as KernelExecutionReport;
  if (!report || typeof report !== "object") return null;

  return { ...report, cached: true };
}

/**
 * Store a command result in the cache. Only called for successful (ok: true)
 * results — the pipeline executor must not call this for failed commands.
 */
export async function setCachedCommandResult(
  cache: CacheLayer,
  key: CommandResultCacheKey,
  report: KernelExecutionReport,
): Promise<void> {
  if (!cache.available) return;

  const cacheKey = buildCommandResultCacheKey(key);
  const mtime = Date.now();
  const contentHash = stableJsonHash({
    commandName: report.commandName,
    ok: report.ok,
    exitCode: report.exitCode,
  });
  await cache.set(COMMAND_RESULT_CACHE_NAMESPACE, cacheKey, report, mtime, contentHash);
}
