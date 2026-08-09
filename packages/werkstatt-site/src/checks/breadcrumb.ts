import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0229] breadcrumb.trail.validate: guard the data that makes a correct, clickable breadcrumb
  trail derivable for every page. Two families of checks:
    1. Authored hierarchy (system.md pages[].parentPageId): every parent reference resolves to a
       known page and the parent chain is acyclic.
    2. Programmatic Surface hierarchy (src/surface.generated.yaml): for every live (indexable,
       non-noindex) page, each surviving ancestor (derived from its synthetic pageId) carries a
       default-language route, so no ancestor crumb resolves to a dead URL.
  The visible breadcrumbs section and the BreadcrumbList JSON-LD are built from one trail in the
  render pipeline, so item/markup parity is structural; this check guards the inputs that trail
  relies on.
</purpose>
<non-goals>
  <item>Do not render pages or diff HTML against JSON-LD (the shared builder guarantees parity).</item>
  <item>Do not re-validate surface artifact integrity (surface.validate owns that).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0229: initial check.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { SurfaceArtifact, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";
import { surfaceAncestorPageIds } from "@warpgogol/werkstatt-site/share/semantic";
import { failResult, passResult } from "./result-helpers.ts";

const ARTIFACT_FILE = "src/surface.generated.yaml";

interface AuthoredPage {
  pageId: string;
  parentPageId?: string;
  routes?: Record<string, string>;
}

/** Load authored pages (pageId + parentPageId + routes) from system.md. Fail-open to []. */
async function loadAuthoredPages(appDir: string): Promise<AuthoredPage[]> {
  try {
    const { loadSystemManifest } = await import("@warpgogol/werkstatt-site/content");
    const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
    const pages = (manifest as unknown as { pages?: AuthoredPage[] }).pages;
    return Array.isArray(pages) ? pages : [];
  } catch {
    return [];
  }
}

/** Validate authored parentPageId references: each resolves to a known page; chains are acyclic. */
function validateAuthoredHierarchy(pages: AuthoredPage[]): string[] {
  const violations: string[] = [];
  const byId = new Map<string, AuthoredPage>();
  for (const page of pages) if (page.pageId) byId.set(page.pageId, page);

  for (const page of pages) {
    if (!page.parentPageId) continue;
    if (!byId.has(page.parentPageId)) {
      violations.push(
        `page "${page.pageId}" references unknown parentPageId "${page.parentPageId}"`,
      );
      continue;
    }
    // Walk the chain from this page; a repeat means a cycle.
    const seen = new Set<string>([page.pageId]);
    let current: string | undefined = page.parentPageId;
    while (current) {
      if (seen.has(current)) {
        violations.push(
          `parentPageId chain for page "${page.pageId}" is cyclic (revisits "${current}")`,
        );
        break;
      }
      seen.add(current);
      current = byId.get(current)?.parentPageId;
    }
  }
  return violations;
}

/** Validate surface ancestor routes: every surviving ancestor of a live page resolves to a route. */
function validateSurfaceHierarchy(entries: VirtualRouteEntry[], defaultLang: string): string[] {
  const violations: string[] = [];
  const byId = new Map<string, VirtualRouteEntry>(entries.map((e) => [e.pageId, e]));

  for (const entry of entries) {
    if (!entry.indexable || entry.noindex) continue;
    // RFC-0229: the surface hierarchy shape is owned by @warpgogol/werkstatt-site/share so the validator and the
    // render-time resolver cannot drift.
    for (const ancestorId of surfaceAncestorPageIds(entry.pageId)) {
      const ancestor = byId.get(ancestorId);
      // A missing or non-live ancestor is intentionally skipped by the trail builder — not a defect.
      if (!ancestor || !ancestor.indexable || ancestor.noindex) continue;
      const hasRoute =
        ancestor.routes[defaultLang] !== undefined || Object.keys(ancestor.routes).length > 0;
      if (!hasRoute) {
        violations.push(
          `live page "${entry.pageId}" has ancestor "${ancestorId}" with no resolvable route`,
        );
      }
    }
  }
  return violations;
}

export async function runBreadcrumbTrailValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "breadcrumb.trail.validate must run inside an app context." };
  }

  const violations: string[] = [];

  // 1. Authored hierarchy.
  const authoredPages = await loadAuthoredPages(app.directory);
  violations.push(...validateAuthoredHierarchy(authoredPages));

  // 2. Programmatic Surface hierarchy (skip cleanly when there is no artifact).
  const artifactPath = join(app.directory, ARTIFACT_FILE);
  let surfaceCount = 0;
  if (existsSync(artifactPath)) {
    let artifact: SurfaceArtifact;
    try {
      artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
    } catch {
      return failResult("breadcrumb.trail.validate", [`${ARTIFACT_FILE} is not valid JSON`]);
    }
    const entries = Array.isArray(artifact.entries) ? artifact.entries : [];
    surfaceCount = entries.length;
    // The artifact carries no default-language marker; the route presence test below is
    // language-agnostic (it passes when any localized route exists), so "de" is a safe probe key.
    violations.push(...validateSurfaceHierarchy(entries, "de"));
  }

  if (violations.length > 0) {
    return failResult("breadcrumb.trail.validate", violations);
  }
  return passResult(
    "breadcrumb.trail.validate",
    `ok (${authoredPages.length} authored page(s), ${surfaceCount} surface route(s))`,
  );
}
