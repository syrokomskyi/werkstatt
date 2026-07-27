/*
<MODULE_CONTRACT>
<purpose>RFC-0074 SEO technical audit validator: cross-checks sitemap, llms, ai, robots, and route registry presence.</purpose>
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
import { localizeUrl } from "@gogol/share/url-policy";
import { defaultLanguageFromManifest } from "../../lib/i18n.ts";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { AuditFinding } from "../types.ts";
import { escapeXml, finding } from "./helpers.ts";

export async function runSeoTechnicalValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: AuditFinding[] = [];
  const system = (await loadSystemManifest(audit.contentDirectory)).manifest;
  // RFC-0143: sitemap inclusion is declared via output.sitemap.
  // Narrow locally to the fields we read rather than `as any`.
  type SystemPageView = {
    pageId?: string;
    routes?: Record<string, string>;
    output?: { sitemap?: boolean | { include?: boolean } };
    structuredData?: unknown[];
  };
  const isSitemapExcluded = (page: SystemPageView): boolean => {
    const sitemap = page.output?.sitemap;
    if (typeof sitemap === "boolean") return !sitemap;
    if (sitemap && typeof sitemap === "object") return sitemap.include === false;
    return false;
  };
  const pages = (system.pages ?? []) as SystemPageView[];
  // RFC-0160: the default language is served unprefixed.
  const defaultLanguage = defaultLanguageFromManifest(system);

  const sitemap = await readFile(join(audit.publicDirectory, "sitemap.xml"), "utf8").catch(
    () => "",
  );
  const llms = await readFile(join(audit.publicDirectory, "llms.txt"), "utf8").catch(() => "");
  const ai = await readFile(join(audit.publicDirectory, "ai.txt"), "utf8").catch(() => "");
  const robots = await readFile(join(audit.publicDirectory, "robots.txt"), "utf8").catch(() => "");

  for (const page of pages) {
    const routes = page.routes ?? {};
    for (const [lang, slug] of Object.entries(routes)) {
      const path = localizeUrl(lang, slug, { defaultLanguage });
      if (
        !isSitemapExcluded(page) &&
        sitemap &&
        /<urlset[\s>]/i.test(sitemap) &&
        !new RegExp(`<loc>[^<]*${escapeXml(path.replace(/\/$/, ""))}\/?<\/loc>`).test(sitemap)
      ) {
        findings.push(
          finding({
            ruleId: "seo-technical.missing-sitemap-url",
            severity: "error",
            file: "public/sitemap.xml",
            message: `Route ${path} is missing from sitemap.xml.`,
            evidence: [{ kind: "config", file: "public/sitemap.xml", snippet: path }],
          }),
        );
      }
    }
  }

  if (llms && !/^##\s+Primary sources/m.test(llms)) {
    findings.push(
      finding({
        ruleId: "seo-technical.llms-primary-sources-section",
        severity: "warning",
        file: "public/llms.txt",
        message: "llms.txt should include a 'Primary sources' section.",
        evidence: [{ kind: "config", file: "public/llms.txt" }],
      }),
    );
  }
  if (llms && !/^##\s+Organization/m.test(llms)) {
    findings.push(
      finding({
        ruleId: "seo-technical.llms-organization-section",
        severity: "warning",
        file: "public/llms.txt",
        message: "llms.txt should include an 'Organization' section.",
        evidence: [{ kind: "config", file: "public/llms.txt" }],
      }),
    );
  }

  if (robots && !/Sitemap:\s*.+sitemap\.xml/i.test(robots)) {
    findings.push(
      finding({
        ruleId: "seo-technical.robots-sitemap-ref",
        severity: "error",
        file: "public/robots.txt",
        message: "robots.txt must reference sitemap.xml.",
        evidence: [{ kind: "config", file: "public/robots.txt" }],
      }),
    );
  }

  if (ai && !/policy:/i.test(ai)) {
    findings.push(
      finding({
        ruleId: "seo-technical.ai-policy",
        severity: "warning",
        file: "public/ai.txt",
        message: "ai.txt is missing a global policy directive.",
        evidence: [{ kind: "config", file: "public/ai.txt" }],
      }),
    );
  }

  const result = buildAuditResult({
    command: "seo.technical.validate",
    app: audit.siteName,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `seo.technical.validate: ${result.status}`,
  };
}
