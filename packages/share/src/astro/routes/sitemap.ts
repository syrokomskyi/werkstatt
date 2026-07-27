/*
<MODULE_CONTRACT>
<purpose>Sitemap route helpers for RFC-0048: provides sitemap URL entries derived from the route registry.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from routes.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { localizeUrl } from "../url-policy.ts";
import type { LanguageCode, PageId } from "./registry.ts";
import { getRouteRegistry } from "./registry.ts";

/** Single locale entry within a sitemap page cluster */
export interface SitemapLocaleEntry {
  lang: LanguageCode;
  path: string;
  url: string;
}

/** Cluster of all localized URLs for one logical page */
export interface PageCluster {
  pageId: string;
  lastmod?: string;
  locales: SitemapLocaleEntry[];
}

/** Build PageCluster[] from the route registry for sitemap generation */
export async function buildSitemapClusters(siteUrl: string): Promise<PageCluster[]> {
  const registry = await getRouteRegistry();
  const baseUrl = siteUrl.replace(/\/$/, "");
  const clusters: PageCluster[] = [];

  for (const entry of registry.byPageId.values()) {
    if (entry.sitemapExclude) continue;

    const locales: SitemapLocaleEntry[] = [];
    for (const [lang, slug] of Object.entries(entry.routes)) {
      const path = localizeUrl(lang, slug, { defaultLanguage: registry.defaultLanguage });
      locales.push({ lang, path, url: `${baseUrl}${path}` });
    }

    if (locales.length > 0) {
      clusters.push({ pageId: entry.pageId, locales });
    }
  }

  return clusters;
}

/** Escape XML special characters for safe inclusion in sitemap XML */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Generate sitemap XML from PageCluster[] */
export function generateSitemapXml(clusters: PageCluster[]): string {
  const urls = clusters.flatMap((cluster) => {
    const alternates = cluster.locales.map((locale) => ({
      lang: locale.lang,
      href: locale.url,
    }));

    return cluster.locales.map((locale) => {
      const linksXml = alternates
        .map(
          ({ lang, href }) =>
            `<xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}" />`,
        )
        .join("");

      const lastmodXml = cluster.lastmod ? `<lastmod>${escapeXml(cluster.lastmod)}</lastmod>` : "";

      return `  <url>\n    <loc>${escapeXml(locale.url)}</loc>\n${alternates
        .map(
          ({ lang, href }) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}" />`,
        )
        .join("\n")}${lastmodXml ? "\n    " + lastmodXml : ""}\n  </url>`;
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset\n  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:xhtml="http://www.w3.org/1999/xhtml"\n>\n${urls.join("\n")}\n</urlset>`;
}

/** Build alternate hreflang links for a page's <head> */
export async function getAlternateLinks(
  pageId: PageId,
  siteUrl: string,
): Promise<Array<{ lang: string; href: string }>> {
  const registry = await getRouteRegistry();
  const entry = registry.byPageId.get(pageId);
  if (!entry) return [];

  const baseUrl = siteUrl.replace(/\/$/, "");
  const defaultLanguage = registry.defaultLanguage;
  const links: Array<{ lang: string; href: string }> = [];

  for (const [lang, slug] of Object.entries(entry.routes)) {
    const path = localizeUrl(lang, slug, { defaultLanguage });
    links.push({ lang, href: `${baseUrl}${path}` });
  }

  // RFC-0160: advertise the unprefixed default-language URL as x-default.
  const defaultSlug = entry.routes[defaultLanguage];
  if (defaultSlug !== undefined) {
    const defaultPath = localizeUrl(defaultLanguage, defaultSlug, { defaultLanguage });
    links.push({ lang: "x-default", href: `${baseUrl}${defaultPath}` });
  }

  return links;
}
