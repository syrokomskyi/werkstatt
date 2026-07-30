/*
<MODULE_CONTRACT>
<purpose>
  RFC-0600: generated.stale.validate — detects files in a site's public/
  directory that are not produced by any registered generator in
  GENERATOR_OWNERSHIP_MAP, not declared as static assets, and not resolved
  by a content-aware resolver (per-page preview images whose owning content
  page still exists). Complements RFC-0375 (generated.files.validate) which
  checks the forward direction (declared files exist).
</purpose>
<non-goals>
  <item>Do not scan src/ — authored content files are not in GENERATOR_OWNERSHIP_MAP and would produce false positives.</item>
  <item>Do not auto-delete stale files — the command is read-only.</item>
  <item>Do not check content drift — that is the domain of a separate RFC.</item>
  <item>Do not check files outside the site workpiece (e.g., packages/, docs/).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0600: initial implementation.</item>
  <item>RFC-0600: review fix — extract STALE_MESSAGE constant, validate preview path segment count.</item>
</CHANGE_SUMMARY>
*/
import { join, relative, basename } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";
import { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";
import {
  toPosix,
  isWorkspaceAbsolute,
  hasGlobPattern,
  resolveEntryPath,
  expandGlob,
} from "./generated-files-validate.ts";

export const STATIC_ASSET_EXEMPT_DIRS = ["public/textures/"];

const PREVIEW_DIR = "public/preview/";

const STALE_MESSAGE =
  "File in public/ is not produced by any registered generator and is not a declared static asset.";

export async function runGeneratedStaleValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = input.flags.site as string | undefined;
  const diagnostics: Diagnostic[] = [];

  const siteDir =
    context.site?.directory ?? (app ? join(context.workspaceRoot, "apps", app) : undefined);
  if (!siteDir) {
    return diagnosticsResult("generated.stale.validate", []);
  }

  const publicDir = join(siteDir, "public");

  const allFiles = await collectFiles(publicDir);
  if (allFiles.length === 0) {
    return diagnosticsResult("generated.stale.validate", []);
  }

  const expectedPaths = new Set<string>();
  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    if (entry.conditional) continue;

    const isWorkspaceAbs = isWorkspaceAbsolute(entry.path);
    if (!isWorkspaceAbs && !app && !context.site?.directory) continue;

    const posixPath = toPosix(entry.path);
    if (posixPath.startsWith(PREVIEW_DIR)) continue;

    const expandedPath = posixPath
      .replace(/\{app\}/g, app ?? "*")
      .replace(/\{lang\}/g, "*")
      .replace(/\{route\}/g, "*")
      .replace(/\{slug\}/g, "*")
      .replace(/\{id\}/g, "*")
      .replace(/\{category\}/g, "*");

    const resolvedPath = resolveEntryPath(
      { ...entry, path: expandedPath },
      app,
      context.workspaceRoot,
      context.site?.directory,
    );

    if (hasGlobPattern(expandedPath)) {
      try {
        const basePath = isWorkspaceAbs
          ? context.workspaceRoot
          : (context.site?.directory ?? join(context.workspaceRoot, "apps", app!));
        const files = await expandGlob(basePath, expandedPath, context.workspaceRoot);
        for (const f of files) {
          expectedPaths.add(toPosix(f));
        }
      } catch {
        // Glob expansion failures are non-fatal for stale detection.
      }
    } else {
      expectedPaths.add(toPosix(resolvedPath));
    }
  }

  for (const absFile of allFiles) {
    const posixFile = toPosix(absFile);
    const relToPublic = toPosix(relative(publicDir, absFile));
    const relToSite = `public/${relToPublic}`;

    if (expectedPaths.has(posixFile)) continue;

    const isExempt = STATIC_ASSET_EXEMPT_DIRS.some((dir) => relToSite.startsWith(dir));
    if (isExempt) continue;

    if (relToSite.startsWith(PREVIEW_DIR) && relToSite.endsWith(".png")) {
      const filename = basename(relToSite);
      if (filename.startsWith("-")) continue;

      const slug = filename.replace(/\.png$/, "");
      const parts = relToSite.split("/");
      // Expected structure: public/preview/{lang}/{slug}.png → parts = ["public", "preview", lang, slug.png]
      // Also supports subdirs: public/preview/{lang}/cosmic/{slug}.png → parts = ["public", "preview", lang, "cosmic", slug.png]
      const lang = parts.length >= 4 ? (parts[2] ?? "") : "";
      if (!lang) {
        diagnostics.push({
          ruleId: "STALE-01",
          severity: "error",
          file: relToSite,
          message: STALE_MESSAGE,
          fixHint: `Remove this file: git rm ${relToSite}`,
        });
        continue;
      }

      // For nested preview paths (e.g. public/preview/de/cosmic/passport.png),
      // the content page is at src/content/pages/{lang}/{subdir}/{slug}.md
      const previewParts = parts.slice(3, -1); // e.g. ["cosmic"] or []
      const contentPagePath = join(
        siteDir,
        "src",
        "content",
        "pages",
        lang,
        ...previewParts,
        `${slug}.md`,
      );
      const contentPageExists = await context.io.exists(contentPagePath);
      if (contentPageExists) continue;
    }

    diagnostics.push({
      ruleId: "STALE-01",
      severity: "error",
      file: relToSite,
      message: STALE_MESSAGE,
      fixHint: `Remove this file: git rm ${relToSite}`,
    });
  }

  return diagnosticsResult("generated.stale.validate", diagnostics);
}
