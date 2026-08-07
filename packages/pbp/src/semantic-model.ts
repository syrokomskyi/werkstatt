/*
<MODULE_CONTRACT>
<purpose>
Builds a SemanticPageModel for a single page from page entries via astro:content.
Established by RFC-0470 as part of the PBP layer. The function reads page/prose/site
collections (not PBP entity data) and takes the semantic profile as a parameter, so it
has no dependency on PBP entity schemas or loaders.
</purpose>
<non-goals>
  <item>Do not contain app-specific page extraction logic.</item>
  <item>Do not hardcode visitor-facing copy — all metadata comes from page frontmatter.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0470 as part of the PBP layer.</item>
  <item>Replaced getBusinessFaqEntries with direct getCollection("faq") call — FAQ now has its own collection (RFC-0475).</item>
  <item>Replaced DEFAULT_LANGUAGE_CODE import with local constant.</item>
  <item>Replaced buildSiteSemanticProfile import with SemanticSiteProfile type from @warpgogol/share/semantic.</item>
</CHANGE_SUMMARY>
*/

import { getEntry, getCollection } from "astro:content";
import {
  buildSemanticPageModelWith,
  type SemanticBreadcrumb,
  type SemanticContentReader,
  type SemanticFaqEntry,
  type SemanticPageModel,
  type SemanticPageType,
  type SemanticSiteProfile,
} from "@warpgogol/share/semantic";
import { pageIdToContentFileSlug } from "@warpgogol/share/content";
import {
  getContentRefIndex,
  resolveReferencesDeep,
  EMPTY_CONTENT_REF_INDEX,
} from "@warpgogol/share/content-reference";
import { parseMaterialCreditMap, materialCreditAtId } from "@warpgogol/share/material-credits";
import { emitPipelineLogEvent } from "@warpgogol/site-kernel-content";

const DEFAULT_LANGUAGE_CODE = "de";

/**
 * Astro's CollectionEntry shape declares `body?: string` on markdown entries
 * but content.config typings sometimes lose it. Narrow via the known shape
 * rather than `as any`.
 */
type EntryWithBody = { body?: string };

async function getProseBody(slug: string, lang: string): Promise<string> {
  const localizedEntry = (await getEntry("prose", `${lang}/${slug}`)) as EntryWithBody | undefined;
  if (typeof localizedEntry?.body === "string") {
    return localizedEntry.body.trim();
  }
  if (lang !== DEFAULT_LANGUAGE_CODE) {
    emitPipelineLogEvent({
      severity: "notice",
      kind: "expected-fallback",
      packageName: "@warpgogol/pbp",
      module: "semantic-model",
      message: `prose fallback: prose/${lang}/${slug} -> prose/${DEFAULT_LANGUAGE_CODE}/${slug}`,
      dedupeKey: `semantic-prose-fallback:${lang}:${slug}`,
      data: { collection: "prose", lang, slug, fallbackLang: DEFAULT_LANGUAGE_CODE },
    });
  }
  const fallbackEntry = (await getEntry("prose", `${DEFAULT_LANGUAGE_CODE}/${slug}`)) as
    EntryWithBody | undefined;
  if (typeof fallbackEntry?.body === "string") {
    return fallbackEntry.body.trim();
  }
  return "";
}

function resolveEntrySlug(pageId: string, _lang: string): string {
  return pageIdToContentFileSlug(pageId);
}

async function getPageFrontmatter(pageId: string, lang: string) {
  const slug = resolveEntrySlug(pageId, lang);

  const localizedEntry = await getEntry("pages", `${lang}/${slug}`);
  if (localizedEntry) {
    const index = getContentRefIndex() ?? EMPTY_CONTENT_REF_INDEX;
    return (await resolveReferencesDeep(index, localizedEntry.data, lang, DEFAULT_LANGUAGE_CODE, {
      collection: "pages",
      file: slug,
    })) as Record<string, unknown>;
  }
  if (lang !== DEFAULT_LANGUAGE_CODE) {
    emitPipelineLogEvent({
      severity: "notice",
      kind: "expected-fallback",
      packageName: "@warpgogol/pbp",
      module: "semantic-model",
      message: `page fallback: pages/${lang}/${slug} -> pages/${DEFAULT_LANGUAGE_CODE}/${slug}`,
      dedupeKey: `semantic-page-fallback:${lang}:${slug}`,
      data: { collection: "pages", lang, slug, fallbackLang: DEFAULT_LANGUAGE_CODE },
    });
  }
  const fallbackSlug = resolveEntrySlug(pageId, DEFAULT_LANGUAGE_CODE);
  const fallbackEntry = await getEntry("pages", `${DEFAULT_LANGUAGE_CODE}/${fallbackSlug}`);
  if (!fallbackEntry) return undefined;
  const index = getContentRefIndex() ?? EMPTY_CONTENT_REF_INDEX;
  return (await resolveReferencesDeep(
    index,
    fallbackEntry.data,
    DEFAULT_LANGUAGE_CODE,
    DEFAULT_LANGUAGE_CODE,
    { collection: "pages", file: fallbackSlug },
  )) as Record<string, unknown>;
}

type FaqEntryData = {
  slug?: string;
  question?: string;
  answer?: string;
  tags?: string[];
  serviceSlug?: string;
  featureFlag?: boolean;
};

async function getFaqEntries(lang: string): Promise<SemanticFaqEntry[]> {
  try {
    const entries = await getCollection("faq");
    const faqEntries = entries.filter(
      (e: { id: string }) =>
        e.id.startsWith(`${lang}/`) || e.id.startsWith(`${DEFAULT_LANGUAGE_CODE}/`),
    );
    return faqEntries
      .filter((entry: { data: FaqEntryData }) => !entry.data.featureFlag)
      .map((entry: { data: FaqEntryData; id: string }) => ({
        id: `faq/${entry.data.slug ?? entry.id}`,
        question: entry.data.question ?? "",
        answer: entry.data.answer ?? "",
        tags: entry.data.tags,
        serviceSlug: entry.data.serviceSlug,
      }));
  } catch {
    return [];
  }
}

/**
 * RFC-0144: the astro:content implementation of the shared SemanticContentReader.
 * Reproduces the previous Astro-path read behavior exactly — notably the home
 * label resolves from `header.brandLabel` only. Content references ({collection.file.field})
 * are substituted in getPageFrontmatter so JSON-LD/OG output gets resolved values.
 * Construction logic now lives once in @warpgogol/share's buildSemanticPageModelWith.
 */
const astroSemanticReader: SemanticContentReader = {
  async getPageFrontmatter(pageId, lang) {
    return (await getPageFrontmatter(pageId, lang)) ?? null;
  },

  async getProseBody(proseSlug, lang) {
    return getProseBody(proseSlug, lang);
  },

  async getHomeLabel(lang) {
    const siteLabelsEntry = await getEntry("site", `${lang}/labels`);
    type SiteLabelsView = { header?: { brandLabel?: string } };
    return (siteLabelsEntry?.data as SiteLabelsView | undefined)?.header?.brandLabel ?? "Home";
  },

  async getFaqEntries(lang): Promise<SemanticFaqEntry[]> {
    return getFaqEntries(lang);
  },
};

/** RFC-0227: eager glob of all material credit sidecars — resolved by Vite at app-build time. */
const _allCreditSidecars = import.meta.glob<string>("/src/content/**/*.credits.yaml", {
  eager: true,
  query: "?raw",
  import: "default",
});

export async function buildPageSemanticModel(
  pageId: string,
  semanticType: SemanticPageType,
  lang: string,
  url: URL,
  siteProfile: SemanticSiteProfile,
  /** RFC-0195: synthetic frontmatter for pages not in the content collection (e.g. surface pages). */
  fallbackFrontmatter?: Record<string, unknown>,
  /** RFC-0229: canonical breadcrumb trail (Home → live ancestors → self) from the render pipeline. */
  breadcrumbs?: SemanticBreadcrumb[],
  /** RFC-0490: collection items for "collection"-typed surface pages (pillar hub industry links). */
  collectionItems?: Array<{ url: string; name: string }>,
  /** RFC-0492: surface identity for depth-gated JSON-LD corrections. */
  surfaceId?: string,
  /** RFC-0492: surface depth for depth-gated JSON-LD corrections. */
  depth?: number,
): Promise<SemanticPageModel | null> {
  const model = await buildSemanticPageModelWith(astroSemanticReader, {
    pageId,
    semanticType,
    lang,
    url,
    profile: siteProfile,
    ...(fallbackFrontmatter ? { fallbackFrontmatter } : {}),
    ...(breadcrumbs && breadcrumbs.length > 0 ? { breadcrumbs } : {}),
  });

  if (model) {
    model.organization = siteProfile.organization;
    // RFC-0490: attach collection items so the JSON-LD builder emits an ItemList node.
    if (collectionItems && collectionItems.length > 0) {
      model.collectionItems = collectionItems;
    }
    // RFC-0492/RFC-0498: attach surface identity + industry Service node for surface pages where Service is required.
    if (surfaceId) model.surfaceId = surfaceId;
    if (depth !== undefined) model.depth = depth;
    const isServiceRequiredSurface =
      (surfaceId === "website-local" && depth === 1) ||
      (surfaceId === "website-service" && depth === 1) ||
      (surfaceId === "website-local" && depth === 5);
    if (isServiceRequiredSurface) {
      model.industryService = {
        serviceType: model.title,
        ...(model.description ? { description: model.description } : {}),
      };
    }
  }

  // RFC-0227: for the credits page, link all lang-matching credit nodes via associatedMedia.
  if (model && pageId === "credits") {
    const allRecords = parseMaterialCreditMap(_allCreditSidecars as Record<string, string>);
    const langRecords = allRecords.filter((r) => {
      const recordLang = r.credit.target.lang ?? r.lang;
      return !recordLang || recordLang === lang || recordLang === DEFAULT_LANGUAGE_CODE;
    });
    const atIds = langRecords
      .map((r) => materialCreditAtId(undefined, r.credit.target.id))
      .filter((id): id is string => id !== undefined)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);
    if (atIds.length > 0) model.materialCreditAtIds = atIds;
  }

  return model;
}
