/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/content-discipline.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not register kernel commands here.</item>
  <item>Do not apply validator-specific policy decisions here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0073: Introduce shared helper surface for content-discipline validators.</item>
</CHANGE_SUMMARY>
*/

import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import type { KernelRuntimeContext } from "@warpgogol/site-kernel";

export interface ContentDisciplinePaths {
  appDirectory: string;
  contentDirectory: string;
  pagesDirectory: string;
  proseDirectory: string;
  businessDirectory: string;
  navigationDirectory: string;
  siteDirectory: string;
  onboardingAuthorDirectory: string;
}

export interface MarkdownDocument {
  filePath: string;
  relativeFile: string;
  source: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface FlattenedStringValue {
  path: string;
  value: string;
}

export function getContentDisciplinePaths(context: KernelRuntimeContext): ContentDisciplinePaths {
  const paths = requireAstroSitePaths(context);
  return {
    appDirectory: paths.appDirectory,
    contentDirectory: paths.contentDirectory,
    pagesDirectory: join(paths.contentDirectory, "pages"),
    proseDirectory: join(paths.contentDirectory, "prose"),
    businessDirectory: join(paths.contentDirectory, "business-profile"),
    navigationDirectory: join(paths.contentDirectory, "navigation"),
    siteDirectory: join(paths.contentDirectory, "site"),
    onboardingAuthorDirectory: join(context.workspaceRoot, "onboarding", ".output", "04-author"),
  };
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function collectMarkdownFilesSafe(directory: string): Promise<string[]> {
  try {
    return await collectMarkdownFiles(directory);
  } catch {
    return [];
  }
}

export async function readMarkdownDocument(
  workspaceRoot: string,
  filePath: string,
): Promise<MarkdownDocument> {
  const source = await readFile(filePath, "utf8");
  const parsed = parseMarkdownFrontmatter(source);
  return {
    filePath,
    relativeFile: relative(workspaceRoot, filePath).replace(/\\/g, "/"),
    source,
    frontmatter: parsed.data,
    body: parsed.content,
  };
}

export function flattenStringValues(
  value: unknown,
  basePath = "$",
  seen = new WeakSet<object>(),
): FlattenedStringValue[] {
  if (typeof value === "string") {
    return [{ path: basePath, value }];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [{ path: basePath, value: String(value) }];
  }
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenStringValues(item, `${basePath}[${index}]`, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return [];
    }
    seen.add(value as object);
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flattenStringValues(child, `${basePath}.${key}`, seen),
    );
  }
  return [];
}

export function findLineNumbersContaining(source: string, needle: string): number[] {
  const hits: number[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(needle)) {
      hits.push(index + 1);
    }
  }
  return hits;
}

export function findPatternLineNumbers(source: string, pattern: RegExp): number[] {
  const hits: number[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    pattern.lastIndex = 0;
    if (pattern.test(lines[index])) {
      hits.push(index + 1);
    }
  }
  return hits;
}
