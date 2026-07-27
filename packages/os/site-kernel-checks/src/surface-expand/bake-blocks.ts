/*
<MODULE_CONTRACT>
<purpose>Block builder functions for the surface page baker — hero, card grids, CTA, markdown.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted block builders from bake.ts into bake-blocks.ts.</item>
  <item>RFC-0504: add articleHeader, toc, changelog block builders for 12-section ratgeber layout.</item>
</CHANGE_SUMMARY>
*/

export type Block = { type: string; props: Record<string, unknown> };

/** A markdown prose block (heading + lead). */
export function md(heading: string, lead: string): Block {
  return { type: "markdown", props: { heading, lead, hideSectionNumber: false } };
}

/**
 * A hero (Europa): H1 + optional tagline + optional lead description + an optional lead image +
 * a primary (and optional secondary) internal CTA. RFC-0207: tagline and description are distinct
 * slots — the baker never feeds the same string to both — and `leadImage` (RFC-0167) carries the
 * page's content illustration (city skyline / industry photo).
 */
export function hero(opts: {
  heading: string;
  tagline?: string;
  description?: string;
  leadImage?: { src: string; alt: string };
  primaryLabel: string;
  primaryTarget: string;
  secondaryLabel?: string;
  secondaryTarget?: string;
}): Block {
  return {
    type: "hero",
    props: {
      header: { heading: opts.heading, level: 1 },
      hideSectionNumber: true,
      ...(opts.tagline ? { tagline: opts.tagline } : {}),
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.leadImage ? { leadImage: opts.leadImage, leadImagePlacement: "after-heading" } : {}),
      ctaPrimaryLabel: opts.primaryLabel,
      primaryCtaTarget: opts.primaryTarget,
      ...(opts.secondaryLabel && opts.secondaryTarget
        ? { ctaSecondaryLabel: opts.secondaryLabel, secondaryCtaTarget: opts.secondaryTarget }
        : {}),
    },
  };
}

/** An audience-cards card grid (Epimetheus): a numbered card per {title, description?}. */
export function cardGrid(
  heading: string,
  cards: Array<{ title: string; description?: string }>,
): Block {
  return {
    type: "audience-cards",
    props: {
      header: { heading },
      body: {
        kind: "cards",
        // The audience-cards archetype pins `columns` to 2|3|4 — a single-card grid (e.g. one
        // "related page" teaser) still renders at the 2-column floor rather than an invalid 1.
        columns: cards.length >= 3 ? 3 : 2,
        cards: cards.map((c, i) => ({
          number: `0${i + 1}`,
          title: c.title,
          ...(c.description ? { description: c.description } : {}),
        })),
      },
    },
  };
}

/**
 * RFC-0207: render a plain string[] (decisionFactors, painPoints, proofSignals, …) as a numbered
 * card grid. Each phrase becomes the card title; the number provides the visual anchor.
 */
export function listCards(heading: string, items: string[]): Block {
  return cardGrid(
    heading,
    items.map((item) => ({ title: item })),
  );
}

/**
 * An audience-cards grid of LINKED teaser cards (title + description + href, with an optional image)
 * — internal linking. RFC-0207: teaser cards carry the target's image (city skyline / industry
 * photo), mirroring the fat site's imaged "nearby cities" / "other industries" sections.
 */
export function linkedCardGrid(
  heading: string,
  cards: Array<{
    title: string;
    description?: string;
    href: string;
    image?: string;
    imageAlt?: string;
    articleType?: string;
    question?: string;
    reviewedAt?: string;
    readTime?: string;
  }>,
  anchorId?: string,
): Block {
  return {
    type: "audience-cards",
    props: {
      header: { heading },
      ...(anchorId ? { anchorId } : {}),
      body: {
        kind: "cards",
        // See cardGrid(): the archetype pins `columns` to 2|3|4, so a single linked teaser
        // still renders at the 2-column floor rather than an invalid 1.
        columns: cards.length >= 3 ? 3 : 2,
        cards: cards.map((c) => ({
          title: c.title,
          ...(c.description ? { description: c.description } : {}),
          ...(c.image ? { image: c.image, imageAlt: c.imageAlt ?? "" } : {}),
          href: c.href,
          ...(c.articleType ? { articleType: c.articleType } : {}),
          ...(c.question ? { question: c.question } : {}),
          ...(c.reviewedAt ? { reviewedAt: c.reviewedAt } : {}),
          ...(c.readTime ? { readTime: c.readTime } : {}),
        })),
      },
    },
  };
}

/** A final-cta (Dione) rendering internal links as a button group — used for the closing CTA. */
export function ctaBlock(
  heading: string,
  items: Array<{ label: string; pageId: string; variant?: "primary" | "secondary" }>,
): Block {
  return {
    type: "final-cta",
    props: {
      header: { heading },
      ctaGroup: {
        align: "center",
        items: items.map((it) => ({
          label: it.label,
          variant: it.variant ?? "secondary",
          target: { kind: "internal", pageId: it.pageId },
        })),
      },
    },
  };
}

/**
 * RFC-0504: An article-header (Himalia) — metadata-rich header for ratgeber articles.
 * Carries category, title (H1), summary, articleType, author name, reviewedAt, readTime.
 */
export function articleHeader(opts: {
  category?: string;
  title: string;
  summary?: string;
  articleType?: string;
  authorName?: string;
  reviewedAt?: string;
  readTime?: string;
}): Block {
  return {
    type: "article-header",
    props: {
      header: { heading: opts.title, level: 1 },
      hideSectionNumber: true,
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.summary ? { summary: opts.summary } : {}),
      ...(opts.articleType ? { articleType: opts.articleType } : {}),
      ...(opts.authorName ? { authorName: opts.authorName } : {}),
      ...(opts.reviewedAt ? { reviewedAt: opts.reviewedAt } : {}),
      ...(opts.readTime ? { readTime: opts.readTime } : {}),
    },
  };
}

/**
 * RFC-0504: A TOC (Metis) — auto-generated table of contents from H2 headings.
 * The entries are computed at bake time from the prose body.
 */
export function tocBlock(entries: Array<{ text: string; anchor: string }>): Block {
  return {
    type: "toc",
    props: {
      hideSectionNumber: true,
      entries,
    },
  };
}

/**
 * RFC-0504: A changelog (Prometheus) — editorial history entries from frontmatter.
 */
export function changelogBlock(
  entries: Array<{ date: string; summary: string; authorId: string }>,
): Block {
  return {
    type: "changelog",
    props: {
      hideSectionNumber: true,
      entries,
    },
  };
}
