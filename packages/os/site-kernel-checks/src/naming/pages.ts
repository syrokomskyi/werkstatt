/*
<MODULE_CONTRACT>
<purpose>naming.pages.lint and naming.layouts.lint — RFC-0020/0025: validates the src/pages/
route-directory contract (dynamic [param] naming, no visitor routes outside a [param]/
directory) and the src/layouts/ singleton contract.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of naming.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { collectAllAstroFiles } from "./shared.ts";
import { PAGES_NON_ROUTE_SUBDIRS } from "../lib/route-constants.ts";

// @ai-invariant VALID_ROUTE_PARAM_RE validates the inner name of a dynamic route segment
// (the part between [ and ]). Per Astro conventions and the naming-conventions.md spec,
// params must be lowercase ASCII letters and digits only — no separators, no uppercase.
// Example: [lang] → "lang" ✅  [mySlug] → "mySlug" ❌  [my-slug] → "my-slug" ❌
const VALID_ROUTE_PARAM_RE = /^[a-z][a-z0-9]*$/;

// Recursively audits the pages directory tree.
// depth 0 = entries directly inside src/pages/
// Returns the count of .astro files encountered (for reporting).
async function auditPageDir(
  dir: string,
  depth: number,
  appDir: string,
  violations: string[],
): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries as { name: string; isFile(): boolean; isDirectory(): boolean }[]) {
    const entryPath = join(dir, entry.name);

    if (entry.isFile() && entry.name.endsWith(".astro")) {
      count++;
      // Root-level .astro files are acceptable (e.g. a root redirect index.astro).
      // Files at depth > 0 are already inside a validated subtree branch.
    } else if (entry.isDirectory()) {
      if (depth === 0) {
        // Direct children of src/pages/
        if (PAGES_NON_ROUTE_SUBDIRS.has(entry.name)) {
          continue;
        }

        const isDynamicParam = entry.name.startsWith("[") && entry.name.endsWith("]");

        if (isDynamicParam) {
          const param = entry.name.slice(1, -1);
          if (!VALID_ROUTE_PARAM_RE.test(param)) {
            const rel = relative(appDir, entryPath).replace(/\\/g, "/");
            violations.push(
              `${rel}: dynamic param "${param}" must use only lowercase letters and digits (got [${param}])`,
            );
          }
          count += await auditPageDir(entryPath, depth + 1, appDir, violations);
        } else {
          // Static (non-excluded) top-level subdir — any .astro files inside violate the rule.
          const inner = await collectAllAstroFiles(entryPath);
          count += inner.length;
          for (const f of inner) {
            const rel = relative(appDir, f).replace(/\\/g, "/");
            violations.push(
              `${rel}: visitor route must sit inside a [param]/ directory (e.g. [lang]/), not inside a static directory`,
            );
          }
        }
      } else {
        // Deeper levels: validate [param] naming but allow any directory structure.
        if (entry.name.startsWith("[") && entry.name.endsWith("]")) {
          const param = entry.name.slice(1, -1);
          if (!VALID_ROUTE_PARAM_RE.test(param)) {
            const rel = relative(appDir, entryPath).replace(/\\/g, "/");
            violations.push(
              `${rel}: dynamic param "${param}" must use only lowercase letters and digits (got [${param}])`,
            );
          }
        }
        count += await auditPageDir(entryPath, depth + 1, appDir, violations);
      }
    }
  }

  return count;
}

export async function runNamingPagesLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number; violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const pagesDir = join(paths.srcDirectory, "pages");

  const violations: string[] = [];
  const checkedFiles = await auditPageDir(pagesDir, 0, paths.appDirectory, violations);

  for (const v of violations) {
    context.logger.error(v);
  }

  return {
    data: { checkedFiles, violations: violations.length },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[naming.pages.lint] OK (${checkedFiles} route files checked)`
        : undefined,
  };
}

/**
 * Validates the src/layouts/ singleton contract per RFC-0020 rule 10.
 *
 * Rules:
 *   - src/layouts/ must contain exactly one file-level entry: layout.astro.
 *   - Any additional .astro file or other source file at the root of src/layouts/ is a violation.
 *   - Subdirectories are not checked (reserved for future multi-layout patterns via a later RFC).
 *   - If src/layouts/ does not exist, the check passes silently.
 *
 * AGENTS.md is unconditionally excluded.
 */
export async function runNamingLayoutsLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const layoutsDir = join(paths.srcDirectory, "layouts");

  let entries: { name: string; isFile(): boolean }[] = [];
  try {
    entries = (await readdir(layoutsDir, { withFileTypes: true })) as typeof entries;
  } catch {
    // src/layouts/ absent — no layouts layer to validate, pass silently.
    return {
      data: { violations: 0 },
      exitCode: 0,
      summary: "[naming.layouts.lint] OK (no src/layouts/ directory)",
    };
  }

  const violations: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.toUpperCase() === "AGENTS.MD") continue;

    if (entry.name !== "layout.astro") {
      const rel = `src/layouts/${entry.name}`;
      violations.push(
        `${rel}: unexpected file in src/layouts/ — only "layout.astro" is permitted as a file-level entry per RFC-0020`,
      );
    }
  }

  // Check that layout.astro actually exists (not just that there are no extra files).
  const hasLayout = entries.some((e) => e.isFile() && e.name === "layout.astro");
  if (!hasLayout) {
    violations.push(
      `src/layouts/layout.astro: missing — src/layouts/ must contain exactly one file-level entry "layout.astro" per RFC-0020`,
    );
  }

  for (const v of violations) {
    context.logger.error(v);
  }

  return {
    data: { violations: violations.length },
    exitCode: violations.length > 0 ? 1 : 0,
    summary: violations.length === 0 ? `[naming.layouts.lint] OK` : undefined,
  };
}
