/*
<MODULE_CONTRACT>
<purpose>naming.components.lint — RFC-0020/0025: validates that src/components/ contains only
expected file types (no CSS, no Markdown, no unlisted extension).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of naming.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative, basename } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { collectFiles } from "@gogol/share/fs";

// @ai-invariant COMPONENTS_ALLOWED_EXTENSIONS lists extensions expected inside src/components/.
// Any other extension found triggers a naming.components.lint violation. CSS belongs in
// src/styles/, Markdown in src/content/components/. Update this set if new component formats
// are officially adopted (e.g. .vue, .svelte).
const COMPONENTS_ALLOWED_EXTENSIONS = new Set([".astro", ".tsx", ".ts", ".js", ".mjs"]);

export async function runNamingComponentsLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number; violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const componentsDir = join(paths.srcDirectory, "components");

  const violations: string[] = [];
  let checkedFiles = 0;

  const SKIP_DIRS = new Set(["node_modules", "dist"]);

  const entryPaths = await collectFiles(componentsDir, {
    ignore: (name) => name.startsWith(".") || SKIP_DIRS.has(name),
  });
  for (const entryPath of entryPaths) {
    const name = basename(entryPath);
    checkedFiles++;
    const rel = relative(paths.appDirectory, entryPath).replace(/\\/g, "/");
    const ext = name.includes(".") ? "." + name.split(".").pop()!.toLowerCase() : "";

    // Skip files with all-uppercase names (like AGENTS.md, README.md)
    const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    if (stem === stem.toUpperCase() && stem.length > 0) {
      continue;
    }

    if (ext === ".css") {
      violations.push(
        `${rel}: CSS file in src/components/ — move to the matching path under src/styles/components/`,
      );
    } else if (ext === ".md" || ext === ".mdx") {
      violations.push(
        `${rel}: Markdown file in src/components/ — component content belongs in src/content/components/`,
      );
    } else if (ext && !COMPONENTS_ALLOWED_EXTENSIONS.has(ext)) {
      violations.push(
        `${rel}: unexpected file type "${ext}" in src/components/ — only ${[...COMPONENTS_ALLOWED_EXTENSIONS].join(", ")} are expected here`,
      );
    }
  }

  for (const v of violations) {
    context.logger.error(v);
  }

  return {
    data: { checkedFiles, violations: violations.length },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[naming.components.lint] OK (${checkedFiles} files in src/components/ checked)`
        : undefined,
  };
}
