/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0045/RFC-0231] Prose image resolver — owns all regex-based HTML image
  attribute manipulation and material-credit injection for rendered prose HTML.
  Given an HTML string with <img> tags, resolves content-asset descriptors,
  swaps src/srcset/sizes/width/height/loading/decoding, and wraps images in
  <figure> with material-credit disclosures where applicable.
</purpose>
<non-goals>
  <item>Do not render markdown — caller passes already-rendered HTML.</item>
  <item>Do not own section layout or SectionShell composition.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from markdown-section.astro to create a testable internal seam for prose image resolution.</item>
</CHANGE_SUMMARY>
*/

import type { ImageDescriptor, MaterialCreditLabels } from "@gogol/share";
import {
  buildImageSources,
  creditByTarget,
  formatMaterialCreditLine,
  labelForMaterialCreditRole,
  resolveAttributionDisplay,
  type AttributionSiteDefault,
} from "@gogol/share";
import { contentAssetCredits, contentAssetImages } from "../../content-assets.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenFromImageSrc(src: string): string {
  const file = src.split(/[?#]/)[0]?.split("/").pop() ?? src;
  return decodeURIComponent(file)
    .replace(/\.[a-zA-Z0-9_-]{8,}(?=\.(webp|jpe?g|png)$)/i, "")
    .replace(/\.(webp|jpe?g|png)$/i, "");
}

function proseImageDescriptor(
  token: string,
  lang: string,
  defaultLanguageCode: string,
): ImageDescriptor | null {
  const languages = Array.from(
    new Set([lang, defaultLanguageCode].map((value) => value.toLowerCase())),
  );
  const extensions = ["webp", "jpg", "jpeg", "png", "gif"];
  for (const language of languages) {
    for (const extension of extensions) {
      const key = `/src/content/prose/${language}/assets/${token}.${extension}`;
      const imageModule = (contentAssetImages as Record<string, unknown>)[key];
      if (!imageModule) continue;
      const image =
        imageModule && typeof imageModule === "object" && "default" in imageModule
          ? (imageModule as { default?: ImageDescriptor }).default
          : (imageModule as ImageDescriptor);
      if (image?.src) return image;
    }
  }
  return null;
}

function replaceImageAttribute(img: string, name: string, value: string | undefined): string {
  if (!value) return img;
  const escapedValue = escapeHtml(value);
  const attrPattern = new RegExp(`\\s${name}=["'][^"']*["']`, "i");
  if (attrPattern.test(img)) {
    return img.replace(attrPattern, ` ${name}="${escapedValue}"`);
  }
  return img.replace(/\s*\/?>$/, ` ${name}="${escapedValue}">`);
}

function removeImageAttribute(img: string, name: string): string {
  return img.replace(new RegExp(`\\s${name}=["'][^"']*["']`, "gi"), "");
}

function resolveProseImageHtml(
  img: string,
  token: string,
  lang: string,
  defaultLanguageCode: string,
): string {
  const descriptor = proseImageDescriptor(token, lang, defaultLanguageCode);
  if (!descriptor) return img;
  const sources = buildImageSources(descriptor, { quality: "max" });
  let resolved = img;
  resolved = removeImageAttribute(resolved, "srcset");
  resolved = removeImageAttribute(resolved, "sizes");
  resolved = replaceImageAttribute(resolved, "src", sources.src);
  resolved = replaceImageAttribute(resolved, "srcset", sources.srcset);
  resolved = replaceImageAttribute(resolved, "sizes", sources.sizes);
  resolved = replaceImageAttribute(
    resolved,
    "width",
    String(sources.width ?? descriptor.width ?? ""),
  );
  resolved = replaceImageAttribute(
    resolved,
    "height",
    String(sources.height ?? descriptor.height ?? ""),
  );
  resolved = replaceImageAttribute(resolved, "loading", "lazy");
  resolved = replaceImageAttribute(resolved, "decoding", "async");
  return resolved;
}

function renderMaterialCreditHtml(
  token: string,
  lang: string,
  defaultLanguageCode: string,
  labels: MaterialCreditLabels,
  siteDefault: AttributionSiteDefault,
): string {
  const credit = creditByTarget(
    contentAssetCredits,
    { kind: "image", id: token, domain: "prose" },
    lang,
    defaultLanguageCode,
  );
  if (!credit) return "";

  // RFC-0231: respect the attribution visibility policy. This prose path emits no
  // JSON-LD, so "hidden" simply omits the visible row (the credits page still lists it).
  const visible =
    resolveAttributionDisplay({
      surface: "material-credit",
      intent: credit.target.intent,
      assetOverride: credit.display,
      siteDefault,
    }) === "shown";
  if (!visible) return "";

  const line = formatMaterialCreditLine(credit, labels);
  const details = credit.parties
    .filter((party) => party.role !== "sourceMaterial")
    .map((party) => {
      const label = labelForMaterialCreditRole(party.role, labels);
      const name = party.url
        ? `<a href="${escapeHtml(party.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(party.name)}</a>`
        : escapeHtml(party.name);
      return `<div class="material-credit__item"><dt>${escapeHtml(label)}</dt><dd>${name}${party.kind !== "Person" ? `<span class="material-credit__kind"> ${escapeHtml(party.kind)}</span>` : ""}</dd></div>`;
    })
    .join("");

  const license = credit.license.url
    ? `<a href="${escapeHtml(credit.license.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(credit.license.label)}</a>`
    : escapeHtml(credit.license.label);
  const notice = credit.license.copyrightNotice
    ? `<div class="material-credit__item"><dt>${escapeHtml(labels.copyrightLabel)}</dt><dd>${escapeHtml(credit.license.copyrightNotice)}</dd></div>`
    : "";

  return `<details class="material-credit"><summary class="material-credit__summary"><span class="material-credit__label">${escapeHtml(labels.summaryLabel)}</span><span class="material-credit__line">${escapeHtml(line)}</span></summary><div class="material-credit__details">${credit.title ? `<p class="material-credit__title">${escapeHtml(credit.title)}</p>` : ""}<dl class="material-credit__list">${details}<div class="material-credit__item"><dt>${escapeHtml(labels.sourceType)}</dt><dd>${escapeHtml(credit.sourceType)}</dd></div><div class="material-credit__item"><dt>${escapeHtml(labels.license)}</dt><dd>${license}</dd></div>${notice}</dl></div></details>`;
}

/**
 * Resolve prose images and inject material-credit disclosures in rendered HTML.
 * Scans for <img> tags (both bare and paragraph-wrapped), resolves their content-asset
 * descriptors, swaps attributes for responsive delivery, and wraps in <figure> with
 * credit disclosures where applicable.
 */
export function resolveProseImages(
  html: string,
  lang: string,
  defaultLanguageCode: string,
  labels: MaterialCreditLabels,
  siteDefault: AttributionSiteDefault,
): string {
  return html.replace(
    /<p>\s*(<img\b[^>]*>)\s*<\/p>|(<img\b[^>]*>)/g,
    (match, paragraphImage: string | undefined, plainImage: string | undefined) => {
      const img = paragraphImage ?? plainImage;
      if (!img) return match;
      const src = img.match(/\ssrc=["']([^"']+)["']/i)?.[1];
      if (!src) return match;
      const token = tokenFromImageSrc(src);
      const resolvedImg = resolveProseImageHtml(img, token, lang, defaultLanguageCode);
      const creditHtml = renderMaterialCreditHtml(
        token,
        lang,
        defaultLanguageCode,
        labels,
        siteDefault,
      );
      if (!creditHtml) return match.replace(img, resolvedImg);
      return `<figure class="markdown-section__image-credit">${resolvedImg}${creditHtml}</figure>`;
    },
  );
}

/** Check whether a markdown body string contains image syntax. */
export function markdownHasImages(body: string | undefined): boolean {
  return Boolean(body && /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/.test(body));
}
