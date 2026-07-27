import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  RFC-0325: shared read-only helper that locates "article"-typed Programmatic Surface pages (e.g.
  Ratgeber) from the generated src/surface.generated.yaml artifact. blog.validate, feed.generate,
  page.markdown.generate, and article.depth.validate each also read the RFC-0167 system.md
  `pages[].article` contract directly; this helper supplies the parallel surface-entry source so a
  Programmatic Surface article participates in the same feeds/twins/validation without four
  separate merges.
</purpose>
<non-goals>
  <item>Do not resolve entitlement gates — callers already gate on `blog`/`pseo` as needed.</item>
  <item>Do not read the Astro runtime — disk only, matching the other build-time generators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0325: initial implementation.</item>
  <item>RFC-0325: split into a dates-optional read (validators) and a dates-required read (generators).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { loadLazySurfacePages } from "@gogol/share/astro/surface-routes";
import type { PageEntry } from "@gogol/surface";

export interface SurfaceArticleTypedEntry {
  pageId: string;
  routes: Record<string, string>;
  semanticType?: string;
  surfaceId?: string;
  article?: { publishedAt?: string; updatedAt?: string; author?: string; tags?: string[] };
  indexable: boolean;
  noindex: boolean;
  /** RFC-0195 GEO contribution: "full" (llms.txt + twin), "twin-only", "off" (neither). */
  geo?: "full" | "twin-only" | "off";
  lazy?: boolean;
  page?: PageEntry;
  pages?: Record<string, PageEntry>;
}

export interface SurfaceArticleEntry extends SurfaceArticleTypedEntry {
  article: { publishedAt: string; updatedAt?: string; author?: string; tags?: string[] };
}

/**
 * Read every live, indexable "article"-typed surface entry, whether or not it has a publishedAt.
 * For validators (blog.validate, article.depth.validate) that must flag a missing/invalid date
 * rather than silently skip the page.
 */
export async function readSurfaceArticleTypedEntries(
  appDir: string,
): Promise<SurfaceArticleTypedEntry[]> {
  try {
    const raw = await readFile(join(appDir, "src", "surface.generated.yaml"), "utf-8");
    const parsed = yamlParse(raw) as { entries?: Array<Record<string, unknown>> };
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const typedEntries = entries.filter(
      (e) => e.semanticType === "article" && e.indexable === true && e.noindex !== true,
    );
    return typedEntries as unknown as SurfaceArticleTypedEntry[];
  } catch {
    return [];
  }
}

/**
 * Read live, indexable surface entries with a valid `article.publishedAt`. For
 * generators (feed.generate, page.markdown.generate) that should simply skip an undated article.
 */
export async function readSurfaceArticleEntries(appDir: string): Promise<SurfaceArticleEntry[]> {
  const typedEntries = await readSurfaceArticleTypedEntries(appDir);
  return typedEntries.filter(
    (e): e is SurfaceArticleEntry => typeof e.article?.publishedAt === "string",
  );
}

/**
 * RFC-0166: Read ALL surface entries that need markdown twins — not just articles.
 * Any entry with geo !== "off", indexable, and not noindex should get a twin.
 * Non-article entries (e.g. "content"-typed) are returned alongside articles.
 */
export async function readSurfaceTwinEntries(appDir: string): Promise<SurfaceArticleTypedEntry[]> {
  try {
    const raw = await readFile(join(appDir, "src", "surface.generated.yaml"), "utf-8");
    const parsed = yamlParse(raw) as { entries?: Array<Record<string, unknown>> };
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const twinEntries = entries.filter(
      (e) => e.indexable === true && e.noindex !== true && e.geo !== "off" && e.geo !== undefined,
    );
    return twinEntries as unknown as SurfaceArticleTypedEntry[];
  } catch {
    return [];
  }
}

/** Resolve the full baked page (blocks included) for one language, loading the lazy cache on demand. */
export async function resolveSurfaceArticlePage(
  appDir: string,
  entry: SurfaceArticleTypedEntry,
  lang: string,
  defaultLang: string,
): Promise<PageEntry | undefined> {
  const pages =
    entry.pages ?? (entry.lazy ? await loadLazySurfacePages(appDir, entry.pageId) : null);
  return pages?.[lang] ?? pages?.[defaultLang] ?? entry.page;
}
