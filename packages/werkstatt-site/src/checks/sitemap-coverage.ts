/*
<MODULE_CONTRACT>
<purpose>
RFC-0907: sitemap coverage validator. Cross-references sitemap URLs in
dist/client/sitemap*.xml against indexable pages declared in system.md.
Ensures every indexable page appears in the sitemap and flags unexpected
sitemap URLs as warnings.
</purpose>
<non-goals>
  <item>Does not check for placeholder URLs — see sitemap.placeholder.validate.</item>
  <item>Does not generate or modify sitemap files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0907: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import {
  canonicalPageUrl,
  type CanonicalUrlOptions,
} from "@warpgogol/werkstatt-site/share/astro/canonical-url";
import { collectFiles } from "@warpgogol/werkstatt-shared/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";
import { extractSitemapUrls } from "./canonical-url.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import type { Diagnostic } from "@warpgogol/werkstatt/kernel";

interface SitemapCoverageResult {
  expectedPages: number;
  sitemapUrls: number;
  missing: number;
  extra: number;
}

type SystemPageView = {
  pageId?: string;
  routes?: Record<string, string>;
  output?: { sitemap?: boolean | { include?: boolean } };
};

function isSitemapExcluded(page: SystemPageView): boolean {
  const sitemap = page.output?.sitemap;
  if (typeof sitemap === "boolean") return !sitemap;
  if (sitemap && typeof sitemap === "object") return sitemap.include === false;
  return false;
}

export async function runSitemapCoverageValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const distClient = join(paths.appDirectory, "dist", "client");

  let manifest;
  try {
    const result = await loadSystemManifest(join(paths.appDirectory, "src", "content"));
    manifest = result.manifest;
  } catch {
    return {
      data: {
        command: "sitemap.coverage.validate",
        status: "pass",
        diagnostics: [],
        summary: { error: 0, warning: 0, info: 1 },
      },
      exitCode: 0,
      summary: "sitemap.coverage.validate: skipped (system.md manifest not found)",
    };
  }

  const sitemapFiles = await collectFiles(distClient, {
    extensions: [".xml"],
  }).then((files) => files.filter((f) => /sitemap.*\.xml$/.test(f)));

  if (sitemapFiles.length === 0) {
    return {
      data: {
        command: "sitemap.coverage.validate",
        status: "pass",
        diagnostics: [],
        summary: { error: 0, warning: 0, info: 1 },
      },
      exitCode: 0,
      summary:
        "sitemap.coverage.validate: skipped (no sitemap files in dist/client; post-build only)",
    };
  }

  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const defaultLang = defaultLanguageFromManifest(manifest);
  const supportedLangs = Object.keys(manifest.i18n?.supported ?? { [defaultLang]: true });
  const canonicalOpts: CanonicalUrlOptions = {
    baseUrl: siteUrl.replace(/\/$/, ""),
    defaultLanguage: defaultLang,
    supportedLanguages: supportedLangs,
    trailingSlash: "always",
  };

  const expectedUrls = new Set<string>();
  const pages = (Array.isArray(manifest.pages) ? manifest.pages : []) as SystemPageView[];
  for (const page of pages) {
    if (!page.routes) continue;
    if (isSitemapExcluded(page)) continue;
    // Skip route template entries (e.g. nachweis-detail with [slug], nachweis-verify
    // with [version]). These are patterns expanded by dedicated route generators,
    // not actual pages.
    const hasPlaceholder = Object.values(page.routes).some(
      (slug) => typeof slug === "string" && (slug.includes("[") || slug.includes("]")),
    );
    if (hasPlaceholder) continue;
    for (const [lang, slug] of Object.entries(page.routes)) {
      const expected = canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts);
      expectedUrls.add(expected);
    }
  }

  const sitemapUrlSet = new Set<string>();
  for (const sitemapFile of sitemapFiles) {
    const xml = await readFile(sitemapFile, "utf-8");
    const urls = extractSitemapUrls(xml);
    for (const url of urls) {
      sitemapUrlSet.add(url);
    }
  }

  const diagnostics: Diagnostic[] = [];
  let missing = 0;
  let extra = 0;

  for (const expected of expectedUrls) {
    if (!sitemapUrlSet.has(expected)) {
      missing++;
      diagnostics.push({
        ruleId: "SITEMAP-COV-01",
        severity: "error",
        file: sitemapFiles[0],
        message: `Indexable page missing from sitemap: ${expected}`,
        fixHint: "Ensure the sitemap generator includes all indexable pages from system.md",
      });
    }
  }

  for (const url of sitemapUrlSet) {
    if (!expectedUrls.has(url)) {
      extra++;
      diagnostics.push({
        ruleId: "SITEMAP-COV-02",
        severity: "warning",
        file: sitemapFiles[0],
        message: `Sitemap URL not in expected indexable set: ${url}`,
        fixHint:
          "Verify this URL should be in the sitemap; if not, exclude it via output.sitemap: false",
      });
    }
  }

  const result: SitemapCoverageResult = {
    expectedPages: expectedUrls.size,
    sitemapUrls: sitemapUrlSet.size,
    missing,
    extra,
  };
  const base = diagnosticsResult("sitemap.coverage.validate", diagnostics);
  return {
    ...base,
    data: { ...base.data, ...result },
  };
}
