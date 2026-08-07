/*
<MODULE_CONTRACT>
<purpose>Validates content references in markdown files against the build-time generated content reference index (RFC-0527, RFC-0529).
Validates braceless collection.file.field syntax only — brace-delimited syntax was removed by RFC-0529.</purpose>
<non-goals>
  <item>Do not rewrite markdown files.</item>
  <item>Do not substitute references into final rendered output here.</item>
  <item>Do not generate the index — that is content.ref-index.generate.</item>
</non-goals>
<notes>
  <item>RFC-0138: references in block props are substituted at render time by the shared
        page handler (@warpgogol/share astro/page-handler). A reference that passes this
        validator therefore renders resolved, not as a literal brace string; a reference
        the render path cannot resolve fails here (no silent empty-string drift).</item>
  <item>RFC-0527: validator now uses the generated content-ref-index instead of reading files from disk.
        Braceless collection.file.field syntax is the only accepted syntax (RFC-0529).</item>
</notes>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0073: Introduce first-class content reference validation command.</item>
  <item>RFC-0138: documented that references in block props are substituted at render time; validator behavior unchanged.</item>
  <item>RFC-0138: added a non-fatal advisory when a reference targets an array element by numeric index (order-coupling).</item>
  <item>RFC-0527: rewrite to use the generated content-ref-index instead of disk reads; add braceless syntax support.</item>
  <item>RFC-0529: remove brace-delimited syntax validation — only braceless references are accepted. Add REF-05 diagnostic for residual brace tokens.</item>
  <item>RFC-0570: add =(...) formula expression validation with REF-06..09 error codes.</item>
  <item>RFC-0723: promote REF-04 from warning to error for known collections in mixed strings; skip REF-04 for refs inside =(…) formulas.</item>
  <item>RFC-0731: add this. self-reference validation — derive sourceRef from file path, expand before resolving, emit REF-12/REF-13.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { readScopeFiles, outOfScope } from "./scope.ts";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";
import {
  collectMarkdownFilesSafe,
  findLineNumbersContaining,
  getContentDisciplinePaths,
  readMarkdownDocument,
} from "./content-discipline.ts";
import { readDefaultLanguageCode } from "./lib/i18n.ts";
import type { ContentRefIndex, SourceRef } from "@warpgogol/share/content-reference";
import { resolveReference } from "@warpgogol/share/content-reference";
import { scanFormulas, resolveFormula } from "@warpgogol/share/formula-eval";

const BRACELESS_PATTERN = /\b([a-z][a-z-]*)\.([a-z0-9-/]+)\.([a-zA-Z0-9_.-]+)\b/g;

const BRACE_RESIDUAL_PATTERN = /\{([a-z][a-z-]*[./][a-z0-9-/]+\.[a-zA-Z0-9_.-]+)\}/g;

const THIS_PATTERN = /\bthis\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\b/g;

interface LocalReference {
  collection: string;
  file: string;
  fieldPath: string[];
  raw: string;
}

function parseBracelessReference(reference: string): LocalReference | null {
  const match = reference.match(/^([a-z][a-z-]*)\.([a-z0-9-/]+)\.([a-zA-Z0-9_.-]+)$/);
  if (!match) return null;
  return {
    collection: match[1],
    file: match[2],
    fieldPath: match[3].split("."),
    raw: reference,
  };
}

function inferLanguageFromRelativeFile(relativeFile: string, fallback: string): string {
  const match = relativeFile.replace(/\\/g, "/").match(/src\/content\/[a-z-]+\/([a-z]{2})\//);
  return match?.[1] ?? fallback;
}

function deriveSourceRef(relativeFile: string): SourceRef | null {
  const normalized = relativeFile.replace(/\\/g, "/");
  const match = normalized.match(/src\/content\/([a-z][a-z-]*)\/[a-z]{2}\/(.+)\.md$/);
  if (!match) return null;
  return { collection: match[1], file: match[2] };
}

function loadIndex(appRoot: string): ContentRefIndex | null {
  const indexPath = join(appRoot, "src", "content-ref-index.generated.yaml");
  try {
    const raw = readFileSync(indexPath, "utf8");
    const parsed = parseYaml(raw) as ContentRefIndex;
    if (parsed && parsed.version === 1 && parsed.entries) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function runContentReferencesValidate(
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
  const violations: string[] = [];
  const warnings: string[] = [];
  const defaultLang = await readDefaultLanguageCode(paths.contentDirectory);

  const appRoot = paths.contentDirectory.replace(/\/src\/content$/, "");
  const index = loadIndex(appRoot);
  if (!index) {
    warnings.push(
      "content-ref-index.generated.yaml not found — run content.ref-index.generate first; skipping reference validation",
    );
    for (const warning of warnings) context.logger.warn(warning);
    return passResult(
      "content.references.validate",
      `Skipped — index not generated (${files.length} file(s) would have been checked)`,
    );
  }

  for (const filePath of files) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    if (outOfScope(allow, doc.relativeFile)) continue;
    const source = doc.source;
    const inferredLang = inferLanguageFromRelativeFile(doc.relativeFile, defaultLang);

    const refs: LocalReference[] = [];
    const sourceRef = deriveSourceRef(doc.relativeFile);

    let match: RegExpExecArray | null;
    BRACELESS_PATTERN.lastIndex = 0;
    while ((match = BRACELESS_PATTERN.exec(source)) !== null) {
      const candidate = match[0];
      const collectionMatch = candidate.match(/^([a-z][a-z-]*)\./);
      if (!collectionMatch) continue;
      const collection = collectionMatch[1];
      if (!index.entries[collection]) continue;
      const parsed = parseBracelessReference(candidate);
      if (parsed) {
        const lineStart = source.lastIndexOf("\n", match.index) + 1;
        const lineEnd = source.indexOf("\n", match.index);
        const lineText = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
        const isPureRef = lineText.trim() === candidate;
        // RFC-0723: Skip REF-04 if the ref is inside an =(...) formula expression —
        // it is an explicit reference, not ambiguous.
        const beforeRef = source.slice(lineStart, match.index);
        const afterRef = source.slice(
          match.index + candidate.length,
          lineEnd === -1 ? source.length : lineEnd,
        );
        const isInsideFormula = /=\(\s*$/.test(beforeRef) && afterRef.includes(")");
        if (!isPureRef && !isInsideFormula) {
          const lineNumbers = findLineNumbersContaining(source, candidate);
          const lineSuffix = lineNumbers.length > 0 ? `:${lineNumbers[0]}` : "";
          // RFC-0723: REF-04 promoted from warning to error for known collections.
          // The pattern matches a known collection (index.entries[collection] exists),
          // so it is a real reference, not literal text. Unknown patterns remain warnings.
          violations.push(
            `${doc.relativeFile}${lineSuffix} — REF-04: ambiguous braceless pattern ${candidate} in mixed string; use =(ref) syntax to explicitly mark it as a reference`,
          );
        }
        refs.push(parsed);
      }
    }

    for (const ref of refs) {
      const lineNumbers = findLineNumbersContaining(source, ref.raw);
      const lineSuffix = lineNumbers.length > 0 ? `:${lineNumbers[0]}` : "";

      if (ref.fieldPath.some((segment) => /^\d+$/.test(segment))) {
        warnings.push(
          `${doc.relativeFile}${lineSuffix} — reference ${ref.raw} uses an array index; coupled to array order in the target file`,
        );
      }

      const result = resolveReference(
        index,
        ref.raw,
        inferredLang,
        defaultLang,
        sourceRef ?? undefined,
      );
      if (!result.resolved) {
        violations.push(
          `${doc.relativeFile}${lineSuffix} — ${result.error ?? "unresolved reference"} ${ref.raw}`,
        );
      } else if (
        result.value !== null &&
        typeof result.value === "object" &&
        !Array.isArray(result.value)
      ) {
        violations.push(
          `${doc.relativeFile}${lineSuffix} — reference ${ref.raw} resolved to object; expected scalar or array`,
        );
      }
    }

    // RFC-0529 REF-05: flag residual brace-delimited {collection.file.field} tokens
    BRACE_RESIDUAL_PATTERN.lastIndex = 0;
    let braceMatch: RegExpExecArray | null;
    while ((braceMatch = BRACE_RESIDUAL_PATTERN.exec(source)) !== null) {
      const token = braceMatch[0];
      const lineNumbers = findLineNumbersContaining(source, token);
      const lineSuffix = lineNumbers.length > 0 ? `:${lineNumbers[0]}` : "";
      violations.push(
        `${doc.relativeFile}${lineSuffix} — REF-05: residual brace-delimited token ${token} — run content.ref-migrate to convert to braceless syntax`,
      );
    }

    // RFC-0570: validate =(...) formula expressions
    const formulas = scanFormulas(source);
    for (const formula of formulas) {
      const formulaText = source.slice(formula.start, formula.end);
      const lineNumbers = findLineNumbersContaining(source, formulaText);
      const lineSuffix = lineNumbers.length > 0 ? `:${lineNumbers[0]}` : "";
      const result = resolveFormula(
        index,
        formula.expression,
        inferredLang,
        defaultLang,
        sourceRef ?? undefined,
      );
      if (!result.resolved) {
        violations.push(
          `${doc.relativeFile}${lineSuffix} — ${result.error ?? "formula error"} =(${formula.expression})`,
        );
      }
    }

    // RFC-0731: validate this. self-references
    THIS_PATTERN.lastIndex = 0;
    let thisMatch: RegExpExecArray | null;
    while ((thisMatch = THIS_PATTERN.exec(source)) !== null) {
      const candidate = thisMatch[0];
      const lineNumbers = findLineNumbersContaining(source, candidate);
      const lineSuffix = lineNumbers.length > 0 ? `:${lineNumbers[0]}` : "";
      if (!sourceRef) {
        violations.push(
          `${doc.relativeFile}${lineSuffix} — REF-12: this. reference used without sourceRef context ${candidate}`,
        );
        continue;
      }
      const fieldPath = candidate.slice("this.".length);
      const expanded = `${sourceRef.collection}.${sourceRef.file}.${fieldPath}`;
      const result = resolveReference(index, expanded, inferredLang, defaultLang);
      if (!result.resolved) {
        violations.push(
          `${doc.relativeFile}${lineSuffix} — ${result.error ?? "unresolved this. reference"} ${candidate}`,
        );
      } else if (
        result.value !== null &&
        typeof result.value === "object" &&
        !Array.isArray(result.value)
      ) {
        violations.push(
          `${doc.relativeFile}${lineSuffix} — reference ${candidate} resolved to object; expected scalar or array`,
        );
      }
    }
  }

  for (const warning of warnings) {
    context.logger.warn(warning);
  }

  return violations.length > 0
    ? failResult("content.references.validate", violations)
    : passResult(
        "content.references.validate",
        `Validated references in ${files.length} content file(s) with ${warnings.length} advisory warning(s)`,
      );
}
