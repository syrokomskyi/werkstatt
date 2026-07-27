/*
<MODULE_CONTRACT>
<purpose>content-validation / naming-lint — page markdown must declare required metadata
(title/description) and its path segments must be kebab-case.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of checks.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { relative } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";

export async function runPageContentValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number }>> {
  const paths = requireAstroSitePaths(context);
  const pageFiles = await collectMarkdownFiles(paths.contentPagesDirectory);
  let hasErrors = false;

  for (const filePath of pageFiles) {
    const relativeToPagesRoot = relative(paths.contentPagesDirectory, filePath).replace(/\\/g, "/");
    const [languageSegment] = relativeToPagesRoot.split("/");

    if (!/^[a-z]{2}$/i.test(languageSegment ?? "")) {
      continue;
    }

    const isShell =
      relativeToPagesRoot.includes("[") ||
      relativeToPagesRoot.includes("]") ||
      relativeToPagesRoot.endsWith("-shell.md") ||
      relativeToPagesRoot.endsWith(".txt.md");
    if (isShell) continue;

    const source = await readFile(filePath, "utf8");
    const data = parseMarkdownFrontmatter(source).data;
    const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
    const hasTitle = Boolean(data.title) || Boolean(data.pageTitle);

    if (!hasTitle) {
      context.logger.error(`${relativePath}: missing required field "title" (or "pageTitle")`);
      hasErrors = true;
    }

    // RFC-0026 PageEntrySchema renamed `metaDescription` → `description`.
    // Accept either for backward compatibility with legacy content.
    if (!data.metaDescription && !data.description) {
      context.logger.error(
        `${relativePath}: missing required field "description" (RFC-0026) or legacy "metaDescription"`,
      );
      hasErrors = true;
    }
  }

  return {
    data: { checkedFiles: pageFiles.length },
    exitCode: hasErrors ? 1 : 0,
    summary: hasErrors ? undefined : `[content-validation] OK (${pageFiles.length} files checked)`,
  };
}

export async function runNamingContentLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const pageFiles = await collectMarkdownFiles(paths.contentPagesDirectory);
  let violations = 0;

  for (const filePath of pageFiles) {
    const relativeToPagesRoot = relative(paths.contentPagesDirectory, filePath).replace(/\\/g, "/");

    // Skip shell/service files — they use special naming by convention
    if (relativeToPagesRoot.endsWith("-shell.md") || relativeToPagesRoot.endsWith(".txt.md"))
      continue;

    const segments = relativeToPagesRoot.split("/");

    for (const segment of segments) {
      const name = segment.endsWith(".md") ? segment.slice(0, -3) : segment;

      if (name.startsWith("[") && name.endsWith("]")) continue;
      if (name === "root" || name === "root-redirect") continue;

      if (!/^[a-z0-9-]+$/.test(name)) {
        const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
        context.logger.error(
          `${relativePath}: segment "${name}" violates kebab-case naming (use lowercase letters, digits, hyphens only)`,
        );
        violations += 1;
        break;
      }
    }
  }

  return {
    data: { violations },
    exitCode: violations > 0 ? 1 : 0,
    summary: violations > 0 ? undefined : `[naming-lint] OK (${pageFiles.length} files checked)`,
  };
}
