// Implements ADR-0033: price markers {price:offering-id:chargeRef} resolve
// from PBP offering entities via derivedPrices, enabling dynamic currency-aware
// pricing for both own and competitor prices (range model supported).
// RFC-0766: renderPriceDisplayHtml generates HTML strings for prose content.
// RFC-0767: OFFERING_URI_PREFIX and PRICE_MARKER_RE relocated to @warpgogol/share/semantic.
import {
  buildPriceVariants,
  formatPrice,
  loadDerivedPrices,
  type SourcePriceProp,
} from "../sections/price-card/price-variants.ts";
import { OFFERING_URI_PREFIX, PRICE_MARKER_RE, AMOUNT_MARKER_RE } from "@warpgogol/share/semantic";
import { decimalMultiply, decimalRound, type PbpRoundingMode } from "@warpgogol/pbp";

export type TextPart = { kind: "text"; value: string };
export type PricePart = { kind: "price"; variants: ReturnType<typeof buildPriceVariants> };
export type TextOrPrice = TextPart | PricePart;

const priceMarkerRe = PRICE_MARKER_RE;

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
  const ref = OFFERING_URI_PREFIX + offeringId;
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

/**
 * RFC-0766: Generate the HTML string for a {amount:NNNN} marker.
 * Extracts exchange rates from derived prices to build currency variants
 * for literal EUR amounts (e.g. thresholds) not tied to an offering.
 * Returns empty string when no derived prices are available.
 */
export function renderAmountDisplayHtml(
  amountEur: string,
  lang: string,
  derivedPrices: ReturnType<typeof loadDerivedPrices>,
): string {
  if (!derivedPrices) return "";

  const sourceProp: SourcePriceProp = { amount: amountEur, currency: "EUR" };
  const sourceFormatted = formatPrice(sourceProp, lang);
  const variants: { currency: string; formatted: string; note: string | null }[] = [];

  if (sourceFormatted) {
    variants.push({ currency: "EUR", formatted: sourceFormatted, note: null });
  }

  const seenCurrencies = new Set<string>(["EUR"]);
  for (const entries of Object.values(derivedPrices)) {
    for (const entry of entries) {
      const targetCurrency = entry.amount.currency;
      if (seenCurrencies.has(targetCurrency)) continue;
      seenCurrencies.add(targetCurrency);

      const rateStr = entry.trace.rate.value;
      const rateNum = Number(rateStr);
      if (!Number.isFinite(rateNum)) continue;

      const converted = decimalMultiply(amountEur, rateStr);
      const rounding = entry.trace.calculation?.rounding;
      const rounded = rounding
        ? decimalRound(
            converted,
            rounding.mode as PbpRoundingMode,
            rounding.increment,
            rounding.decimalPlaces,
          )
        : converted;
      const numericAmount = Number(rounded);
      if (!Number.isFinite(numericAmount)) continue;

      const formatted = new Intl.NumberFormat(lang, {
        style: "currency",
        currency: targetCurrency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(numericAmount);

      variants.push({ currency: targetCurrency, formatted, note: null });
    }
  }

  if (variants.length <= 1) return "";

  const variantHtml = variants
    .map((variant, index) => {
      return `<span class="currency-aware-price-display__variant" data-currency="${escapeHtml(variant.currency)}"${index !== 0 ? " hidden" : ""} aria-label="${escapeHtml(variant.formatted)}"><span class="currency-aware-price-display__amount">${escapeHtml(variant.formatted)}</span></span>`;
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
    const ref = OFFERING_URI_PREFIX + offeringId;
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
