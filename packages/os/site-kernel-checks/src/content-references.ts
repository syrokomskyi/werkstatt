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
        page handler (@gogol/share astro/page-handler). A reference that passes this
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
} from "@gogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";
import {
  collectMarkdownFilesSafe,
  findLineNumbersContaining,
  getContentDisciplinePaths,
  readMarkdownDocument,
} from "./content-discipline.ts";
import { readDefaultLanguageCode } from "./lib/i18n.ts";
import type { ContentRefIndex } from "@gogol/share/content-reference";
import { resolveReference } from "@gogol/share/content-reference";

const BRACELESS_PATTERN = /\b([a-z][a-z-]*)\.([a-z0-9-/]+)\.([a-zA-Z0-9_.-]+)\b/g;

const BRACE_RESIDUAL_PATTERN = /\{([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+)\}/g;

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
        if (!isPureRef) {
          const lineNumbers = findLineNumbersContaining(source, candidate);
          const lineSuffix = lineNumbers.length > 0 ? `:${lineNumbers[0]}` : "";
          warnings.push(
            `${doc.relativeFile}${lineSuffix} — REF-04: ambiguous braceless pattern ${candidate} in mixed string; could be literal`,
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

      const result = resolveReference(index, ref.raw, inferredLang, defaultLang);
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
