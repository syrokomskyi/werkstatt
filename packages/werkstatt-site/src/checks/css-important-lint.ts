/* 
<MODULE_CONTRACT>
<purpose>Lint CSS files for forbidden !important declarations to maintain cascade hygiene.</purpose>
<non-goals>
  <item>Do not allow exceptions or whitelists for !important.</item>
  <item>Do not check non-CSS files (Astro style blocks are covered by other validators).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation to enforce !important prohibition in CSS.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles } from "@warpgogol/share/fs";
import { getLineColumn } from "@warpgogol/share/text-position";

interface ImportantViolation {
  filePath: string;
  line: number;
  column: number;
  rule: string;
}

async function collectCssFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".css"] });
}

/**
 * css.important.lint — validates that no CSS files contain !important declarations.
 *
 * Scans all .css files under src/styles/ and reports any !important usage
 * with file, line, and column information. Exits with code 1 if any violations
 * are found, making this a build-blocking check.
 */
export async function runCssImportantLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ violations: number; files: number }>> {
  const paths = requireAstroSitePaths(context);
  const stylesDir = join(paths.srcDirectory, "styles");

  const violations: ImportantViolation[] = [];

  // Collect all CSS files under src/styles/
  const cssFiles = await collectCssFiles(stylesDir);

  for (const filePath of cssFiles) {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");

    // Match !important declarations (including whitespace variations)
    // This regex matches !important with optional whitespace before/after
    const importantRegex = /\s*!\s*important\s*/gi;

    let match;
    while ((match = importantRegex.exec(content)) !== null) {
      const index = match.index;
      if (index !== undefined) {
        const { line, column } = getLineColumn(content, index);

        // Extract the CSS rule for better context
        const lines = content.split("\n");
        const ruleLine = lines[line - 1] || "";
        const rule = ruleLine.trim();

        violations.push({
          filePath: relativePath,
          line,
          column,
          rule,
        });
      }
    }
  }

  // Report violations
  for (const violation of violations) {
    context.logger.error(
      `${violation.filePath}:${violation.line}:${violation.column} !important found in: ${violation.rule}`,
    );
  }

  return {
    data: {
      violations: violations.length,
      files: cssFiles.length,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[css.important.lint] OK (${cssFiles.length} CSS files checked)`
        : undefined,
  };
}
