/*
<MODULE_CONTRACT>
<purpose>RFC-0074 RFC-0910 JSON-LD audit validators: checks rendered HTML for required JSON-LD types, URL parity across languages, and canonical entity identity URLs.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from audit-validators.ts as part of the domain split.</item>
  <item>RFC-0910: add jsonld.canonical-entity.validate — Organization/WebSite/BreadcrumbList/Person entity URL canonicality.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultLanguageFromManifest } from "../../lib/i18n.ts";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
import { readAstroSiteUrl } from "../../lib/astro-site-url.ts";
import { getContentDisciplinePaths } from "../../content-discipline.ts";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import {
  collectRenderedHtml,
  extractAllJsonLdNodes,
  extractJsonLdGraph,
  finding,
  isHtmlRedirectPage,
  jsonLdNodeHasType,
  toComparablePathname,
} from "./helpers.ts";

/**
 * RFC-0163: jsonld.url.validate — every rendered WebPage node must carry its own
 * url (matching the page canonical) and a unique @id. Postbuild, dist-aware: skips
 * gracefully when the app is not built.
 */
export async function runJsonLdUrlValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  if (htmlFiles.length === 0) {
    const result = buildAuditResult({
      command: "jsonld.url.validate",
      app: audit.siteName,
      workspaceRoot: audit.workspaceRoot,
      findings,
      runtimeMs: Date.now() - started,
    });
    return { data: result, exitCode: 0, summary: "jsonld.url.validate: skipped (no dist/ HTML)" };
  }

  const seenWebpageIds = new Map<string, string>();
  for (const page of htmlFiles) {
    if (isHtmlRedirectPage(page.html)) {
      continue;
    }
    const webpage = extractJsonLdGraph(page.html).find((node) =>
      jsonLdNodeHasType(node, "WebPage"),
    );
    if (!webpage) {
      continue;
    }
    const canonicalHref =
      page.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
    if (
      typeof webpage.url === "string" &&
      canonicalHref &&
      toComparablePathname(webpage.url) !== toComparablePathname(canonicalHref)
    ) {
      findings.push(
        finding({
          ruleId: "JSONLD-URL.WEBPAGE-URL-MISMATCH",
          severity: "error",
          file: page.file,
          message: `WebPage.url (${toComparablePathname(webpage.url)}) does not match canonical (${toComparablePathname(canonicalHref)}).`,
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }
    const id = typeof webpage["@id"] === "string" ? (webpage["@id"] as string) : null;
    if (id) {
      const previous = seenWebpageIds.get(id);
      if (previous) {
        findings.push(
          finding({
            ruleId: "JSONLD-URL.DUPLICATE-WEBPAGE-ID",
            severity: "error",
            file: page.file,
            message: `WebPage @id "${id}" is not unique (also emitted by ${previous}).`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      } else {
        seenWebpageIds.set(id, page.file);
      }
    }
  }

  const result = buildAuditResult({
    command: "jsonld.url.validate",
    app: audit.siteName,
    workspaceRoot: audit.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `jsonld.url.validate: ${result.status}`,
  };
}

/**
 * RFC-0163: jsonld.parity — when the business web file declares socials/logo, the
 * rendered Organization node must emit sameAs/logo. No-op pass when business data
 * carries neither (parity ships warn-until-data-exists).
 */
export async function runJsonLdParityValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];

  const defaultLang = defaultLanguageFromManifest(audit.systemManifest);
  let socials: unknown;
  let logo: unknown;
  try {
    const raw = await readFile(
      join(audit.appDirectory, "src", "content", "business", defaultLang, "web.md"),
      "utf8",
    );
    const data = (parseMarkdownFrontmatter(raw).data ?? {}) as Record<string, unknown>;
    socials = data.socials;
    logo = data.logo;
  } catch {
    /* no web file — nothing to compare */
  }
  const businessHasSameAs = Array.isArray(socials) && socials.length > 0;
  const businessHasLogo = typeof logo === "string" && logo.length > 0;

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);

  if ((businessHasSameAs || businessHasLogo) && htmlFiles.length > 0) {
    let sawSameAs = false;
    let sawLogo = false;
    for (const page of htmlFiles) {
      const org = extractJsonLdGraph(page.html).find((node) =>
        jsonLdNodeHasType(node, "Organization"),
      );
      if (org) {
        if (Array.isArray(org.sameAs) && org.sameAs.length > 0) sawSameAs = true;
        if (org.logo) sawLogo = true;
      }
    }
    if (businessHasSameAs && !sawSameAs) {
      findings.push(
        finding({
          ruleId: "JSONLD-PARITY.ORG-MISSING-SAMEAS",
          severity: "error",
          file: "src/content/business",
          message: "Business web.socials are declared but the Organization node omits sameAs.",
          evidence: [{ kind: "config", file: "src/content/business" }],
        }),
      );
    }
    if (businessHasLogo && !sawLogo) {
      findings.push(
        finding({
          ruleId: "JSONLD-PARITY.ORG-MISSING-LOGO",
          severity: "error",
          file: "src/content/business",
          message: "Business web.logo is declared but the Organization node omits logo.",
          evidence: [{ kind: "config", file: "src/content/business" }],
        }),
      );
    }
  }

  // RFC-0227: credit-node parity — every disclosed credit must have an @id, and no page
  // may have two nodes with the same @id for credited materials.
  for (const page of htmlFiles) {
    const allNodes = extractAllJsonLdNodes(page.html);
    const creditNodes = allNodes.filter((n) => typeof n.creditText === "string");
    const seenAtIds = new Set<string>();
    for (const node of creditNodes) {
      const atId = typeof node["@id"] === "string" ? node["@id"] : null;
      if (!atId) {
        findings.push(
          finding({
            ruleId: "CREDIT-NODE-ORPHANED",
            severity: "warning",
            file: page.file,
            message: `A material credit node (creditText: "${String(node.creditText).slice(0, 60)}") has no @id — it cannot be linked from the page entity (RFC-0227).`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      } else if (seenAtIds.has(atId)) {
        findings.push(
          finding({
            ruleId: "CREDIT-NODE-DUPLICATED",
            severity: "error",
            file: page.file,
            message: `Two material credit nodes share @id "${atId}" on this page — exactly one node per credited asset is required (RFC-0227).`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      } else {
        seenAtIds.add(atId);
      }
    }
  }

  const result = buildAuditResult({
    command: "jsonld.parity",
    app: audit.siteName,
    workspaceRoot: audit.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `jsonld.parity: ${result.status}`,
  };
}

/**
 * RFC-0910: jsonld.canonical-entity.validate — Organization.url, WebSite.url,
 * BreadcrumbList item URLs, and same-origin Person.url must be canonical
 * (unprefixed root, no default-language prefix like /de/).
 *
 * Scans rendered HTML in dist/client/ for JSON-LD entity nodes and compares
 * their url fields against the canonical root derived from Astro.site.
 * External Person URLs (different origin) are skipped — only same-origin
 * profile URLs are canonicalized.
 */
export async function runJsonLdCanonicalEntityValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const paths = requireAstroSitePaths(context);
  const distDir = join(paths.appDirectory, "dist", "client");
  const siteName = context.site!.name;
  const findings: Diagnostic[] = [];

  const htmlFiles = await collectRenderedHtml(distDir);
  const skipResult = (reason: string): KernelCommandResult => ({
    data: buildAuditResult({
      command: "jsonld.canonical-entity.validate",
      app: siteName,
      workspaceRoot: context.workspaceRoot,
      findings,
      runtimeMs: Date.now() - started,
    }),
    exitCode: 0,
    summary: `jsonld.canonical-entity.validate: skipped (${reason})`,
  });

  if (htmlFiles.length === 0) {
    return skipResult("no dist/ HTML");
  }

  const siteUrl = await readAstroSiteUrl(paths.appDirectory);
  if (!siteUrl) {
    return skipResult("Astro.site not configured");
  }

  const expectedRoot = new URL("/", siteUrl).toString();
  const expectedPath = new URL("/", siteUrl).pathname;
  const siteOrigin = new URL(siteUrl).origin;

  const contentPaths = getContentDisciplinePaths(context);
  const { manifest } = await loadSystemManifest(contentPaths.contentDirectory);
  const defaultLang = defaultLanguageFromManifest(manifest as unknown as Record<string, unknown>);
  const defaultPrefix = `/${defaultLang}`;

  for (const page of htmlFiles) {
    if (isHtmlRedirectPage(page.html)) {
      continue;
    }
    const nodes = extractAllJsonLdNodes(page.html);

    // JSONLD-ENTITY-01: Organization.url and WebSite.url
    for (const node of nodes) {
      if (jsonLdNodeHasType(node, "Organization") || jsonLdNodeHasType(node, "WebSite")) {
        const url = typeof node.url === "string" ? node.url : null;
        if (!url) continue;
        const urlPath = toComparablePathname(url);
        if (urlPath !== expectedPath) {
          findings.push(
            finding({
              ruleId: "JSONLD-ENTITY-01",
              severity: "error",
              file: page.file,
              message: `${Array.isArray(node["@type"]) ? node["@type"].join("/") : node["@type"]} url (${url}) is not the canonical root URL (${expectedRoot}). Entity identity URLs must be the unprefixed root, not language-prefixed.`,
              evidence: [{ kind: "rendered", file: page.file }],
            }),
          );
        }
      }
    }

    // JSONLD-ENTITY-02: BreadcrumbList item URLs
    for (const node of nodes) {
      if (jsonLdNodeHasType(node, "BreadcrumbList")) {
        const itemListElement = node.itemListElement;
        if (!Array.isArray(itemListElement)) continue;
        for (const item of itemListElement) {
          const itemRecord = item as Record<string, unknown>;
          const itemNode = itemRecord.item as Record<string, unknown> | undefined;
          const itemUrl = typeof itemNode?.url === "string" ? itemNode.url : null;
          if (!itemUrl) continue;
          const itemPath = toComparablePathname(itemUrl);
          // The home breadcrumb item must be the canonical root (unprefixed).
          // Check both the canonical root path and the default-language-prefixed
          // root path (e.g. /de) — the latter is a violation.
          if (itemPath === expectedPath || itemPath === defaultPrefix) {
            const fullUrl = new URL(itemUrl, siteUrl).toString();
            if (toComparablePathname(fullUrl) !== expectedPath) {
              findings.push(
                finding({
                  ruleId: "JSONLD-ENTITY-02",
                  severity: "error",
                  file: page.file,
                  message: `BreadcrumbList home item url (${itemUrl}) carries a language prefix. The home breadcrumb must be the canonical root (${expectedRoot}).`,
                  evidence: [{ kind: "rendered", file: page.file }],
                }),
              );
            }
          }
        }
      }
    }

    // JSONLD-ENTITY-03: same-origin Person.url
    for (const node of nodes) {
      if (jsonLdNodeHasType(node, "Person")) {
        const url = typeof node.url === "string" ? node.url : null;
        if (!url) continue;
        let personOrigin: string;
        try {
          personOrigin = new URL(url).origin;
        } catch {
          continue;
        }
        if (personOrigin !== siteOrigin) continue;
        // Same-origin Person.url — check it doesn't carry the default-language prefix
        const urlPath = toComparablePathname(url);
        // Person profile URLs are page URLs, not root URLs — they should not
        // have the default-language prefix. Check if the path starts with
        // the default language prefix (e.g. /de/).
        if (urlPath.startsWith(defaultPrefix + "/") || urlPath === defaultPrefix) {
          findings.push(
            finding({
              ruleId: "JSONLD-ENTITY-03",
              severity: "error",
              file: page.file,
              message: `Person.url (${url}) carries the default-language prefix (${defaultPrefix}). Same-origin Person URLs must be canonical (unprefixed for the default language).`,
              evidence: [{ kind: "rendered", file: page.file }],
            }),
          );
        }
      }
    }
  }

  const result = buildAuditResult({
    command: "jsonld.canonical-entity.validate",
    app: siteName,
    workspaceRoot: context.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `jsonld.canonical-entity.validate: ${result.status}`,
  };
}
