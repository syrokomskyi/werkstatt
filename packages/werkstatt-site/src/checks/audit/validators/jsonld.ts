/*
<MODULE_CONTRACT>
<purpose>RFC-0074 JSON-LD audit validators: checks rendered HTML for required JSON-LD types and URL parity across languages.</purpose>
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
import { defaultLanguageFromManifest } from "../../lib/i18n.ts";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
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
          ruleId: "jsonld-url.webpage-url-mismatch",
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
            ruleId: "jsonld-url.duplicate-webpage-id",
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
          ruleId: "jsonld-parity.org-missing-sameAs",
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
          ruleId: "jsonld-parity.org-missing-logo",
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
            ruleId: "credit-node-orphaned",
            severity: "warning",
            file: page.file,
            message: `A material credit node (creditText: "${String(node.creditText).slice(0, 60)}") has no @id — it cannot be linked from the page entity (RFC-0227).`,
            evidence: [{ kind: "rendered", file: page.file }],
          }),
        );
      } else if (seenAtIds.has(atId)) {
        findings.push(
          finding({
            ruleId: "credit-node-duplicated",
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
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `jsonld.parity: ${result.status}`,
  };
}
