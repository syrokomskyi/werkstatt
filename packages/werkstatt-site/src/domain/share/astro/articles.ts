/*
<MODULE_CONTRACT>
<purpose>
  RFC-0167: build-time enumeration of article pages for the article-list archetype.
  Joins the dated `article:` metadata declared in system.md (publishedAt/updatedAt/tags)
  with the title/description authored in the pages content collection, resolves the
  localized URL, and returns summaries sorted newest-first. Mirrors routes.ts in reading
  the system collection at build.
</purpose>
<non-goals>
  <item>Do not render — the section component owns presentation.</item>
  <item>Do not validate the article contract — blog.validate owns that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0167: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { getCollection } from "astro:content";
import { pageIdToContentFileSlug } from "../content/entity-id.ts";
import { resolveLocalizedPagePath } from "./routes.ts";

/** A single article card's resolved data. */
export interface ArticleSummary {
  pageId: string;
  href: string;
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
}

interface SystemArticleView {
  pages?: Array<{
    pageId?: string;
    routes?: Record<string, string>;
    article?: { publishedAt?: string; updatedAt?: string; tags?: string[] };
  }>;
}

/**
 * Return all article pages for `lang`, newest-first. An article page is a
 * system.md page carrying `article.publishedAt`. Pages without a route in the
 * requested language, or with no resolvable URL, are skipped.
 */
export async function getArticleSummaries(lang: string): Promise<ArticleSummary[]> {
  const systemEntries = await getCollection("system");
  const data = (systemEntries[0]?.data ?? {}) as SystemArticleView;
  const pages = data.pages ?? [];

  const pageEntries = await getCollection("pages");
  const contentById = new Map<string, { title?: string; description?: string }>(
    pageEntries.map((e: { id: string; data: unknown }) => [
      e.id,
      e.data as { title?: string; description?: string },
    ]),
  );

  const summaries: ArticleSummary[] = [];
  for (const page of pages) {
    const article = page.article;
    if (!article?.publishedAt || !page.pageId) continue;
    if (page.routes?.[lang] === undefined) continue;

    const href = await resolveLocalizedPagePath(page.pageId, lang);
    if (!href) continue;

    const content = contentById.get(`${lang}/${pageIdToContentFileSlug(page.pageId)}`);
    summaries.push({
      pageId: page.pageId,
      href,
      title: content?.title ?? page.pageId,
      summary: content?.description ?? "",
      publishedAt: article.publishedAt,
      ...(article.updatedAt ? { updatedAt: article.updatedAt } : {}),
      tags: article.tags ?? [],
    });
  }

  summaries.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return summaries;
}
