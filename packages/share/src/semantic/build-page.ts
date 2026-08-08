/*
<MODULE_CONTRACT>
<purpose>RFC-0144: the single, framework-agnostic per-page semantic builder. Orchestration that was duplicated between the disk loader (@warpgogol/site-kernel-content) and the Astro path (formerly @warpgogol/business, deleted in RFC-0471) lives here once. Where the bytes come from is injected via a small SemanticContentReader seam; the disk path supplies an fs reader, the Astro path an astro:content reader. (A future RFC-0141 node ContentSourceProvider can back both readers — see RFC-0144 staging.)</purpose>
<non-goals>
  <item>Do not read files or import astro:content — all I/O flows through the injected reader.</item>
  <item>Do not assemble the organization profile or iterate system.md pages — callers own that.</item>
  <item>Do not resolve output projection (RFC-0143) — callers attach model.output.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0144: initial extraction of the shared per-page builder from the two duplicated paths.</item>
  <item>RFC-0372: unified all page types through extractContentBlocks + extractPageHeading; removed home-specific branch and extractMarkdownProps; extractContentBlocks returns SemanticBlock[].</item>
</CHANGE_SUMMARY>
*/

import type {
  SemanticBlock,
  SemanticBreadcrumb,
  SemanticFaqEntry,
  SemanticInitiative,
  SemanticOrganization,
  SemanticPageModel,
  SemanticPageType,
  SemanticPerson,
} from "./models.ts";
import { BLOCK_EXTRACTORS } from "./block-extraction.ts";
import "./block-extractors/index.ts";
import {
  buildMarkdownPageSemantic,
  type MarkdownPageInput,
} from "./page-builders/markdown-page.ts";
import { extractAnswerBlocksFromMarkdown, toSemanticAnswerBlocks } from "./page-utils.ts";
import type { DerivedPriceEntry } from "./price-marker-resolver.ts";
import { resolvePriceMarkersForSemantic } from "./price-marker-resolver.ts";

/** The organization profile + enrichment pools the builder draws from. */
export interface SemanticBuildProfile {
  organization: SemanticOrganization;
  people: SemanticPerson[];
  initiatives: SemanticInitiative[];
}

/**
 * The injected content-read seam. Each implementation keeps its source's
 * behavior (the fs reader substitutes content references per RFC-0045; the
 * astro:content reader returns raw body). Returning `null` frontmatter means
 * the page does not exist for the language and is skipped by the caller.
 */
export interface SemanticContentReader {
  getPageFrontmatter(pageId: string, lang: string): Promise<Record<string, unknown> | null>;
  getProseBody(proseSlug: string, lang: string): Promise<string>;
  getHomeLabel(lang: string): Promise<string>;
  getFaqEntries(lang: string): Promise<SemanticFaqEntry[]>;
  /**
   * RFC-0767: load derived prices for price marker resolution. Returns null
   * when the derived prices file does not exist (ENOENT). Synchronous because
   * the underlying loader uses readFileSync — the method is on the reader
   * interface to keep build-page.ts I/O-free per its module contract.
   */
  getDerivedPrices(): Record<string, DerivedPriceEntry[]> | null;
}

export interface SemanticPageBuildArgs {
  pageId: string;
  semanticType: SemanticPageType;
  lang: string;
  url: URL | string;
  profile: SemanticBuildProfile;
  /**
   * RFC-0377: optional audience override for the page. If omitted, consumers fall back to the
   * SemanticPageType derivation map (AUDIENCE_BY_PAGE_TYPE).
   */
  audience?: string;
  /**
   * RFC-0195: synthetic frontmatter used when the reader has no content entry for `pageId`
   * (e.g. a Programmatic Surface page baked into the route artifact rather than a pages/*.md file).
   * Shaped like a page entry: `{ title, description, blocks }`.
   */
  fallbackFrontmatter?: Record<string, unknown>;
  /**
   * RFC-0229: the canonical breadcrumb trail (Home → live ancestors → self) resolved by the render
   * pipeline. When supplied it becomes the page's `breadcrumbs` (driving both the JSON-LD
   * BreadcrumbList and the visible section); when omitted the builder falls back to a flat trail.
   */
  breadcrumbs?: SemanticBreadcrumb[];
}

/** semanticType → which enrichment pool to attach. */
const PAGE_ENRICHMENT_MAP: Partial<Record<SemanticPageType, "people" | "initiatives">> = {
  about: "people",
  projects: "initiatives",
};

/** semanticType values whose pages embed the FAQ list. */
const PAGE_INCLUDE_FAQ: ReadonlySet<SemanticPageType> = new Set<SemanticPageType>([
  "donationContact",
]);

/**
 * Resolve the FAQ entries a page should embed (drives the FAQPage JSON-LD node).
 * A page carries FAQ when its semanticType opts in (PAGE_INCLUDE_FAQ), it is the
 * canonical `faq` page, or it declares a visible `faq-list` block. When `faq-list`
 * blocks declare tags, entries are filtered to those tags (RFC-0208). Returns
 * undefined when the page should carry no FAQPage. Shared by the home and
 * markdown builder paths so a `faq-list` block on the home emits FAQPage too.
 */
async function resolveFaqEntries(
  reader: SemanticContentReader,
  lang: string,
  blocks: Array<Record<string, unknown>>,
  pageId: string,
  semanticType: SemanticPageType,
): Promise<SemanticFaqEntry[] | undefined> {
  const faqBlocks = blocks.filter((b) => b["type"] === "faq-list");
  if (!(PAGE_INCLUDE_FAQ.has(semanticType) || pageId === "faq" || faqBlocks.length > 0)) {
    return undefined;
  }
  const faqEntries = await reader.getFaqEntries(lang);
  if (faqEntries.length === 0) return undefined;
  const tags = new Set(
    faqBlocks
      .map((b) => ((b["props"] ?? b) as Record<string, unknown>)["tag"] as string | undefined)
      .filter((t): t is string => typeof t === "string" && t.length > 0),
  );
  if (tags.size > 0) {
    const filtered = faqEntries.filter((e) => e.tags?.some((t) => tags.has(t)));
    return filtered.length > 0 ? filtered : undefined;
  }
  return faqEntries;
}

/** RFC-0372: extract semantic text from declared blocks into SemanticBlock[]. */
function extractContentBlocks(
  blocks: Array<Record<string, unknown>>,
  ctx: { pageId: string; lang: string; siteUrl: string },
): SemanticBlock[] {
  const result: SemanticBlock[] = [];
  for (const block of blocks) {
    const blockType = String(block["type"] ?? "");
    const blockId = String(block["id"] ?? `block-${result.length}`);
    if (!blockType) continue;
    const extractor = BLOCK_EXTRACTORS.get(blockType);
    if (!extractor) continue;
    const props = (block["props"] ?? block) as Record<string, unknown>;
    const extracted = extractor.extract(props, ctx);
    // RFC-0372: always push the block — no-op extractors return heading: "".
    result.push({
      id: blockId,
      blockType,
      heading: extracted.heading ?? "",
      summary: extracted.lead,
      body: extracted.body,
      items: extracted.items,
      extractedAt: new Date().toISOString(),
      extractorVersion: "1.0.0",
    });
  }
  return result;
}

/**
 * RFC-0372: Scan all frontmatter blocks in declaration order for header.heading / header.subheading.
 * Works with any block type that has header props (hero-decision-card, markdown, etc.) — not
 * limited to type: "markdown". Falls back to frontmatter title/description.
 */
function extractPageHeading(
  blocks: Array<Record<string, unknown>>,
  fallbackTitle: string,
  fallbackDescription: string,
): { heading: string; lead?: string } {
  let heading = fallbackTitle;
  let lead: string | undefined;
  for (const block of blocks) {
    const props = (block["props"] ?? block) as Record<string, unknown>;
    const headerHeading =
      props["header"] && typeof props["header"] === "object"
        ? safeString((props["header"] as Record<string, unknown>)["heading"])
        : safeString(props["heading"]);
    const headerSubheading =
      props["header"] && typeof props["header"] === "object"
        ? safeString((props["header"] as Record<string, unknown>)["subheading"])
        : safeString(props["lead"]);
    if (!heading || heading === fallbackTitle) {
      if (headerHeading) heading = headerHeading;
    }
    if (!lead) {
      if (headerSubheading) lead = headerSubheading;
    }
    if (heading !== fallbackTitle && lead) break;
  }
  if (!lead) lead = fallbackDescription || undefined;
  return { heading, ...(lead ? { lead } : {}) };
}

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * RFC-0144/RFC-0372: build a single SemanticPageModel via the injected reader. This is
 * the one place the per-page construction logic lives. All page types (including home)
 * go through the same unified pipeline: extractContentBlocks → extractPageHeading →
 * buildMarkdownPageSemantic with a merged blocks array. `model.organization`
 * and `model.output` (RFC-0143) are attached by the caller.
 */
export async function buildSemanticPageModelWith(
  reader: SemanticContentReader,
  args: SemanticPageBuildArgs,
): Promise<SemanticPageModel | null> {
  const { pageId, semanticType, lang, url, profile } = args;

  const frontmatter = (await reader.getPageFrontmatter(pageId, lang)) ?? args.fallbackFrontmatter;
  if (!frontmatter) return null;

  const title = (frontmatter["title"] as string) ?? "";
  const rawDescription = (frontmatter["description"] as string) ?? "";

  const allBlocks = (frontmatter["blocks"] as Array<Record<string, unknown>> | undefined) ?? [];

  // RFC-0372: Extract block-derived SemanticBlocks from frontmatter.
  const blockDerived = extractContentBlocks(allBlocks, { pageId, lang, siteUrl: url.toString() });

  // RFC-0372: Extract prose from contentRef (if any) and convert to SemanticBlock[].
  // Scan frontmatter blocks for a contentRef in any block's props (typically markdown blocks).
  let proseBlocks: SemanticBlock[] = [];
  for (const block of allBlocks) {
    const props = (block["props"] ?? block) as Record<string, unknown>;
    const contentRef = props["contentRef"] as string | undefined;
    if (contentRef) {
      const proseSlug = contentRef.replace(/^prose\//, "");
      const bodyText = await reader.getProseBody(proseSlug, lang);
      const markdownBlocks = extractAnswerBlocksFromMarkdown(bodyText);
      proseBlocks = toSemanticAnswerBlocks(markdownBlocks);
      break;
    }
  }

  // RFC-0372: Merge block-derived and prose-derived blocks in frontmatter declaration order.
  // For pages with both frontmatter blocks and prose, prose blocks are appended after
  // block-derived blocks (prose contentRef is typically the markdown body following the
  // structured blocks).
  const mergedBlocks = [...blockDerived, ...proseBlocks];

  // RFC-0372: Extract page heading from frontmatter block props (any block type with
  // header.heading), falling back to title/description.
  const { heading, lead } = extractPageHeading(allBlocks, title, rawDescription);

  // RFC-0767: resolve {price:offering:chargeRef} markers to source-currency (EUR)
  // strings for JSON-LD and meta tags. Markers in heading, lead, and description
  // are resolved before entering the SemanticPageModel.
  const derivedPrices = reader.getDerivedPrices();
  const resolvedHeading = resolvePriceMarkersForSemantic(heading, lang, derivedPrices);
  const resolvedLead = lead ? resolvePriceMarkersForSemantic(lead, lang, derivedPrices) : undefined;
  const resolvedDescription = resolvePriceMarkersForSemantic(rawDescription, lang, derivedPrices);

  const baseInput = { lang, url, title, description: resolvedDescription };

  const homeLabel = await reader.getHomeLabel(lang);
  const enrichmentKey = PAGE_ENRICHMENT_MAP[semanticType];

  const input: MarkdownPageInput = {
    type: semanticType,
    ...baseInput,
    ...(args.audience ? { audience: args.audience } : {}),
    heading: resolvedHeading,
    ...(resolvedLead ? { lead: resolvedLead } : {}),
    blocks: mergedBlocks,
    breadcrumbsContent: { homeLabel },
    ...(args.breadcrumbs && args.breadcrumbs.length > 0 ? { breadcrumbs: args.breadcrumbs } : {}),
    ...(enrichmentKey === "people" ? { people: profile.people } : {}),
    ...(enrichmentKey === "initiatives" ? { initiatives: profile.initiatives } : {}),
    // RFC-0200: a person profile page attaches just the profiled person (matched by
    // name) so a Person JSON-LD node emits as the page's subject.
    ...(semanticType === "person"
      ? { people: profile.people.filter((p) => p.name === title) }
      : {}),
  };

  const faqEntries = await resolveFaqEntries(reader, lang, allBlocks, pageId, semanticType);
  if (faqEntries) {
    input.faqEntries = faqEntries;
  }

  return buildMarkdownPageSemantic(input);
}
