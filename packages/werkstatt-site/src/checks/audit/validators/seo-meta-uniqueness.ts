/*
<MODULE_CONTRACT>
<purpose>RFC-0911 SEO meta uniqueness validator: detects duplicate titles and meta descriptions across indexable rendered pages within the same language.</purpose>
<non-goals>
  <item>Do not check title/description presence — that is owned by seo.meta.validate (RFC-0162) and content.validate (RFC-0026).</item>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0911: created validator for cross-page title/description uniqueness (SEO-UNIQ-01/02).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { buildAuditResult } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
import { defaultLanguageFromManifest } from "../../lib/i18n.ts";
import {
  collectRenderedHtml,
  extractMetaContent,
  finding,
  getRoutePathForHtml,
  isHtmlRedirectPage,
  normalizeAuditPath,
} from "./helpers.ts";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractHtmlLang(html: string): string | null {
  const m = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ?? "";
}

function extractLangFromRoute(routePath: string, supportedLocales: string[]): string | null {
  const segments = routePath.replace(/^\/+/, "").split("/");
  if (segments.length > 0 && segments[0] && supportedLocales.includes(segments[0])) {
    return segments[0];
  }
  return null;
}

function getSupportedLocales(manifest: Record<string, unknown>): string[] {
  const i18n = manifest.i18n as
    { supported?: Record<string, unknown>; default?: string } | undefined;
  if (i18n?.supported && typeof i18n.supported === "object") {
    return Object.keys(i18n.supported);
  }
  const defaultLang = i18n?.default;
  return defaultLang ? [defaultLang] : ["de"];
}

interface PageMeta {
  file: string;
  lang: string;
  title: string;
  description: string;
}

/**
 * RFC-0911: seo.meta-uniqueness.validate — fail when two or more indexable rendered
 * pages in the same language share an identical `<title>` (SEO-UNIQ-01) or meta
 * description (SEO-UNIQ-02). Skips noindex, redirect, and .well-known pages.
 */
export async function runSeoMetaUniquenessValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const paths = requireAstroSitePaths(context);
  const distDir = join(paths.appDirectory, "dist", "client");
  const siteName = context.site!.name;
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const manifest = systemManifest as unknown as Record<string, unknown>;
  const findings: Diagnostic[] = [];

  const htmlFiles = await collectRenderedHtml(distDir);
  if (htmlFiles.length === 0) {
    const result = buildAuditResult({
      command: "seo.meta-uniqueness.validate",
      app: siteName,
      workspaceRoot: context.workspaceRoot,
      findings,
      runtimeMs: Date.now() - started,
    });
    return {
      data: result,
      exitCode: 0,
      summary: "seo.meta-uniqueness.validate: skipped (no dist/ HTML; build the app first)",
    };
  }

  const supportedLocales = getSupportedLocales(manifest);
  const defaultLang = defaultLanguageFromManifest(manifest);

  const pages: PageMeta[] = [];

  for (const page of htmlFiles) {
    if (isHtmlRedirectPage(page.html)) {
      continue;
    }
    const robots = extractMetaContent(page.html, "robots", "name") ?? "";
    const isNoindex = /noindex/i.test(robots);
    const routePath = getRoutePathForHtml(distDir, page.file, page.html);
    if (isNoindex || /\.well-known\//.test(normalizeAuditPath(routePath))) {
      continue;
    }

    const htmlLang = extractHtmlLang(page.html);
    const routeLang = extractLangFromRoute(routePath, supportedLocales);
    const lang = htmlLang ?? routeLang ?? defaultLang;

    const title = normalizeText(extractTitle(page.html));
    const description = normalizeText(extractMetaContent(page.html, "description", "name") ?? "");

    pages.push({ file: page.file, lang, title, description });
  }

  const titleByLang = new Map<string, Map<string, string[]>>();
  const descByLang = new Map<string, Map<string, string[]>>();

  for (const p of pages) {
    if (!p.title) continue;
    let langMap = titleByLang.get(p.lang);
    if (!langMap) {
      langMap = new Map();
      titleByLang.set(p.lang, langMap);
    }
    const files = langMap.get(p.title) ?? [];
    files.push(p.file);
    langMap.set(p.title, files);
  }

  for (const p of pages) {
    if (!p.description) continue;
    let langMap = descByLang.get(p.lang);
    if (!langMap) {
      langMap = new Map();
      descByLang.set(p.lang, langMap);
    }
    const files = langMap.get(p.description) ?? [];
    files.push(p.file);
    langMap.set(p.description, files);
  }

  for (const [lang, titleMap] of titleByLang) {
    for (const [title, files] of titleMap) {
      if (files.length >= 2) {
        findings.push(
          finding({
            ruleId: "SEO-UNIQ-01",
            severity: "error",
            file: files[0]!,
            message: `Duplicate <title> in language "${lang}": "${title}" — shared by ${files.length} pages: ${files.join(", ")}.`,
            evidence: files.map((f) => ({ kind: "rendered" as const, file: f })),
          }),
        );
      }
    }
  }

  for (const [lang, descMap] of descByLang) {
    for (const [description, files] of descMap) {
      if (files.length >= 2) {
        findings.push(
          finding({
            ruleId: "SEO-UNIQ-02",
            severity: "error",
            file: files[0]!,
            message: `Duplicate meta description in language "${lang}": "${description}" — shared by ${files.length} pages: ${files.join(", ")}.`,
            evidence: files.map((f) => ({ kind: "rendered" as const, file: f })),
          }),
        );
      }
    }
  }

  const result = buildAuditResult({
    command: "seo.meta-uniqueness.validate",
    app: siteName,
    workspaceRoot: context.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `seo.meta-uniqueness.validate: ${result.status}`,
  };
}
