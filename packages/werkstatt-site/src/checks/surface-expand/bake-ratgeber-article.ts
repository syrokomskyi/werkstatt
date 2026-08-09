/*
<MODULE_CONTRACT>
<purpose>
[RFC-0500] bakeRatgeberArticle: builds a depth-1 article page for the ratgeber surface.
[RFC-0504] 12-section layout: breadcrumbs → article-header → direct-answer → TOC → main analysis
→ practical tool → limitations → Warpgogol connection → sources → authorship/review → changelog
→ contextual next step (CTA). Emits article-header (Himalia) with metadata, TOC (Metis) auto-generated
from H2 headings, markdown prose body (single or sectioned via articleSections), FAQ blocks, related
articles (same category), context-specific closing CTA based on articleType (RFC-0501), changelog
(Prometheus) from frontmatter, and provenance footer (RFC-0502).
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0500: initial implementation — ratgeber article baker with hero + prose + FAQ + related + CTA.</item>
  <item>RFC-0501: context-specific closing CTAs based on articleType.</item>
  <item>RFC-0502: provenance footer block with author info, review date, and source list.</item>
  <item>RFC-0504: 12-section layout with article-header, TOC, articleSections extraction, changelog, three-tier CTA.</item>
</CHANGE_SUMMARY>
*/

import type { VirtualRouteEntry } from "@warpgogol/surface";
import type { Block } from "./bake-blocks.ts";
import { md, linkedCardGrid, ctaBlock, articleHeader, changelogBlock } from "./bake-blocks.ts";
import type { BakeCtx } from "./bake.ts";
import { labelsFor, valData } from "./bake-helpers.ts";
import { articleProseSlug } from "./bake.ts";

interface FaqItem {
  question: string;
  answer: string;
}

const SLOT_TO_H2_DE: Record<string, string> = {
  "direct-answer": "## Kernfrage",
  definitions: "## Wissensbasis",
  analysis: "## Häufige Missverständnisse",
  example: "## Praxisbezug",
  checklist: "## Checkliste",
  limitations: "## Kosten und Trade-offs",
  sources: "## Quellen",
  "warpgogol-connection": "## Warpgogol-Bezug",
};

const SLOT_TO_H2_UK: Record<string, string> = {
  "direct-answer": "## Ключове питання",
  definitions: "## База знань",
  analysis: "## Поширені помилки",
  example: "## Практична частина",
  checklist: "## Контрольний список",
  limitations: "## Витрати і компроміси",
  sources: "## Джерела",
  "warpgogol-connection": "## Зв'язок із Warpgogol",
};

function slotToH2(slot: string, lang: string): string | undefined {
  if (lang === "uk") return SLOT_TO_H2_UK[slot];
  return SLOT_TO_H2_DE[slot];
}

export function bakeRatgeberArticle(
  entry: VirtualRouteEntry,
  lang: string,
  ctx: BakeCtx,
): VirtualRouteEntry["page"] {
  const dl = ctx.defaultLang;
  const lbl = labelsFor(lang);
  const axisId = ctx.axisOrder[0];
  const articleSlug = axisId ? entry.axes[axisId] : undefined;
  const data = articleSlug ? valData(ctx, axisId!, articleSlug, lang) : undefined;

  const title =
    (typeof data?.title === "string" && data.title) ||
    (typeof data?.name === "string" && data.name) ||
    articleSlug ||
    "Artikel";

  const summary =
    typeof data?.summary === "string"
      ? data.summary
      : typeof data?.intro === "string"
        ? data.intro
        : undefined;
  const categoryId = typeof data?.categoryId === "string" ? data.categoryId : undefined;
  const articleType = typeof data?.articleType === "string" ? data.articleType : undefined;
  const authorId = typeof data?.authorId === "string" ? data.authorId : undefined;
  const reviewedAt = typeof data?.reviewedAt === "string" ? data.reviewedAt : undefined;

  // Resolve author name
  let authorName: string | undefined;
  if (authorId) {
    const authorData = ctx.supplementaryCollections?.get("authors")?.get(lang)?.get(authorId);
    if (authorData) {
      authorName = typeof authorData.name === "string" ? authorData.name : authorId;
    }
  }

  const blocks: Block[] = [];

  // 1. Breadcrumbs
  // (breadcrumbs are rendered by the layout, not emitted here)

  // 2. Article-header (Himalia) — title as H1, metadata fields
  blocks.push(
    articleHeader({
      title,
      ...(summary ? { summary } : {}),
      ...(categoryId ? { category: categoryId } : {}),
      ...(articleType ? { articleType } : {}),
      ...(authorName ? { authorName } : {}),
      ...(reviewedAt ? { reviewedAt } : {}),
    }),
  );

  // 3. Direct-answer — if articleSections includes "direct-answer", it will be extracted below
  //    Otherwise the prose body is rendered as a single markdown block after the TOC

  // 4. TOC (Metis) — auto-generated from H2 headings at render time
  //    The renderer reads the prose body from the contentRef and populates entries.
  blocks.push({
    type: "toc",
    props: {
      hideSectionNumber: true,
      sourceContentRef: `prose/${articleProseSlug(entry)}`,
    },
  });

  // 5-9. Main content — articleSections extraction or single markdown block
  const articleSectionsRaw = data?.articleSections;
  if (Array.isArray(articleSectionsRaw) && articleSectionsRaw.length > 0) {
    // Emit section blocks with slot + contentRef — the renderer extracts the named section
    for (const slot of articleSectionsRaw) {
      if (typeof slot !== "string") continue;
      const h2 = slotToH2(slot, lang);
      if (!h2) continue;
      blocks.push({
        type: "markdown",
        props: {
          contentRef: `prose/${articleProseSlug(entry)}`,
          sectionHeading: h2,
          hideSectionNumber: true,
        },
      });
    }
  } else {
    // Single markdown block (field-presence-driven rendering)
    blocks.push({
      type: "markdown",
      props: { contentRef: `prose/${articleProseSlug(entry)}`, hideSectionNumber: true },
    });
  }

  // 10. FAQ blocks
  const faqsRaw = data?.faqs;
  if (Array.isArray(faqsRaw)) {
    const faqs: FaqItem[] = faqsRaw
      .filter(
        (f): f is FaqItem =>
          typeof f === "object" &&
          f !== null &&
          typeof (f as Record<string, unknown>).question === "string" &&
          typeof (f as Record<string, unknown>).answer === "string",
      )
      .map((f) => ({ question: f.question, answer: f.answer }));
    for (const f of faqs) blocks.push(md(f.question, f.answer));
  }

  // 11. Related articles — siblings in the same categoryId (up to 6)
  if (categoryId && axisId) {
    const siblings = ctx.entries
      .filter((other) => {
        if (other.depth !== entry.depth || !other.indexable || other.pageId === entry.pageId)
          return false;
        const siblingSlug = other.axes[axisId];
        if (!siblingSlug) return false;
        const siblingData = valData(ctx, axisId, siblingSlug, lang);
        return typeof siblingData?.categoryId === "string" && siblingData.categoryId === categoryId;
      })
      .slice(0, 6);

    if (siblings.length > 0) {
      blocks.push(
        linkedCardGrid(
          lbl.related,
          siblings.map((s) => {
            const sData = valData(ctx, axisId!, s.axes[axisId!], lang);
            const sTitle =
              (typeof sData?.title === "string" && sData.title) ||
              (typeof sData?.name === "string" && sData.name) ||
              (s.axes[axisId!] ?? "Artikel");
            const sSummary = typeof sData?.summary === "string" ? sData.summary : undefined;
            return {
              title: sTitle,
              ...(sSummary ? { description: sSummary } : {}),
              href: `/${lang === dl ? "" : `${lang}/`}ratgeber/${s.axes[axisId!]}/`.replace(
                /\/+/g,
                "/",
              ),
            };
          }),
        ),
      );
    }
  }

  // 12. Changelog (Prometheus) — from frontmatter, omitted when absent
  const changelogRaw = data?.changelog;
  if (Array.isArray(changelogRaw)) {
    const changelogEntries = changelogRaw
      .filter(
        (e): e is { date: string; summary: string; authorId: string } =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as Record<string, unknown>).date === "string" &&
          typeof (e as Record<string, unknown>).summary === "string" &&
          typeof (e as Record<string, unknown>).authorId === "string",
      )
      .map((e) => ({ date: e.date, summary: e.summary, authorId: e.authorId }));
    if (changelogEntries.length > 0) {
      blocks.push(changelogBlock(changelogEntries));
    }
  }

  // 13. Context-specific closing CTA (RFC-0501) — three-tier system
  const ctaBlocks = buildContextualCta(articleType, lang, lbl, ctx, entry, axisId, categoryId);
  // Add secondary CTA from frontmatter if present
  const secondaryCtaRaw = data?.secondaryCta;
  if (
    typeof secondaryCtaRaw === "object" &&
    secondaryCtaRaw !== null &&
    typeof (secondaryCtaRaw as Record<string, unknown>).label === "string" &&
    typeof (secondaryCtaRaw as Record<string, unknown>).target === "string"
  ) {
    const sCta = secondaryCtaRaw as { label: string; target: string };
    blocks.push({
      type: "final-cta",
      props: {
        header: { heading: lbl.closing },
        ctaGroup: {
          align: "center",
          items: [
            ...ctaBlocks.flatMap(
              (b) =>
                (
                  b.props.ctaGroup as {
                    items: Array<{ label: string; variant: string; target: unknown }>;
                  }
                )?.items?.map((it) => ({
                  label: it.label,
                  variant: it.variant,
                  target: it.target,
                })) ?? [],
            ),
            {
              label: sCta.label,
              variant: "secondary",
              target: { kind: "internal", href: sCta.target },
            },
            { label: lbl.cta, variant: "primary", target: { kind: "internal", pageId: "contact" } },
          ],
        },
      },
    });
  } else {
    for (const block of ctaBlocks) {
      blocks.push(block);
    }
  }

  // 14. Provenance footer (RFC-0502) — author info, review date, source list
  const provenanceFooter = buildProvenanceFooter(data, lang, ctx);
  if (provenanceFooter) {
    blocks.push(provenanceFooter);
  }

  return {
    kind: "page",
    cosmicStar: "Vega",
    title,
    description: summary || title,
    lang,
    blocks: blocks as never,
  };
}

interface RatgeberCtaLabels {
  relatedArticles: string;
  relatedTerms: string;
  services: string;
  pricing: string;
  help: string;
  cta: string;
}

const CTA_LABELS: Record<string, RatgeberCtaLabels> = {
  de: {
    relatedArticles: "Verwandte Artikel",
    relatedTerms: "Verwandte Begriffe",
    services: "Passende Leistungen",
    pricing: "Preise ansehen",
    help: "Brauchen Sie Hilfe?",
    cta: "Situation beschreiben",
  },
  uk: {
    relatedArticles: "Пов'язані статті",
    relatedTerms: "Пов'язані терміни",
    services: "Відповідні послуги",
    pricing: "Дивитися ціни",
    help: "Потрібна допомога?",
    cta: "Описати ситуацію",
  },
};

function ctaLabelsFor(lang: string): RatgeberCtaLabels {
  return CTA_LABELS[lang] ?? CTA_LABELS.de!;
}

function buildContextualCta(
  articleType: string | undefined,
  lang: string,
  lbl: ReturnType<typeof labelsFor>,
  ctx: BakeCtx,
  entry: VirtualRouteEntry,
  axisId: string | undefined,
  categoryId: string | undefined,
): Block[] {
  const dl = ctx.defaultLang;
  const ctaLbl = ctaLabelsFor(lang);

  if (!articleType || !axisId) {
    return [ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }])];
  }

  const href = (slug: string): string =>
    `/${lang === dl ? "" : `${lang}/`}ratgeber/${slug}/`.replace(/\/+/g, "/");

  switch (articleType) {
    case "grundlagenartikel":
    case "methodik": {
      // "Verwandte Artikel" — linked card grid of related articles in the same category
      if (!categoryId) {
        return [ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }])];
      }
      const siblings = ctx.entries
        .filter((other) => {
          if (other.depth !== entry.depth || !other.indexable || other.pageId === entry.pageId)
            return false;
          const siblingSlug = other.axes[axisId];
          if (!siblingSlug) return false;
          const siblingData = valData(ctx, axisId, siblingSlug, lang);
          return (
            typeof siblingData?.categoryId === "string" && siblingData.categoryId === categoryId
          );
        })
        .slice(0, 6);

      if (siblings.length === 0) {
        return [ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }])];
      }
      return [
        linkedCardGrid(
          ctaLbl.relatedArticles,
          siblings.map((s) => {
            const sData = valData(ctx, axisId, s.axes[axisId], lang);
            const sTitle =
              (typeof sData?.title === "string" && sData.title) ||
              (typeof sData?.name === "string" && sData.name) ||
              (s.axes[axisId] ?? "Artikel");
            const sSummary = typeof sData?.summary === "string" ? sData.summary : undefined;
            return {
              title: sTitle,
              ...(sSummary ? { description: sSummary } : {}),
              href: href(s.axes[axisId]!),
            };
          }),
        ),
      ];
    }

    case "entscheidungshilfe": {
      // "Passende Leistungen" — link to service pages
      return [
        ctaBlock(ctaLbl.services, [
          { label: ctaLbl.services, pageId: "leistungen", variant: "primary" },
        ]),
      ];
    }

    case "checkliste": {
      // "Brauchen Sie Hilfe?" — contact CTA
      return [ctaBlock(ctaLbl.help, [{ label: lbl.cta, pageId: "contact", variant: "primary" }])];
    }

    case "vergleich":
    case "rechenmodell": {
      // "Preise ansehen" — link to pricing page
      return [
        ctaBlock(ctaLbl.pricing, [{ label: ctaLbl.pricing, pageId: "preise", variant: "primary" }]),
      ];
    }

    case "begriffserklaerung": {
      // "Verwandte Begriffe" — linked card grid of related glossary articles (same type)
      const glossarySiblings = ctx.entries
        .filter((other) => {
          if (other.depth !== entry.depth || !other.indexable || other.pageId === entry.pageId)
            return false;
          const siblingSlug = other.axes[axisId];
          if (!siblingSlug) return false;
          const siblingData = valData(ctx, axisId, siblingSlug, lang);
          return siblingData?.articleType === "begriffserklaerung";
        })
        .slice(0, 6);

      if (glossarySiblings.length === 0) {
        return [ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }])];
      }
      return [
        linkedCardGrid(
          ctaLbl.relatedTerms,
          glossarySiblings.map((s) => {
            const sData = valData(ctx, axisId, s.axes[axisId], lang);
            const sTitle =
              (typeof sData?.title === "string" && sData.title) ||
              (typeof sData?.name === "string" && sData.name) ||
              (s.axes[axisId] ?? "Begriff");
            const sSummary = typeof sData?.summary === "string" ? sData.summary : undefined;
            return {
              title: sTitle,
              ...(sSummary ? { description: sSummary } : {}),
              href: href(s.axes[axisId]!),
            };
          }),
        ),
      ];
    }

    default:
      return [ctaBlock(lbl.closing, [{ label: lbl.cta, pageId: "contact", variant: "primary" }])];
  }
}

const PROVENANCE_LABELS: Record<
  string,
  { redaktion: string; reviewDate: string; quellen: string }
> = {
  de: { redaktion: "Redaktion", reviewDate: "Geprüft am", quellen: "Quellen" },
  uk: { redaktion: "Редакція", reviewDate: "Перевірено", quellen: "Джерела" },
};

function provenanceLabelsFor(lang: string) {
  return PROVENANCE_LABELS[lang] ?? PROVENANCE_LABELS.de!;
}

function buildProvenanceFooter(
  data: Record<string, unknown> | undefined,
  lang: string,
  ctx: BakeCtx,
): Block | null {
  const lbl = provenanceLabelsFor(lang);
  const lines: string[] = [];

  // Author info
  const authorId = typeof data?.authorId === "string" ? data.authorId : undefined;
  if (authorId) {
    const authorData = ctx.supplementaryCollections?.get("authors")?.get(lang)?.get(authorId);
    if (authorData) {
      const name = typeof authorData.name === "string" ? authorData.name : authorId;
      const role = typeof authorData.role === "string" ? authorData.role : "";
      lines.push(`**${lbl.redaktion}:** ${name}${role ? ` — ${role}` : ""}`);
    }
  }

  // Review date
  const reviewedAt = typeof data?.reviewedAt === "string" ? data.reviewedAt : undefined;
  if (reviewedAt) {
    lines.push(`**${lbl.reviewDate}:** ${reviewedAt}`);
  }

  // Source list
  const sourcesRaw = Array.isArray(data?.sources) ? data.sources : [];
  const sourceIds: string[] = sourcesRaw
    .filter(
      (s: unknown) =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as Record<string, unknown>).sourceId === "string",
    )
    .map((s: unknown) => (s as Record<string, unknown>).sourceId as string);

  if (sourceIds.length > 0) {
    lines.push(`**${lbl.quellen}:**`);
    for (const sid of sourceIds) {
      lines.push(`- ${sid}`);
    }
  }

  if (lines.length === 0) return null;

  return {
    type: "markdown",
    props: { content: lines.join("\n\n"), hideSectionNumber: true },
  };
}
