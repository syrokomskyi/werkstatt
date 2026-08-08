/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0026/RFC-0041/RFC-0045/RFC-0766] Prose rendering pipeline — orchestrates the
  decision tree for rendering prose content: reference substitution → micromark,
  image-bearing → micromark + image resolution, or Astro render() for plain prose.
  Also handles inline-number animation wrapping and price marker resolution.
  Returns either an HTML string (for set:html) or an Astro Component (for <Component />).
</purpose>
<non-goals>
  <item>Do not own section layout, SectionShell, or language columns — caller handles those.</item>
  <item>Do not own image attribute manipulation — delegated to prose-image-resolver.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from markdown-section.astro to create a testable internal seam for prose rendering orchestration.</item>
  <item>RFC-0766: Added hasPriceMarkers detection, resolvePriceMarkersInHtml post-processing, and integration into all HTML-returning paths.</item>
</CHANGE_SUMMARY>
*/

import { render } from "astro:content";
import type { MaterialCreditLabels } from "@warpgogol/share";
import {
  getProseContentEntry,
  wrapInlineNumbers,
  type AttributionSiteDefault,
} from "@warpgogol/share";
import {
  getContentRefIndex,
  resolveReferencesInString,
  EMPTY_CONTENT_REF_INDEX,
} from "@warpgogol/share/content-reference";
import GithubSlugger from "github-slugger";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { resolveProseImages, markdownHasImages } from "./prose-image-resolver.ts";
import { renderPriceDisplayHtml, renderAmountDisplayHtml } from "../../utils/price-marker.ts";
import { loadDerivedPrices } from "../price-card/price-variants.ts";
import {
  PRICE_MARKER_RE as PRICE_MARKER_GLOBAL_RE,
  AMOUNT_MARKER_RE as AMOUNT_MARKER_GLOBAL_RE,
} from "@warpgogol/share/semantic";

/**
 * Render markdown to HTML with GFM support (tables, strikethrough, task lists,
 * autolinks). Used on the reference-substitution and number-animation paths so
 * any markdown document renders the same GFM features as Astro's render() path.
 */
function injectHeadingIds(html: string): string {
  const slugger = new GithubSlugger();
  return html.replace(/<h([1-6])>(.*?)<\/h\1>/gs, (_match, level, content) => {
    const text = content.replace(/<[^>]+>/g, "");
    const id = slugger.slug(text);
    return `<h${level} id="${id}">${content}</h${level}>`;
  });
}

function addTableTabindex(html: string): string {
  return html.replace(/<table>/g, '<table tabindex="0">');
}

function renderMarkdownGfm(text: string, allowDangerousHtml: boolean): string {
  const html = micromark(text, {
    allowDangerousHtml,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
  return addTableTabindex(injectHeadingIds(html));
}

export interface ProsePipelineOptions {
  lang: string;
  defaultLanguageCode: string;
  contentRef?: string;
  body?: string;
  animateNumbers?: boolean;
  animateYears?: boolean;
  numberDuration?: number;
  materialCreditLabels: MaterialCreditLabels;
  creditsSiteDefault: AttributionSiteDefault;
}

const PRICE_MARKER_RE = new RegExp(PRICE_MARKER_GLOBAL_RE.source);
const AMOUNT_MARKER_RE = new RegExp(AMOUNT_MARKER_GLOBAL_RE.source);
const CODE_PRE_SPLIT_RE = /(<code[^>]*>[\s\S]*?<\/code>|<pre[^>]*>[\s\S]*?<\/pre>)/g;

function hasPriceMarkers(text: string): boolean {
  return PRICE_MARKER_RE.test(text) || AMOUNT_MARKER_RE.test(text);
}

function resolvePriceMarkersInHtml(
  html: string,
  lang: string,
  derivedPrices: ReturnType<typeof loadDerivedPrices>,
): string {
  const segments = html.split(CODE_PRE_SPLIT_RE);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      let resolved = segment.replace(PRICE_MARKER_GLOBAL_RE, (_match, offeringId, chargeRef) =>
        renderPriceDisplayHtml(offeringId, chargeRef, lang, derivedPrices),
      );
      resolved = resolved.replace(AMOUNT_MARKER_GLOBAL_RE, (_match, amountEur) =>
        renderAmountDisplayHtml(amountEur, lang, derivedPrices),
      );
      return resolved;
    })
    .join("");
}

export type ProseRenderResult =
  | { kind: "html"; html: string }
  | { kind: "component"; Component: Record<string, unknown> }
  | { kind: "slot" };

/**
 * Load and render prose content from the prose domain, following the rendering
 * decision tree:
 *
 * 1. If the body contains content references → substitute + micromark + image resolution.
 * 2. If the body contains images → micromark + image resolution.
 * 3. Otherwise → Astro render() for full feature support (footnotes, etc.).
 * 4. If animateNumbers is true → wrap inline numbers (uses rendered.html or micromark fallback).
 *
 * Returns { kind: "html", html } for set:html, { kind: "component", Component }
 * for <Component />, or { kind: "slot" } when no prose entry is loaded.
 */
export async function renderProse(opts: ProsePipelineOptions): Promise<ProseRenderResult> {
  const {
    lang,
    defaultLanguageCode,
    contentRef,
    body,
    animateNumbers = false,
    animateYears = true,
    numberDuration = 3.0,
    materialCreditLabels,
    creditsSiteDefault,
  } = opts;

  // Inline body rendering: when no contentRef but a body string is provided,
  // render it through micromark with GFM + image resolution. References in the
  // body are resolved by substituteBlockPropReferences before reaching here, but
  // we run resolveReferencesInString as a safety net for non-page-handler usage.
  if (!contentRef && body) {
    const index = getContentRefIndex() ?? EMPTY_CONTENT_REF_INDEX;
    const resolvedBody = resolveReferencesInString(
      index,
      body,
      lang,
      defaultLanguageCode,
      contentRef ? { collection: "prose", file: contentRef } : undefined,
    );
    let html = resolveProseImages(
      renderMarkdownGfm(resolvedBody, true),
      lang,
      defaultLanguageCode,
      materialCreditLabels,
      creditsSiteDefault,
    );
    if (hasPriceMarkers(resolvedBody)) {
      const derivedPrices = loadDerivedPrices();
      html = resolvePriceMarkersInHtml(html, lang, derivedPrices);
    }
    return { kind: "html", html };
  }

  const proseEntry = contentRef
    ? await getProseContentEntry(contentRef, lang, defaultLanguageCode)
    : null;

  if (!proseEntry) return { kind: "slot" };

  // [RFC-0529] Resolve braceless content references in prose body before rendering
  let proseBody = "";
  let hasReferences = false;
  let sourceBody: string | undefined;
  const entryBody = (proseEntry as Record<string, unknown> & { body?: string }).body;
  if (entryBody && typeof entryBody === "string") {
    sourceBody = entryBody;
    const index = getContentRefIndex() ?? EMPTY_CONTENT_REF_INDEX;
    proseBody = resolveReferencesInString(
      index,
      entryBody,
      lang,
      defaultLanguageCode,
      contentRef ? { collection: "prose", file: contentRef } : undefined,
    );
    hasReferences = proseBody !== entryBody;
  }

  // [RFC-0041] Pre-wrap inline numbers server-side when animateNumbers is true.
  if (animateNumbers) {
    const entryRenderedHtml = (
      proseEntry as Record<string, unknown> & { rendered?: { html?: string } }
    ).rendered?.html;

    let rawHtml: string;
    if (entryRenderedHtml) {
      rawHtml = entryRenderedHtml;
    } else {
      const rawBody = (proseEntry as Record<string, unknown> & { body?: string }).body;
      rawHtml = rawBody ? renderMarkdownGfm(rawBody, false) : "";
    }

    if (rawHtml) {
      let html = resolveProseImages(
        wrapInlineNumbers(rawHtml, { animateYears, duration: numberDuration }),
        lang,
        defaultLanguageCode,
        materialCreditLabels,
        creditsSiteDefault,
      );
      if (hasPriceMarkers(sourceBody ?? "")) {
        const derivedPrices = loadDerivedPrices();
        html = resolvePriceMarkersInHtml(html, lang, derivedPrices);
      }
      return { kind: "html", html };
    }
  }

  // [RFC-0766] Detect price markers — force micromark path if present.
  const hasPriceMarkersInBody = hasPriceMarkers(proseBody) || hasPriceMarkers(sourceBody ?? "");

  // Render prose: use micromark if there were references, images, or price markers; otherwise use Astro's render()
  if ((hasReferences || hasPriceMarkersInBody) && proseBody) {
    let html = resolveProseImages(
      renderMarkdownGfm(proseBody, true),
      lang,
      defaultLanguageCode,
      materialCreditLabels,
      creditsSiteDefault,
    );
    if (hasPriceMarkersInBody) {
      const derivedPrices = loadDerivedPrices();
      html = resolvePriceMarkersInHtml(html, lang, derivedPrices);
    }
    return { kind: "html", html };
  }

  if (markdownHasImages(sourceBody) || hasPriceMarkers(sourceBody ?? "")) {
    let html = resolveProseImages(
      renderMarkdownGfm(sourceBody ?? "", true),
      lang,
      defaultLanguageCode,
      materialCreditLabels,
      creditsSiteDefault,
    );
    if (hasPriceMarkers(sourceBody ?? "")) {
      const derivedPrices = loadDerivedPrices();
      html = resolvePriceMarkersInHtml(html, lang, derivedPrices);
    }
    return { kind: "html", html };
  }

  // Use Astro's render() for normal prose (supports tables, footnotes, etc.)
  const proseRendered = await render(proseEntry);
  const Component = proseRendered?.Content ?? null;
  if (Component) return { kind: "component", Component };
  return { kind: "slot" };
}
