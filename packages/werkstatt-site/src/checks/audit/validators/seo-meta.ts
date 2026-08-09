/*
<MODULE_CONTRACT>
<purpose>RFC-0074 SEO meta audit validator: checks rendered HTML for title, meta description, and canonical link tags.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from audit-validators.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { AuditFinding } from "../types.ts";
import {
  collectRenderedHtml,
  extractMetaContent,
  finding,
  getRoutePathForHtml,
  isHtmlRedirectPage,
  normalizeAuditPath,
  toComparablePathname,
} from "./helpers.ts";

/**
 * RFC-0162: seo.meta.validate — verify every rendered, indexable page carries coherent
 * Open Graph / Twitter Card meta. Postbuild gate: when dist/ is not built it skips
 * gracefully so the standard author-phase check stays green; once HTML exists it
 * fails hard on missing tags or an og:url/canonical mismatch.
 */
export async function runSeoMetaValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: AuditFinding[] = [];

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  if (htmlFiles.length === 0) {
    const result = buildAuditResult({
      command: "seo.meta.validate",
      app: audit.siteName,
      findings,
      runtimeMs: Date.now() - started,
    });
    return {
      data: result,
      exitCode: 0,
      summary: "seo.meta.validate: skipped (no dist/ HTML; build the app first)",
    };
  }

  const requiredOg = ["og:title", "og:description", "og:type", "og:url"];

  for (const page of htmlFiles) {
    if (isHtmlRedirectPage(page.html)) {
      continue;
    }
    const robots = extractMetaContent(page.html, "robots", "name") ?? "";
    const isNoindex = /noindex/i.test(robots);
    const routePath = getRoutePathForHtml(audit.distDirectory, page.file, page.html);
    if (isNoindex || /\.well-known\//.test(normalizeAuditPath(routePath))) {
      continue;
    }

    for (const key of requiredOg) {
      if (!extractMetaContent(page.html, key, "property")) {
        findings.push(
          finding({
            ruleId: `seo-meta.missing-${key.replace(":", "-")}`,
            severity: "error",
            file: page.file,
            message: `Rendered page is missing ${key}.`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      }
    }

    if (!isNoindex && !extractMetaContent(page.html, "og:image", "property")) {
      findings.push(
        finding({
          ruleId: "seo-meta.missing-og-image",
          severity: "error",
          file: page.file,
          message: "Indexable page has no og:image.",
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }

    const ogUrl = extractMetaContent(page.html, "og:url", "property");
    const canonicalHref =
      page.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
    if (
      ogUrl &&
      canonicalHref &&
      toComparablePathname(ogUrl) !== toComparablePathname(canonicalHref)
    ) {
      findings.push(
        finding({
          ruleId: "seo-meta.og-url-canonical-mismatch",
          severity: "error",
          file: page.file,
          message: `og:url (${toComparablePathname(ogUrl)}) does not match canonical (${toComparablePathname(canonicalHref)}).`,
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }

    if (!extractMetaContent(page.html, "twitter:card", "name")) {
      findings.push(
        finding({
          ruleId: "seo-meta.missing-twitter-card",
          severity: "warning",
          file: page.file,
          message: "Rendered page is missing twitter:card.",
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }
  }

  const result = buildAuditResult({
    command: "seo.meta.validate",
    app: audit.siteName,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `seo.meta.validate: ${result.status}`,
  };
}
