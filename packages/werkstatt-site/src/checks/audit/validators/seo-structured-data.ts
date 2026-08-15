/*
<MODULE_CONTRACT>
<purpose>RFC-0074/RFC-0498 SEO structured data audit validator: checks rendered HTML for required JSON-LD types and enforces per-depth type policy for surface pages.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from audit-validators.ts as part of the domain split.</item>
  <item>RFC-0498: extend with prohibited-type, Service provider, and fabricated-offer checks for surface pages.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { jsonldTypes, type JsonldSurfacePolicyEntry } from "@warpgogol/werkstatt-site/ontology/external-surfaces";
import type { SurfaceArtifact, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";
import { parse as yamlParse } from "yaml";
import { buildAuditResult, getAuditPageInfo, loadAuditAppContext } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
import {
  collectRenderedHtml,
  escapeRegExp,
  extractAllJsonLdNodes,
  extractMetaContent,
  finding,
  getRoutePathForHtml,
  isHtmlRedirectPage,
  jsonLdNodeHasType,
  normalizeAuditPath,
} from "./helpers.ts";
import { ARTIFACT_FILE } from "../../surface/shared.ts";

/** RFC-0498: Build a map of route path → surface+depth from the surface artifact. */
function buildSurfaceRouteMap(
  entries: VirtualRouteEntry[],
  defaultLanguage: string,
): Map<string, { surfaceId: string; depth: number }> {
  const map = new Map<string, { surfaceId: string; depth: number }>();
  for (const entry of entries) {
    for (const [lang, slug] of Object.entries(entry.routes)) {
      const localized = lang === defaultLanguage ? slug : `/${lang}${slug}`;
      const normalized = normalizeAuditPath(localized).replace(/\/+$/, "") || "/";
      map.set(normalized, { surfaceId: entry.surfaceId, depth: entry.depth });
    }
  }
  return map;
}

/** RFC-0498: Find the surface policy entry for a given surface+depth. */
function findSurfacePolicy(surfaceId: string, depth: number): JsonldSurfacePolicyEntry | undefined {
  return jsonldTypes.surfacePolicy?.find((p) => p.surface === surfaceId && p.depth === depth);
}

export async function runSeoStructuredDataValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];
  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  // Required JSON-LD types are resolved PER PAGE, not globally. The family
  // agent-readiness baseline (e.g. [Organization, FAQPage, Service]) applies to
  // the agent-readiness landing pages — those with a transactional CTA (home /
  // donation-contact) — so it does not spam every legal/utility page with
  // warnings for types it has no reason to carry. A page's own
  // system.md `structuredData` requirements always apply to that page.
  const familyBaseline = audit.agentReadinessBaseline.requireStructuredData;

  // RFC-0498: Load surface artifact to identify surface pages and apply per-depth type policy.
  const surfaceArtifactPath = join(audit.appDirectory, ARTIFACT_FILE);
  let surfaceRouteMap = new Map<string, { surfaceId: string; depth: number }>();
  if (existsSync(surfaceArtifactPath)) {
    try {
      const artifact = yamlParse(await readFile(surfaceArtifactPath, "utf8")) as SurfaceArtifact;
      const defaultLang = String(
        (audit.systemManifest.identity as Record<string, unknown> | undefined)?.defaultLanguage ??
          "de",
      );
      surfaceRouteMap = buildSurfaceRouteMap(artifact.entries ?? [], defaultLang);
    } catch {
      // If the artifact can't be parsed, skip surface-specific checks.
    }
  }

  for (const html of htmlFiles) {
    if (isHtmlRedirectPage(html.html)) {
      continue;
    }
    const routePath = getRoutePathForHtml(audit.distDirectory, html.file, html.html);
    const pageInfo = getAuditPageInfo(audit.systemManifest, routePath);
    const jsonLdBlocks = [
      ...html.html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ].map((m) => m[1]);
    if (jsonLdBlocks.length === 0) {
      // Legal pages, cosmic utility pages (passport, star-map), noindex pages,
      // and .well-known routes legitimately carry no JSON-LD. Cosmic routes are
      // not registered in system.md pages[] (so getAuditPageInfo returns null
      // and the requiresJsonLd=false exemption never fires); exempt them by
      // route, mirroring getAuditPageInfo's `requiresJsonLd = !pageId.startsWith("cosmic")` policy.
      const robots = extractMetaContent(html.html, "robots", "name") ?? "";
      if (
        pageInfo?.isLegal ||
        /\/cosmic\//.test(normalizeAuditPath(routePath)) ||
        /noindex/i.test(robots) ||
        /\.well-known\//.test(normalizeAuditPath(routePath))
      ) {
        continue;
      }
      findings.push(
        finding({
          ruleId: "seo-structured-data.missing-jsonld",
          severity: "error",
          file: html.file,
          message: "Rendered HTML has no JSON-LD blocks.",
          evidence: [{ kind: "rendered", file: html.file }],
        }),
      );
      continue;
    }
    // Per-page required types: the family baseline only on transactional landing
    // pages, plus any types the page itself declares in system.md.
    const requiredTypes = new Set<string>(pageInfo?.structuredData ?? []);
    if (pageInfo?.expectsTransactionalCta) {
      for (const type of familyBaseline) {
        requiredTypes.add(type);
      }
    }
    const blockText = jsonLdBlocks.join("\n");
    for (const type of requiredTypes) {
      if (!new RegExp(`\"@type\"\\s*:\\s*\"${escapeRegExp(type)}\"`).test(blockText)) {
        findings.push(
          finding({
            ruleId: `seo-structured-data.missing-${type}`,
            severity: pageInfo?.expectsTransactionalCta ? "error" : "warning",
            file: html.file,
            message: `Required JSON-LD type ${type} not found in rendered HTML.`,
            evidence: [{ kind: "rendered", file: html.file, snippet: type }],
          }),
        );
      }
    }

    // RFC-0498: Per-depth type policy checks for surface pages.
    const normalizedRoute =
      normalizeAuditPath(routePath)
        .replace(/^\/+(dist\/)?/, "/")
        .replace(/\/+$/, "") || "/";
    const surfaceInfo = surfaceRouteMap.get(normalizedRoute);
    if (surfaceInfo) {
      const policy = findSurfacePolicy(surfaceInfo.surfaceId, surfaceInfo.depth);
      if (policy) {
        const allNodes = extractAllJsonLdNodes(html.html);

        // Check prohibited types are not present.
        for (const prohibitedType of policy.prohibitedTypes) {
          const hasProhibited = allNodes.some((node) => jsonLdNodeHasType(node, prohibitedType));
          if (hasProhibited) {
            findings.push(
              finding({
                ruleId: `seo-structured-data.prohibited-${prohibitedType}`,
                severity: "error",
                file: html.file,
                message: `Prohibited JSON-LD type ${prohibitedType} found on surface page (${surfaceInfo.surfaceId} depth-${surfaceInfo.depth}).`,
                evidence: [{ kind: "rendered", file: html.file, snippet: prohibitedType }],
              }),
            );
          }
        }

        // Check Service provider.name is "Warpgogol" when Service is emitted.
        if (policy.requiredTypes.includes("Service")) {
          for (const node of allNodes) {
            if (jsonLdNodeHasType(node, "Service")) {
              const provider = node["provider"] as Record<string, unknown> | string | undefined;
              const providerName =
                typeof provider === "object" && provider !== null
                  ? (provider["name"] as string | undefined)
                  : undefined;
              if (providerName && providerName !== "Warpgogol") {
                findings.push(
                  finding({
                    ruleId: "seo-structured-data.service-provider-mismatch",
                    severity: "error",
                    file: html.file,
                    message: `Service node has provider.name "${providerName}" — must be "Warpgogol" on surface pages.`,
                    evidence: [{ kind: "rendered", file: html.file, snippet: providerName }],
                  }),
                );
              }
            }
          }
        }

        // Check no fabricated offer types are present.
        const fabricatedOfferTypes = [
          "Offer",
          "BookAction",
          "PriceSpecification",
          "QuantitativeValue",
        ];
        for (const offerType of fabricatedOfferTypes) {
          const hasOffer = allNodes.some((node) => jsonLdNodeHasType(node, offerType));
          if (hasOffer) {
            findings.push(
              finding({
                ruleId: "seo-structured-data.fabricated-offer",
                severity: "error",
                file: html.file,
                message: `Fabricated offer type ${offerType} found on surface page — surface pages must not carry offer/pricing JSON-LD.`,
                evidence: [{ kind: "rendered", file: html.file, snippet: offerType }],
              }),
            );
          }
        }

        // RFC-0506: Ratgeber depth-1 Article field policy (SD-RAT-01..04)
        if (surfaceInfo.surfaceId === "ratgeber" && surfaceInfo.depth === 1) {
          const articleNode = allNodes.find((node) => jsonLdNodeHasType(node, "Article"));
          if (articleNode) {
            // SD-RAT-01: Check required Article fields
            const requiredArticleFields = [
              "headline",
              "description",
              "author",
              "publisher",
              "datePublished",
              "mainEntityOfPage",
            ];
            for (const field of requiredArticleFields) {
              if (articleNode[field] === undefined || articleNode[field] === null) {
                findings.push(
                  finding({
                    ruleId: "SD-RAT-01",
                    severity: "error",
                    file: html.file,
                    message: `Article JSON-LD missing required field "${field}" on ratgeber depth-1 page.`,
                    evidence: [{ kind: "rendered", file: html.file, snippet: field }],
                  }),
                );
              }
            }

            // SD-RAT-02: author must be a structured Person object, not a plain string
            const authorValue = articleNode["author"];
            if (typeof authorValue === "string") {
              findings.push(
                finding({
                  ruleId: "SD-RAT-02",
                  severity: "error",
                  file: html.file,
                  message: `Article JSON-LD author is a plain string — must be a structured Person object on ratgeber depth-1 page.`,
                  evidence: [{ kind: "rendered", file: html.file, snippet: String(authorValue) }],
                }),
              );
            } else if (authorValue && typeof authorValue === "object") {
              const authorObj = authorValue as Record<string, unknown>;
              if (authorObj["@type"] !== "Person" || !authorObj["name"]) {
                findings.push(
                  finding({
                    ruleId: "SD-RAT-02",
                    severity: "error",
                    file: html.file,
                    message: `Article JSON-LD author must be a Person with @type="Person" and name on ratgeber depth-1 page.`,
                    evidence: [
                      { kind: "rendered", file: html.file, snippet: JSON.stringify(authorObj) },
                    ],
                  }),
                );
              }
            }

            // SD-RAT-03: mainEntityOfPage must match the canonical URL
            const meopValue = articleNode["mainEntityOfPage"];
            if (typeof meopValue === "string") {
              const expectedUrl = html.file.replace(/^.*dist\//, "/");
              if (!meopValue.endsWith(expectedUrl) && !expectedUrl.endsWith(meopValue)) {
                findings.push(
                  finding({
                    ruleId: "SD-RAT-03",
                    severity: "error",
                    file: html.file,
                    message: `Article JSON-LD mainEntityOfPage "${meopValue}" does not match canonical URL on ratgeber depth-1 page.`,
                    evidence: [{ kind: "rendered", file: html.file, snippet: meopValue }],
                  }),
                );
              }
            } else if (meopValue && typeof meopValue === "object") {
              findings.push(
                finding({
                  ruleId: "SD-RAT-03",
                  severity: "error",
                  file: html.file,
                  message: `Article JSON-LD mainEntityOfPage must be a URL string, not an object reference on ratgeber depth-1 page.`,
                  evidence: [
                    { kind: "rendered", file: html.file, snippet: JSON.stringify(meopValue) },
                  ],
                }),
              );
            }
          }

          // SD-RAT-04: FAQPage must not be present (explicit ruleId beyond prohibited-type check)
          const hasFaqPage = allNodes.some((node) => jsonLdNodeHasType(node, "FAQPage"));
          if (hasFaqPage) {
            findings.push(
              finding({
                ruleId: "SD-RAT-04",
                severity: "error",
                file: html.file,
                message: `FAQPage JSON-LD is prohibited on ratgeber depth-1 article pages.`,
                evidence: [{ kind: "rendered", file: html.file, snippet: "FAQPage" }],
              }),
            );
          }
        }
      }
    }
  }

  const result = buildAuditResult({
    command: "seo.structured-data.validate",
    app: audit.siteName,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `seo.structured-data.validate: ${result.status}`,
  };
}
