/*
<MODULE_CONTRACT>
<purpose>
RFC-0499: surface.media-leakage.validate — scan rendered surface page HTML for
prohibited media metadata strings using context-aware matching. Verifies that
AI-generated images carry the Konzeptillustration label and /bildnachweise/ link,
and that internal enum values (AIPlatform, Organization, etc.) do not leak into
visible HTML outside credit-context elements.
</purpose>
<non-goals>
  <item>Do not validate non-surface pages — only routes with a surfaceId in the surface artifact are checked.</item>
  <item>Do not modify HTML — this is a read-only validator.</item>
  <item>Do not check JSON-LD blocks — media metadata is allowed inside <script type="application/ld+json">.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0499: initial — media metadata leakage validator with context-aware matching.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { SurfaceArtifact, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";
import { jsonldTypes, type MediaLeakagePolicy } from "@warpgogol/werkstatt-site/ontology/external-surfaces";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { ARTIFACT_FILE } from "./surface/shared.ts";

const DIST_CLIENT_DIR = "dist/client";

async function collectHtmlFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectHtmlFiles(fullPath)));
    } else if (entry.name.endsWith(".html")) {
      results.push(fullPath);
    }
  }
  return results;
}

function routeFromHtmlPath(distClientDir: string, htmlPath: string): string {
  const rel = relative(distClientDir, htmlPath).replace(/\\/g, "/");
  const withoutIndex = rel.replace(/index\.html$/, "").replace(/\.html$/, "/");
  return `/${withoutIndex}`.replace(/\/+/g, "/");
}

function stripJsonLdScripts(html: string): string {
  return html.replace(/<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "");
}

function stripFooterAndDataFooter(html: string): string {
  let result = html.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  result = result.replace(/<[^>]*data-footer[^>]*>[\s\S]*?<\/[^>]+>/gi, "");
  return result;
}

function stripCreditContext(html: string): string {
  let result = html.replace(/<figcaption[^>]*>[\s\S]*?<\/figcaption>/gi, "");
  result = result.replace(/<details[^>]*>[\s\S]*?<\/details>/gi, "");
  result = result.replace(/<dl[^>]*>[\s\S]*?<\/dl>/gi, "");
  result = result.replace(/<[^>]*data-credit-context[^>]*>[\s\S]*?<\/[^>]+>/gi, "");
  return result;
}

function matchProhibitedString(
  visibleHtml: string,
  pattern: string,
  strategy: "exact" | "whole-word" | "context-aware",
): boolean {
  switch (strategy) {
    case "exact":
      return visibleHtml.includes(pattern);
    case "whole-word": {
      const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      return regex.test(visibleHtml);
    }
    case "context-aware":
      // Pattern is allowed inside credit context elements; flag only when it leaks outside.
      return stripCreditContext(visibleHtml).includes(pattern);
  }
}

function checkAiGeneratedImages(html: string, policy: MediaLeakagePolicy): string[] {
  const violations: string[] = [];
  const aiImageRegex = /<img[^>]*data-ai-generated[^>]*>/gi;
  const aiImages = html.match(aiImageRegex) ?? [];
  for (const imgTag of aiImages) {
    const requiredLabels = policy.requiredLabels.map((l) => l.label);
    const hasLabel = requiredLabels.some((label) => html.includes(label));
    if (!hasLabel) {
      violations.push(
        `MEDIA-LEAK-AI-LABEL: AI-generated image missing required label (${requiredLabels.join(" | ")}): ${imgTag.slice(0, 120)}`,
      );
    }
    if (!html.includes(policy.requiredLinkPattern)) {
      violations.push(
        `MEDIA-LEAK-AI-LINK: AI-generated image missing link to ${policy.requiredLinkPattern}: ${imgTag.slice(0, 120)}`,
      );
    }
  }
  return violations;
}

export async function runSurfaceMediaLeakageValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "surface.media-leakage.validate must run inside an app context.",
    };
  }

  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult(
      "surface.media-leakage.validate",
      "skipped (no surface artifact; run surface.generate)",
    );
  }

  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return {
      exitCode: 1,
      summary: "surface.media-leakage.validate: surface artifact is not valid YAML",
    };
  }

  const policy = jsonldTypes.mediaLeakagePolicy;
  if (!policy) {
    return passResult(
      "surface.media-leakage.validate",
      "skipped (no mediaLeakagePolicy in Layer C contract)",
    );
  }

  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];
  const surfaceEntries = entries.filter(
    (e: VirtualRouteEntry) => e.surfaceId && e.indexable && !e.noindex,
  );

  if (surfaceEntries.length === 0) {
    return passResult(
      "surface.media-leakage.validate",
      "skipped (no indexable surface pages in artifact)",
    );
  }

  // Build a set of surface route paths for filtering (per non-goals: only surface pages are checked).
  const surfaceRoutePaths = new Set<string>();
  for (const e of surfaceEntries) {
    for (const route of Object.values(e.routes ?? {})) {
      const normalized = "/" + route.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
      surfaceRoutePaths.add(normalized.replace(/\/+/g, "/"));
    }
  }

  const distClientDir = join(app.directory, DIST_CLIENT_DIR);
  if (!existsSync(distClientDir)) {
    return passResult(
      "surface.media-leakage.validate",
      "skipped (no dist/client — run astro build first)",
    );
  }

  const htmlFiles = await collectHtmlFiles(distClientDir);
  const violations: string[] = [];

  for (const htmlFile of htmlFiles) {
    const route = routeFromHtmlPath(distClientDir, htmlFile);
    if (!surfaceRoutePaths.has(route)) continue;
    const rawHtml = await readFile(htmlFile, "utf8");
    const htmlNoJsonLd = stripJsonLdScripts(rawHtml);
    const visibleHtml = stripFooterAndDataFooter(htmlNoJsonLd);

    for (const prohibited of policy.prohibitedStrings) {
      const found = matchProhibitedString(
        visibleHtml,
        prohibited.pattern,
        prohibited.matchingStrategy,
      );
      if (found) {
        violations.push(
          `MEDIA-LEAK-${prohibited.matchingStrategy.toUpperCase()}: route "${route}" contains prohibited string "${prohibited.pattern}" (${prohibited.reason})`,
        );
      }
    }

    violations.push(...checkAiGeneratedImages(rawHtml, policy));
  }

  const diagnostics: Diagnostic[] = violations.map((message) => ({
    ruleId: "SURFACE.MEDIA-LEAKAGE.VALIDATE",
    severity: "error" as const,
    file: DIST_CLIENT_DIR,
    message,
    fixHint:
      "Suppress media metadata in visible HTML. Use surfacePage prop on MaterialCredit for AI-generated images. Ensure data-credit-context on credit elements.",
  }));

  return diagnosticsResult("surface.media-leakage.validate", diagnostics);
}
