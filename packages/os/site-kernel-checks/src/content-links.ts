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
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
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
import { resultFromViolations } from "./result-helpers.ts";
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
  rule: string;
  message: string;
}

/** Parse a URL string into { path, anchor } */
function parseUrl(value: string): { path: string | null; anchor: string | null } {
  const hashIndex = value.indexOf("#");
  if (hashIndex === 0) {
    return { path: null, anchor: value };
  }
  if (hashIndex > 0) {
    return { path: value.slice(0, hashIndex), anchor: value.slice(hashIndex) };
  }
  return { path: value, anchor: null };
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

    // For page files, extract pageId and prose heading IDs
    let filePageId: string | null = null;
    let proseHeadingIds: string[] = [];
    if (isPageFile) {
      filePageId = typeof doc.frontmatter.pageId === "string" ? doc.frontmatter.pageId : null;
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
        routeMap,
        anchorRegistryByPage,
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
        routeMap,
        anchorRegistryByPage,
        defaultLanguage,
        violations,
      );
    }
  }

  const violationMessages = violations.map((v) => {
    const loc = v.line ? `${v.file}:${v.line}` : v.file;
    return `${loc} — [${v.rule}] ${v.message}`;
  });

  return resultFromViolations(COMMAND, violationMessages);
}

function validateUrl(
  value: string,
  relativeFile: string,
  line: number | undefined,
  lang: string,
  filePageId: string | null,
  proseHeadingIds: string[],
  routeMap: Map<string, RouteEntry>,
  anchorRegistryByPage: Map<string, AnchorRegistry>,
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
    if (resolved === null && !inProseHeadings && !inRegistryKeys) {
      violations.push({
        file: relativeFile,
        line,
        rule: "LINK-01",
        message: `Anchor "${anchor}" not found on page "${filePageId}" for lang "${lang}". Add to system.md anchor registry or prose heading.`,
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
          rule: "LINK-02",
          message: `Same-page anchor must not carry path prefix. Use "${anchor}" instead of "${value}"`,
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
            rule: "LINK-02",
            message: `Same-page anchor must not carry language prefix. Use "${anchor}" instead of "${value}"`,
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
        rule: "LINK-03",
        message: `Internal path "${path}" does not resolve to a known route`,
      });
      return;
    }

    // If path resolves and there's an anchor, validate the anchor against target page
    if (anchor) {
      const anchorId = anchor.slice(1);
      const targetPageAnchors = anchorRegistryByPage.get(routeEntry.pageId);
      if (targetPageAnchors) {
        const langMap = targetPageAnchors[anchorId];
        if (!langMap) {
          violations.push({
            file: relativeFile,
            line,
            rule: "LINK-01",
            message: `Anchor "${anchor}" not found on target page "${routeEntry.pageId}"`,
          });
        }
      }
      // If no anchor registry for target page, we can't validate — skip silently
    }
  }
}
