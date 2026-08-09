/*
<MODULE_CONTRACT>
<purpose>
[RFC-0500] bakeRatgeberHub: builds the depth-0 editorial knowledge hub page for the ratgeber
surface. Emits a six-block layout: hero, Aktuelle Entscheidungshilfen, Themenbereiche,
So arbeitet die Redaktion, Neu, Grundlagen — plus an optional contact CTA. Editorial blocks
with zero matching articles are omitted (field-presence-driven pattern).
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0500: initial implementation — ratgeber hub baker with six-block editorial layout.</item>
  <item>RFC-0507: hub cards now pass articleType, question, reviewedAt, readTime instead of description (summary).</item>
</CHANGE_SUMMARY>
*/

import type { VirtualRouteEntry } from "@warpgogol/surface";
import type { Block } from "./bake-blocks.ts";
import { hero, linkedCardGrid, md, ctaBlock } from "./bake-blocks.ts";
import type { BakeCtx } from "./bake.ts";
import { labelsFor, titleForEntry } from "./bake-helpers.ts";

interface RatgeberArticle {
  slug: string;
  title: string;
  question?: string;
  summary?: string;
  articleType?: string;
  categoryId?: string;
  readTime?: string;
  reviewedAt?: string;
  publishedAt?: string;
  updatedAt?: string;
  status?: string;
}

interface RatgeberCategory {
  slug: string;
  name: string;
  sortOrder?: number;
}

const HUB_LABELS: Record<
  string,
  {
    aktuellen: string;
    themenbereiche: string;
    redaktion: string;
    neu: string;
    grundlagen: string;
    redaktionBody: string;
    redaktionLink: string;
    contactCta: string;
  }
> = {
  de: {
    aktuellen: "Aktuelle Entscheidungshilfen",
    themenbereiche: "Themenbereiche",
    redaktion: "So arbeitet die Redaktion",
    neu: "Neu",
    grundlagen: "Grundlagen",
    redaktionBody:
      "Unsere Redaktion prüft jeden Ratgeberartikel auf Quellen, Aktualität und Verständlichkeit. Wir aktualisieren Inhalte regelmäßig und kennzeichnen das Datum der letzten Überprüfung.",
    redaktionLink: "Mehr zur Redaktion",
    contactCta: "Bereit für ein tragfähiges Fundament?",
  },
  uk: {
    aktuellen: "Актуальні рішення",
    themenbereiche: "Тематичні розділи",
    redaktion: "Як працює редакція",
    neu: "Нове",
    grundlagen: "Основи",
    redaktionBody:
      "Наша редакція перевіряє кожну статтю на джерела, актуальність і зрозумілість. Ми регулярно оновлюємо контент і позначаємо дату останньої перевірки.",
    redaktionLink: "Докладніше про редакцію",
    contactCta: "Готові до надійного цифрового фундаменту?",
  },
};

function hubLabelsFor(lang: string) {
  return HUB_LABELS[lang] ?? HUB_LABELS.de!;
}

function extractArticles(ctx: BakeCtx, lang: string): RatgeberArticle[] {
  const articles: RatgeberArticle[] = [];
  const axisId = ctx.axisOrder[0];
  if (!axisId) return articles;
  const axisData = ctx.axisDataByLang.get(lang)?.get(axisId);
  if (!axisData) return articles;
  for (const [slug, data] of axisData) {
    const status = typeof data.status === "string" ? data.status : "published";
    if (status !== "published") continue;
    articles.push({
      slug,
      title:
        typeof data.title === "string"
          ? data.title
          : typeof data.name === "string"
            ? data.name
            : slug,
      question: typeof data.question === "string" ? data.question : undefined,
      summary:
        typeof data.summary === "string"
          ? data.summary
          : typeof data.intro === "string"
            ? data.intro
            : undefined,
      articleType: typeof data.articleType === "string" ? data.articleType : undefined,
      categoryId: typeof data.categoryId === "string" ? data.categoryId : undefined,
      readTime: typeof data.readTime === "string" ? data.readTime : undefined,
      reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : undefined,
      publishedAt: typeof data.publishedAt === "string" ? data.publishedAt : undefined,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
      status,
    });
  }
  return articles;
}

function extractCategories(ctx: BakeCtx, lang: string): RatgeberCategory[] {
  const cats = ctx.supplementaryCollections?.get("article-categories")?.get(lang);
  if (!cats) return [];
  const categories: RatgeberCategory[] = [];
  for (const [slug, data] of cats) {
    categories.push({
      slug,
      name:
        (typeof data.title === "string" && data.title) ||
        (typeof data.name === "string" && data.name) ||
        slug,
      sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 999,
    });
  }
  return categories.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

function articleHref(slug: string, lang: string, defaultLang: string, baseSlug: string): string {
  const prefix = lang === defaultLang ? "" : `${lang}/`;
  return `/${prefix}${baseSlug}/${slug}/`.replace(/\/+/g, "/");
}

function categoryHref(slug: string, lang: string, defaultLang: string, baseSlug: string): string {
  const prefix = lang === defaultLang ? "" : `${lang}/`;
  return `/${prefix}${baseSlug}/kategorie/${slug}/`.replace(/\/+/g, "/");
}

export function bakeRatgeberHub(
  entry: VirtualRouteEntry,
  lang: string,
  ctx: BakeCtx,
): VirtualRouteEntry["page"] {
  const dl = ctx.defaultLang;
  const lbl = labelsFor(lang);
  const hlbl = hubLabelsFor(lang);
  const baseSlug = entry.routes?.[lang] ?? entry.routes?.[dl] ?? "ratgeber";
  const level = ctx.levels.find((l) => l.depth === entry.depth);
  const title =
    level?.titleTemplate?.[lang] ?? level?.titleTemplate?.[dl] ?? titleForEntry(entry, ctx, lang);
  const intro = level?.intro?.[lang] ?? level?.intro?.[dl] ?? "";

  const articles = extractArticles(ctx, lang);
  const categories = extractCategories(ctx, lang);

  const blocks: Block[] = [];

  // 1. Hero
  blocks.push(
    hero({
      heading: title,
      ...(intro ? { description: intro } : {}),
      primaryLabel: lbl.cta,
      primaryTarget: "contact",
    }),
  );

  // 2. Aktuelle Entscheidungshilfen — 3 most recently updated entscheidungshilfe/rechenmodell articles
  const entscheidungshilfen = articles
    .filter((a) => a.articleType === "entscheidungshilfe" || a.articleType === "rechenmodell")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 3);
  if (entscheidungshilfen.length > 0) {
    blocks.push(
      linkedCardGrid(
        hlbl.aktuellen,
        entscheidungshilfen.map((a) => ({
          title: a.title,
          ...(a.articleType ? { articleType: a.articleType } : {}),
          ...(a.question ? { question: a.question } : {}),
          ...(a.reviewedAt ? { reviewedAt: a.reviewedAt } : {}),
          ...(a.readTime ? { readTime: a.readTime } : {}),
          href: articleHref(a.slug, lang, dl, baseSlug),
        })),
      ),
    );
  }

  // 3. Themenbereiche — category cards
  if (categories.length > 0) {
    blocks.push(
      linkedCardGrid(
        hlbl.themenbereiche,
        categories.map((c) => ({
          title: c.name,
          href: categoryHref(c.slug, lang, dl, baseSlug),
        })),
        "themenbereiche",
      ),
    );
  }

  // 4. So arbeitet die Redaktion — editorial standards + link to policy page
  const redaktionHref =
    lang === dl ? `/${baseSlug}/redaktion/` : `/${lang}/${baseSlug}/redaktsiya/`;
  blocks.push(md(hlbl.redaktion, hlbl.redaktionBody, `[${hlbl.redaktionLink}](${redaktionHref})`));

  // 5. Neu — 3 most recently published
  const neu = articles
    .filter((a) => a.publishedAt)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 3);
  if (neu.length > 0) {
    blocks.push(
      linkedCardGrid(
        hlbl.neu,
        neu.map((a) => ({
          title: a.title,
          ...(a.articleType ? { articleType: a.articleType } : {}),
          ...(a.question ? { question: a.question } : {}),
          ...(a.reviewedAt ? { reviewedAt: a.reviewedAt } : {}),
          ...(a.readTime ? { readTime: a.readTime } : {}),
          href: articleHref(a.slug, lang, dl, baseSlug),
        })),
      ),
    );
  }

  // 6. Grundlagen — all grundlagenartikel sorted by title
  const grundlagen = articles
    .filter((a) => a.articleType === "grundlagenartikel")
    .sort((a, b) => a.title.localeCompare(b.title));
  if (grundlagen.length > 0) {
    blocks.push(
      linkedCardGrid(
        hlbl.grundlagen,
        grundlagen.map((a) => ({
          title: a.title,
          ...(a.articleType ? { articleType: a.articleType } : {}),
          ...(a.question ? { question: a.question } : {}),
          ...(a.reviewedAt ? { reviewedAt: a.reviewedAt } : {}),
          ...(a.readTime ? { readTime: a.readTime } : {}),
          href: articleHref(a.slug, lang, dl, baseSlug),
        })),
      ),
    );
  }

  // 7. Optional contact CTA
  blocks.push(
    ctaBlock(hlbl.contactCta, [{ label: lbl.cta, pageId: "contact", variant: "primary" }]),
  );

  return {
    kind: "page",
    cosmicStar: "Vega",
    title,
    description: intro || title,
    lang,
    blocks: blocks as never,
  };
}
