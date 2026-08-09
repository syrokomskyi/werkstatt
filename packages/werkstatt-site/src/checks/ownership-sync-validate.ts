/*
<MODULE_CONTRACT>
<purpose>
  RFC-0612: ownership.sync.validate — detects registry drift between
  GENERATOR_OWNERSHIP_MAP and files on disk. Reports two diagnostics:
  OWN-01 (file on disk not covered by any ownership entry) and
  OWN-02 (ownership entry that matches no file on disk).
  Complements generated.stale.validate (RFC-0600) and generated.files.validate
  (RFC-0375) by checking the bidirectional sync between registry and filesystem.
</purpose>
<non-goals>
  <item>Do not check content drift — that is the domain of RFC-0601 (generated.drift.validate).</item>
  <item>Do not check for stale git-tracked files — that is the domain of RFC-0600 (generated.stale.validate).</item>
  <item>Do not auto-add missing entries to GENERATOR_OWNERSHIP_MAP — the command is informational.</item>
  <item>Do not check authored content files in src/content/ — they are not generated outputs.</item>
  <item>Do not apply the content-aware preview image exemption from generated.stale.validate — preview images must be covered by GENERATOR_OWNERSHIP_MAP entries with {lang}/{slug} placeholders. If a preview image generator is not registered, that is a legitimate OWN-01 finding.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0612: initial implementation.</item>
  <item>RFC-0612: extract shared expandOwnershipPlaceholders to generated-files-validate.ts (review fix).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";
import { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";
import {
  toPosix,
  isWorkspaceAbsolute,
  hasGlobPattern,
  resolveEntryPath,
  expandGlob,
  expandOwnershipPlaceholders,
} from "./generated-files-validate.ts";
import { STATIC_ASSET_EXEMPT_DIRS } from "./generated-stale-validate.ts";

const OWN_01_MESSAGE = "File on disk not covered by any GENERATOR_OWNERSHIP_MAP entry.";
const OWN_02_MESSAGE = "Ownership entry matches no file on disk (phantom registration).";

export async function runOwnershipSyncValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = input.flags.site as string | undefined;
  const diagnostics: Diagnostic[] = [];

  const siteDir =
    context.site?.directory ?? (app ? join(context.workspaceRoot, "apps", app) : undefined);
  if (!siteDir) {
    return diagnosticsResult("ownership.sync.validate", []);
  }

  const publicDir = join(siteDir, "public");

  // --- Build expected path set from GENERATOR_OWNERSHIP_MAP ---
  const expectedPaths = new Set<string>();
  const phantomEntries: Array<{
    entry: (typeof GENERATOR_OWNERSHIP_MAP)[number];
    resolvedPath: string;
  }> = [];

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    const isWorkspaceAbs = isWorkspaceAbsolute(entry.path);
    if (!isWorkspaceAbs && !app && !context.site?.directory) continue;

    const expandedPath = expandOwnershipPlaceholders(entry.path, app);

    if (hasGlobPattern(expandedPath)) {
      try {
        const basePath = isWorkspaceAbs
          ? context.workspaceRoot
          : (context.site?.directory ?? join(context.workspaceRoot, "apps", app!));
        const files = await expandGlob(basePath, expandedPath, context.workspaceRoot);
        for (const f of files) {
          expectedPaths.add(toPosix(f));
        }
        if (files.length === 0 && !entry.conditional) {
          const resolvedPath = isWorkspaceAbs
            ? join(context.workspaceRoot, expandedPath)
            : join(basePath, expandedPath);
          phantomEntries.push({ entry, resolvedPath });
        }
      } catch {
        // Glob expansion failures are non-fatal.
      }
    } else {
      const resolvedPath = resolveEntryPath(
        { ...entry, path: expandedPath },
        app,
        context.workspaceRoot,
        context.site?.directory,
      );
      expectedPaths.add(toPosix(resolvedPath));
      if (!entry.conditional) {
        const exists = await context.io.exists(resolvedPath);
        if (!exists) {
          phantomEntries.push({ entry, resolvedPath });
        }
      }
    }
  }

  // --- OWN-02: phantom registrations (entries matching no file) ---
  for (const { entry, resolvedPath } of phantomEntries) {
    const relPath = toPosix(relative(context.workspaceRoot, resolvedPath));
    diagnostics.push({
      ruleId: "OWN-02",
      severity: "warning",
      file: relPath,
      message: OWN_02_MESSAGE,
      fixHint: `Remove stale entry or fix generator "${entry.command}" — no file matches "${entry.path}".`,
    });
  }

  // --- OWN-01: files on disk not covered by any ownership entry ---
  const allFiles = await collectFiles(publicDir);
  for (const absFile of allFiles) {
    const posixFile = toPosix(absFile);
    if (expectedPaths.has(posixFile)) continue;

    const relToPublic = toPosix(relative(publicDir, absFile));
    const relToSite = `public/${relToPublic}`;

    // Static asset exemption
    const isExempt = STATIC_ASSET_EXEMPT_DIRS.some((dir) => relToSite.startsWith(dir));
    if (isExempt) continue;

    diagnostics.push({
      ruleId: "OWN-01",
      severity: "error",
      file: relToSite,
      message: OWN_01_MESSAGE,
      fixHint: `Add this file to GENERATOR_OWNERSHIP_MAP or remove it: git rm ${relToSite}`,
    });
  }

  return diagnosticsResult("ownership.sync.validate", diagnostics);
}
