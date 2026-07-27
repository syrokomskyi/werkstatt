/*
<MODULE_CONTRACT>
<purpose>semantic-drift.validate — catches copy-paste drift and SEO-length violations in
page metadata (title/description/heading).</purpose>
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

export async function runSemanticDriftValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number }>> {
  const paths = requireAstroSitePaths(context);
  const pageFiles = await collectMarkdownFiles(paths.contentPagesDirectory);
  let hasErrors = false;

  for (const filePath of pageFiles) {
    const relativeToPagesRoot = relative(paths.contentPagesDirectory, filePath).replace(/\\/g, "/");
    const [languageSegment] = relativeToPagesRoot.split("/");

    if (!/^[a-z]{2}$/i.test(languageSegment ?? "")) continue;

    const isShell =
      relativeToPagesRoot.includes("[") ||
      relativeToPagesRoot.endsWith("-shell.md") ||
      relativeToPagesRoot.endsWith(".txt.md");
    if (isShell) continue;

    const source = await readFile(filePath, "utf8");
    const { data } = parseMarkdownFrontmatter(source);
    const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");

    const title = typeof data.title === "string" ? data.title.trim() : "";
    // RFC-0026: prefer `description`, fall back to legacy `metaDescription`.
    const metaDescription =
      (typeof data.description === "string" ? data.description.trim() : "") ||
      (typeof data.metaDescription === "string" ? data.metaDescription.trim() : "");
    const heading = typeof data.heading === "string" ? data.heading.trim() : "";

    if (title && metaDescription && title === metaDescription) {
      context.logger.error(
        `${relativePath}: "title" and "description" are identical — likely copy-paste drift`,
      );
      hasErrors = true;
    }

    if (heading && title && heading === title) {
      context.logger.error(
        `${relativePath}: "heading" equals "title" — heading is for the page body, title is for the browser tab; they should differ`,
      );
      hasErrors = true;
    }

    if (title.length > 70) {
      context.logger.error(
        `${relativePath}: "title" is ${title.length} chars (limit 70) — will be truncated in search results`,
      );
      hasErrors = true;
    }

    if (metaDescription && metaDescription.length > 160) {
      context.logger.error(
        `${relativePath}: "metaDescription" is ${metaDescription.length} chars (limit 160) — will be truncated in search results`,
      );
      hasErrors = true;
    }

    if (metaDescription && metaDescription.length < 50) {
      // RFC-0136 deferral: pages with `seoDeferred: true` in frontmatter are
      // legally or editorially deferred — their descriptions are intentionally
      // minimal stubs pending review. Downgrade to warn so the build stays green
      // while tracking the open work.
      const isDeferred = (data as { seoDeferred?: unknown }).seoDeferred === true;
      if (isDeferred) {
        context.logger.warn(
          `${relativePath}: "metaDescription" is ${metaDescription.length} chars (minimum 50) — deferred (seoDeferred: true); finalize before launch`,
        );
      } else {
        context.logger.error(
          `${relativePath}: "metaDescription" is ${metaDescription.length} chars (minimum 50) — too short for effective SEO`,
        );
        hasErrors = true;
      }
    }
  }

  return {
    data: { checkedFiles: pageFiles.length },
    exitCode: hasErrors ? 1 : 0,
    summary: hasErrors ? undefined : `[semantic-drift] OK (${pageFiles.length} files checked)`,
  };
}
