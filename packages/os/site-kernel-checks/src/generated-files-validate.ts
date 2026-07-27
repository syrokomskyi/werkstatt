/*
<MODULE_CONTRACT>
<purpose>
  RFC-0375: generated.files.validate — checks that every registry-declared
  generated file in GENERATOR_OWNERSHIP_MAP exists on disk. Covers both
  Category A (embedded) and Category B (registry-only). Expands glob patterns
  via collectFiles from @warpgogol/share/fs.
</purpose>
<non-goals>
  <item>Do not check marker presence — use generated.marker.validate for that.</item>
  <item>Do not modify any files — read-only validation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0375: initial implementation.</item>
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
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";
import { GENERATOR_OWNERSHIP_MAP, type OwnershipEntry } from "./generator-ownership.ts";

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

const WORKSPACE_ABSOLUTE_PREFIXES = ["packages/", "docs/", "apps/", ".gitattributes", ".env"];

function isWorkspaceAbsolute(path: string): boolean {
  const posixPath = toPosix(path);
  return WORKSPACE_ABSOLUTE_PREFIXES.some((prefix) => posixPath.startsWith(prefix));
}

function resolveEntryPath(
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

function hasGlobPattern(path: string): boolean {
  return path.includes("*") || path.includes("{");
}

async function checkFileExists(io: WorkspaceIO, filePath: string): Promise<boolean> {
  return io.exists(filePath);
}

async function expandGlob(
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
          const subPath = join(dir, remaining);
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

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    const isWorkspaceAbs = isWorkspaceAbsolute(entry.path);

    if (!isWorkspaceAbs && !app) {
      continue;
    }

    const resolvedPath = resolveEntryPath(
      entry,
      app,
      context.workspaceRoot,
      context.site?.directory,
    );
    const posixPath = toPosix(entry.path);

    if (hasGlobPattern(posixPath)) {
      try {
        const files = await expandGlob(
          isWorkspaceAbs
            ? context.workspaceRoot
            : (context.site?.directory ?? join(context.workspaceRoot, "apps", app!)),
          posixPath,
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
      const exists = await checkFileExists(context.io, resolvedPath);
      if (!exists) {
        const relPath = toPosix(relative(context.workspaceRoot, resolvedPath));
        diagnostics.push({
          ruleId: "GEN-FILES-01",
          severity: "error",
          file: relPath,
          message: `Registry-declared generated file "${relPath}" (owner: ${entry.command}) does not exist on disk.`,
          fixHint: `Run \`pnpm exec site-kernel run ${entry.command}${app ? ` --site ${app}` : ""}\` to regenerate it.`,
        });
      }
    }
  }

  return diagnosticsResult("generated.files.validate", diagnostics);
}
