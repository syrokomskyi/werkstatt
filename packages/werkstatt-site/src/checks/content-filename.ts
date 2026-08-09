/*
<MODULE_CONTRACT>
<purpose>Validates page content filenames follow the {pageId}.md naming convention (RFC-0054, RFC-0090).</purpose>
<non-goals>
  <item>Do not rename files — this is a validation-only check.</item>
  <item>Do not validate prose files or global prose fragments.</item>
  <item>Do not validate route URL structure or system.md registration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0090: Added `git mv` suggestion in diagnostic, `kind: redirect` skip, and missing `pageId` violation. Wired into SITES_CHECK_AUTHOR_PIPELINE.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { pageIdToContentFileSlug } from "@warpgogol/werkstatt-site/share/content";
import { passResult, failResult } from "./result-helpers.ts";

interface ContentFilenameViolation {
  file: string;
  expected: string;
  actual: string;
  pageId: string;
}

interface MissingPageIdViolation {
  file: string;
}

export async function runContentFilenameValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const violations: ContentFilenameViolation[] = [];
  const missingPageId: MissingPageIdViolation[] = [];
  let checkedFiles = 0;

  let langDirs: string[];
  try {
    const entries = await readdir(paths.contentPagesDirectory, { withFileTypes: true });
    langDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => name.length === 2);
  } catch {
    return passResult("content.filename.validate");
  }

  for (const lang of langDirs) {
    const langDir = join(paths.contentPagesDirectory, lang);
    const mdFiles = await collectMdFiles(langDir);

    for (const filePath of mdFiles) {
      const content = await readFileSafe(filePath);
      if (!content) continue;

      const parsed = parseMarkdownFrontmatter(content);
      const data = (parsed as { data?: Record<string, unknown> }).data;
      if (!data) continue;

      // Skip redirect pages (root-redirect.md)
      if (data.kind === "redirect") continue;

      const pageId = data.pageId;
      if (typeof pageId !== "string") {
        missingPageId.push({
          file: relative(context.workspaceRoot, filePath),
        });
        continue;
      }

      const relativeFilePath = relative(langDir, filePath).replace(/\\/g, "/");
      const actualSlug = relativeFilePath.replace(/\.md$/, "");
      const expectedSlug = pageIdToContentFileSlug(pageId);

      checkedFiles++;

      if (actualSlug !== expectedSlug) {
        violations.push({
          file: relative(context.workspaceRoot, filePath),
          expected: `${expectedSlug}.md`,
          actual: `${actualSlug}.md`,
          pageId,
        });
      }
    }
  }

  const messages: string[] = [];

  for (const v of violations) {
    const filePath = v.file.replace(/\\/g, "/");
    const fileName = filePath.replace(/^.*\//, "");
    const expectedName = v.expected;
    const dir = filePath.replace(/\/[^/]+$/, "");
    messages.push(
      `${filePath} — frontmatter says ` +
        `\`pageId: ${v.pageId}\` but pageIdToContentFileSlug("${v.pageId}") is "${v.expected.replace(/\.md$/, "")}". ` +
        `Rename the file: \`git mv ${fileName} ${expectedName}\` in ${dir} (RFC-0090).`,
    );
  }

  for (const m of missingPageId) {
    messages.push(
      `${m.file.replace(/\\/g, "/")} — page file lacks pageId frontmatter, cannot validate filename (RFC-0090).`,
    );
  }

  if (messages.length === 0) {
    return passResult(
      "content.filename.validate",
      `All ${checkedFiles} files match pageId convention (RFC-0090)`,
    );
  }

  return failResult("content.filename.validate", messages);
}

async function collectMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectMdFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
