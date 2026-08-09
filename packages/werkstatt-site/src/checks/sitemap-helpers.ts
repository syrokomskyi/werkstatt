import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>Internal helpers for sitemap generation and validation — cluster building, XML generation/parsing, and validation logic.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted helpers from sitemap.ts into sitemap-helpers.ts.</item>
  <item>RFC-0788: Add markdown alternate link support — generateSitemapXml accepts optional markdownTwins map, SitemapUrlEntry gains markdownAlternates field, parseSitemapXml extracts type-bearing alternates, validateSitemapFile validates markdown alternates separately from hreflang.</item>
</CHANGE_SUMMARY>
*/

import { join, dirname } from "node:path";
import type { WorkspaceIO, DirEntry } from "@warpgogol/werkstatt/kernel";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { resolvePageOutput, type RawPageOutput } from "@warpgogol/werkstatt-site/share/semantic";
import { localizeUrl } from "@warpgogol/werkstatt-site/share/url-policy";
import {
  canonicalPageUrl,
  type CanonicalUrlOptions,
} from "@warpgogol/werkstatt-site/share/canonical-url";
import {
  resolvePageUpdateStamp,
  type PageUpdateStampResult,
} from "@warpgogol/werkstatt-site/share/semantic";
import { DEFAULT_PROFILE_BASE_BY_LANG } from "@warpgogol/werkstatt-site/share/people-profile-defaults";
import { hasGeneratedMarker } from "@warpgogol/werkstatt-site/codegen";
import { readEntitledFeatures } from "./lib/entitlements.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

export const IMAGE_SITEMAP_FILENAME = "sitemap-images.xml";

export interface SitemapLocaleEntry {
  lang: string;
  path: string;
  url: string;
}

export interface PageCluster {
  pageId: string;
  locales: SitemapLocaleEntry[];
  /** RFC-0317: source-backed update stamp for this page (same for all locales of a page). */
  updateStamp?: PageUpdateStampResult;
}

/** Build clusters directly from system.md (CLI context, no Astro content collections) */
export async function buildClustersFromSystemMd(
  io: WorkspaceIO,
  appDir: string,
  siteUrl: string,
): Promise<{
  clusters: PageCluster[];
  categoryMap: Map<string, string>;
  defaultLanguage: string;
  supportedLanguages: string[];
}> {
  const contentDir = join(appDir, "src", "content");
  const manifest = await loadSystemManifest(contentDir);
  type SitemapPageExtensions = {
    semanticType?: string;
    output?: RawPageOutput;
  };
  const pages = (manifest.manifest.pages ?? []) as Array<
    (typeof manifest.manifest.pages)[number] & SitemapPageExtensions
  >;
  const baseUrl = siteUrl.replace(/\/$/, "");
  const defaultLanguage = defaultLanguageFromManifest(manifest.manifest);
  const supportedLangs = Object.keys(
    (manifest.manifest.i18n as { supported?: Record<string, unknown> } | undefined)?.supported ?? {
      [defaultLanguage]: true,
    },
  );
  // RFC-0788: expose supportedLanguages so sitemap generate/validate can build markdownTwins map.
  const canonicalOpts: CanonicalUrlOptions = {
    baseUrl,
    defaultLanguage,
    supportedLanguages: supportedLangs,
    trailingSlash: "always",
  };
  const clusters: PageCluster[] = [];
  const categoryMap = new Map<string, string>();

  const entitledFeatures = await readEntitledFeatures(appDir);
  const blogGated = entitledFeatures !== null && !entitledFeatures.includes("blog");

  for (const page of pages) {
    if (!page.pageId || !page.routes) continue;
    if (blogGated && page.semanticType === "article") continue;

    const projection = resolvePageOutput(page.output, {
      semanticType: page.semanticType,
    });
    const sitemap = projection.sitemap;
    if (!sitemap.include) continue;
    if (!projection.robots.index) continue;

    const category = sitemap.category;

    const locales: SitemapLocaleEntry[] = [];
    for (const [lang, slug] of Object.entries(page.routes as Record<string, string>)) {
      const path = localizeUrl(lang, slug, { defaultLanguage });
      const url = canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts);
      locales.push({ lang, path, url });
    }

    const updateStamp = resolvePageUpdateStamp({
      pageId: page.pageId as string,
      lang: defaultLanguage,
      pageEntry: page as Record<string, unknown>,
    });

    if (locales.length > 0) {
      clusters.push({ pageId: page.pageId as string, locales, updateStamp });
      categoryMap.set(page.pageId as string, category);
    }
  }

  const pseoGated = entitledFeatures !== null && !entitledFeatures.includes("pseo");
  if (!pseoGated) {
    for (const surface of await readSurfaceEntries(io, appDir)) {
      if (!surface.indexable || surface.noindex) continue;
      const locales: SitemapLocaleEntry[] = [];
      for (const [lang, slug] of Object.entries(surface.routes)) {
        const path = localizeUrl(lang, slug, { defaultLanguage });
        const url = canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts);
        locales.push({ lang, path, url });
      }
      if (locales.length > 0) {
        clusters.push({ pageId: surface.pageId, locales });
        categoryMap.set(surface.pageId, "content");
      }
    }
  }

  const profilesGated = entitledFeatures !== null && !entitledFeatures.includes("team.profiles");
  if (!profilesGated) {
    const aboutPage = pages.find((p) => p.semanticType === "about");
    const baseFor = (lang: string): string =>
      (aboutPage?.routes as Record<string, string> | undefined)?.[lang] ??
      DEFAULT_PROFILE_BASE_BY_LANG[lang] ??
      "team";
    for (const slug of await readProfileEnabledSlugs(io, appDir, defaultLanguage)) {
      const locales: SitemapLocaleEntry[] = [];
      for (const lang of supportedLangs) {
        const route = `${baseFor(lang)}/${slug}`;
        const path = localizeUrl(lang, route, { defaultLanguage });
        const url = canonicalPageUrl({ lang, route, kind: "html" }, canonicalOpts);
        locales.push({ lang, path, url });
      }
      if (locales.length > 0) {
        clusters.push({ pageId: `person:${slug}`, locales });
        categoryMap.set(`person:${slug}`, "content");
      }
    }
  }

  return { clusters, categoryMap, defaultLanguage, supportedLanguages: supportedLangs };
}

/** Read profile-page-enabled Person slugs from disk (default-language anchors). Fail-open to []. */
async function readProfileEnabledSlugs(
  io: WorkspaceIO,
  appDir: string,
  defaultLang: string,
): Promise<string[]> {
  const peopleDir = join(appDir, "src", "content", "people", defaultLang);
  let files: DirEntry[];
  try {
    files = await io.readdir(peopleDir);
  } catch {
    return [];
  }
  const slugs: string[] = [];
  for (const f of files) {
    if (!f.isFile || !f.name.endsWith(".md")) continue;
    const data = parseMarkdownFrontmatter(await io.readFile(join(peopleDir, f.name))).data as
      Record<string, unknown> | undefined;
    const page = data?.["page"] as { enabled?: unknown } | undefined;
    if (page?.enabled !== true) continue;
    const slug =
      typeof data?.["slug"] === "string" ? (data["slug"] as string) : f.name.replace(/\.md$/, "");
    slugs.push(slug);
  }
  return slugs;
}

/**
 * RFC-0049/0160: the full ordered hreflang alternate set for a cluster — one
 * entry per localized URL plus an `x-default` pointing at the default-language
 * URL (mirrors the in-page <head> links from getAlternateLinks). This is the
 * single source of truth shared by the generator and validator so the two can
 * never drift. Clusters without a default-language locale (defensive) get no
 * x-default.
 */
export function clusterAlternates(
  cluster: PageCluster,
  defaultLanguage: string,
): Array<{ lang: string; href: string }> {
  const alternates = cluster.locales.map((locale) => ({ lang: locale.lang, href: locale.url }));
  const defaultLocale = cluster.locales.find((locale) => locale.lang === defaultLanguage);
  if (defaultLocale) {
    alternates.push({ lang: "x-default", href: defaultLocale.url });
  }
  return alternates;
}

/** Read indexable surface route entries from the generated artifact (fail-open to []). */
async function readSurfaceEntries(
  io: WorkspaceIO,
  appDir: string,
): Promise<
  Array<{ pageId: string; routes: Record<string, string>; indexable: boolean; noindex: boolean }>
> {
  try {
    const raw = await io.readFile(join(appDir, "src", "surface.generated.yaml"));
    const parsed = yamlParse(raw) as {
      entries?: Array<{
        pageId: string;
        routes: Record<string, string>;
        indexable: boolean;
        noindex: boolean;
      }>;
    };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/** Group clusters by their sitemapCategory (defaults to "content") */
export function groupClustersByCategory(
  clusters: PageCluster[],
  categoryMap: Map<string, string>,
): Map<string, PageCluster[]> {
  const grouped = new Map<string, PageCluster[]>();
  for (const cluster of clusters) {
    const category = categoryMap.get(cluster.pageId) ?? "content";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(cluster);
  }
  return grouped;
}

/** Generate a sitemap index XML referencing sub-sitemap files */
export function generateSitemapIndex(baseUrl: string, filenames: string[]): string {
  const entries = filenames
    .map(
      (filename) =>
        `  <sitemap>\n    <loc>${escapeXml(`${baseUrl}/${filename}`)}</loc>\n  </sitemap>`,
    )
    .join("\n");

  // RFC-0375: sitemap-index.xml is Category B — no marker in output.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function generateSitemapXml(
  clusters: PageCluster[],
  defaultLanguage: string,
  markdownTwins?: Map<string, string>,
): string {
  const urls = clusters.flatMap((cluster) => {
    const alternates = clusterAlternates(cluster, defaultLanguage);
    const lastmod = cluster.updateStamp?.stamp?.date;

    return cluster.locales.map((locale) => {
      const lastmodXml = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
      // RFC-0788: add markdown alternate link if a .md twin exists for this locale.
      const mdHref = markdownTwins?.get(locale.url);
      const mdLink = mdHref
        ? `\n    <xhtml:link rel="alternate" type="text/markdown" href="${escapeXml(mdHref)}" />`
        : "";
      return `  <url>\n    <loc>${escapeXml(locale.url)}</loc>${lastmodXml}\n${alternates
        .map(
          ({ lang, href }) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}" />`,
        )
        .join("\n")}${mdLink}\n  </url>`;
    });
  });

  // RFC-0375: sitemap-0.xml is Category B — no marker in output.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset\n  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:xhtml="http://www.w3.org/1999/xhtml"\n>\n${urls.join("\n")}\n</urlset>`;
}

export async function writeGeneratedFile(
  io: WorkspaceIO,
  filePath: string,
  content: string,
): Promise<"written" | "skipped"> {
  if (await io.exists(filePath)) {
    const existing = await io.readFile(filePath);
    if (!hasGeneratedMarker(existing)) {
      return "skipped";
    }
  }
  await io.mkdir(dirname(filePath));
  await io.writeFile(filePath, content);
  return "written";
}

export interface SitemapUrlEntry {
  loc: string;
  hreflangs: Array<{ lang: string; href: string }>;
  markdownAlternates: Array<{ type: string; href: string }>;
}

export function parseSitemapXml(xml: string): SitemapUrlEntry[] {
  const entries: SitemapUrlEntry[] = [];
  const urlRegex = /<url>([\s\S]*?)<\/url>/g;
  let match;

  while ((match = urlRegex.exec(xml)) !== null) {
    const block = match[1];
    const locMatch = block.match(/<loc>(.*?)<\/loc>/);
    const loc = locMatch?.[1] ?? "";

    const hreflangs: Array<{ lang: string; href: string }> = [];
    const linkRegex = /<xhtml:link[^>]*?hreflang="([^"]*)"[^>]*?href="([^"]*)"[^>]*?\/?>/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(block)) !== null) {
      hreflangs.push({ lang: linkMatch[1], href: linkMatch[2] });
    }

    // RFC-0788: extract markdown alternate links (type-bearing, no hreflang).
    const markdownAlternates: Array<{ type: string; href: string }> = [];
    const mdLinkRegex = /<xhtml:link[^>]*?type="([^"]*)"[^>]*?href="([^"]*)"[^>]*?\/?>/g;
    let mdLinkMatch;
    while ((mdLinkMatch = mdLinkRegex.exec(block)) !== null) {
      markdownAlternates.push({ type: mdLinkMatch[1], href: mdLinkMatch[2] });
    }

    entries.push({ loc, hreflangs, markdownAlternates });
  }

  return entries;
}

/** Parse a sitemap index XML to extract sub-sitemap filenames */
export function parseSitemapIndex(xml: string, baseUrl: string): string[] {
  const filenames: string[] = [];
  const sitemapRegex = /<sitemap>([\s\S]*?)<\/sitemap>/g;
  let match;
  while ((match = sitemapRegex.exec(xml)) !== null) {
    const block = match[1];
    const locMatch = block.match(/<loc>(.*?)<\/loc>/);
    const loc = locMatch?.[1] ?? "";
    if (loc.startsWith(baseUrl + "/")) {
      filenames.push(loc.slice(baseUrl.length + 1));
    } else if (loc) {
      filenames.push(loc);
    }
  }
  return filenames;
}

/** Validate a single sitemap file against the full expected clusters */
export function validateSitemapFile(
  parsed: SitemapUrlEntry[],
  clusters: PageCluster[],
  filename: string,
  defaultLanguage: string,
  markdownTwins: Map<string, string>,
): string[] {
  const violations: string[] = [];

  const locSet = new Set<string>();
  for (const entry of parsed) {
    if (locSet.has(entry.loc)) {
      violations.push(`[${filename}] Duplicate <loc>: ${entry.loc}`);
    }
    locSet.add(entry.loc);
  }

  const expectedUrls = new Map<
    string,
    { pageId: string; hreflangs: Array<{ lang: string; href: string }> }
  >();
  for (const cluster of clusters) {
    for (const locale of cluster.locales) {
      expectedUrls.set(locale.url, {
        pageId: cluster.pageId,
        hreflangs: clusterAlternates(cluster, defaultLanguage),
      });
    }
  }

  for (const entry of parsed) {
    if (!expectedUrls.has(entry.loc)) {
      violations.push(`[${filename}] Unexpected <url> entry not in route registry: ${entry.loc}`);
    }
  }

  for (const entry of parsed) {
    const expected = expectedUrls.get(entry.loc);
    if (!expected) continue;

    const expectedSet = new Set(expected.hreflangs.map((h) => `${h.lang}|${h.href}`));
    const actualSet = new Set(entry.hreflangs.map((h) => `${h.lang}|${h.href}`));

    for (const expectedHreflang of expected.hreflangs) {
      const key = `${expectedHreflang.lang}|${expectedHreflang.href}`;
      if (!actualSet.has(key)) {
        violations.push(
          `[${filename}] Missing alternate link on ${entry.loc}: hreflang="${expectedHreflang.lang}" href="${expectedHreflang.href}"`,
        );
      }
    }

    for (const actualHreflang of entry.hreflangs) {
      const key = `${actualHreflang.lang}|${actualHreflang.href}`;
      if (!expectedSet.has(key)) {
        violations.push(
          `[${filename}] Unexpected alternate link on ${entry.loc}: hreflang="${actualHreflang.lang}" href="${actualHreflang.href}"`,
        );
      }
    }

    // RFC-0788: validate markdown alternate links separately from hreflang alternates.
    const expectedMdHref = markdownTwins.get(entry.loc);
    if (expectedMdHref) {
      const hasMd = entry.markdownAlternates.some(
        (a) => a.type === "text/markdown" && a.href === expectedMdHref,
      );
      if (!hasMd) {
        violations.push(
          `[${filename}] Missing markdown alternate link on ${entry.loc}: type="text/markdown" href="${expectedMdHref}"`,
        );
      }
    }
    for (const actual of entry.markdownAlternates) {
      if (actual.type !== "text/markdown") continue;
      if (actual.href !== expectedMdHref) {
        violations.push(
          `[${filename}] Unexpected markdown alternate link on ${entry.loc}: type="${actual.type}" href="${actual.href}"`,
        );
      }
    }
  }

  return violations;
}
