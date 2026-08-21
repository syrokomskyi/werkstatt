/*
<MODULE_CONTRACT>
<purpose>
RFC-0906: canonical HTML parity validator. Scans rendered HTML in dist/client/
for <link rel="canonical"> and <meta property="og:url"> and compares each
against the expected canonicalPageUrl output for the corresponding route.
Ensures byte-identical canonical URLs across HTML and sitemap/feed/llms.
</purpose>
<non-goals>
  <item>Do not validate sitemap/feed/llms URL parity — that is owned by canonical.url.validate (RFC-0317, CANON-01..03).</item>
  <item>Do not validate canonical domain origin — that is owned by seo.domain.validate (RFC-0898).</item>
  <item>Do not validate JSON-LD WebPage.url — that is owned by jsonld.url.validate (RFC-0163).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0906: initial implementation — CANON-HTML-01..03 rules for HTML canonical and og:url parity.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { collectFiles } from "@warpgogol/werkstatt-shared/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { Diagnostic } from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import {
  canonicalPageUrl,
  type CanonicalUrlOptions,
} from "@warpgogol/werkstatt-site/share/astro/canonical-url";
import { diagnosticsResult } from "./result-helpers.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { isHtmlRedirectPage } from "./audit/validators/helpers.ts";

function extractCanonicalHref(html: string): string | null {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function extractOgUrl(html: string): string | null {
  const match = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

export async function runCanonicalHtmlParityValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const distClientDir = join(paths.appDirectory, "dist", "client");

  if (!existsSync(distClientDir)) {
    return diagnosticsResult("canonical.html-parity.validate", []);
  }

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

  const expectedUrls = new Set<string>();
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  for (const page of pages) {
    if (!page.pageId || !page.routes) continue;
    for (const [lang, slug] of Object.entries(page.routes as Record<string, string>)) {
      const expected = canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts);
      expectedUrls.add(expected);
    }
  }

  const htmlFiles = await collectFiles(distClientDir, {
    extensions: [".html"],
    ignore: () => false,
  });

  const diagnostics: Diagnostic[] = [];

  for (const htmlFile of htmlFiles) {
    let rawHtml: string;
    try {
      rawHtml = await readFile(htmlFile, "utf8");
    } catch {
      continue;
    }

    if (isHtmlRedirectPage(rawHtml)) {
      continue;
    }

    const canonicalHref = extractCanonicalHref(rawHtml);
    const ogUrl = extractOgUrl(rawHtml);

    if (!canonicalHref && !ogUrl) {
      continue;
    }

    if (canonicalHref && !expectedUrls.has(canonicalHref)) {
      diagnostics.push({
        ruleId: "CANON-HTML-01",
        severity: "error",
        message: `Canonical href ${canonicalHref} does not match any expected canonicalPageUrl output`,
        fixHint:
          "Ensure pageUrl in resolve-route.ts uses canonicalPageUrl with trailingSlash: always",
      });
    }

    if (ogUrl && !expectedUrls.has(ogUrl)) {
      diagnostics.push({
        ruleId: "CANON-HTML-02",
        severity: "error",
        message: `og:url ${ogUrl} does not match any expected canonicalPageUrl output`,
        fixHint:
          "Ensure og:url is derived from the same canonicalPageUrl output as the canonical tag",
      });
    }

    if (canonicalHref && ogUrl && canonicalHref !== ogUrl) {
      diagnostics.push({
        ruleId: "CANON-HTML-03",
        severity: "error",
        message: `Canonical href ${canonicalHref} diverges from og:url ${ogUrl}`,
        fixHint:
          "Ensure both canonical and og:url are derived from the same canonicalPageUrl output",
      });
    }
  }

  return diagnosticsResult("canonical.html-parity.validate", diagnostics);
}
