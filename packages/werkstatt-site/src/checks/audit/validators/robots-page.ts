/*
<MODULE_CONTRACT>
<purpose>RFC-0074 robots.txt and page-level SEO audit validator: checks robots.txt presence and page-level meta directives.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from audit-validators.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { AuditFinding } from "../types.ts";
import {
  collectRenderedHtml,
  extractMetaContent,
  finding,
  isHtmlRedirectPage,
  toComparablePathname,
} from "./helpers.ts";

/**
 * RFC-0165: robots.page.validate — a page rendered with `noindex` must never appear
 * in the sitemap. Postbuild, dist-aware (skips gracefully when unbuilt).
 */
export async function runRobotsPageValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: AuditFinding[] = [];

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  if (htmlFiles.length === 0) {
    const result = buildAuditResult({
      command: "robots.page.validate",
      app: audit.siteName,
      findings,
      runtimeMs: Date.now() - started,
    });
    return { data: result, exitCode: 0, summary: "robots.page.validate: skipped (no dist/ HTML)" };
  }

  const noindexPaths = new Set<string>();
  for (const page of htmlFiles) {
    if (isHtmlRedirectPage(page.html)) continue;
    const robots = extractMetaContent(page.html, "robots", "name") ?? "";
    if (/noindex/i.test(robots)) {
      const canonical =
        page.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
      if (canonical) noindexPaths.add(toComparablePathname(canonical));
    }
  }

  if (noindexPaths.size > 0) {
    const sitemapLocs = new Set<string>();
    let names: string[] = [];
    try {
      names = await (await import("node:fs/promises")).readdir(audit.publicDirectory);
    } catch {
      /* no public dir */
    }
    for (const name of names.filter((n) => n.startsWith("sitemap") && n.endsWith(".xml"))) {
      const xml = await readFile(join(audit.publicDirectory, name), "utf8");
      for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        sitemapLocs.add(toComparablePathname(match[1]));
      }
    }
    for (const path of noindexPaths) {
      if (sitemapLocs.has(path)) {
        findings.push(
          finding({
            ruleId: "robots-page.noindex-in-sitemap",
            severity: "error",
            file: "public/sitemap.xml",
            message: `noindex page "${path}" is listed in the sitemap.`,
            evidence: [{ kind: "config", file: "public/sitemap.xml" }],
          }),
        );
      }
    }
  }

  const result = buildAuditResult({
    command: "robots.page.validate",
    app: audit.siteName,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `robots.page.validate: ${result.status}`,
  };
}
