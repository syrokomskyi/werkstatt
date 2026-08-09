/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0073 pbp.content.validate for PBP content completeness and NEED_THIS marker reporting.</purpose>
<non-goals>
  <item>Do not mutate PBP content files.</item>
  <item>Do not replace pbp.profile.validate; complement it with RFC-0073 checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0073: Add PBP content completeness validator with NEED_THIS reporting.</item>
  <item>RFC-0471: Rewritten to use PBP schemas exclusively (legacy @warpgogol/business deleted).</item>
  <item>Renamed from content-business.ts to content-pbp.ts; command renamed content.business.validate → pbp.content.validate.</item>
</CHANGE_SUMMARY>
*/

import { relative, join } from "node:path";
import { pbpSchemaById } from "@warpgogol/werkstatt-site/pbp/schemas";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { passResult, failResult } from "./result-helpers.ts";
import { readScopeFiles, outOfScope } from "./scope.ts";
import {
  collectMarkdownFilesSafe,
  findPatternLineNumbers,
  getContentDisciplinePaths,
  pathExists,
  readMarkdownDocument,
} from "./content-discipline.ts";

const NEED_THIS_PATTERN = /NEED_THIS_[A-Z0-9_]+/g;
const SENSITIVE_DATA_LEAKAGE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "iban", regex: /\bIBAN\b\s*[:：-]?\s*[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  { name: "bic", regex: /\b(?:BIC|SWIFT)\b\s*[:：-]?\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g },
  { name: "steuernummer", regex: /\bSteuernummer\b\s*[:：-]?\s*\d{2,3}\/\d{3,4}\/\d{4,5}\b/g },
];

export async function runPbpContentValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const allow = readScopeFiles(input); // RFC-0139: optional --scope-files (null = whole-app)
  const paths = getContentDisciplinePaths(context);
  const violations: string[] = [];
  const warnings: string[] = [];

  const targetDirectory = paths.businessDirectory;

  const defaultLangDir = join(targetDirectory, "de");
  if (!(await pathExists(defaultLangDir))) {
    violations.push(`src/content/business-profile/de — default language directory is missing`);
  }

  const pbpFiles = await collectMarkdownFilesSafe(targetDirectory);
  for (const filePath of pbpFiles) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    if (outOfScope(allow, doc.relativeFile)) continue; // RFC-0139
    const relFromPbp = relative(targetDirectory, filePath).replace(/\\/g, "/");
    const schemaEntryId = relFromPbp.replace(/\.md$/i, "");

    try {
      // RFC-0469/0471: Validate PBP content against pbpSchemaById using the `schema` frontmatter field.
      const schemaId = (doc.frontmatter as Record<string, unknown>).schema as string | undefined;
      const pbpSchema = schemaId ? pbpSchemaById[schemaId] : undefined;
      if (pbpSchema) {
        if (schemaEntryId.startsWith("de/")) {
          pbpSchema.parse(doc.frontmatter);
        } else {
          pbpSchema.safeParse(doc.frontmatter);
        }
      }
    } catch (error) {
      violations.push(
        `${doc.relativeFile} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const markerLines = findPatternLineNumbers(doc.source, NEED_THIS_PATTERN);
    for (const line of markerLines) {
      warnings.push(`${doc.relativeFile}:${line} — explicit NEED_THIS marker present`);
    }
  }

  const proseFiles = await collectMarkdownFilesSafe(paths.proseDirectory);
  for (const filePath of proseFiles) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    if (outOfScope(allow, doc.relativeFile)) continue; // RFC-0139
    for (const pattern of SENSITIVE_DATA_LEAKAGE_PATTERNS) {
      const lines = findPatternLineNumbers(doc.source, pattern.regex);
      for (const line of lines) {
        violations.push(
          `${doc.relativeFile}:${line} — possible sensitive data leakage (${pattern.name}) in prose; move to PBP content and reference it`,
        );
      }
    }
  }

  for (const warning of warnings) {
    context.logger.warn(warning);
  }

  if (violations.length > 0) {
    return failResult("pbp.content.validate", violations);
  }

  return passResult(
    "pbp.content.validate",
    `Validated ${pbpFiles.length} PBP file(s) with ${warnings.length} NEED_THIS marker warning(s)`,
  );
}
