/*
<MODULE_CONTRACT>
<purpose>Facilitates retrieval and merging of component/layout content in Astro environments.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>Deepening: extracted site-content handler registry to astro/site-content-handlers.ts; getSemanticSiteContentData replaced by resolveSiteContentData registry dispatch.</item>
</CHANGE_SUMMARY>
*/

// RFC-0141: content reads flow through the Content Source Provider port (the single named
// seam that owns the astro:content dependency), not astro:content directly.
import { getEntry } from "@gogol/content-source/astro";
import { mergeComponentContent } from "../content/merge.ts";
import {
  getContentRefIndex,
  resolveReferencesDeep,
  EMPTY_CONTENT_REF_INDEX,
} from "../content-reference.ts";
import {
  normalizeComponentPath,
  getCollectionId,
  getKnownIdsForCollection,
  resolveSiteContentData,
} from "./site-content-handlers.ts";

export { normalizeComponentPath, getCollectionId };

export async function getComponentContentData(
  componentPath: string,
  languageCode: string,
  defaultLanguageCode: string,
): Promise<Record<string, unknown> | undefined> {
  const semanticData = await resolveSiteContentData(
    componentPath,
    languageCode,
    defaultLanguageCode,
  );
  return semanticData;
}

export async function getProseContentEntry(
  prosePath: string,
  languageCode: string,
  defaultLanguageCode: string,
): Promise<unknown | undefined> {
  const knownIds = await getKnownIdsForCollection("prose");
  const normalizedPath = normalizeComponentPath(prosePath)
    .replace(/^prose\//, "")
    .replace(/\.[a-z]{2}$/, "");
  const langId = getCollectionId(languageCode, normalizedPath);

  if (knownIds.has(langId)) {
    return getEntry("prose", langId);
  }

  const defaultId = getCollectionId(defaultLanguageCode, normalizedPath);
  if (knownIds.has(defaultId)) {
    if (languageCode !== defaultLanguageCode) {
      console.warn(
        `[content-fallback] "prose/${languageCode}/${normalizedPath}" not found — using "${defaultLanguageCode}" fallback`,
      );
    }
    return getEntry("prose", defaultId);
  }

  return undefined;
}

export async function getLayoutContentData(
  layoutPath: string,
  languageCode: string,
  defaultLanguageCode: string,
): Promise<Record<string, unknown> | undefined> {
  const knownSiteIds = await getKnownIdsForCollection("site");
  const siteEntryId = getCollectionId(languageCode, layoutPath);
  if (knownSiteIds.has(siteEntryId)) {
    const entry = await getEntry("site", siteEntryId);
    return entry?.data as Record<string, unknown> | undefined;
  }

  if (languageCode !== defaultLanguageCode) {
    const defaultSiteEntryId = getCollectionId(defaultLanguageCode, layoutPath);
    if (knownSiteIds.has(defaultSiteEntryId)) {
      const defaultEntry = await getEntry("site", defaultSiteEntryId);
      console.warn(
        `[content-fallback] "site/${languageCode}/${normalizeComponentPath(layoutPath)}" not found — using "${defaultLanguageCode}" fallback`,
      );
      return defaultEntry?.data as Record<string, unknown> | undefined;
    }
  }

  const entryId = getCollectionId(languageCode, layoutPath);
  // @ts-ignore - dynamic collection name
  const entry = await getEntry("layouts", entryId);

  if (entry) return entry.data as Record<string, unknown>;

  if (languageCode !== defaultLanguageCode) {
    const defaultEntryId = getCollectionId(defaultLanguageCode, layoutPath);
    // @ts-ignore - dynamic collection name
    const defaultEntry = await getEntry("layouts", defaultEntryId);
    if (defaultEntry) {
      console.warn(
        `[content-fallback] "layouts/${languageCode}/${normalizeComponentPath(layoutPath)}" not found — using "${defaultLanguageCode}" fallback`,
      );
      return defaultEntry.data as Record<string, unknown>;
    }
  }

  return undefined;
}

/**
 * Fetches default component content then deep-merges an optional pageOverride on top.
 * App-agnostic — requires explicit defaultLanguageCode so packages/* never import from apps/*.
 */
export async function getResolvedComponentContent<TContent>(options: {
  componentPath: string;
  languageCode?: string;
  defaultLanguageCode: string;
  pageOverride?: Partial<TContent>;
}): Promise<TContent> {
  const lang = options.languageCode ?? options.defaultLanguageCode;
  const data = await getComponentContentData(
    options.componentPath,
    lang,
    options.defaultLanguageCode,
  );
  if (data === undefined) {
    throw new Error(
      `Missing shared component content entry for: ${options.componentPath}. ` +
        `RFC-0099 removes legacy componentContent fallback; declare this content in modern semantic sources.`,
    );
  }

  // [RFC-0527] Resolve content references via the build-time index
  const index = getContentRefIndex() ?? EMPTY_CONTENT_REF_INDEX;
  const substitutedData = (await resolveReferencesDeep(
    index,
    data,
    lang,
    options.defaultLanguageCode,
  )) as TContent;

  return mergeComponentContent(substitutedData, options.pageOverride);
}

export function getComponentOverride<TContent = Record<string, unknown>>(
  pageData: { componentOverrides?: Record<string, Record<string, unknown>> },
  componentPath: string,
): Partial<TContent> | undefined {
  return pageData.componentOverrides?.[componentPath] as Partial<TContent> | undefined;
}

/**
 * RFC-0106: Get orchestrator configuration from site labels.
 * Reads `orchestrator` block from site/{lang}/labels.md with fallback to default language.
 */
export async function getSiteLabelsData(
  languageCode: string,
  defaultLanguageCode: string,
): Promise<Record<string, unknown> | undefined> {
  const knownSiteIds = await getKnownIdsForCollection("site");
  const siteId = getCollectionId(languageCode, "labels");
  const defaultSiteId = getCollectionId(defaultLanguageCode, "labels");

  const siteEntry = knownSiteIds.has(siteId) ? await getEntry("site", siteId) : undefined;
  const defaultSiteEntry = knownSiteIds.has(defaultSiteId)
    ? await getEntry("site", defaultSiteId)
    : undefined;

  return (
    (siteEntry?.data as Record<string, unknown> | undefined) ??
    (defaultSiteEntry?.data as Record<string, unknown> | undefined)
  );
}

export async function getSiteSectionLabels<TLabels extends Record<string, unknown>>(
  languageCode: string,
  defaultLanguageCode: string,
  sectionKey: string,
): Promise<TLabels | undefined> {
  const labels = await getSiteLabelsData(languageCode, defaultLanguageCode);
  const defaultLabels =
    languageCode === defaultLanguageCode
      ? labels
      : await getSiteLabelsData(defaultLanguageCode, defaultLanguageCode);

  return ((labels?.sections as Record<string, unknown> | undefined)?.[sectionKey] ??
    (defaultLabels?.sections as Record<string, unknown> | undefined)?.[sectionKey]) as
    TLabels | undefined;
}

export async function getSiteOrchestratorConfig(
  languageCode: string,
  defaultLanguageCode: string,
): Promise<Record<string, unknown> | undefined> {
  const labels = await getSiteLabelsData(languageCode, defaultLanguageCode);
  const defaultLabels =
    languageCode === defaultLanguageCode
      ? labels
      : await getSiteLabelsData(defaultLanguageCode, defaultLanguageCode);
  return (labels?.orchestrator ?? defaultLabels?.orchestrator) as
    Record<string, unknown> | undefined;
}
