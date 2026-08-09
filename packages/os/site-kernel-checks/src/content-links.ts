/*
<MODULE_CONTRACT>
<purpose>
  RFC-0206: content.links.validate — scans authored content files for URL and
  anchor values, validates them against the route registry and anchor registry.
</purpose>
<non-goals>
  <item>Do not perform live HTTP requests to external sites.</item>
  <item>Do not validate rendered HTML hrefs post-build.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0206: Introduce content link and anchor validation.</item>
  <item>RFC-0576: Migrate to diagnosticsResult with registered LINK-01..03 ruleIds, add fixHints, normalize parseUrl trailing slashes.</item>
  <item>RFC-0576 review fix: Rename Violation.rule to Violation.ruleId for consistency.</item>
  <item>Extend LINK-01 to validate anchor targets against block-level anchorId props (not just system.md registry and prose headings). Catches CTA buttons pointing to #anchor when no block declares anchorId on the page.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { localizeUrl } from "@warpgogol/share/url-policy";
import {
  collectMarkdownFilesSafe,
  flattenStringValues,
  findLineNumbersContaining,
  getContentDisciplinePaths,
  readMarkdownDocument,
} from "./content-discipline.ts";
import { diagnosticsResult } from "./result-helpers.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

const COMMAND = "content.links.validate";

interface RouteEntry {
  pageId: string;
  lang: string;
}

interface AnchorRegistry {
  [anchorId: string]: Record<string, string>;
}

interface SystemPage {
  pageId?: string;
  routes?: Record<string, string>;
  anchors?: AnchorRegistry;
}

/** Build a map: URL path -> { pageId, lang } */
function buildRouteMap(pages: SystemPage[], defaultLanguage: string): Map<string, RouteEntry> {
  const map = new Map<string, RouteEntry>();
  for (const page of pages) {
    if (!page.pageId || !page.routes) continue;
    for (const [lang, slug] of Object.entries(page.routes)) {
      const path = localizeUrl(lang, slug, { defaultLanguage });
      map.set(path, { pageId: page.pageId, lang });

      // RFC-0160: default language pages also have prefixed redirect paths
      if (lang === defaultLanguage) {
        const prefixedPath = slug === "" ? `/${defaultLanguage}/` : `/${defaultLanguage}/${slug}`;
        map.set(prefixedPath, { pageId: page.pageId, lang });
      }
    }
  }
  return map;
}

/**
 * Extract heading IDs from markdown body text.
 * Simple slugification: lowercase, replace spaces/special chars with hyphens.
 */
function extractHeadingIds(markdownSource: string): string[] {
  const ids: string[] = [];
  const lines = markdownSource.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      const text = match[1].trim().toLowerCase();
      const id = text.replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * Extract prose references from page frontmatter blocks.
 * Looks for contentRef and prose src paths in block props.
 */
function extractProseRefs(frontmatter: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const blocks = frontmatter.blocks;
  if (!Array.isArray(blocks)) return refs;

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;

    // contentRef: "prose/donate-contact"
    if (typeof b.contentRef === "string") {
      refs.push(b.contentRef);
    }
    if (typeof b.props === "object" && b.props !== null) {
      const props = b.props as Record<string, unknown>;
      if (typeof props.contentRef === "string") {
        refs.push(props.contentRef);
      }
      if (typeof props.src === "string" && props.src.includes("prose/")) {
        refs.push(props.src);
      }
    }
  }
  return refs;
}

/**
 * Extract anchorId values from page frontmatter blocks.
 * These are the section-level anchor targets that SectionShell renders as HTML id attributes.
 * CTA #anchor links must resolve to one of these, a prose heading, or a system.md registry entry.
 */
function extractBlockAnchorIds(frontmatter: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const blocks = frontmatter.blocks;
  if (!Array.isArray(blocks)) return ids;

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (typeof b.props === "object" && b.props !== null) {
      const props = b.props as Record<string, unknown>;
      if (typeof props.anchorId === "string") {
        ids.push(props.anchorId);
      }
    }
  }
  return ids;
}

/** Infer language from relative path like src/content/pages/de/home.md */
function inferLangFromPath(relativeFile: string, fallback: string): string {
  const match = relativeFile.replace(/\\/g, "/").match(/src\/content\/[a-z-]+\/([a-z]{2})\//);
  return match?.[1] ?? fallback;
}

/** Check if a string looks like an internal URL or anchor */
function looksLikeUrl(value: string): boolean {
  if (value.startsWith("mailto:") || value.startsWith("tel:")) return false;
  if (value.startsWith("http://") || value.startsWith("https://")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/api/")) return false;
  return value.startsWith("/") || value.startsWith("#");
}

/**
 * Resolve an anchor string against the anchor registry.
 * Returns the localized fragment if the anchor string matches either:
 * - A localized fragment for the current language
 * - A localized fragment for the default language (fallback)
 * Returns null if no match is found.
 */
function resolveAnchor(
  anchorId: string,
  pageAnchors: AnchorRegistry | undefined,
  lang: string,
  defaultLanguage: string,
): string | null {
  if (!pageAnchors) return null;
  for (const [, langMap] of Object.entries(pageAnchors)) {
    const localized = langMap[lang] ?? langMap[defaultLanguage];
    if (localized === anchorId) {
      return localized;
    }
  }
  return null;
}

interface Violation {
  file: string;
  line?: number;
  ruleId: string;
  message: string;
  fixHint: string;
}

/** Parse a URL string into { path, anchor }.
 * RFC-0576: normalizes trailing slashes for non-root paths so that /uk/tsina/
 * matches route map entry /uk/tsina (localizeUrl produces no trailing slash). */
function parseUrl(value: string): { path: string | null; anchor: string | null } {
  const hashIndex = value.indexOf("#");
  if (hashIndex === 0) {
    return { path: null, anchor: value };
  }
  let path: string;
  let anchor: string | null = null;
  if (hashIndex > 0) {
    path = value.slice(0, hashIndex);
    anchor = value.slice(hashIndex);
  } else {
    path = value;
  }
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return { path, anchor };
}

export async function runContentLinksValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const contentDir = join(paths.srcDirectory, "content");
  const { manifest } = await loadSystemManifest(contentDir);

  const i18n = (manifest.i18n as { default?: string; supported?: Record<string, unknown> }) ?? {};
  const defaultLanguage = defaultLanguageFromManifest(manifest);
  const pages = (manifest.pages ?? []) as SystemPage[];

  const routeMap = buildRouteMap(pages, defaultLanguage);

  // Build anchor registry lookup: pageId -> AnchorRegistry
  const anchorRegistryByPage = new Map<string, AnchorRegistry>();
  for (const page of pages) {
    if (page.pageId && page.anchors) {
      anchorRegistryByPage.set(page.pageId, page.anchors);
    }
  }

  // Pre-scan page files to build blockAnchorIdsByPage: pageId -> anchorId[]
  // This lets cross-page anchor links validate against block-level anchorId props.
  const blockAnchorIdsByPage = new Map<string, string[]>();
  const pagesDir = join(contentDir, "pages");
  let pageFiles: string[] = [];
  try {
    pageFiles = await collectMarkdownFilesSafe(pagesDir);
  } catch {
    // pages directory may not exist in all workspaces
  }
  for (const filePath of pageFiles) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    const pageId = typeof doc.frontmatter.pageId === "string" ? doc.frontmatter.pageId : null;
    if (pageId) {
      const anchorIds = extractBlockAnchorIds(doc.frontmatter);
      if (anchorIds.length > 0) {
        const existing = blockAnchorIdsByPage.get(pageId) ?? [];
        blockAnchorIdsByPage.set(pageId, [...existing, ...anchorIds]);
      }
    }
  }

  const directories = [
    join(contentDir, "pages"),
    join(contentDir, "prose"),
    join(contentDir, "business"),
    join(contentDir, "navigation"),
    join(contentDir, "site"),
  ];

  const files = (
    await Promise.all(directories.map((directory) => collectMarkdownFilesSafe(directory)))
  ).flat();

  const violations: Violation[] = [];

  for (const filePath of files) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    const lang = inferLangFromPath(doc.relativeFile, defaultLanguage);
    const isPageFile = doc.relativeFile.includes("/content/pages/");

    // For page files, extract pageId, prose heading IDs, and block anchorIds
    let filePageId: string | null = null;
    let proseHeadingIds: string[] = [];
    let blockAnchorIds: string[] = [];
    if (isPageFile) {
      filePageId = typeof doc.frontmatter.pageId === "string" ? doc.frontmatter.pageId : null;
      blockAnchorIds = extractBlockAnchorIds(doc.frontmatter);
      const proseRefs = extractProseRefs(doc.frontmatter);
      for (const ref of proseRefs) {
        // Resolve prose ref like "prose/donate-contact" to file path
        // Prose files are organized by language: prose/<lang>/<filename>.md
        const refParts = ref.split("/");
        const collection = refParts[0];
        const filename = refParts.slice(1).join("/");
        const prosePath = join(contentDir, collection, lang, `${filename}.md`);
        try {
          const proseSource = await readFile(prosePath, "utf8");
          // Skip frontmatter, extract body
          const bodyMatch = proseSource.match(/---\n[\s\S]*?---\n([\s\S]*)/);
          const proseBody = bodyMatch?.[1] ?? proseSource;
          proseHeadingIds.push(...extractHeadingIds(proseBody));
        } catch {
          // Prose file not found — ignore, other validators catch missing prose
        }
      }
    }

    // Scan frontmatter string values
    const stringValues = flattenStringValues(doc.frontmatter, "frontmatter");
    for (const entry of stringValues) {
      if (!looksLikeUrl(entry.value)) continue;

      const lineNumbers = findLineNumbersContaining(doc.source, entry.value);
      const line = lineNumbers.length > 0 ? lineNumbers[0] : undefined;

      validateUrl(
        entry.value,
        doc.relativeFile,
        line,
        lang,
        filePageId,
        proseHeadingIds,
        blockAnchorIds,
        routeMap,
        anchorRegistryByPage,
        blockAnchorIdsByPage,
        defaultLanguage,
        violations,
      );
    }

    // Scan markdown body for [text](url) links
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkPattern.exec(doc.body)) !== null) {
      const url = match[2];
      if (!looksLikeUrl(url)) continue;

      const lineNumbers = findLineNumbersContaining(doc.source, `[${match[1]}](${url})`);
      const line = lineNumbers.length > 0 ? lineNumbers[0] : undefined;

      validateUrl(
        url,
        doc.relativeFile,
        line,
        lang,
        filePageId,
        proseHeadingIds,
        blockAnchorIds,
        routeMap,
        anchorRegistryByPage,
        blockAnchorIdsByPage,
        defaultLanguage,
        violations,
      );
    }
  }

  const diagnostics: Diagnostic[] = violations.map((v) => ({
    ruleId: v.ruleId,
    severity: "error" as const,
    message: v.message,
    file: v.file,
    line: v.line,
    fixHint: v.fixHint,
  }));

  return diagnosticsResult(COMMAND, diagnostics);
}

function validateUrl(
  value: string,
  relativeFile: string,
  line: number | undefined,
  lang: string,
  filePageId: string | null,
  proseHeadingIds: string[],
  blockAnchorIds: string[],
  routeMap: Map<string, RouteEntry>,
  anchorRegistryByPage: Map<string, AnchorRegistry>,
  blockAnchorIdsByPage: Map<string, string[]>,
  defaultLanguage: string,
  violations: Violation[],
): void {
  const { path, anchor } = parseUrl(value);

  // Case: #anchor (same-page anchor)
  if (path === null && anchor !== null) {
    const anchorId = anchor.slice(1); // strip #
    if (!filePageId) {
      // Can't validate anchor without page context (e.g. prose file)
      return;
    }
    const pageAnchors = anchorRegistryByPage.get(filePageId);
    const resolved = resolveAnchor(anchorId, pageAnchors, lang, defaultLanguage);
    const inProseHeadings = proseHeadingIds.includes(anchorId);
    const inRegistryKeys = pageAnchors ? Object.keys(pageAnchors).includes(anchorId) : false;
    const inBlockAnchors = blockAnchorIds.includes(anchorId);
    if (resolved === null && !inProseHeadings && !inRegistryKeys && !inBlockAnchors) {
      violations.push({
        file: relativeFile,
        line,
        ruleId: "LINK-01",
        message: `Anchor "${anchor}" not found on page "${filePageId}" for lang "${lang}". Add anchorId to a block on this page, or to system.md anchor registry, or add a matching prose heading.`,
        fixHint: `Anchor "${anchor}" not found on page "${filePageId}". Add "anchorId: ${anchorId}" to the target block's props on this page, or add the anchor to system.md anchors registry, or add a matching heading in the prose file, or fix the anchor text.`,
      });
    }
    // LINK-04: anchor is in system.md registry but not rendered by any block or prose heading.
    // The registry declares intent but without a block anchorId or prose heading,
    // no HTML id is rendered and the anchor link will be broken.
    if ((resolved !== null || inRegistryKeys) && !inBlockAnchors && !inProseHeadings) {
      violations.push({
        file: relativeFile,
        line,
        ruleId: "LINK-04",
        message: `Anchor "${anchor}" is declared in system.md registry for page "${filePageId}" but no block on this page renders it. Add "anchorId: ${anchorId}" to the target block's props.`,
        fixHint: `Anchor "${anchor}" is in the system.md anchor registry but no block renders HTML id="${anchorId}". Add "anchorId: ${anchorId}" to the target block's props on this page, or remove the anchor from the registry if it is unused.`,
      });
    }
    return;
  }

  // Case: /path or /path#anchor
  if (path !== null) {
    // LINK-02: same-page anchor carrying a path prefix (canonical or prefixed redirect form)
    if (anchor && filePageId) {
      // Check canonical form: path directly matches current page
      const canonicalEntry = routeMap.get(path);
      if (canonicalEntry && canonicalEntry.pageId === filePageId) {
        violations.push({
          file: relativeFile,
          line,
          ruleId: "LINK-02",
          message: `Same-page anchor must not carry path prefix. Use "${anchor}" instead of "${value}"`,
          fixHint: `Same-page anchor must not carry a path or language prefix. Use "${anchor}" instead of "${value}".`,
        });
        return;
      }

      // Check prefixed redirect form: /de/slug or /de/
      const prefixedMatch = path.match(/^\/([a-z]{2})\/(.+)?$/);
      if (prefixedMatch) {
        const prefixLang = prefixedMatch[1];
        const prefixSlug = prefixedMatch[2] ?? "";
        const canonicalPath = localizeUrl(prefixLang, prefixSlug, { defaultLanguage });
        const entry = routeMap.get(canonicalPath);
        if (entry && entry.pageId === filePageId) {
          violations.push({
            file: relativeFile,
            line,
            ruleId: "LINK-02",
            message: `Same-page anchor must not carry language prefix. Use "${anchor}" instead of "${value}"`,
            fixHint: `Same-page anchor must not carry a path or language prefix. Use "${anchor}" instead of "${value}".`,
          });
          return;
        }
      }
    }

    // LINK-03: unresolved internal path
    const routeEntry = routeMap.get(path);
    if (!routeEntry) {
      violations.push({
        file: relativeFile,
        line,
        ruleId: "LINK-03",
        message: `Internal path "${path}" does not resolve to a known route`,
        fixHint: `Internal path "${path}" does not resolve to a known route. Check the route map in system.md or remove the link.`,
      });
      return;
    }

    // If path resolves and there's an anchor, validate the anchor against target page
    if (anchor) {
      const anchorId = anchor.slice(1);
      const targetPageAnchors = anchorRegistryByPage.get(routeEntry.pageId);
      const targetBlockAnchorIds = blockAnchorIdsByPage.get(routeEntry.pageId);
      const inBlockAnchors = targetBlockAnchorIds?.includes(anchorId) ?? false;
      if (targetPageAnchors) {
        const langMap = targetPageAnchors[anchorId];
        if (!langMap && !inBlockAnchors) {
          violations.push({
            file: relativeFile,
            line,
            ruleId: "LINK-01",
            message: `Anchor "${anchor}" not found on target page "${routeEntry.pageId}"`,
            fixHint: `Anchor "${anchor}" not found on page "${routeEntry.pageId}". Add "anchorId: ${anchorId}" to a block on that page, or add the anchor to system.md anchors registry, or add a matching heading in the prose file, or fix the anchor text.`,
          });
        }
      } else if (!inBlockAnchors) {
        // No anchor registry for target page, but block anchorIds may still match
        // If neither source has the anchor, report it
        violations.push({
          file: relativeFile,
          line,
          ruleId: "LINK-01",
          message: `Anchor "${anchor}" not found on target page "${routeEntry.pageId}"`,
          fixHint: `Anchor "${anchor}" not found on page "${routeEntry.pageId}". Add "anchorId: ${anchorId}" to a block on that page, or add the anchor to system.md anchors registry, or fix the anchor text.`,
        });
      }
    }
  }
}
