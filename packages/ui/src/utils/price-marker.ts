// Implements ADR-0033: price markers {price:offering-id:chargeRef} resolve
// from PBP offering entities via derivedPrices, enabling dynamic currency-aware
// pricing for both own and competitor prices (range model supported).
// RFC-0766: renderPriceDisplayHtml generates HTML strings for prose content.
import {
  buildPriceVariants,
  loadDerivedPrices,
  type SourcePriceProp,
} from "../sections/price-card/price-variants.ts";

export type TextPart = { kind: "text"; value: string };
export type PricePart = { kind: "price"; variants: ReturnType<typeof buildPriceVariants> };
export type TextOrPrice = TextPart | PricePart;

const offeringUriPrefix = "https://warpgogol.com/id/offerings/";
export const PRICE_MARKER_PATTERN = "\\{price:([a-zA-Z0-9_-]+):([a-zA-Z0-9_.-]+)\\}";
const priceMarkerRe = new RegExp(PRICE_MARKER_PATTERN, "g");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * RFC-0766: Generate the HTML string for a {price:offering:chargeRef} marker.
 * Uses <span> elements (not <div>) to remain valid HTML inside <p> elements.
 * Returns empty string when buildPriceVariants returns null
 *   (single-currency or no derived prices).
 * The CSS classes and data attributes match CurrencyAwarePriceDisplay,
 * so the client-side currency switcher toggles variants correctly.
 */
export function renderPriceDisplayHtml(
  offeringId: string,
  chargeRef: string,
  lang: string,
  derivedPrices: ReturnType<typeof loadDerivedPrices>,
): string {
  const ref = offeringUriPrefix + offeringId;
  const entries = derivedPrices?.[ref];
  const matching = entries?.filter((e) => e.chargeRef === chargeRef) ?? [];
  const sourceAmount = matching[0]?.trace?.source?.amount ?? "0";
  const sourceProp: SourcePriceProp = { amount: sourceAmount, currency: "EUR" };
  const variants = buildPriceVariants(sourceProp, chargeRef, lang, ref, derivedPrices, undefined);
  if (!variants) return "";

  const variantHtml = variants
    .map((variant, index) => {
      const noteHtml = variant.note
        ? `<span class="currency-aware-price-display__note">${escapeHtml(variant.note)}</span>`
        : "";
      return `<span class="currency-aware-price-display__variant" data-currency="${escapeHtml(variant.currency)}"${index !== 0 ? " hidden" : ""} aria-label="${escapeHtml(variant.formatted)}"><span class="currency-aware-price-display__amount">${escapeHtml(variant.formatted)}</span>${noteHtml}</span>`;
    })
    .join("");

  return `<span class="currency-aware-price-display" data-currency-price-display aria-live="polite">${variantHtml}</span>`;
}

export function parsePriceMarkers(
  text: string,
  lang: string,
  derivedPrices: ReturnType<typeof loadDerivedPrices>,
): TextOrPrice[] {
  const parts: TextOrPrice[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  priceMarkerRe.lastIndex = 0;
  while ((match = priceMarkerRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    const offeringId = match[1]!;
    const chargeRef = match[2]!;
    const ref = offeringUriPrefix + offeringId;
    const entries = derivedPrices?.[ref];
    const matching = entries?.filter((e) => e.chargeRef === chargeRef) ?? [];
    const sourceAmount = matching[0]?.trace?.source?.amount ?? "0";
    const sourceProp: SourcePriceProp = { amount: sourceAmount, currency: "EUR" };
    const variants = buildPriceVariants(sourceProp, chargeRef, lang, ref, derivedPrices, undefined);
    parts.push({ kind: "price", variants });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIndex) });
  }
  if (parts.length === 0) parts.push({ kind: "text", value: text });
  return parts;
}
