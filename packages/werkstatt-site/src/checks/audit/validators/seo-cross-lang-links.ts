/*
<MODULE_CONTRACT>
<purpose>RFC-0898: Cross-language link validator — scans rendered HTML for internal links crossing language boundaries without hreflang attribute.</purpose>
<non-goals>
  <item>Do not check broken links or orphan pages — that is owned by seo.internal-linking.validate.</item>
  <item>Do not check canonical URL parity — that is owned by canonical.url.validate (RFC-0317).</item>
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
import { defaultLanguageFromManifest } from "../../lib/i18n.ts";
import {
  collectRenderedHtml,
  finding,
  getRoutePathForHtml,
  isHtmlRedirectPage,
  normalizeAuditPath,
} from "./helpers.ts";

interface InternalLink {
  href: string;
  hasHreflang: boolean;
  isInNav: boolean;
}

function extractPageLanguage(routePath: string, defaultLanguage: string, supportedLanguages: string[]): string {
  const segments = routePath.split("/").filter(Boolean);
  if (segments.length > 0 && supportedLanguages.includes(segments[0])) {
    return segments[0];
  }
  return defaultLanguage;
}

function extractLinkLanguage(href: string, defaultLanguage: string, supportedLanguages: string[]): string | null {
  try {
    const url = new URL(href, "https://example.invalid");
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0 && supportedLanguages.includes(segments[0])) {
      return segments[0];
    }
    return defaultLanguage;
  } catch {
    return null;
  }
}

function isInternalLink(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return false;
  }
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
    return false;
  }
  if (href.startsWith("#") || href.startsWith("data:")) {
    return false;
  }
  return true;
}

function extractInternalLinks(html: string): InternalLink[] {
  const links: InternalLink[] = [];
  const linkRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html)) !== null) {
    const fullTag = match[0];
    const href = match[1];

    if (!isInternalLink(href)) {
      continue;
    }

    const hasHreflang = /\bhreflang\s*=/i.test(fullTag);

    const isInNav = /<nav[\s>]/i.test(html.slice(0, linkRe.lastIndex)) &&
      /<\/nav>/i.test(html.slice(linkRe.lastIndex));

    links.push({ href, hasHreflang, isInNav });
  }

  return links;
}

function getSupportedLanguages(manifest: Record<string, unknown>): string[] {
  const i18n = (manifest.i18n ?? {}) as Record<string, unknown>;
  const languages = i18n.languages;
  if (Array.isArray(languages)) {
    return languages.map((l) => String(l));
  }
  const defaultLang = defaultLanguageFromManifest(manifest);
  return defaultLang ? [defaultLang] : [];
}

export async function runSeoCrossLangLinksValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  if (htmlFiles.length === 0) {
    const result = buildAuditResult({
      command: "seo.cross-lang-links.validate",
      app: audit.siteName,
      workspaceRoot: audit.workspaceRoot,
      findings,
      runtimeMs: Date.now() - started,
    });
    return {
      data: result,
      exitCode: 0,
      summary: "seo.cross-lang-links.validate: skipped (no dist/ HTML; build the app first)",
    };
  }

  const defaultLanguage = defaultLanguageFromManifest(audit.systemManifest);
  const supportedLanguages = getSupportedLanguages(audit.systemManifest);

  if (supportedLanguages.length <= 1) {
    const result = buildAuditResult({
      command: "seo.cross-lang-links.validate",
      app: audit.siteName,
      workspaceRoot: audit.workspaceRoot,
      findings,
      runtimeMs: Date.now() - started,
    });
    return {
      data: result,
      exitCode: 0,
      summary: "seo.cross-lang-links.validate: skipped (single-language site)",
    };
  }

  for (const page of htmlFiles) {
    if (isHtmlRedirectPage(page.html)) {
      continue;
    }

    const routePath = getRoutePathForHtml(audit.distDirectory, page.file, page.html);
    const pageLanguage = extractPageLanguage(routePath, defaultLanguage, supportedLanguages);

    const links = extractInternalLinks(page.html);

    for (const link of links) {
      if (link.hasHreflang) {
        continue;
      }

      if (link.isInNav) {
        continue;
      }

      const linkLanguage = extractLinkLanguage(link.href, defaultLanguage, supportedLanguages);
      if (linkLanguage === null) {
        continue;
      }

      if (linkLanguage !== pageLanguage) {
        findings.push(
          finding({
            ruleId: "SEO-XLANG-01",
            severity: "error",
            file: page.file,
            message: `Internal link on a ${pageLanguage} page (${normalizeAuditPath(routePath)}) points to ${link.href} (${linkLanguage}) without hreflang attribute.`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      }
    }
  }

  const result = buildAuditResult({
    command: "seo.cross-lang-links.validate",
    app: audit.siteName,
    workspaceRoot: audit.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `seo.cross-lang-links.validate: ${result.status}`,
  };
}
