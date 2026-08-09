/*
<MODULE_CONTRACT>
<purpose>Generic semantic builder for markdown-based pages (impressum, datenschutz, agb, widerruf, open-source, etc.). Replaces 7 copy-paste page builders.</purpose>
<non-goals>
  <item>Do not handle home page or other specialized page types.</item>
  <item>Do not contain app-specific extractor logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Consolidated 7 copy-paste page builders (impressum, datenschutz, agb, widerruf, open-source, projekte, wir-ueber-uns) into one generic function.</item>
  <item>Introduced app-agnostic markdown-page semantic builder and breadcrumb normalization.</item>
  <item>Unified blocksToMarkdown signature — eliminated duplication.</item>
  <item>RFC-0372: MarkdownPageInput now accepts blocks: SemanticBlock[] directly; removed bodyText/contentBlocks/answerBlocks from input and output.</item>
</CHANGE_SUMMARY>
*/

import { getBaseUrl, toAbsoluteUrl, toCanonicalUrl } from "../ids.ts";
import type {
  SemanticBlock,
  SemanticBreadcrumb,
  SemanticPageModel,
  SemanticPageType,
} from "../models.ts";

export interface MarkdownPageInput {
  type: SemanticPageType;
  lang: string;
  url: URL | string;
  title: string;
  description: string;
  /** RFC-0377: optional audience override for the page. */
  audience?: string;
  heading: string;
  lead?: string;
  /** RFC-0372: unified block array — replaces bodyText/contentBlocks/answerBlocks. */
  blocks: SemanticBlock[];
  breadcrumbsContent?: { homeLabel: string };
  /**
   * RFC-0229: the canonical breadcrumb trail (Home → live ancestors → self), supplied by the
   * render pipeline so the JSON-LD BreadcrumbList matches the visible section exactly. When omitted
   * the builder falls back to a flat Home → self trail (used by source paths with no ancestor
   * resolver, e.g. the disk-side llms model).
   */
  breadcrumbs?: SemanticBreadcrumb[];
  people?: Array<{ name: string; role?: string; description?: string; isDeceased?: boolean }>;
  initiatives?: Array<{ id: string; name: string; summary: string; facts?: string[] }>;
  faqEntries?: Array<{
    id: string;
    question: string;
    answer: string;
    tags?: string[];
    serviceSlug?: string;
  }>;
}

export function buildMarkdownPageSemantic(input: MarkdownPageInput): SemanticPageModel {
  return {
    type: input.type,
    lang: input.lang,
    url: toCanonicalUrl(input.url),
    title: input.title,
    description: input.description,
    ...(input.audience ? { audience: input.audience } : {}),
    heading: input.heading,
    lead: input.lead,
    // RFC-0229: prefer the canonical trail from the render pipeline; otherwise build the flat
    // Home → self fallback (preserves behavior for source paths with no ancestor resolver).
    breadcrumbs:
      input.breadcrumbs && input.breadcrumbs.length > 0
        ? input.breadcrumbs
        : [
            {
              name: input.breadcrumbsContent?.homeLabel ?? "Home",
              url: toAbsoluteUrl(getBaseUrl(input.url), `/${input.lang}/`),
            },
            { name: input.heading, url: toCanonicalUrl(input.url) },
          ],
    blocks: input.blocks,
    organization: {} as SemanticPageModel["organization"],
    people: input.people,
    initiatives: input.initiatives,
    faqEntries: input.faqEntries?.length ? input.faqEntries : undefined,
  };
}
