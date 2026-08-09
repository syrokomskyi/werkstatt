/*
<MODULE_CONTRACT>
<purpose>RFC-0570 content.formula.lint — detects hardcoded arithmetic patterns next to content
references in markdown files and suggests =(...) formula replacement. Warn-level: never fails builds.</purpose>
<non-goals>
  <item>Do not rewrite markdown files — that is content.formula.migrate in @warpgogol/werkstatt-site/codegen.</item>
  <item>Do not validate formula expressions — that is content.references.validate.</item>
  <item>Do not fail the build — this is a warn-level check.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0570: initial implementation of content.formula.lint command.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { passResult } from "./result-helpers.ts";
import {
  collectMarkdownFilesSafe,
  findLineNumbersContaining,
  getContentDisciplinePaths,
  readMarkdownDocument,
} from "./content-discipline.ts";
import { readScopeFiles, outOfScope } from "./scope.ts";
import { scanFormulas } from "@warpgogol/werkstatt-site/share/formula-eval";

// Detect patterns like: <ref> + <ref> = <number> or <ref> + <ref> × <number>
// where <ref> is a braceless content reference (collection.file.field)
const HARDCODED_FORMULA_PATTERN =
  /([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+)\s*[+\-*/]\s*([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+(?:\s*[+\-*/]\s*\d+)*)/g;

export async function runContentFormulaLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const allow = readScopeFiles(input);
  const paths = getContentDisciplinePaths(context);
  const directories = [
    paths.pagesDirectory,
    paths.proseDirectory,
    paths.businessDirectory,
    paths.navigationDirectory,
    paths.siteDirectory,
  ];
  const files = (
    await Promise.all(directories.map((directory) => collectMarkdownFilesSafe(directory)))
  ).flat();

  const warnings: string[] = [];

  for (const filePath of files) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    if (allow && outOfScope(allow, doc.relativeFile)) continue;
    const source = doc.source;

    // RFC-0570: use scanFormulas to identify spans already inside =(...) formulas
    const formulaSpans = scanFormulas(source);

    let match: RegExpExecArray | null;
    HARDCODED_FORMULA_PATTERN.lastIndex = 0;
    while ((match = HARDCODED_FORMULA_PATTERN.exec(source)) !== null) {
      const candidate = match[0];
      // Verify both operands look like content references (not just prose)
      const refCount = (candidate.match(/[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+/g) || [])
        .length;
      if (refCount < 2) continue;

      // Skip if this match is inside an existing =(...) formula span
      const matchStart = match.index;
      const matchEnd = match.index + candidate.length;
      const insideFormula = formulaSpans.some(
        (span) => matchStart >= span.start && matchEnd <= span.end,
      );
      if (insideFormula) continue;

      const lineNumbers = findLineNumbersContaining(source, candidate);
      const lineSuffix = lineNumbers.length > 0 ? `:${lineNumbers[0]}` : "";
      warnings.push(
        `${doc.relativeFile}${lineSuffix} — hardcoded arithmetic between content references: "${candidate}" — consider using =(...) formula syntax`,
      );
    }
  }

  for (const warning of warnings) {
    context.logger.warn(warning);
  }

  return passResult(
    "content.formula.lint",
    warnings.length > 0
      ? `Detected ${warnings.length} hardcoded formula pattern(s) in ${files.length} content file(s)`
      : `No hardcoded formula patterns detected in ${files.length} content file(s)`,
  );
}
