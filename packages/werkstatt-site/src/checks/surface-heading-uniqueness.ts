/*
<MODULE_CONTRACT>
<purpose>
RFC-0690, RFC-0696: surface.heading-uniqueness.validate — scan rendered surface page HTML
for duplicate block heading text. For each <section> element or <div>/<article>/<aside>
with aria-labelledby, extracts the first <h2> or <h3> descendant's text content,
normalizes it, and reports HEADING-UNIQ-01 when the same normalized heading text appears
more than once on the same page. Catches bake function label reuse before the Axiom gate.
</purpose>
<non-goals>
  <item>Do not validate non-surface pages — only routes with a surfaceId in the surface artifact are checked.</item>
  <item>Do not check heading hierarchy (h1-h6 order) — that is a separate accessibility concern.</item>
  <item>Do not modify HTML — this is a read-only validator.</item>
  <item>Do not check headings outside block-level elements with aria-labelledby — only headings inside <section> or <div>/<article>/<aside> with aria-labelledby participate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0690: initial — duplicate section heading validator using parse5 and surface artifact route identification.</item>
  <item>RFC-0696: extend scan to non-section blocks with aria-labelledby; add findFirstHeadingSkippingChildBlocks for nested block double-counting prevention; rename extractSectionHeadings → extractBlockHeadings.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { SurfaceArtifact, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { ARTIFACT_FILE } from "./surface/shared.ts";

type TreeNode = DefaultTreeAdapterMap["node"];
type TreeParentNode = DefaultTreeAdapterMap["parentNode"];
type TreeElementNode = DefaultTreeAdapterMap["element"];
type TreeTextNode = DefaultTreeAdapterMap["textNode"];

const DIST_CLIENT_DIR = "dist/client";
const HEADING_TAGS = new Set(["h2", "h3"]);
const BLOCK_TAGS = new Set(["section", "div", "article", "aside"]);

function isElementNode(node: TreeNode): node is TreeElementNode {
  return "tagName" in node;
}

function hasChildNodes(node: TreeNode): node is TreeParentNode {
  return "childNodes" in node;
}

function isTextNode(node: TreeNode): node is TreeTextNode {
  return node.nodeName === "#text";
}

/**
 * Recursively collect all text content from a node's subtree.
 */
function collectTextContent(node: TreeNode): string {
  if (isTextNode(node)) {
    return node.value;
  }
  if (!hasChildNodes(node)) {
    return "";
  }
  return node.childNodes.map(collectTextContent).join("");
}

/**
 * Find the first descendant element with a tag name in the given set,
 * using depth-first search.
 */
function _findFirstDescendantByTag(
  node: TreeParentNode,
  tagNames: Set<string>,
): TreeElementNode | null {
  const children = node.childNodes;
  if (!children) return null;
  for (const child of children) {
    if (isElementNode(child) && tagNames.has(child.tagName)) {
      return child;
    }
    if (hasChildNodes(child)) {
      const found = _findFirstDescendantByTag(child, tagNames);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Check if an element is a block-level element that participates in heading uniqueness:
 * <section> (always) or <div>/<article>/<aside> with aria-labelledby.
 */
function isBlockElement(node: TreeNode): node is TreeElementNode {
  if (!isElementNode(node) || !BLOCK_TAGS.has(node.tagName)) return false;
  if (node.tagName === "section") return true;
  const attrs = node.attrs ?? [];
  return attrs.some((a) => a.name === "aria-labelledby");
}

/**
 * Find all block-level elements that participate in heading uniqueness (depth-first):
 * all <section> elements (always) + <div>/<article>/<aside> with aria-labelledby.
 */
function findBlockElementsWithAriaLabelledby(
  node: TreeParentNode,
  results: TreeElementNode[] = [],
): TreeElementNode[] {
  const children = node.childNodes;
  if (!children) return results;
  for (const child of children) {
    if (isBlockElement(child)) {
      results.push(child);
    }
    if (hasChildNodes(child)) {
      findBlockElementsWithAriaLabelledby(child, results);
    }
  }
  return results;
}

/**
 * Find the first descendant heading element (h2/h3) using depth-first search,
 * skipping child block elements to prevent nested block double-counting.
 * Without the skip, the same heading element would be found from both a parent
 * <section> and a child <div aria-labelledby>, counting it twice.
 */
function findFirstHeadingSkippingChildBlocks(
  node: TreeParentNode,
  tagNames: Set<string>,
): TreeElementNode | null {
  const children = node.childNodes;
  if (!children) return null;
  for (const child of children) {
    if (isElementNode(child) && tagNames.has(child.tagName)) {
      return child;
    }
    if (isBlockElement(child)) {
      continue;
    }
    if (hasChildNodes(child)) {
      const found = findFirstHeadingSkippingChildBlocks(child, tagNames);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Normalize heading text: trim, lowercase, collapse internal whitespace.
 */
function normalizeHeadingText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Extract block headings from HTML content.
 * Returns a map of normalized heading text → count of occurrences.
 * Block elements without an <h2> or <h3> descendant are skipped.
 */
export function extractBlockHeadings(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  let document: TreeParentNode;
  try {
    document = parse(html);
  } catch {
    return counts;
  }

  const blocks = findBlockElementsWithAriaLabelledby(document);
  for (const block of blocks) {
    const heading = findFirstHeadingSkippingChildBlocks(block, HEADING_TAGS);
    if (!heading) continue;
    const rawText = collectTextContent(heading);
    const normalized = normalizeHeadingText(rawText);
    if (normalized.length === 0) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return counts;
}

function routeFromHtmlPath(distClientDir: string, htmlPath: string): string {
  const rel = relative(distClientDir, htmlPath).replace(/\\/g, "/");
  const withoutIndex = rel.replace(/index\.html$/, "").replace(/\.html$/, "/");
  return `/${withoutIndex}`.replace(/\/+/g, "/");
}

export async function runSurfaceHeadingUniquenessValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "surface.heading-uniqueness.validate must run inside an app context.",
    };
  }

  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult(
      "surface.heading-uniqueness.validate",
      "skipped (no surface artifact; run surface.generate)",
    );
  }

  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return {
      exitCode: 1,
      summary: "surface.heading-uniqueness.validate: surface artifact is not valid YAML",
    };
  }

  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];
  const surfaceEntries = entries.filter(
    (e: VirtualRouteEntry) => e.surfaceId && e.indexable && !e.noindex,
  );

  if (surfaceEntries.length === 0) {
    return passResult(
      "surface.heading-uniqueness.validate",
      "skipped (no indexable surface pages in artifact)",
    );
  }

  const surfaceRoutePaths = new Set<string>();
  for (const e of surfaceEntries) {
    for (const route of Object.values(e.routes ?? {})) {
      const normalized = "/" + route.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
      surfaceRoutePaths.add(normalized.replace(/\/+/g, "/"));
    }
  }

  const distClientDir = join(app.directory, DIST_CLIENT_DIR);
  if (!existsSync(distClientDir)) {
    return passResult(
      "surface.heading-uniqueness.validate",
      "skipped (no dist/client — run astro build first)",
    );
  }

  const htmlFiles = await collectFiles(distClientDir, {
    extensions: [".html"],
    ignore: () => false,
  });
  const diagnostics: Diagnostic[] = [];

  for (const htmlFile of htmlFiles) {
    const route = routeFromHtmlPath(distClientDir, htmlFile);
    if (!surfaceRoutePaths.has(route)) continue;

    let rawHtml: string;
    try {
      rawHtml = await readFile(htmlFile, "utf8");
    } catch {
      continue;
    }

    const headingCounts = extractBlockHeadings(rawHtml);

    for (const [headingText, count] of headingCounts) {
      if (count > 1) {
        diagnostics.push({
          ruleId: "HEADING-UNIQ-01",
          severity: "error" as const,
          message: `Duplicate block heading "${headingText}" appears ${count} times on ${route}`,
          file: relative(app.directory, htmlFile).replace(/\\/g, "/"),
          fixHint:
            "Use distinct heading text for each block-level element with aria-labelledby on this page",
        });
      }
    }
  }

  return diagnosticsResult("surface.heading-uniqueness.validate", diagnostics);
}
