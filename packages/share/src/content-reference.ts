/*
<MODULE_CONTRACT>
<purpose>Framework-agnostic content reference index resolver — loads a build-time generated index
and resolves braceless collection.file.field references without astro:content (RFC-0527).</purpose>
<non-goals>
  <item>Do not generate the index — that is content.ref-index.generate in @warpgogol/site-kernel-codegen.</item>
  <item>Do not validate references — that is content.references.validate in @warpgogol/site-kernel-checks.</item>
  <item>Do not handle brace-delimited {collection.file.field} syntax — legacy, removed by RFC-0529.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0045: Initial implementation of content data references in markdown files.</item>
  <item>RFC-0527: Rewrite as framework-agnostic index-based resolver. Remove astro:content dependency.
        Replace parseContentReference, resolveContentReference, substituteContentReferences,
        substituteContentReferencesInData with loadContentRefIndex, resolveReference,
        resolveReferencesInString, resolveReferencesDeep.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { substituteRefsDeep } from "./content/substitute-deep.ts";
import { resolveFieldPath } from "./content/resolve-field-path.ts";
import { scanFormulas, resolveFormula } from "./formula-eval.ts";

export interface ContentRefIndex {
  version: 1;
  generatedAt: string | null;
  entries: Record<string, Record<string, Record<string, unknown>>>;
  collections: string[];
}

export interface ResolveReferenceResult {
  value: unknown;
  resolved: boolean;
  error?: string;
}

const REF_PATTERN = /^([a-z][a-z-]*)\.([a-z0-9-/]+)\.(.+)$/;
const PURE_REF_PATTERN = /^[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+$/;
const BRACELESS_SCAN_PATTERN = /[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+/g;
const DEFAULT_INDEX_PATH = "src/content-ref-index.generated.yaml";

export const EMPTY_CONTENT_REF_INDEX: ContentRefIndex = {
  version: 1,
  generatedAt: "",
  entries: {},
  collections: [],
};

let cachedIndex: ContentRefIndex | null | undefined;

export function loadContentRefIndex(indexPath: string): ContentRefIndex | null {
  try {
    const raw = readFileSync(indexPath, "utf8");
    const parsed = parse(raw) as ContentRefIndex;
    if (parsed && parsed.version === 1 && parsed.entries) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function getContentRefIndex(indexPath?: string): ContentRefIndex | null {
  if (cachedIndex === undefined) {
    cachedIndex = loadContentRefIndex(indexPath ?? DEFAULT_INDEX_PATH);
  }
  return cachedIndex;
}

export function resetContentRefIndexCache(): void {
  cachedIndex = undefined;
}

export function resolveReference(
  index: ContentRefIndex,
  ref: string,
  lang: string,
  defaultLang: string,
): ResolveReferenceResult {
  const match = ref.match(REF_PATTERN);
  if (!match) {
    return { value: undefined, resolved: false, error: `Invalid reference syntax: ${ref}` };
  }

  const [, collection, file, fieldPathStr] = match;
  const fieldPath = fieldPathStr.split(".");

  const collectionEntries = index.entries[collection];
  if (!collectionEntries) {
    return {
      value: undefined,
      resolved: false,
      error: `REF-01: Collection "${collection}" not found in index`,
    };
  }

  const fileEntries = collectionEntries[file];
  if (!fileEntries) {
    return {
      value: undefined,
      resolved: false,
      error: `REF-02: File "${file}" not found in collection "${collection}"`,
    };
  }

  let data = fileEntries[lang];
  if (!data && lang !== defaultLang) {
    data = fileEntries[defaultLang];
  }
  if (!data) {
    return {
      value: undefined,
      resolved: false,
      error: `REF-02: No entry for language "${lang}" or fallback "${defaultLang}" for ${collection}.${file}`,
    };
  }

  const { value, missingField } = resolveFieldPath(data, fieldPath);
  if (missingField || value === undefined) {
    // Field-level fallback: if the field path fails in the requested language,
    // retry with the default language data before reporting REF-03.
    if (lang !== defaultLang) {
      const fallbackData = fileEntries[defaultLang];
      if (fallbackData) {
        const fallbackResult = resolveFieldPath(fallbackData, fieldPath);
        if (!fallbackResult.missingField && fallbackResult.value !== undefined) {
          return { value: fallbackResult.value, resolved: true };
        }
      }
    }
    return {
      value: undefined,
      resolved: false,
      error: `REF-03: Field "${missingField ?? fieldPath[fieldPath.length - 1]}" not found in ${collection}.${file}`,
    };
  }

  return { value, resolved: true };
}

export function resolveReferencesInString(
  index: ContentRefIndex,
  text: string,
  lang: string,
  defaultLang: string,
): string {
  if (PURE_REF_PATTERN.test(text)) {
    const result = resolveReference(index, text, lang, defaultLang);
    if (result.resolved) {
      return formatValue(result.value);
    }
    return text;
  }

  // RFC-0570: resolve =(...) formula expressions first
  const formulas = scanFormulas(text);
  let formulaResult = text;
  if (formulas.length > 0) {
    // Process formulas in reverse order to preserve indices
    for (let i = formulas.length - 1; i >= 0; i--) {
      const { start, end, expression } = formulas[i];
      const result = resolveFormula(index, expression, lang, defaultLang);
      const replacement = result.resolved ? result.value : "";
      formulaResult = formulaResult.slice(0, start) + replacement + formulaResult.slice(end);
    }
  }

  // If the entire string was a formula, return the formula result
  if (formulas.length > 0 && formulas[0].start === 0 && formulas[0].end === text.length) {
    return formulaResult;
  }

  let result = formulaResult;
  const pattern = new RegExp(BRACELESS_SCAN_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  const replacements: Array<{ start: number; end: number; resolved: string }> = [];

  while ((match = pattern.exec(formulaResult)) !== null) {
    const candidate = match[0];
    const collectionMatch = candidate.match(/^([a-z][a-z-]*)\./);
    if (!collectionMatch) continue;
    const collection = collectionMatch[1];
    if (!index.entries[collection]) continue;

    const resolved = resolveReference(index, candidate, lang, defaultLang);
    if (resolved.resolved) {
      replacements.push({
        start: match.index,
        end: match.index + candidate.length,
        resolved: formatValue(resolved.value),
      });
    }
  }

  for (let i = replacements.length - 1; i >= 0; i--) {
    const { start, end, resolved } = replacements[i];
    result = result.slice(0, start) + resolved + result.slice(end);
  }

  return result;
}

export async function resolveReferencesDeep(
  index: ContentRefIndex,
  data: unknown,
  lang: string,
  defaultLang: string,
): Promise<unknown> {
  return substituteRefsDeep(data, (value) =>
    Promise.resolve(resolveReferencesInString(index, value, lang, defaultLang)),
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return "";
}
