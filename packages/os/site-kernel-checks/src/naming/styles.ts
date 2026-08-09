/*
<MODULE_CONTRACT>
<purpose>naming.styles.lint — RFC-0020/0025: validates that src/styles/global.css exists and that
no CSS file lives outside src/styles/.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of naming.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { fileExists } from "../lib/file-exists.ts";
import { walkForExtension } from "./shared.ts";

export async function runNamingStylesLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number; violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const stylesDir = join(paths.srcDirectory, "styles");
  const globalCssPath = join(stylesDir, "global.css");

  const violations: string[] = [];

  // Rule 1: src/styles/global.css must exist.
  if (!(await fileExists(globalCssPath))) {
    violations.push(
      `src/styles/global.css: missing entry-point stylesheet — every app must define src/styles/global.css`,
    );
  }

  // Rule 2: No CSS files outside src/styles/ within src/.
  // Scan all of src/ and report any .css file not under src/styles/.
  const SKIP_DIRS = new Set(["node_modules", "dist", ".astro"]);
  const cssFilesInSrc: string[] = [];
  await walkForExtension(
    paths.srcDirectory,
    (name) => name.endsWith(".css"),
    cssFilesInSrc,
    SKIP_DIRS,
  );

  const checkedFiles = cssFilesInSrc.length;
  for (const filePath of cssFilesInSrc) {
    const relFromSrc = relative(paths.srcDirectory, filePath).replace(/\\/g, "/");
    if (!relFromSrc.startsWith("styles/")) {
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      violations.push(
        `${rel}: CSS file outside src/styles/ — all CSS must live under src/styles/ (found at ${rel})`,
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
        ? `[naming.styles.lint] OK (${checkedFiles} CSS files checked)`
        : undefined,
  };
}
