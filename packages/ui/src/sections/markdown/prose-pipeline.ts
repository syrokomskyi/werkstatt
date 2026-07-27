/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0026/RFC-0041/RFC-0045] Prose rendering pipeline — orchestrates the
  decision tree for rendering prose content: reference substitution → micromark,
  image-bearing → micromark + image resolution, or Astro render() for plain prose.
  Also handles inline-number animation wrapping. Returns either an HTML string
  (for set:html) or an Astro Component (for <Component />).
</purpose>
<non-goals>
  <item>Do not own section layout, SectionShell, or language columns — caller handles those.</item>
  <item>Do not own image attribute manipulation — delegated to prose-image-resolver.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from markdown-section.astro to create a testable internal seam for prose rendering orchestration.</item>
</CHANGE_SUMMARY>
*/

import { render } from "astro:content";
import type { MaterialCreditLabels } from "@gogol/share";
import { getProseContentEntry, wrapInlineNumbers, type AttributionSiteDefault } from "@gogol/share";
import {
  getContentRefIndex,
  resolveReferencesInString,
  EMPTY_CONTENT_REF_INDEX,
} from "@gogol/share/content-reference";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { resolveProseImages, markdownHasImages } from "./prose-image-resolver.ts";

/**
 * Render markdown to HTML with GFM support (tables, strikethrough, task lists,
 * autolinks). Used on the reference-substitution and number-animation paths so
 * any markdown document renders the same GFM features as Astro's render() path.
 */
function renderMarkdownGfm(text: string, allowDangerousHtml: boolean): string {
  return micromark(text, {
    allowDangerousHtml,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}

export interface ProsePipelineOptions {
  lang: string;
  defaultLanguageCode: string;
  contentRef?: string;
  animateNumbers?: boolean;
  animateYears?: boolean;
  numberDuration?: number;
  materialCreditLabels: MaterialCreditLabels;
  creditsSiteDefault: AttributionSiteDefault;
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
    animateNumbers = false,
    animateYears = true,
    numberDuration = 3.0,
    materialCreditLabels,
    creditsSiteDefault,
  } = opts;

  const proseEntry = contentRef
    ? await getProseContentEntry(contentRef, lang, defaultLanguageCode)
    : null;

  if (!proseEntry) return { kind: "slot" };

  // [RFC-0529] Resolve braceless content references in prose body before rendering
  let proseBody = "";
  let hasReferences = false;
  let sourceBody: string | undefined;
  const body = (proseEntry as Record<string, unknown> & { body?: string }).body;
  if (body && typeof body === "string") {
    sourceBody = body;
    const index = getContentRefIndex() ?? EMPTY_CONTENT_REF_INDEX;
    proseBody = resolveReferencesInString(index, body, lang, defaultLanguageCode);
    hasReferences = proseBody !== body;
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
      const html = resolveProseImages(
        wrapInlineNumbers(rawHtml, { animateYears, duration: numberDuration }),
        lang,
        defaultLanguageCode,
        materialCreditLabels,
        creditsSiteDefault,
      );
      return { kind: "html", html };
    }
  }

  // Render prose: use micromark only if there were references to substitute, otherwise use Astro's render()
  if (hasReferences && proseBody) {
    const html = resolveProseImages(
      renderMarkdownGfm(proseBody, true),
      lang,
      defaultLanguageCode,
      materialCreditLabels,
      creditsSiteDefault,
    );
    return { kind: "html", html };
  }

  if (markdownHasImages(sourceBody)) {
    const html = resolveProseImages(
      renderMarkdownGfm(sourceBody ?? "", true),
      lang,
      defaultLanguageCode,
      materialCreditLabels,
      creditsSiteDefault,
    );
    return { kind: "html", html };
  }

  // Use Astro's render() for normal prose (supports tables, footnotes, etc.)
  const proseRendered = await render(proseEntry);
  const Component = proseRendered?.Content ?? null;
  if (Component) return { kind: "component", Component };
  return { kind: "slot" };
}
