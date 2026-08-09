/*
<MODULE_CONTRACT>
<purpose>
  RFC-0375: generated.files.validate — checks that every registry-declared
  generated file in GENERATOR_OWNERSHIP_MAP exists on disk. Covers both
  Category A (embedded) and Category B (registry-only). Expands glob patterns
  via collectFiles from @warpgogol/werkstatt-site/share/fs.
</purpose>
<non-goals>
  <item>Do not check marker presence — use generated.marker.validate for that.</item>
  <item>Do not modify any files — read-only validation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0375: initial implementation.</item>
  <item>RFC-0612: extract expandOwnershipPlaceholders as shared utility for reuse by ownership.sync.validate and generated.stale.validate.</item>
  <item>RFC-0790: replace systems/registry.yaml IO with convention-based discoverSystems + resolveCacheClonePath from @warpgogol/werkstatt/sternsystem.</item>
</CHANGE_SUMMARY>
*/
import { join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
  WorkspaceIO,
} from "@warpgogol/werkstatt/kernel";
import {
  resolveCacheClonePath as resolveCacheClonePathSync,
  discoverSystems,
} from "@warpgogol/werkstatt/sternsystem";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";
import { GENERATOR_OWNERSHIP_MAP, type OwnershipEntry } from "./generator-ownership.ts";

export function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

export const WORKSPACE_ABSOLUTE_PREFIXES = [
  "packages/",
  "docs/",
  "apps/",
  "systems/",
  ".gitattributes",
  ".env",
];

export function isWorkspaceAbsolute(path: string): boolean {
  const posixPath = toPosix(path);
  return WORKSPACE_ABSOLUTE_PREFIXES.some((prefix) => posixPath.startsWith(prefix));
}

export function resolveEntryPath(
  entry: OwnershipEntry,
  app: string | undefined,
  workspaceRoot: string,
  siteDirectory?: string,
): string {
  const posixPath = toPosix(entry.path);

  if (isWorkspaceAbsolute(posixPath)) {
    return join(workspaceRoot, posixPath);
  }

  if (siteDirectory) {
    return join(siteDirectory, posixPath);
  }

  if (app) {
    return join(workspaceRoot, "apps", app, posixPath);
  }

  return join(workspaceRoot, "apps", "*", posixPath);
}

export function hasGlobPattern(path: string): boolean {
  return path.includes("*") || path.includes("{");
}

export function expandOwnershipPlaceholders(path: string, app?: string): string {
  return toPosix(path)
    .replace(/\{system\}/g, app ?? "*")
    .replace(/\{app\}/g, app ?? "*")
    .replace(/\{lang\}/g, "*")
    .replace(/\{route\}/g, "*")
    .replace(/\{slug\}/g, "*")
    .replace(/\{id\}/g, "*")
    .replace(/\{category\}/g, "*");
}

async function checkFileExists(io: WorkspaceIO, filePath: string): Promise<boolean> {
  return io.exists(filePath);
}

async function resolveAllCacheClonePaths(workspaceRoot: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const { systems } = await discoverSystems(workspaceRoot);
  for (const sys of systems) {
    result.set(sys.id, resolveCacheClonePathSync(workspaceRoot, sys.id));
  }
  return result;
}

export async function expandGlob(
  basePath: string,
  pattern: string,
  workspaceRoot: string,
): Promise<string[]> {
  const posixPattern = toPosix(pattern);
  const hasWildcards = (p: string): boolean => p.includes("*");

  if (!hasWildcards(posixPattern)) {
    return [join(basePath, posixPattern)];
  }

  const segments = posixPattern.split("/");
  let currentRoot = basePath;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg === "**") {
      const remaining = segments.slice(i + 1).join("/");
      if (remaining) {
        const extMatch = remaining.match(/\.[^.]+$/);
        const files = await collectFiles(currentRoot, {
          extensions: extMatch ? [extMatch[0]!] : undefined,
        });
        return files;
      }
      return collectFiles(currentRoot);
    }

    if (seg.includes("*")) {
      const remaining = segments.slice(i + 1).join("/");
      if (!remaining) {
        const allFiles = await collectFiles(currentRoot);
        const regex = new RegExp(
          "^" +
            seg
              .replace(/[.+^${}()|[\]\\]/g, "\\$&")
              .split("*")
              .join("[^/]*") +
            "$",
        );
        return allFiles.filter((f) => {
          const rel = toPosix(relative(currentRoot, f));
          const parts = rel.split("/");
          return regex.test(parts[parts.length - 1] ?? "");
        });
      }
      const subDirs = await collectFiles(currentRoot, { withDirs: true });
      const regex = new RegExp(
        "^" +
          seg
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .split("*")
            .join("[^/]*") +
          "$",
      );
      const matched: string[] = [];
      for (const dir of subDirs) {
        const rel = toPosix(relative(currentRoot, dir));
        const parts = rel.split("/");
        const lastPart = parts[parts.length - 1] ?? "";
        if (regex.test(lastPart)) {
          const _subPath = join(dir, remaining);
          const subFiles = await expandGlob(dir, remaining, workspaceRoot);
          matched.push(...subFiles);
        }
      }
      return matched;
    }

    currentRoot = join(currentRoot, seg);
  }

  return [currentRoot];
}

export async function runGeneratedFilesValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = input.flags.site as string | undefined;
  const diagnostics: Diagnostic[] = [];

  const systemsPrefix = "systems/";
  const allCacheClones = await resolveAllCacheClonePaths(context.workspaceRoot);

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    const isWorkspaceAbs = isWorkspaceAbsolute(entry.path);

    if (!isWorkspaceAbs && !app) {
      continue;
    }

    if (entry.conditional) {
      continue;
    }

    const expandedPath = expandOwnershipPlaceholders(entry.path, app);

    if (isWorkspaceAbs && expandedPath.startsWith(systemsPrefix)) {
      const restAfterSystems = expandedPath.slice(systemsPrefix.length);
      const systemId = restAfterSystems.split("/")[0]!;
      const restAfterSystemId = restAfterSystems.slice(systemId.length + 1);

      if (systemId === "*") {
        let foundAny = false;
        for (const [sid, cachePath] of allCacheClones) {
          const resolvedPath = join(cachePath, restAfterSystemId);
          const exists = await checkFileExists(context.io, resolvedPath);
          if (exists) {
            foundAny = true;
          } else {
            diagnostics.push({
              ruleId: "GEN-FILES-01",
              severity: "error",
              file: toPosix(relative(context.workspaceRoot, resolvedPath)),
              message: `Registry-declared generated file for system "${sid}" (owner: ${entry.command}) does not exist on disk at ${resolvedPath}.`,
              fixHint: `Run \`pnpm exec werkstatt run ${entry.command} --system ${sid}\` to regenerate it.`,
            });
          }
        }
        if (!foundAny && allCacheClones.size === 0) {
          diagnostics.push({
            ruleId: "GEN-FILES-01",
            severity: "warning",
            message: `No systems found matching glob "${entry.path}" for command "${entry.command}".`,
          });
        }
        continue;
      }

      const cachePath =
        allCacheClones.get(systemId) ?? resolveCacheClonePathSync(context.workspaceRoot, systemId);
      if (cachePath) {
        const resolvedPath = join(cachePath, restAfterSystemId);
        const exists = await checkFileExists(context.io, resolvedPath);
        if (!exists) {
          diagnostics.push({
            ruleId: "GEN-FILES-01",
            severity: "error",
            file: `systems/${systemId}/${restAfterSystemId}`,
            message: `Registry-declared generated file "systems/${systemId}/${restAfterSystemId}" (owner: ${entry.command}) does not exist on disk.`,
            fixHint: `Run \`pnpm exec werkstatt run ${entry.command} --system ${systemId}\` to regenerate it.`,
          });
        }
        continue;
      }
    }

    if (hasGlobPattern(expandedPath)) {
      try {
        const files = await expandGlob(
          isWorkspaceAbs
            ? context.workspaceRoot
            : (context.site?.directory ?? join(context.workspaceRoot, "apps", app!)),
          expandedPath,
          context.workspaceRoot,
        );

        if (files.length === 0) {
          diagnostics.push({
            ruleId: "GEN-FILES-01",
            severity: "warning",
            message: `No files found matching glob "${entry.path}" for command "${entry.command}".`,
          });
        }
      } catch {
        diagnostics.push({
          ruleId: "GEN-FILES-01",
          severity: "warning",
          message: `Could not expand glob "${entry.path}" for command "${entry.command}".`,
        });
      }
    } else {
      const resolvedPath = resolveEntryPath(
        { ...entry, path: expandedPath },
        app,
        context.workspaceRoot,
        context.site?.directory,
      );
      const exists = await checkFileExists(context.io, resolvedPath);
      if (!exists) {
        const relPath = toPosix(relative(context.workspaceRoot, resolvedPath));
        diagnostics.push({
          ruleId: "GEN-FILES-01",
          severity: "error",
          file: relPath,
          message: `Registry-declared generated file "${relPath}" (owner: ${entry.command}) does not exist on disk.`,
          fixHint: `Run \`pnpm exec werkstatt run ${entry.command}${app ? ` --site ${app}` : ""}\` to regenerate it.`,
        });
      }
    }
  }

  return diagnosticsResult("generated.files.validate", diagnostics);
}
