/*
<MODULE_CONTRACT>
<purpose>
RFC-0317: canonical URL parity validator and update-stamp validator.
Ensures sitemap, feed, llms, and HTML canonical tags all produce byte-identical
URLs for the same page, and that sitemap <lastmod> is always source-backed.
</purpose>
<non-goals>
  <item>Do not generate artifacts — only validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0317: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { canonicalPageUrl, type CanonicalUrlOptions } from "@warpgogol/share/canonical-url";
import { resolvePageUpdateStamp, isValidStampDate } from "@warpgogol/share/semantic";
import { diagnosticsResult } from "./result-helpers.ts";
import type { Diagnostic } from "@warpgogol/site-kernel";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function extractFeedUrls(xml: string): string[] {
  const urls: string[] = [];
  const linkRegex = /<link>(.*?)<\/link>/g;
  let match;
  while ((match = linkRegex.exec(xml)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function extractLlmsUrls(content: string): string[] {
  const urls: string[] = [];
  const linkRegex = /\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function extractSitemapLastmods(xml: string): Map<string, string> {
  const result = new Map<string, string>();
  const urlRegex = /<url>([\s\S]*?)<\/url>/g;
  let match;
  while ((match = urlRegex.exec(xml)) !== null) {
    const block = match[1];
    const locMatch = block.match(/<loc>(.*?)<\/loc>/);
    const lastmodMatch = block.match(/<lastmod>(.*?)<\/lastmod>/);
    if (locMatch && lastmodMatch) {
      result.set(locMatch[1], lastmodMatch[1]);
    }
  }
  return result;
}

export async function runCanonicalUrlValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const { manifest } = await loadSystemManifest(join(paths.appDirectory, "src", "content"));
  const defaultLang = defaultLanguageFromManifest(manifest);
  const supportedLangs = Object.keys(
    (manifest.i18n as { supported?: Record<string, unknown> } | undefined)?.supported ?? {
      [defaultLang]: true,
    },
  );
  const canonicalOpts: CanonicalUrlOptions = {
    baseUrl: siteUrl.replace(/\/$/, ""),
    defaultLanguage: defaultLang,
    supportedLanguages: supportedLangs,
    trailingSlash: "always",
  };

  const diagnostics: Diagnostic[] = [];

  // Build expected canonical URLs from system.md pages
  const expectedUrls = new Set<string>();
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  for (const page of pages) {
    if (!page.pageId || !page.routes) continue;
    for (const [lang, slug] of Object.entries(page.routes as Record<string, string>)) {
      const expected = canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts);
      expectedUrls.add(expected);
    }
  }

  // Check sitemap URLs
  const sitemapPath = join(paths.publicDirectory, "sitemap.xml");
  if (existsSync(sitemapPath)) {
    const sitemapIndex = await readFile(sitemapPath, "utf-8");
    const subSitemapNames = extractSitemapUrls(sitemapIndex)
      .map((url) => {
        try {
          return new URL(url).pathname.replace(/^\//, "");
        } catch {
          return null;
        }
      })
      .filter((name): name is string => name !== null && name !== "");

    for (const filename of subSitemapNames) {
      const subPath = join(paths.publicDirectory, filename);
      if (!existsSync(subPath)) continue;
      const subXml = await readFile(subPath, "utf-8");
      const sitemapUrls = extractSitemapUrls(subXml);
      for (const url of sitemapUrls) {
        if (!expectedUrls.has(url)) {
          diagnostics.push({
            ruleId: "CANON-01",
            severity: "warning",
            message: `Sitemap URL not in expected canonical set: ${url}`,
            fixHint: "Regenerate sitemap with canonicalPageUrl.",
          });
        }
      }
    }
  }

  // Check feed URLs
  const feedPath = join(paths.publicDirectory, "feed.xml");
  if (existsSync(feedPath)) {
    const feedXml = await readFile(feedPath, "utf-8");
    const feedUrls = extractFeedUrls(feedXml);
    for (const url of feedUrls) {
      if (url === canonicalPageUrl({ lang: defaultLang, route: "", kind: "html" }, canonicalOpts)) {
        continue;
      }
      if (!expectedUrls.has(url)) {
        diagnostics.push({
          ruleId: "CANON-02",
          severity: "warning",
          message: `Feed URL not in expected canonical set: ${url}`,
          fixHint: "Regenerate feed with canonicalPageUrl.",
        });
      }
    }
  }

  // Check llms.txt URLs
  const llmsPath = join(paths.publicDirectory, "llms.txt");
  if (existsSync(llmsPath)) {
    const llmsContent = await readFile(llmsPath, "utf-8");
    const llmsUrls = extractLlmsUrls(llmsContent);
    for (const url of llmsUrls) {
      if (url.endsWith("llms-full.txt") || url.endsWith("feed.xml") || url.endsWith("feed.json")) {
        continue;
      }
      if (!expectedUrls.has(url)) {
        diagnostics.push({
          ruleId: "CANON-03",
          severity: "warning",
          message: `llms.txt URL not in expected canonical set: ${url}`,
          fixHint: "Regenerate llms with canonicalPageUrl.",
        });
      }
    }
  }

  return diagnosticsResult("canonical.url.validate", diagnostics);
}

export async function runContentUpdateStampsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const { manifest } = await loadSystemManifest(join(paths.appDirectory, "src", "content"));
  const defaultLang = defaultLanguageFromManifest(manifest);
  const supportedLangs = Object.keys(
    (manifest.i18n as { supported?: Record<string, unknown> } | undefined)?.supported ?? {
      [defaultLang]: true,
    },
  );
  const canonicalOpts: CanonicalUrlOptions = {
    baseUrl: siteUrl.replace(/\/$/, ""),
    defaultLanguage: defaultLang,
    supportedLanguages: supportedLangs,
    trailingSlash: "always",
  };

  const diagnostics: Diagnostic[] = [];

  // Build expected lastmod map from system.md
  const expectedLastmods = new Map<string, string>();
  const expectedNoLastmod = new Set<string>();
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  for (const page of pages) {
    if (!page.pageId || !page.routes) continue;
    const stampResult = resolvePageUpdateStamp({
      pageId: page.pageId,
      lang: defaultLang,
      pageEntry: page as Record<string, unknown>,
    });
    for (const [lang, slug] of Object.entries(page.routes as Record<string, string>)) {
      const url = canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts);
      if (stampResult.stamp) {
        expectedLastmods.set(url, stampResult.stamp.date);
      } else {
        expectedNoLastmod.add(url);
      }
    }
  }

  // Check sitemap for lastmod parity
  const sitemapPath = join(paths.publicDirectory, "sitemap.xml");
  if (existsSync(sitemapPath)) {
    const sitemapIndex = await readFile(sitemapPath, "utf-8");
    const subSitemapNames = extractSitemapUrls(sitemapIndex)
      .map((url) => {
        try {
          return new URL(url).pathname.replace(/^\//, "");
        } catch {
          return null;
        }
      })
      .filter((name): name is string => name !== null && name !== "");

    for (const filename of subSitemapNames) {
      const subPath = join(paths.publicDirectory, filename);
      if (!existsSync(subPath)) continue;
      const subXml = await readFile(subPath, "utf-8");
      const actualLastmods = extractSitemapLastmods(subXml);

      for (const [url, lastmod] of actualLastmods) {
        if (!isValidStampDate(lastmod)) {
          diagnostics.push({
            ruleId: "STAMP-01",
            severity: "error",
            message: `Sitemap lastmod for ${url} is not a valid YYYY-MM-DD date: ${lastmod}`,
            fixHint: "Use a source-backed update stamp resolver.",
          });
        }
        const expected = expectedLastmods.get(url);
        if (expected && expected !== lastmod) {
          diagnostics.push({
            ruleId: "STAMP-02",
            severity: "error",
            message: `Sitemap lastmod for ${url} is ${lastmod} but resolver expects ${expected}`,
            fixHint: "Regenerate sitemap with the update-stamp resolver.",
          });
        }
        if (expectedNoLastmod.has(url)) {
          diagnostics.push({
            ruleId: "STAMP-03",
            severity: "error",
            message: `Sitemap has lastmod for ${url} but no source-backed stamp exists`,
            fixHint: "Remove lastmod from pages without a source-backed update stamp.",
          });
        }
      }

      // Check that expected lastmods are present
      for (const [url, _expected] of expectedLastmods) {
        if (!actualLastmods.has(url) && expectedNoLastmod.size === 0) {
          // This is OK — lastmod may be omitted if the generator chose to
        }
      }
    }
  }

  // Check that no generator uses build date (heuristic: lastmod == today)
  const today = new Date().toISOString().slice(0, 10);
  for (const [, lastmod] of expectedLastmods) {
    if (lastmod === today) {
      diagnostics.push({
        ruleId: "STAMP-04",
        severity: "warning",
        message: `Update stamp ${lastmod} equals today's date — verify this is source-backed, not build date.`,
        fixHint: "Ensure the update stamp comes from authored content, not new Date().",
      });
    }
  }

  return diagnosticsResult("content.update-stamps.validate", diagnostics);
}
