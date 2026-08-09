/*
<MODULE_CONTRACT>
<purpose>RFC-0208: block text extractor implementations for all known block types. Registers extractors into the global BLOCK_EXTRACTORS registry.</purpose>
<non-goals>
  <item>Do not handle block types that contain no text-bearing props.</item>
  <item>Do not resolve content references — extraction is shallow and deterministic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0208: registered extractors for warpgogol-com block types.</item>
  <item>RFC-0372: added video-section, donation-card, credits, passport no-op extractors; people extractor now extracts heading; all extractors return heading (possibly empty) for unified SemanticBlock.</item>
</CHANGE_SUMMARY>
*/

import { BLOCK_EXTRACTORS } from "../block-extraction.ts";

function safeGet(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function safeArray<T>(v: unknown, mapper: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const result = v.map(mapper).filter((x): x is T => x !== undefined);
  return result.length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// hero-decision-card
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "hero-decision-card",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const lead =
      safeString(safeGet(props, "header.subheading")) ?? safeString(safeGet(props, "tagline"));
    const items = safeArray(safeGet(props, "decisionCard.items"), (item) => {
      const label = safeString(safeGet(item, "label"));
      const value = safeString(safeGet(item, "value"));
      if (!label) return undefined;
      return { title: `${label}: ${value ?? ""}` };
    });
    const ctaItems: Array<{ title: string; description?: string }> = [];
    const primaryLabel = safeString(safeGet(props, "primaryCta.label"));
    const secondaryLabel = safeString(safeGet(props, "secondaryCta.label"));
    if (primaryLabel) ctaItems.push({ title: `CTA: ${primaryLabel}` });
    if (secondaryLabel) ctaItems.push({ title: `CTA: ${secondaryLabel}` });
    return { heading, lead, items: items?.length ? [...items, ...ctaItems] : ctaItems };
  },
});

// ---------------------------------------------------------------------------
// audience-cards (guarantees, included-features, price-economics, growth-modules, referral-club, growth-timeline, etc.)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "audience-cards",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const lead = safeString(safeGet(props, "header.subheading"));
    const cards = safeArray(safeGet(props, "body.cards"), (card) => {
      const title = safeString(safeGet(card, "title"));
      const description = safeString(safeGet(card, "description"));
      if (!title) return undefined;
      return { title, description };
    });
    return { heading, lead, items: cards };
  },
});

// ---------------------------------------------------------------------------
// comparison-cards
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "comparison-cards",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const _labels = safeGet(props, "labels") as Record<string, string> | undefined;
    const rows = safeArray(safeGet(props, "rows"), (row) => {
      const left = safeString(safeGet(row, "left"));
      const right = safeString(safeGet(row, "right"));
      if (!left || !right) return undefined;
      return { title: `${left} → ${right}` };
    });
    return { heading, items: rows };
  },
});

// ---------------------------------------------------------------------------
// price-card
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "price-card",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const monthly = safeString(safeGet(props, "monthly"));
    const yearly = safeString(safeGet(props, "yearly"));
    const setup = safeString(safeGet(props, "setup"));
    const includes = safeArray(safeGet(props, "includes"), (item) => {
      const text = safeString(safeGet(item, "text"));
      if (!text) return undefined;
      return { title: text };
    });
    const priceItems: Array<{ title: string; description?: string }> = [];
    if (monthly) priceItems.push({ title: `Monatlich: ${monthly}` });
    if (yearly) priceItems.push({ title: `Jährlich: ${yearly}` });
    if (setup) priceItems.push({ title: `Einrichtung: ${setup}` });
    return { heading, items: includes?.length ? [...priceItems, ...includes] : priceItems };
  },
});

// ---------------------------------------------------------------------------
// ownership-block
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "ownership-block",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const items = safeArray(safeGet(props, "body.items"), (item) => {
      const text = safeString(safeGet(item, "text"));
      if (!text) return undefined;
      return { title: text };
    });
    return { heading, items };
  },
});

// ---------------------------------------------------------------------------
// controlled-responsibility-block
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "controlled-responsibility-block",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const lead = safeString(safeGet(props, "header.subheading"));
    const primaryLabel = safeString(safeGet(props, "labels.primary"));
    const secondaryLabel = safeString(safeGet(props, "labels.secondary"));
    const primaryItems = safeArray(safeGet(props, "primaryItems"), (item) => {
      const text = safeString(safeGet(item, "text"));
      if (!text) return undefined;
      return { title: `${primaryLabel ?? ""}: ${text}`.replace(/^:\s*/, "") };
    });
    const secondaryItems = safeArray(safeGet(props, "secondaryItems"), (item) => {
      const text = safeString(safeGet(item, "text"));
      if (!text) return undefined;
      return { title: `${secondaryLabel ?? ""}: ${text}`.replace(/^:\s*/, "") };
    });
    return { heading, lead, items: [...(primaryItems ?? []), ...(secondaryItems ?? [])] };
  },
});

// ---------------------------------------------------------------------------
// notausgang-block
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "notausgang-block",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const items = safeArray(safeGet(props, "body.items"), (item) => {
      const text = safeString(safeGet(item, "text"));
      if (!text) return undefined;
      return { title: text };
    });
    return { heading, items };
  },
});

// ---------------------------------------------------------------------------
// faq-list — extracts heading only; FAQ entries come from business/faq via reader
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "faq-list",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    return { heading };
  },
});

// ---------------------------------------------------------------------------
// final-cta
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "final-cta",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const paragraphs = safeArray(safeGet(props, "body.paragraphs"), (p) => {
      const text = safeString(p);
      if (!text) return undefined;
      return { title: text };
    });
    const ctaItems = safeArray(safeGet(props, "ctaGroup.items"), (item) => {
      const label = safeString(safeGet(item, "label"));
      if (!label) return undefined;
      return { title: `CTA: ${label}` };
    });
    const allItems = [...(paragraphs ?? []), ...(ctaItems ?? [])];
    return { heading, items: allItems.length > 0 ? allItems : undefined };
  },
});

// ---------------------------------------------------------------------------
// trust-strip
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "trust-strip",
  extract(props) {
    const items = safeArray(safeGet(props, "body.items"), (item) => {
      const text = safeString(safeGet(item, "text"));
      if (!text) return undefined;
      return { title: text };
    });
    return { items };
  },
});

// ---------------------------------------------------------------------------
// send-message
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "send-message",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const paragraphs = safeArray(safeGet(props, "body.paragraphs"), (p) => {
      const text = safeString(p);
      if (!text) return undefined;
      return { title: text };
    });
    return { heading, items: paragraphs };
  },
});

// ---------------------------------------------------------------------------
// chat-widget
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "chat-widget",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    return { heading };
  },
});

// ---------------------------------------------------------------------------
// markdown (RFC-0325: Programmatic Surface Q&A/prose sections baked as repeated
// `type: "markdown"` blocks — e.g. the Ratgeber FAQ items). The first markdown
// block on a page is separately consumed for the page's prose `contentRef`
// body (build-page.ts `extractMarkdownProps`); this extractor additionally
// surfaces EVERY markdown block's heading/lead as a content block so repeated
// Q&A-style sections are not silently dropped from Markdown twins.
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "markdown",
  extract(props) {
    const heading = safeString(safeGet(props, "heading"));
    const lead = safeString(safeGet(props, "lead"));
    return { heading, lead };
  },
});

// ---------------------------------------------------------------------------
// hero (nicaragua-projekt home page)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "hero",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const lead =
      safeString(safeGet(props, "header.subheading")) ?? safeString(safeGet(props, "tagline"));
    const description = safeString(safeGet(props, "description"));
    const stats = safeArray(safeGet(props, "stats"), (s) => {
      const value = safeString(safeGet(s, "value"));
      const label = safeString(safeGet(s, "label"));
      if (!value || !label) return undefined;
      return { title: `${value} ${label}` };
    });
    const ctaItems: Array<{ title: string }> = [];
    const primary = safeString(safeGet(props, "ctaPrimaryLabel"));
    const secondary = safeString(safeGet(props, "ctaSecondaryLabel"));
    if (primary) ctaItems.push({ title: `CTA: ${primary}` });
    if (secondary) ctaItems.push({ title: `CTA: ${secondary}` });
    const allItems = [...(stats ?? []), ...ctaItems];
    return {
      heading,
      lead: lead ?? description,
      items: allItems.length > 0 ? allItems : undefined,
    };
  },
});

// ---------------------------------------------------------------------------
// problem (nicaragua-projekt)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "problem",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const paragraphs = safeArray(safeGet(props, "body.paragraphs"), (p) => {
      const text = safeString(p);
      if (!text) return undefined;
      return { title: text };
    });
    return { heading, items: paragraphs };
  },
});

// ---------------------------------------------------------------------------
// approach (nicaragua-projekt)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "approach",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const cards = safeArray(safeGet(props, "body.cards"), (card) => {
      const title = safeString(safeGet(card, "title"));
      const description = safeString(safeGet(card, "description"));
      if (!title) return undefined;
      return { title, description };
    });
    return { heading, items: cards };
  },
});

// ---------------------------------------------------------------------------
// impact (nicaragua-projekt)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "impact",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const stats = safeArray(safeGet(props, "body.stats"), (s) => {
      const value = safeString(safeGet(s, "value"));
      const label = safeString(safeGet(s, "label"));
      if (!value || !label) return undefined;
      return { title: `${value} ${label}` };
    });
    return { heading, items: stats };
  },
});

// ---------------------------------------------------------------------------
// social-proof (nicaragua-projekt)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "social-proof",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const paragraphs = safeArray(safeGet(props, "body.paragraphs"), (p) => {
      const text = safeString(p);
      if (!text) return undefined;
      return { title: text };
    });
    const note = safeString(safeGet(props, "registrationNote"));
    const items = [...(paragraphs ?? [])];
    if (note) items.push({ title: note });
    return { heading, items: items.length > 0 ? items : undefined };
  },
});

// ---------------------------------------------------------------------------
// donation-use (nicaragua-projekt)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "donation-use",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const cards = safeArray(safeGet(props, "body.cards"), (card) => {
      const number = safeString(safeGet(card, "number"));
      const title = safeString(safeGet(card, "title"));
      if (!title) return undefined;
      return { title: number ? `${number}. ${title}` : title };
    });
    return { heading, items: cards };
  },
});

// ---------------------------------------------------------------------------
// women (nicaragua-projekt)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "women",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const paragraphs = safeArray(safeGet(props, "body.paragraphs"), (p) => {
      const text = safeString(p);
      if (!text) return undefined;
      return { title: text };
    });
    return { heading, items: paragraphs };
  },
});

// ---------------------------------------------------------------------------
// transparency (nicaragua-projekt)
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "transparency",
  extract(props) {
    const rawHeading = safeGet(props, "header.heading");
    let heading: string | undefined;
    if (Array.isArray(rawHeading)) {
      heading = rawHeading
        .map((h: unknown) => {
          if (h && typeof h === "object") {
            const text = (h as Record<string, unknown>)["text"];
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .filter(Boolean)
        .join(" ");
    } else {
      heading = safeString(rawHeading);
    }
    const note = safeString(safeGet(props, "body.note"));
    const items = safeArray(safeGet(props, "body.items"), (item) => {
      const text = safeString(safeGet(item, "text"));
      if (!text) return undefined;
      return { title: text };
    });
    const reportLink = safeString(safeGet(props, "reportLinkLabel"));
    const allItems = [...(items ?? [])];
    if (note) allItems.unshift({ title: note });
    if (reportLink) allItems.push({ title: reportLink });
    return { heading: heading || undefined, items: allItems.length > 0 ? allItems : undefined };
  },
});

// ---------------------------------------------------------------------------
// people (nicaragua-projekt, warpgogol-com) — extracts heading from header;
// people content itself is sourced from business/people enrichment, not block props.
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "people",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    return { heading };
  },
});

// ---------------------------------------------------------------------------
// video-section (warpgogol-com) — extracts heading and lead from header.
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "video-section",
  extract(props) {
    const heading = safeString(safeGet(props, "header.heading"));
    const lead = safeString(safeGet(props, "header.subheading"));
    return { heading, lead };
  },
});

// ---------------------------------------------------------------------------
// donation-card (nicaragua-projekt) — extracts heading from labels.title.
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "donation-card",
  extract(props) {
    const heading = safeString(safeGet(props, "labels.title"));
    return { heading };
  },
});

// ---------------------------------------------------------------------------
// credits (nicaragua-projekt, warpgogol-com) — extracts heading and lead.
// ---------------------------------------------------------------------------
BLOCK_EXTRACTORS.register<Record<string, unknown>>({
  blockType: "credits",
  extract(props) {
    const heading = safeString(safeGet(props, "heading"));
    const lead = safeString(safeGet(props, "lead"));
    return { heading, lead };
  },
});

// ---------------------------------------------------------------------------
// RFC-0372: Passport-reserved moon no-op extractors. These block types render
// visual components (passport-header, pulsar, passport-score-grid,
// passport-provenance, passport-star-map) with no text content to project into
// the semantic layer. They must be registered so page.blocks.extract.validate
// does not fail, but they return empty headings.
// ---------------------------------------------------------------------------
const PASSPORT_NOOP_TYPES = [
  "passport-header",
  "pulsar",
  "passport-score-grid",
  "passport-provenance",
  "passport-star-map",
] as const;

for (const blockType of PASSPORT_NOOP_TYPES) {
  BLOCK_EXTRACTORS.register<Record<string, unknown>>({
    blockType,
    extract() {
      return { heading: "" };
    },
  });
}
