/*
<MODULE_CONTRACT>
<purpose>RFC-0898: SEO domain origin validator — scans rendered HTML for canonical, og:url, hreflang, and JSON-LD url fields, checking origins against Astro.site and detecting dev/staging hostname leakage.</purpose>
<non-goals>
  <item>Do not check sitemap/feed/llms URL parity — that is owned by canonical.url.validate (RFC-0317).</item>
  <item>Do not check OG tag presence — that is owned by seo.meta.validate (RFC-0162).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0898: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
import { readAstroSiteUrl } from "../../lib/astro-site-url.ts";
import {
  collectRenderedHtml,
  extractAllJsonLdNodes,
  extractMetaContent,
  finding,
  isHtmlRedirectPage,
} from "./helpers.ts";

const DEV_STAGING_PATTERNS = ["dev.", "staging.", "localhost", "127.0.0.1", "0.0.0.0", ".local"];

function extractOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function extractAllHreflangHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const re = /<link[^>]+rel=["']alternate["'][^>]+hreflang=["'][^"']*["'][^>]+href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    hrefs.push(match[1]);
  }
  return hrefs;
}

function extractAllJsonLdUrls(nodes: Array<Record<string, unknown>>): string[] {
  const urls: string[] = [];
  for (const node of nodes) {
    const url = node["url"];
    if (typeof url === "string") {
      urls.push(url);
    }
  }
  return urls;
}

function containsDevStagingPattern(url: string): boolean {
  const lower = url.toLowerCase();
  return DEV_STAGING_PATTERNS.some((p) => lower.includes(p));
}

export async function runSeoDomainValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  if (htmlFiles.length === 0) {
    const result = buildAuditResult({
      command: "seo.domain.validate",
      app: audit.siteName,
      workspaceRoot: audit.workspaceRoot,
      findings,
      runtimeMs: Date.now() - started,
    });
    return {
      data: result,
      exitCode: 0,
      summary: "seo.domain.validate: skipped (no dist/ HTML; build the app first)",
    };
  }

  const siteUrl = await readAstroSiteUrl(audit.appDirectory);
  const expectedOrigin = siteUrl ? extractOrigin(siteUrl) : null;

  if (!expectedOrigin) {
    findings.push(
      finding({
        ruleId: "SEO-DOMAIN-CONFIG-01",
        severity: "warning",
        file: undefined,
        message: "Astro.site is not configured — SEO-DOMAIN-01 through SEO-DOMAIN-04 are skipped. Only SEO-DOMAIN-05 (dev/staging pattern check) runs.",
        evidence: [{ kind: "config", file: "astro.config.mjs" }],
      }),
    );
  }

  for (const page of htmlFiles) {
    if (isHtmlRedirectPage(page.html)) {
      continue;
    }

    const canonicalHref =
      page.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
    const ogUrl = extractMetaContent(page.html, "og:url", "property");
    const hreflangHrefs = extractAllHreflangHrefs(page.html);
    const jsonLdNodes = extractAllJsonLdNodes(page.html);
    const jsonLdUrls = extractAllJsonLdUrls(jsonLdNodes);

    const allUrls = [canonicalHref, ogUrl, ...hreflangHrefs, ...jsonLdUrls].filter(
      (u): u is string => u !== null,
    );

    for (const url of allUrls) {
      if (containsDevStagingPattern(url)) {
        findings.push(
          finding({
            ruleId: "SEO-DOMAIN-05",
            severity: "error",
            file: page.file,
            message: `SEO tag URL contains a dev/staging hostname pattern: ${url}`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      }
    }

    if (!expectedOrigin) {
      continue;
    }

    if (canonicalHref) {
      const origin = extractOrigin(canonicalHref);
      if (origin && origin !== expectedOrigin) {
        findings.push(
          finding({
            ruleId: "SEO-DOMAIN-01",
            severity: "error",
            file: page.file,
            message: `Canonical URL origin (${origin}) does not match Astro.site origin (${expectedOrigin}).`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      }
    }

    if (ogUrl) {
      const origin = extractOrigin(ogUrl);
      if (origin && origin !== expectedOrigin) {
        findings.push(
          finding({
            ruleId: "SEO-DOMAIN-02",
            severity: "error",
            file: page.file,
            message: `og:url origin (${origin}) does not match Astro.site origin (${expectedOrigin}).`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      }
    }

    for (const href of hreflangHrefs) {
      const origin = extractOrigin(href);
      if (origin && origin !== expectedOrigin) {
        findings.push(
          finding({
            ruleId: "SEO-DOMAIN-03",
            severity: "error",
            file: page.file,
            message: `hreflang href origin (${origin}) does not match Astro.site origin (${expectedOrigin}).`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      }
    }

    for (const url of jsonLdUrls) {
      const origin = extractOrigin(url);
      if (origin && origin !== expectedOrigin) {
        findings.push(
          finding({
            ruleId: "SEO-DOMAIN-04",
            severity: "error",
            file: page.file,
            message: `JSON-LD url origin (${origin}) does not match Astro.site origin (${expectedOrigin}).`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      }
    }
  }

  const result = buildAuditResult({
    command: "seo.domain.validate",
    app: audit.siteName,
    workspaceRoot: audit.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `seo.domain.validate: ${result.status}`,
  };
}
