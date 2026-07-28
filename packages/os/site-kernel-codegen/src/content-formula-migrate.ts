/*
<MODULE_CONTRACT>
<purpose>RFC-0570 content.formula.migrate — scans src/content markdown files, finds hardcoded
arithmetic patterns next to content references, and converts them to =(...) formula syntax.
Manual command — not in any pipeline. Idempotent: re-running on already-migrated files is a no-op.</purpose>
<non-goals>
  <item>Do not validate formula expressions — that is content.references.validate in @warpgogol/site-kernel-checks.</item>
  <item>Do not detect formulas — that is content.formula.lint in @warpgogol/site-kernel-checks.</item>
  <item>Do not migrate files outside src/content/.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0570: initial implementation of content.formula.migrate command.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { collectMarkdownFiles } from "@warpgogol/site-kernel-content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";

// Detect patterns like: <ref> + <ref> = <number> or <ref> + <ref> × <number>
// where <ref> is a braceless content reference (collection.file.field)
const HARDCODED_FORMULA_PATTERN =
  /([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+)\s*[+\-*/]\s*([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+(?:\s*[+\-*/]\s*\d+)*)/g;

function convertToFormulaSyntax(match: string): string {
  // The matched pattern is: <ref> <op> <ref> [op <number>]...
  // Wrap it in =(...) syntax
  return `=(${match})`;
}

export async function runContentFormulaMigrate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "content.formula.migrate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentDir = join(appRoot, "src", "content");

  const files = await collectMarkdownFiles(contentDir);
  const conversions: Array<{ file: string; line: number; before: string; after: string }> = [];

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    let modified = content;
    const replacements: Array<{ original: string; replacement: string; index: number }> = [];

    let match: RegExpExecArray | null;
    HARDCODED_FORMULA_PATTERN.lastIndex = 0;
    while ((match = HARDCODED_FORMULA_PATTERN.exec(content)) !== null) {
      const candidate = match[0];
      const refCount = (candidate.match(/[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+/g) || [])
        .length;
      if (refCount < 2) continue;

      // Check if this pattern is already inside a =(...) formula
      const beforeStart = content.slice(Math.max(0, match.index - 2), match.index);
      if (beforeStart.includes("=(")) continue;

      const replacement = convertToFormulaSyntax(candidate);
      replacements.push({ original: candidate, replacement, index: match.index });
    }

    if (replacements.length === 0) continue;

    // Apply replacements in reverse order to preserve indices
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { original, replacement, index } = replacements[i];
      modified = modified.slice(0, index) + replacement + modified.slice(index + original.length);

      // Calculate line number
      const lines = content.slice(0, index).split("\n");
      const line = lines.length;
      conversions.push({
        file: relative(appRoot, filePath),
        line,
        before: original,
        after: replacement,
      });
    }

    await writeFile(filePath, modified, "utf8");
  }

  const summary =
    conversions.length === 0
      ? `No hardcoded formula patterns found in ${files.length} content file(s)`
      : `Converted ${conversions.length} hardcoded formula pattern(s) in ${files.length} content file(s)`;

  return {
    exitCode: 0,
    data: {
      command,
      status: "pass",
      conversions,
      summary,
    },
    summary: `${command}: OK — ${conversions.length} conversion(s) in ${files.length} file(s)`,
  };
}
