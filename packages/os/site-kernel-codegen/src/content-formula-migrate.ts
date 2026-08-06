/*
<MODULE_CONTRACT>
<purpose>RFC-0570 + RFC-0723 content.formula.migrate — scans src/content markdown files, finds
hardcoded arithmetic patterns next to content references (RFC-0570) and bare braceless refs in
mixed strings (RFC-0723), and converts them to =(...) formula syntax.
Manual command — not in any pipeline. Idempotent: re-running on already-migrated files is a no-op.</purpose>
<non-goals>
  <item>Do not validate formula expressions — that is content.references.validate in @warpgogol/site-kernel-checks.</item>
  <item>Do not detect formulas — that is content.formula.lint in @warpgogol/site-kernel-checks.</item>
  <item>Do not migrate files outside src/content/.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0570: initial implementation of content.formula.migrate command.</item>
  <item>RFC-0723: add second scan pass for bare braceless refs in mixed strings — wrap with =(ref) syntax.</item>
  <item>RFC-0723 review fix: deduplicate BRACELESS_PATTERN with share's fixed field path pattern; reuse loadContentRefIndex from share; skip YAML frontmatter in second pass.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { collectMarkdownFiles } from "@warpgogol/site-kernel-content";
import { scanFormulas } from "@warpgogol/share/formula-eval";
import { loadContentRefIndex } from "@warpgogol/share/content-reference";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";

// Detect patterns like: <ref> + <ref> = <number> or <ref> + <ref> × <number>
// where <ref> is a braceless content reference (collection.file.field)
const HARDCODED_FORMULA_PATTERN =
  /([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\s*[+\-*/]\s*([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:\s*[+\-*/]\s*\d+)*)/g;

// RFC-0723: detect bare braceless refs in mixed strings
// Field path uses the fixed pattern from @warpgogol/share (no trailing dots)
const BRACELESS_PATTERN =
  /\b([a-z][a-z-]*)\.([a-z0-9-/]+)\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\b/g;

function findFrontmatterEnd(content: string): number | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return null;
  return end + 5;
}

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
  const index = loadContentRefIndex(join(appRoot, "src", "content-ref-index.generated.yaml"));
  const knownCollections = index ? new Set(Object.keys(index.entries)) : new Set<string>();
  const conversions: Array<{ file: string; line: number; before: string; after: string }> = [];

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    let modified = content;
    const replacements: Array<{ original: string; replacement: string; index: number }> = [];

    // RFC-0570: use scanFormulas to identify spans already inside =(...) formulas
    const formulaSpans = scanFormulas(content);

    // Track spans consumed by the first pass to avoid double-processing
    const firstPassSpans: Array<{ start: number; end: number }> = [];

    let match: RegExpExecArray | null;
    HARDCODED_FORMULA_PATTERN.lastIndex = 0;
    while ((match = HARDCODED_FORMULA_PATTERN.exec(content)) !== null) {
      const candidate = match[0];
      const refCount = (
        candidate.match(/[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*/g) || []
      ).length;
      if (refCount < 2) continue;

      // Skip if this pattern is already inside a =(...) formula
      const matchStart = match.index;
      const matchEnd = match.index + candidate.length;
      const insideFormula = formulaSpans.some(
        (span) => matchStart >= span.start && matchEnd <= span.end,
      );
      if (insideFormula) continue;

      const replacement = convertToFormulaSyntax(candidate);
      replacements.push({ original: candidate, replacement, index: match.index });
      firstPassSpans.push({ start: matchStart, end: matchEnd });
    }

    // RFC-0723: second scan pass — detect bare braceless refs in mixed strings
    // Skip YAML frontmatter (between --- delimiters) — =(…) is content syntax, not YAML
    const fmEnd = findFrontmatterEnd(content);
    BRACELESS_PATTERN.lastIndex = 0;
    while ((match = BRACELESS_PATTERN.exec(content)) !== null) {
      const candidate = match[0];
      const matchStart = match.index;
      const matchEnd = match.index + candidate.length;

      // Skip if inside YAML frontmatter
      if (fmEnd !== null && matchStart < fmEnd) continue;

      // Skip if part of a hardcoded formula pattern (already handled by first pass)
      const inFirstPass = firstPassSpans.some(
        (span) => matchStart >= span.start && matchEnd <= span.end,
      );
      if (inFirstPass) continue;

      // Skip if already inside a =(...) formula
      const insideFormula = formulaSpans.some(
        (span) => matchStart >= span.start && matchEnd <= span.end,
      );
      if (insideFormula) continue;

      // Skip pure refs (the entire line is just the reference)
      const lineStart = content.lastIndexOf("\n", matchStart) + 1;
      const lineEnd = content.indexOf("\n", matchStart);
      const lineText = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
      if (lineText.trim() === candidate) continue;

      // Skip if the collection is not known (likely literal text)
      const collectionMatch = candidate.match(/^([a-z][a-z-]*)\./);
      if (!collectionMatch) continue;
      const collection = collectionMatch[1];
      if (!knownCollections.has(collection)) continue;

      const replacement = `=(${candidate})`;
      replacements.push({ original: candidate, replacement, index: matchStart });
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
      ? `No formula patterns found in ${files.length} content file(s)`
      : `Converted ${conversions.length} formula pattern(s) in ${files.length} content file(s)`;

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
