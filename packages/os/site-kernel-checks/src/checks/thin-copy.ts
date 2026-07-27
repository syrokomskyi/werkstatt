/*
<MODULE_CONTRACT>
<purpose>thin-copy.validate / shared-ui.thin-copy.validate — detect hardcoded human-readable
text nodes/attributes in .astro templates that should flow through content/props instead.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of checks.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";

const ATTRIBUTE_NAMES = ["aria-label", "alt", "title", "placeholder"];
const IGNORED_ATTRIBUTE_VALUES = new Set([
  "UTF-8",
  "image/svg+xml",
  "application/ld+json",
  "stylesheet",
  "viewport",
  "description",
  "robots",
  "canonical",
  "icon",
  "generator",
  "preconnect",
]);
const IGNORED_ASTRO_FILES = new Set(["dev-missing-data-error-component.astro"]);
const THIN_COPY_CODE_PATTERNS = [
  "=>",
  "src=",
  "import ",
  "${",
  ").",
  "',",
  '\",',
  ": (",
  ", ",
  "[]",
  "{}",
  "...",
  " &&",
  " ||",
  " ? ",
  " : ",
  " != ",
  " == ",
  "const ",
  "function ",
  "Record<",
  ": ImageMetadata",
  "getImageBySlug",
] as const;

function getLineStartOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function getLineNumber(lineStartOffsets: number[], index: number): number {
  let low = 0;
  let high = lineStartOffsets.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStartOffset = lineStartOffsets[middle];
    const nextLineStartOffset = lineStartOffsets[middle + 1] ?? Number.POSITIVE_INFINITY;

    if (index < lineStartOffset) {
      high = middle - 1;
      continue;
    }

    if (index >= nextLineStartOffset) {
      low = middle + 1;
      continue;
    }

    return middle + 1;
  }

  return lineStartOffsets.length;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasHumanText(value: string): boolean {
  return /[A-Za-zА-Яа-яÀ-ÿ]/.test(value);
}

function shouldAnalyzeSource(source: string): boolean {
  if (!source.includes(">") || !source.includes("<")) {
    return false;
  }

  if (ATTRIBUTE_NAMES.some((attributeName) => source.includes(`${attributeName}=`))) {
    return true;
  }

  return /[A-Za-zА-Яа-яÀ-ÿ]/.test(source);
}

function stripNonTemplateBlocks(source: string): { template: string } {
  const frontmatterRegex = /^---[\s\S]*?---/;
  let template = source.replace(frontmatterRegex, (match) => " ".repeat(match.length));
  const scriptRegex = /<script[\s\S]*?<\/script>/gi;
  template = template.replace(scriptRegex, (match) => " ".repeat(match.length));
  const styleRegex = /<style[\s\S]*?<\/style>/gi;
  template = template.replace(styleRegex, (match) => " ".repeat(match.length));
  const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
  template = template.replace(blockCommentRegex, (match) => {
    let replaced = "";
    for (const ch of match) {
      replaced += ch === "\n" ? "\n" : " ";
    }
    return replaced;
  });
  const htmlCommentRegex = /<!--[\s\S]*?-->/g;
  template = template.replace(htmlCommentRegex, (match) => {
    let replaced = "";
    for (const ch of match) {
      replaced += ch === "\n" ? "\n" : " ";
    }
    return replaced;
  });
  return { template };
}

function findTextNodeViolations(template: string) {
  const violations: Array<{ index: number; snippet: string; kind: string }> = [];
  let searchIndex = 0;

  while (searchIndex < template.length) {
    const openIndex = template.indexOf(">", searchIndex);
    if (openIndex === -1) break;

    const closeIndex = template.indexOf("<", openIndex + 1);
    if (closeIndex === -1) break;

    const rawValue = template.slice(openIndex + 1, closeIndex);
    searchIndex = closeIndex + 1;

    if (rawValue.length < 5) continue;
    if (rawValue.includes("{") || rawValue.includes("}")) continue;

    const snippet = normalizeWhitespace(rawValue);
    if (!snippet || !hasHumanText(snippet) || snippet.length < 5) continue;
    if (
      THIN_COPY_CODE_PATTERNS.some((pattern) => snippet.includes(pattern)) ||
      snippet.startsWith(".") ||
      snippet.endsWith(";")
    ) {
      continue;
    }

    const firstNonWhitespaceOffset = rawValue.search(/\S/);
    if (firstNonWhitespaceOffset === -1) continue;

    violations.push({
      index: openIndex + 1 + firstNonWhitespaceOffset,
      snippet,
      kind: "text node",
    });
  }

  return violations;
}

function findAttributeViolations(template: string) {
  const violations: Array<{ index: number; snippet: string; kind: string }> = [];

  for (const attributeName of ATTRIBUTE_NAMES) {
    const needle = `${attributeName}=`;
    let searchIndex = 0;

    while (searchIndex < template.length) {
      const attributeIndex = template.indexOf(needle, searchIndex);
      if (attributeIndex === -1) break;

      const quote = template[attributeIndex + needle.length];
      if (quote !== '"' && quote !== "'") {
        searchIndex = attributeIndex + needle.length;
        continue;
      }

      const valueStart = attributeIndex + needle.length + 1;
      const valueEnd = template.indexOf(quote, valueStart);
      if (valueEnd === -1) break;

      searchIndex = valueEnd + 1;

      const attributeValue = normalizeWhitespace(template.slice(valueStart, valueEnd));
      if (!attributeValue || !hasHumanText(attributeValue)) continue;
      if (IGNORED_ATTRIBUTE_VALUES.has(attributeValue)) continue;

      violations.push({
        index: valueStart,
        snippet: `${attributeName}="${attributeValue}"`,
        kind: "attribute",
      });
    }
  }

  return violations;
}

async function collectAstroFiles(
  directoryPath: string,
  ignoredDirectoryPaths: Set<string>,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("-") || entry.name.startsWith("old-")) continue;
    if (IGNORED_ASTRO_FILES.has(entry.name)) continue;

    const absolutePath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirectoryPaths.has(absolutePath)) continue;
      files.push(...(await collectAstroFiles(absolutePath, ignoredDirectoryPaths)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".astro")) {
      files.push(absolutePath);
    }
  }

  return files;
}

export interface ThinCopyViolation {
  filePath: string;
  kind: string;
  line: number;
  snippet: string;
}

export async function collectThinCopyViolations(options: {
  baseDirectory: string;
  targetDirectories: string[];
  ignoredDirectoryPaths?: Set<string>;
}): Promise<{ checkedFiles: number; violations: ThinCopyViolation[] }> {
  const ignoredDirectoryPaths = options.ignoredDirectoryPaths ?? new Set<string>();
  const astroFiles = (
    await Promise.all(
      options.targetDirectories.map((directoryPath) =>
        collectAstroFiles(directoryPath, ignoredDirectoryPaths),
      ),
    )
  ).flat();
  const violations: ThinCopyViolation[] = [];

  for (const filePath of astroFiles) {
    const source = await readFile(filePath, "utf8");
    if (!shouldAnalyzeSource(source)) {
      continue;
    }

    const { template } = stripNonTemplateBlocks(source);
    if (!shouldAnalyzeSource(template)) {
      continue;
    }

    const fileViolations = [
      ...findTextNodeViolations(template),
      ...findAttributeViolations(template),
    ].sort((left, right) => left.index - right.index);

    if (fileViolations.length === 0) {
      continue;
    }

    const lineStartOffsets = getLineStartOffsets(source);
    for (const violation of fileViolations) {
      violations.push({
        filePath: relative(options.baseDirectory, filePath).replace(/\\/g, "/"),
        kind: violation.kind,
        line: getLineNumber(lineStartOffsets, violation.index),
        snippet: violation.snippet,
      });
    }
  }

  return {
    checkedFiles: astroFiles.length,
    violations,
  };
}

export async function runThinCopyValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number }>> {
  const paths = requireAstroSitePaths(context);
  const targetDirectories = [
    join(paths.srcDirectory, "layouts"),
    join(paths.srcDirectory, "pages"),
    join(paths.srcDirectory, "components"),
  ];
  const ignoredDirectoryPaths = new Set([
    join(paths.srcDirectory, "components", "icons"),
    join(paths.srcDirectory, "components", "effects"),
    join(paths.srcDirectory, "pages", "api"),
  ]);
  const result = await collectThinCopyViolations({
    baseDirectory: paths.appDirectory,
    targetDirectories,
    ignoredDirectoryPaths,
  });

  for (const violation of result.violations) {
    context.logger.error(
      `${violation.filePath}:${violation.line}: hardcoded ${violation.kind} -> ${violation.snippet}`,
    );
  }

  return {
    data: { checkedFiles: result.checkedFiles },
    exitCode: result.violations.length > 0 ? 1 : 0,
    summary: result.violations.length > 0 ? undefined : "[thin-copy-validation] OK",
  };
}

export async function runSharedUiThinCopyValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number }>> {
  const uiSectionsDirectory = join(context.workspaceRoot, "packages", "ui", "src", "sections");
  const ignoredDirectoryPaths = new Set<string>();
  const result = await collectThinCopyViolations({
    baseDirectory: context.workspaceRoot,
    targetDirectories: [uiSectionsDirectory],
    ignoredDirectoryPaths,
  });

  const ignoredRelativePaths = new Set([
    "packages/ui/src/sections/breadcrumbs/breadcrumbs-section.astro",
  ]);
  const filteredViolations = result.violations.filter(
    (violation) => !ignoredRelativePaths.has(violation.filePath),
  );

  for (const violation of filteredViolations) {
    context.logger.error(
      `${violation.filePath}:${violation.line}: hardcoded ${violation.kind} -> ${violation.snippet}`,
    );
  }

  return {
    data: { checkedFiles: result.checkedFiles },
    exitCode: filteredViolations.length > 0 ? 1 : 0,
    summary: filteredViolations.length > 0 ? undefined : "[shared-ui-thin-copy-validation] OK",
  };
}
