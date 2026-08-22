/*
<MODULE_CONTRACT>
<purpose>RFC-0911 SEO anchor-text validator: detects generic anchor text in rendered internal links using a built-in de/uk stop-list extensible via system.md.</purpose>
<non-goals>
  <item>Do not check link target integrity — that is owned by content.links.validate (RFC-0206).</item>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0911: created anchor-text lint validator (SEO-ANCHOR-01/02).</item>
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
import {
  collectRenderedHtml,
  extractMetaContent,
  finding,
  getRoutePathForHtml,
  isHtmlRedirectPage,
  normalizeAuditPath,
} from "./helpers.ts";

const BUILTIN_STOP_LIST: Record<string, string[]> = {
  de: ["hier", "hier klicken", "mehr", "mehr erfahren", "link"],
  uk: ["тут", "натисніть тут", "детальніше", "посилання"],
};

function stripPunctuation(text: string): string {
  return text
    .replace(/[.,!?;:"'(){}[\]/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAnchorText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function isInternalLink(href: string): boolean {
  return href.startsWith("/") || href.startsWith("#") || href.startsWith(".");
}

function isBareUrlAnchor(text: string, href: string): boolean {
  const cleanedText = text.replace(/\s+/g, "").toLowerCase();
  const cleanedHref = href.replace(/\s+/g, "").toLowerCase();
  const hrefVariants = [
    cleanedHref,
    cleanedHref.replace(/^https?:\/\//, ""),
    cleanedHref.replace(/^mailto:/, ""),
  ];
  return hrefVariants.includes(cleanedText);
}

function extractAnchors(html: string): Array<{ href: string; text: string; raw: string }> {
  const anchors: Array<{ href: string; text: string; raw: string }> = [];
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1]!;
    const innerHtml = match[2] ?? "";
    const text = innerHtml.replace(/<[^>]+>/g, "").trim();
    anchors.push({ href, text, raw: match[0] });
  }
  return anchors;
}

function getStopList(manifest: Record<string, unknown>): Map<string, Set<string>> {
  const stopList = new Map<string, Set<string>>();
  for (const [lang, phrases] of Object.entries(BUILTIN_STOP_LIST)) {
    stopList.set(lang, new Set(phrases.map((p) => normalizeAnchorText(p))));
  }
  const seo = manifest.seo as
    { anchorText?: { extraStopPhrases?: Record<string, string[]> } } | undefined;
  const extra = seo?.anchorText?.extraStopPhrases;
  if (extra && typeof extra === "object") {
    for (const [lang, phrases] of Object.entries(extra)) {
      if (!Array.isArray(phrases)) continue;
      let set = stopList.get(lang);
      if (!set) {
        set = new Set();
        stopList.set(lang, set);
      }
      for (const p of phrases) {
        if (typeof p === "string") set.add(normalizeAnchorText(p));
      }
    }
  }
  return stopList;
}

function extractHtmlLang(html: string): string | null {
  const m = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  return m?.[1] ?? null;
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

function extractLangFromRoute(routePath: string, supportedLocales: string[]): string | null {
  const segments = routePath.replace(/^\/+/, "").split("/");
  if (segments.length > 0 && segments[0] && supportedLocales.includes(segments[0])) {
    return segments[0];
  }
  return null;
}

/**
 * RFC-0911: seo.anchor-text.validate — fail when rendered internal links use
 * generic anchor text from a stop-list (SEO-ANCHOR-01, error). Warn when anchor
 * text is a bare URL (SEO-ANCHOR-02, warning). Skips noindex, redirect, and
 * .well-known pages. Stop-list is built-in for de/uk and extensible via
 * system.md `seo.anchorText.extraStopPhrases`.
 */
export async function runSeoAnchorTextValidate(
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
      command: "seo.anchor-text.validate",
      app: siteName,
      workspaceRoot: context.workspaceRoot,
      findings,
      runtimeMs: Date.now() - started,
    });
    return {
      data: result,
      exitCode: 0,
      summary: "seo.anchor-text.validate: skipped (no dist/ HTML; build the app first)",
    };
  }

  const stopList = getStopList(manifest);
  const supportedLocales = getSupportedLocales(manifest);
  const i18n = manifest.i18n as { default?: string } | undefined;
  const defaultLang = i18n?.default ?? "de";

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

    const langStopList = stopList.get(lang) ?? new Set<string>();
    const allStopPhrases = new Set<string>();
    for (const phrases of stopList.values()) {
      for (const p of phrases) allStopPhrases.add(p);
    }

    const anchors = extractAnchors(page.html);
    for (const anchor of anchors) {
      if (!isInternalLink(anchor.href)) {
        continue;
      }
      const rawText = anchor.text;
      if (!rawText) continue;

      const normalized = normalizeAnchorText(rawText);
      const stripped = normalizeAnchorText(stripPunctuation(rawText));

      if (
        langStopList.has(normalized) ||
        langStopList.has(stripped) ||
        allStopPhrases.has(normalized) ||
        allStopPhrases.has(stripped)
      ) {
        findings.push(
          finding({
            ruleId: "SEO-ANCHOR-01",
            severity: "error",
            file: page.file,
            message: `Generic anchor text "${rawText}" found in internal link to ${anchor.href}.`,
            evidence: [{ kind: "rendered", file: page.file, snippet: anchor.raw }],
          }),
        );
        continue;
      }

      if (isBareUrlAnchor(rawText, anchor.href)) {
        findings.push(
          finding({
            ruleId: "SEO-ANCHOR-02",
            severity: "warning",
            file: page.file,
            message: `Anchor text is a bare URL (${anchor.href}). Use descriptive text instead.`,
            evidence: [{ kind: "rendered", file: page.file, snippet: anchor.raw }],
          }),
        );
      }
    }
  }

  const result = buildAuditResult({
    command: "seo.anchor-text.validate",
    app: siteName,
    workspaceRoot: context.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `seo.anchor-text.validate: ${result.status}`,
  };
}
