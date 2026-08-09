/*
<MODULE_CONTRACT>
<purpose>
Content-entry resolution helpers for resolvePageRoute: RFC-0008 default-language content
fallback (with deep-merge of localized onto default entry data), shared-context prop
resolution across pages, and the RFC-0192 Programmatic Surface redirect-stub result builder.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of astro/page-handler.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

// RFC-0141: content reads flow through the Content Source Provider port (the single named
// seam that owns the astro:content dependency), not astro:content directly.
import { getEntry } from "@warpgogol/werkstatt-site/content-source/astro";
import { EMPTY_RUNTIME_CONTEXT } from "../../runtime-context.ts";
import type { PageEntry, ResolvedPage } from "../../page.ts";
import { pageIdToContentFileSlug } from "../../content/entity-id.ts";
import { deepMergeEntryData } from "../../content/merge.ts";
import { resolveSharedContextProps } from "../../shared-context.ts";
import { deriveOrchestratorConfig } from "./semantic.ts";
import type { PageRouteData } from "./types.ts";

export type SharedContextBlock = {
  id?: string;
  type?: string;
  use?: string;
  props?: Record<string, unknown>;
};

export type SharedContextPageEntry = {
  pageId: string;
  blocks: SharedContextBlock[];
};

export async function loadLocalizedPageEntry(
  pageId: string,
  lang: string,
  defaultLang: string,
): Promise<PageEntry | null> {
  const fileSlug = pageIdToContentFileSlug(pageId);
  const localizedEntry = await getEntry("pages", `${lang}/${fileSlug}`);

  if (localizedEntry && lang === defaultLang) {
    return localizedEntry.data as PageEntry;
  }

  const defaultEntry = await getEntry("pages", `${defaultLang}/${fileSlug}`);

  if (localizedEntry && defaultEntry) {
    return deepMergeEntryData(
      defaultEntry.data as Record<string, unknown>,
      localizedEntry.data as Record<string, unknown>,
    ) as unknown as PageEntry;
  }

  if (localizedEntry) {
    return localizedEntry.data as PageEntry;
  }

  if (defaultEntry) {
    return defaultEntry.data as PageEntry;
  }

  return null;
}

export function applySharedContextFallback(options: {
  currentPageId: string;
  entry: PageEntry;
  pages: Map<string, SharedContextPageEntry>;
  requiredPageIds: string[];
}): PageEntry {
  const { currentPageId, entry, pages, requiredPageIds } = options;

  return {
    ...entry,
    blocks: entry.blocks.map((block) => ({
      ...block,
      props: resolveSharedContextProps({
        currentPageId,
        block,
        pages,
        requiredPageIds,
      }),
    })),
  };
}

/**
 * RFC-0192: minimal PageRouteData for a Programmatic Surface redirect stub. The route template
 * checks `redirectTo` first and 301s before touching any other field, so the rest are safe
 * placeholders.
 */
export function buildSurfaceRedirectResult(
  pageId: string,
  lang: string,
  defaultLang: string,
  supportedLangs: string[],
  redirectTo: string,
): PageRouteData {
  const emptyPage: ResolvedPage = {
    star: "",
    title: "",
    description: "",
    lang,
    blocks: [],
    ctx: EMPTY_RUNTIME_CONTEXT(lang),
  };
  return {
    pageId,
    page: emptyPage,
    alternateLinks: [],
    growthConfig: undefined,
    appId: "app",
    defaultLanguageCode: defaultLang,
    supportedLangs,
    localizedSiblingPath: "",
    semanticPage: null,
    biome: "default",
    skipLinkLabel: "",
    resolvedDescription: "",
    orchestratorConfig: deriveOrchestratorConfig([]),
    translationContext: null,
    redirectTo,
    printMode: false,
  };
}
