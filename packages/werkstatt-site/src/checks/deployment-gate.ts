/*
<MODULE_CONTRACT>
<purpose>
RFC-0803 deployment.gate.validate — checks that non-gated pages do not reference
gated pages in navigation, block props, or breadcrumb parent chains.
Rules: GATE-01 (navigation), GATE-02 (block props), GATE-03 (parentPageId).
</purpose>
<non-goals>
  <item>Do not modify source files.</item>
  <item>Do not check external URLs or anchors — only internal pageId references.</item>
  <item>Do not run in dev mode — collectGatedPageIds returns empty set when NODE_ENV is not production.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0803: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { collectGatedPageIds } from "@warpgogol/werkstatt-site/share/astro/deployment-gate";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { diagnosticsResult } from "./result-helpers.ts";

interface SystemPageView {
  pageId?: string;
  parentPageId?: string;
  deployment?: { production?: boolean };
}

const TARGET_KEY_RE = /(^|\.)(pageId|ctaTarget|primaryCtaTarget|secondaryCtaTarget|targetPageId)$/;

function isPageIdTarget(value: string): boolean {
  if (value.startsWith("#") || value.startsWith("http://") || value.startsWith("https://"))
    return false;
  if (value.startsWith("/") || value.startsWith("mailto:") || value.startsWith("tel:"))
    return false;
  return true;
}

function collectInternalPageIds(node: unknown, results: string[], path: string): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectInternalPageIds(item, results, `${path}[${index}]`));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const propPath = path ? `${path}.${key}` : key;
    if (
      typeof value === "string" &&
      TARGET_KEY_RE.test(propPath) &&
      value.trim() !== "" &&
      isPageIdTarget(value)
    ) {
      results.push(value);
    }
    collectInternalPageIds(value, results, propPath);
  }
}

export async function runDeploymentGateValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "deployment.gate.validate";
  const paths = requireAstroSitePaths(context);
  const contentDir = join(paths.appDirectory, "src", "content");

  const { manifest } = await loadSystemManifest(contentDir);
  const pages = (manifest.pages ?? []) as SystemPageView[];
  const gatedPageIds = collectGatedPageIds(pages);

  if (gatedPageIds.size === 0) {
    return diagnosticsResult(command, []);
  }

  const allPageIds = new Set<string>();
  for (const page of pages) {
    if (page.pageId) allPageIds.add(page.pageId);
  }

  const diagnostics: Diagnostic[] = [];

  // GATE-03: non-gated page has parentPageId pointing to a gated page
  for (const page of pages) {
    if (!page.pageId || !page.parentPageId) continue;
    if (gatedPageIds.has(page.pageId)) continue;
    if (gatedPageIds.has(page.parentPageId)) {
      diagnostics.push({
        ruleId: "GATE-03",
        severity: "error",
        message: `Page "${page.pageId}" has parentPageId "${page.parentPageId}" which is gated from production. Remove the parent reference or ungate the parent page.`,
        data: { sourcePageId: page.pageId, gatedPageId: page.parentPageId },
      });
    }
  }

  // GATE-01: navigation files reference gated pages
  for (const domain of ["navigation", "site", "business"]) {
    const domainDir = join(contentDir, domain);
    let navFiles: string[];
    try {
      navFiles = await collectMarkdownFiles(domainDir);
    } catch {
      continue;
    }
    for (const filePath of navFiles) {
      const raw = await readFile(filePath, "utf8").catch(() => "");
      const { data } = parseMarkdownFrontmatter(raw);
      if (!data || typeof data !== "object") continue;
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      const refs: string[] = [];
      collectInternalPageIds(data, refs, "");
      for (const refPageId of refs) {
        if (gatedPageIds.has(refPageId)) {
          diagnostics.push({
            ruleId: "GATE-01",
            severity: "error",
            file: rel,
            message: `Navigation file "${rel}" references gated pageId "${refPageId}". Remove the reference or ungate the page.`,
            data: { gatedPageId: refPageId, source: "navigation" },
          });
        }
      }
    }
  }

  // GATE-02: block props in page content reference gated pages
  const pagesDir = join(contentDir, "pages");
  let pageFiles: string[];
  try {
    pageFiles = await collectMarkdownFiles(pagesDir);
  } catch {
    pageFiles = [];
  }
  for (const filePath of pageFiles) {
    const raw = await readFile(filePath, "utf8").catch(() => "");
    const { data } = parseMarkdownFrontmatter(raw);
    if (!data || typeof data !== "object") continue;
    const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
    const refs: string[] = [];
    collectInternalPageIds(data, refs, "");
    for (const refPageId of refs) {
      if (gatedPageIds.has(refPageId)) {
        diagnostics.push({
          ruleId: "GATE-02",
          severity: "error",
          file: rel,
          message: `Page content "${rel}" references gated pageId "${refPageId}" in block props. Remove the reference or ungate the page.`,
          data: { gatedPageId: refPageId, source: "block-props" },
        });
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}
