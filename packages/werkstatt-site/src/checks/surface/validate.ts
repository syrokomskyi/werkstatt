/*
<MODULE_CONTRACT>
<purpose>surface.validate command handler — validate the generated artifact for integrity.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted validate handler from surface.ts into surface/validate.ts.</item>
  <item>RFC-0495: add SURF-OLD-URL check — depth-4/depth-5 routes must not contain country/region segments.</item>
  <item>RFC-0498: add SURF-BREADCRUMB-URL check — no route URLs at any depth may contain old /deu/ or /bw/ segments.</item>
  <item>RFC-0499: add SURF-MEDIA-LEAK check — generated artifact block props must not contain prohibited media metadata strings.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { SurfaceArtifact, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";
import { diagnosticsResult, failResult, passResult } from "../result-helpers.ts";
import { loadSurfaceBlueprints } from "../surface-expand.ts";
import { loadApprovedNarrative } from "../surface-enrich.ts";
import { jsonldTypes } from "@warpgogol/werkstatt-site/ontology/external-surfaces";
import { ARTIFACT_FILE, loadAuthoredRoutes, readLangs } from "./shared.ts";

export async function runSurfaceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.validate must run inside an app context." };
  }
  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult("surface.validate", "skipped (no surface artifact; run surface.generate)");
  }

  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return failResult("surface.validate", [`${ARTIFACT_FILE} is not valid YAML`]);
  }
  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];

  const violations: string[] = [];
  const byPageId = new Map<string, VirtualRouteEntry>();
  for (const entry of entries) {
    if (byPageId.has(entry.pageId)) {
      violations.push(`duplicate pageId "${entry.pageId}"`);
    }
    byPageId.set(entry.pageId, entry);
  }

  const { slugs: authoredSlugs, pageIds: authoredPageIds } = await loadAuthoredRoutes(
    app.directory,
  );
  const liveEntries = new Set(entries.filter((e) => e.indexable).map((e) => e.pageId));

  for (const entry of entries) {
    for (const slug of Object.values(entry.routes)) {
      if (authoredSlugs.has(slug)) {
        violations.push(`slug "${slug}" (pageId ${entry.pageId}) collides with an authored page`);
      }
    }
    if (
      !entry.indexable &&
      entry.redirectToPageId &&
      !liveEntries.has(entry.redirectToPageId) &&
      !authoredPageIds.has(entry.redirectToPageId)
    ) {
      violations.push(
        `redirect stub "${entry.pageId}" targets "${entry.redirectToPageId}" which is not a live entry`,
      );
    }
  }

  const localizedSlugViolations: Array<{
    lang: string;
    slug: string;
    pageIds: [string, string];
    rule: "duplicate-localized-slug";
  }> = [];
  const mixedPathWarnings: Array<{
    lang: string;
    slug: string;
    pageId: string;
    rule: "untranslated-route";
  }> = [];
  const { defaultLang } = await readLangs(app.directory);
  const seenRoute = new Map<string, string>();
  for (const entry of entries) {
    for (const [lang, slug] of Object.entries(entry.routes)) {
      const key = `${lang}|${slug}`;
      const first = seenRoute.get(key);
      if (first && first !== entry.pageId) {
        violations.push(
          `duplicate localized slug "${slug}" (lang "${lang}") maps to both ${first} and ${entry.pageId}`,
        );
        localizedSlugViolations.push({
          lang,
          slug,
          pageIds: [first, entry.pageId],
          rule: "duplicate-localized-slug",
        });
      } else if (!first) {
        seenRoute.set(key, entry.pageId);
      }
      if (lang !== defaultLang && slug === entry.routes[defaultLang]) {
        mixedPathWarnings.push({ lang, slug, pageId: entry.pageId, rule: "untranslated-route" });
      }
    }
  }

  for (const entry of entries) {
    for (const lang of entry.untranslatedLangs ?? []) {
      violations.push(
        `untranslated-route: ${entry.pageId} has no native "${lang}" content (localized route dropped; supply native fields or an approved narrative)`,
      );
    }
  }

  const warnings: Array<{ pageId: string; lang?: string; rule: string; message: string }> = [
    ...mixedPathWarnings.map((w) => ({
      pageId: w.pageId,
      lang: w.lang,
      rule: w.rule,
      message: `non-default route "${w.slug}" equals the default-language route (record slug not localized)`,
    })),
  ];

  for (const entry of entries) {
    if (!entry.indexable || entry.noindex || entry.lazy || !entry.page) continue;
    const heroBlock = (
      entry.page.blocks as Array<{ type?: string; props?: Record<string, unknown> }>
    ).find((b) => b.type === "hero");
    if (heroBlock && heroBlock.props?.leadImage == null) {
      warnings.push({
        pageId: entry.pageId,
        rule: "lead-image-missing",
        message: "indexable page has no hero lead image (add an `image` to a contributing record)",
      });
    }
  }

  // RFC-0495: detect old URL patterns (with country/region segments) in depth-4 and depth-5 entries.
  // Depth-2 and depth-3 legitimately contain country/region — only check depth >= 4.
  for (const entry of entries) {
    if (entry.depth < 4) continue;
    for (const [lang, slug] of Object.entries(entry.routes)) {
      // Old pattern: /website/{industry}/{country}/{region}/{city} or /website/{industry}/{country}/{region}/{city}/{demand}
      // New pattern: /website/{industry}/{city} or /website/{industry}/{city}/{demand}
      // Detect old pattern by checking for known country segments (deu, de) in position 3.
      const segments = slug.split("/").filter(Boolean);
      if (
        segments.length >= 4 &&
        segments[0] === "website" &&
        (segments[2] === "deu" || segments[2] === "de")
      ) {
        violations.push(
          `SURF-OLD-URL: ${entry.pageId} (depth ${entry.depth}, lang "${lang}") route "${slug}" contains old country/region segments — regenerate with RFC-0495 slug templates`,
        );
      }
    }
  }

  // RFC-0498: BreadcrumbList URL check — verify no route URLs contain old /deu/ or /bw/ segments
  // at any depth. Breadcrumb URLs are derived from the route hierarchy, so if any route contains
  // old segments, the BreadcrumbList JSON-LD will also carry them.
  for (const entry of entries) {
    for (const [lang, slug] of Object.entries(entry.routes)) {
      if (slug.includes("/deu/") || slug.includes("/bw/")) {
        violations.push(
          `SURF-BREADCRUMB-URL: ${entry.pageId} (depth ${entry.depth}, lang "${lang}") route "${slug}" contains old /deu/ or /bw/ segments — breadcrumb URLs would carry stale hierarchy`,
        );
      }
    }
  }

  const bpById = new Map(
    (await loadSurfaceBlueprints(context.workspaceRoot)).map((b) => [b.id, b]),
  );
  for (const entry of entries) {
    const bp = bpById.get(entry.surfaceId);
    if (bp && !bp.levels.some((level) => level.depth === entry.depth)) {
      violations.push(
        `phantom-level: ${entry.pageId} has depth ${entry.depth}, but Blueprint "${entry.surfaceId}" declares no matching level`,
      );
    }
  }
  for (const entry of entries) {
    if (!entry.indexable || entry.noindex) continue;
    const narrativeField = bpById
      .get(entry.surfaceId)
      ?.enrichedFields?.find((f) => f.kind === "narrative" && f.scopeDepth === entry.depth);
    if (!narrativeField) continue;
    const n = await loadApprovedNarrative(
      app.directory,
      entry.surfaceId,
      defaultLang,
      entry.pageId,
      narrativeField.field,
    );
    if (!n) {
      warnings.push({
        pageId: entry.pageId,
        rule: "narrative-missing",
        message:
          "indexable page renders the deterministic title/intro fallback (no approved narrative)",
      });
    }
  }

  // RFC-0499: Pre-build check — scan the generated artifact's block props for
  // prohibited media metadata strings. This complements the post-build HTML scan
  // in surface.media-leakage.validate by catching leakage before astro build.
  const mediaLeakagePolicy = jsonldTypes.mediaLeakagePolicy;
  if (mediaLeakagePolicy) {
    const artifactRaw = await readFile(artifactPath, "utf8");
    for (const prohibited of mediaLeakagePolicy.prohibitedStrings) {
      if (prohibited.matchingStrategy === "whole-word") {
        const regex = new RegExp(
          `\b${prohibited.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`,
          "i",
        );
        if (regex.test(artifactRaw)) {
          violations.push(
            `SURF-MEDIA-LEAK: generated artifact contains prohibited string "${prohibited.pattern}" (${prohibited.reason})`,
          );
        }
      } else if (prohibited.matchingStrategy === "exact") {
        if (artifactRaw.includes(prohibited.pattern)) {
          violations.push(
            `SURF-MEDIA-LEAK: generated artifact contains prohibited string "${prohibited.pattern}" (${prohibited.reason})`,
          );
        }
      }
    }
  }

  const diagnostics: Diagnostic[] = [
    ...violations.map((message) => ({
      ruleId: "surface.validate",
      severity: "error" as const,
      file: ARTIFACT_FILE,
      message,
      fixHint: "Regenerate the surface artifact or correct the underlying surface records.",
    })),
    ...warnings.map((warning) => ({
      ruleId: "surface.validate",
      severity: "warning" as const,
      file: ARTIFACT_FILE,
      message: `${warning.pageId}: ${warning.message}`,
      fixHint:
        "Add the missing localized route data, lead image, or approved narrative for this generated page.",
      data: { rule: warning.rule, pageId: warning.pageId, lang: warning.lang },
    })),
  ];

  return diagnosticsResult("surface.validate", diagnostics);
}
