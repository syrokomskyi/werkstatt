import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0194] pseo.validate: the Programmatic Surface quality gate. Reads src/surface.generated.yaml
  and, per surface (Blueprint), checks: the thin-page share does not exceed the Blueprint's
  maxThinShare, the indexable count does not exceed the sitemap budget, no generated slug collides
  with an authored page, and every internal link in a baked page resolves to a known route.
  Substance scoring + the per-page noindex decision happen in surface.generate (RFC-0194); this is
  the aggregate gate.
</purpose>
<non-goals>
  <item>Do not compute substance (surface.generate does). Do not re-validate structure (surface.validate).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0194: initial suite.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { Blueprint, PageEntry, SurfaceArtifact, VirtualRouteEntry } from "@warpgogol/werkstatt-site/surface";
import { failResult, passResult } from "../result-helpers.ts";
import { loadSurfaceBlueprints } from "../surface-expand.ts";

const ARTIFACT_FILE = "src/surface.generated.yaml";

async function loadAuthoredSlugs(appDir: string): Promise<Set<string>> {
  const slugs = new Set<string>();
  try {
    const { loadSystemManifest } = await import("@warpgogol/werkstatt-site/content");
    const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
    const pages = (manifest as unknown as { pages?: Array<{ routes?: Record<string, string> }> })
      .pages;
    for (const page of pages ?? []) {
      for (const slug of Object.values(page.routes ?? {})) slugs.add(slug);
    }
  } catch {
    /* fail-open */
  }
  return slugs;
}

function pageIdToFile(pageId: string): string {
  return pageId.replace(/[^a-z0-9_-]/gi, "__");
}

async function pagesForEntry(appDir: string, entry: VirtualRouteEntry): Promise<PageEntry[]> {
  if (entry.pages) return Object.values(entry.pages);
  if (entry.lazy) {
    try {
      const raw = await readFile(
        join(appDir, ".surface-cache", `${pageIdToFile(entry.pageId)}.yaml`),
        "utf8",
      );
      const parsed = yamlParse(raw) as { pages?: Record<string, PageEntry> };
      if (parsed.pages) return Object.values(parsed.pages);
    } catch {
      return entry.page ? [entry.page] : [];
    }
  }
  return entry.page ? [entry.page] : [];
}

/** Collect internal-link href strings from baked page block props, including lazy pages. */
async function pageLinks(appDir: string, entry: VirtualRouteEntry): Promise<string[]> {
  const links: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.startsWith("/")) links.push(value.replace(/\/$/, ""));
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object")
      Object.values(value as Record<string, unknown>).forEach(visit);
  };
  for (const page of await pagesForEntry(appDir, entry)) {
    for (const block of page.blocks ?? []) visit(block.props);
  }
  return links;
}

export async function runPseoValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "pseo.validate must run inside an app context." };
  }
  const artifactPath = join(app.directory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult("pseo.validate", "skipped (no surface artifact)");
  }
  let artifact: SurfaceArtifact;
  try {
    artifact = yamlParse(await readFile(artifactPath, "utf8")) as SurfaceArtifact;
  } catch {
    return failResult("pseo.validate", [`${ARTIFACT_FILE} is not valid JSON`]);
  }
  const entries = Array.isArray(artifact.entries) ? artifact.entries : [];
  if (entries.length === 0) {
    return passResult("pseo.validate", "ok (no surface routes)");
  }

  const blueprints = await loadSurfaceBlueprints(context.workspaceRoot);
  const bpById = new Map<string, Blueprint>(blueprints.map((bp) => [bp.id, bp]));
  const authoredSlugs = await loadAuthoredSlugs(app.directory);

  // Index of every known route slug (authored + surface) for orphan-link resolution.
  const knownPaths = new Set<string>();
  for (const slug of authoredSlugs) knownPaths.add(`/${slug}`.replace(/\/$/, ""));
  for (const entry of entries) {
    for (const slug of Object.values(entry.routes)) knownPaths.add(`/${slug}`.replace(/\/$/, ""));
  }

  const violations: string[] = [];
  const bySurface = new Map<string, VirtualRouteEntry[]>();
  for (const entry of entries) {
    const list = bySurface.get(entry.surfaceId) ?? [];
    list.push(entry);
    bySurface.set(entry.surfaceId, list);
  }

  for (const [surfaceId, list] of bySurface) {
    const bp = bpById.get(surfaceId);
    const live = list.filter((e) => e.indexable);
    const indexable = live.filter((e) => !e.noindex);
    const thin = live.filter((e) => e.decision?.reason === "thin");
    const thinShare = live.length === 0 ? 0 : thin.length / live.length;
    const maxThinShare = bp?.policy.maxThinShare ?? 1;
    if (thinShare > maxThinShare) {
      violations.push(
        `surface "${surfaceId}": thin-page share ${(thinShare * 100).toFixed(0)}% exceeds maxThinShare ${(maxThinShare * 100).toFixed(0)}% (${thin.length}/${live.length})`,
      );
    }
    const budget = bp?.policy.sitemapBudget;
    if (budget !== undefined && indexable.length > budget) {
      violations.push(
        `surface "${surfaceId}": ${indexable.length} indexable pages exceed sitemap budget ${budget}`,
      );
    }
  }

  // Slug collisions with authored pages.
  for (const entry of entries) {
    if (entry.indexable && !entry.noindex && entry.decision?.evidenceGate === false) {
      violations.push(`pageId ${entry.pageId} is indexable despite evidenceGate=false`);
    }
    if (entry.indexable && !entry.noindex && entry.decision?.demandGate === false) {
      violations.push(`pageId ${entry.pageId} is indexable despite demandGate=false`);
    }
    if (entry.indexable && !entry.noindex && entry.decision?.fresh === false) {
      violations.push(`pageId ${entry.pageId} is indexable despite fresh=false`);
    }
    if (entry.indexable && !entry.noindex && entry.decision?.duplicateGate === false) {
      violations.push(`pageId ${entry.pageId} is indexable despite duplicateGate=false`);
    }
    for (const slug of Object.values(entry.routes)) {
      if (authoredSlugs.has(slug)) {
        violations.push(`slug "${slug}" (pageId ${entry.pageId}) collides with an authored page`);
      }
    }
  }

  // Orphan internal links in baked pages.
  for (const entry of entries) {
    for (const link of await pageLinks(app.directory, entry)) {
      // Only audit links that look like surface routes (share a generated prefix).
      const looksSurface = entries.some((e) =>
        Object.values(e.routes).some((slug) => link === `/${slug}`.replace(/\/$/, "")),
      );
      if (!looksSurface) continue;
      if (!knownPaths.has(link)) {
        violations.push(`orphan internal link "${link}" in pageId ${entry.pageId}`);
      }
    }
  }

  if (violations.length > 0) {
    return failResult("pseo.validate", violations);
  }

  const totalIndexable = entries.filter((e) => e.indexable && !e.noindex).length;
  const totalThin = entries.filter((e) => e.decision?.reason === "thin").length;
  return passResult(
    "pseo.validate",
    `ok (${entries.length} route(s), ${totalIndexable} indexable, ${totalThin} thin)`,
  );
}
