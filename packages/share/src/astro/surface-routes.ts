/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0192] Build-time loader for the Programmatic Surface artifact (src/surface.generated.yaml).
  The single seam the route registry merge and the page handler use to read materialized virtual
  route entries. Build-time only: node:fs is dynamically imported so it never enters a worker
  bundle. Fail-open — a missing/unreadable artifact yields zero surface routes (authored pages
  are never affected).
</purpose>
<non-goals>
  <item>Do not generate entries — that is the surface.generate kernel command.</item>
  <item>Do not gate by entitlement — the registry merge owns the pseo gate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0192: initial loader.</item>
</CHANGE_SUMMARY>
*/

// Inlined from @gogol/surface/src/types.ts to break the workspace cycle
// (surface → site-kernel-content → share → surface). These are type-only;
// the canonical definitions live in @gogol/surface and must stay structurally compatible.
import type { PageEntry } from "../page.ts";

interface VirtualRouteEntry {
  surfaceId: string;
  pageId: string;
  routes: Record<string, string>;
  axes: Record<string, string | undefined>;
  depth: number;
  recordCount: number;
  indexable: boolean;
  noindex: boolean;
  redirectToPageId?: string;
  canonicalPageId?: string;
  semanticType?: string;
  article?: { publishedAt: string; updatedAt?: string; author?: string; tags?: string[] };
  geo?: "full" | "twin-only" | "off";
  backgroundImage?: string;
  page?: PageEntry;
  pages?: Record<string, PageEntry>;
  lazy?: boolean;
  untranslatedLangs?: string[];
  decision?: unknown;
}

interface SurfaceArtifact {
  generatedAt: string | null;
  entries: VirtualRouteEntry[];
}

let ENTRIES_CACHE: VirtualRouteEntry[] | null = null;
let BY_PAGE_ID_CACHE: Map<string, VirtualRouteEntry> | null = null;

async function loadArtifact(): Promise<VirtualRouteEntry[]> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { parse: yamlParse } = await import("yaml");
    const raw = await readFile(join(process.cwd(), "src", "surface.generated.yaml"), "utf8");
    const parsed = yamlParse(raw) as SurfaceArtifact;
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/** All materialized virtual route entries (cached). Fail-open to []. */
export async function getSurfaceEntries(): Promise<VirtualRouteEntry[]> {
  if (ENTRIES_CACHE) return ENTRIES_CACHE;
  ENTRIES_CACHE = await loadArtifact();
  return ENTRIES_CACHE;
}

/** Filesystem-safe filename for a synthetic surface pageId (colons → __). */
function pageIdToFile(pageId: string): string {
  return pageId.replace(/[^a-z0-9_-]/gi, "__");
}

/**
 * RFC-0192: load a lazily-baked entry's per-language pages from its per-page file
 * (`<baseDir>/.surface-cache/<pageId>.yaml`). Build-time only; fail-open to null.
 * The single seam for the cache path/format — reused by the page handler/renderer
 * and the llms.txt generator (RFC-0199).
 */
export async function loadLazySurfacePages(
  baseDir: string,
  pageId: string,
): Promise<NonNullable<VirtualRouteEntry["pages"]> | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const raw = await readFile(
      join(baseDir, ".surface-cache", `${pageIdToFile(pageId)}.yaml`),
      "utf8",
    );
    const { parse: yamlParse } = await import("yaml");
    const parsed = yamlParse(raw) as { pages?: NonNullable<VirtualRouteEntry["pages"]> };
    return parsed.pages ?? null;
  } catch {
    return null;
  }
}

/** Lookup a virtual route entry by its synthetic pageId (cached). Resolves lazy pages on demand. */
export async function getSurfaceEntryByPageId(pageId: string): Promise<VirtualRouteEntry | null> {
  if (!BY_PAGE_ID_CACHE) {
    const entries = await getSurfaceEntries();
    BY_PAGE_ID_CACHE = new Map(entries.map((entry) => [entry.pageId, entry]));
  }
  const entry = BY_PAGE_ID_CACHE.get(pageId);
  if (!entry) return null;
  // RFC-0192: in lazy bake mode the registry entry carries only a metadata stub; load the full
  // per-language pages from its per-page file on first access and memoize them on the entry.
  if (entry.lazy && !entry.pages) {
    const pages = await loadLazySurfacePages(process.cwd(), pageId);
    if (pages) {
      entry.pages = pages;
      const firstLang = Object.keys(pages)[0];
      if (firstLang) entry.page = pages[firstLang];
    }
  }
  return entry;
}

/** Reset caches (tests / hot reload). */
export function clearSurfaceCache(): void {
  ENTRIES_CACHE = null;
  BY_PAGE_ID_CACHE = null;
}
