/*
<MODULE_CONTRACT>
<purpose>Price marker resolution for semantic projections (RFC-0767). Resolves {price:offering:chargeRef} markers to source-currency (EUR) strings for JSON-LD and meta tags. Also hosts the relocated DerivedPriceEntry type, OFFERING_URI_PREFIX constant, and PRICE_MARKER_RE regex shared between the semantic layer and packages/ui.</purpose>
<non-goals>
  <item>Does not read files — derived prices are passed as a parameter. File I/O lives in derived-prices-loader.ts.</item>
  <item>Does not append recurrence suffixes — JSON-LD headline/description are free-text strings where recurrence is in the surrounding sentence.</item>
  <item>Does not resolve markers in block-derived content or prose body — only heading, lead, description (RFC-0767 nonGoals).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0767: relocated DerivedPriceEntry, OFFERING_URI_PREFIX, PRICE_MARKER_RE from packages/ui to packages/share to break circular dependency.</item>
  <item>RFC-0767: added formatSourcePrice and resolvePriceMarkersForSemantic for semantic-layer marker resolution.</item>
</CHANGE_SUMMARY>
*/

/**
 * Derived price entry shape (moved from packages/ui to packages/share
 * so both the semantic layer and UI components share a single type).
 */
export interface DerivedPriceEntry {
  chargeRef: string;
  targetCurrency: string;
  amount: { value: string; currency: string };
  trace: {
    source: { amount: string; currency: string };
    rate: { value: string; pair: string };
  };
}

export const OFFERING_URI_PREFIX = "https://warpgogol.com/id/offerings/";
export const PRICE_MARKER_RE = /\{price:([a-zA-Z0-9_-]+):([a-zA-Z0-9_.-]+)\}/g;
export const AMOUNT_MARKER_RE = /\{amount:([0-9]+(?:\.[0-9]+)?)\}/g;

/**
 * Format a source-currency amount for semantic projections.
 * Unlike formatPrice in packages/ui, this does NOT append a recurrence
 * suffix — JSON-LD headline/description fields are free-text strings
 * where the recurrence context is already in the surrounding sentence.
 * Uses Intl.NumberFormat with currencyDisplay: "narrowSymbol".
 * Output contains a non-breaking space (U+00A0) between number and symbol.
 */
export function formatSourcePrice(amount: string, lang: string): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "0\u00A0€";
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "EUR",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

/**
 * Resolve {price:offering:chargeRef} markers in a string to source-currency
 * (EUR) formatted strings for use in semantic projections (JSON-LD, meta tags).
 *
 * Returns the input string unchanged if no markers are present.
 * Returns "0 €" (with non-breaking space) for unknown offerings or chargeRefs
 * (same fallback as parsePriceMarkers in packages/ui).
 */
export function resolvePriceMarkersForSemantic(
  text: string,
  lang: string,
  derivedPrices?: Record<string, DerivedPriceEntry[]> | null,
): string {
  return text.replace(PRICE_MARKER_RE, (_match, offeringId: string, chargeRef: string) => {
    const ref = OFFERING_URI_PREFIX + offeringId;
    const entry = derivedPrices?.[ref]?.find((e) => e.chargeRef === chargeRef);
    const sourceAmount = entry?.trace?.source?.amount ?? "0";
    return formatSourcePrice(sourceAmount, lang);
  });
}

/**
 * Resolve {amount:NNNN} markers to source-currency (EUR) formatted strings
 * for semantic projections (JSON-LD, meta tags). These markers represent
 * literal EUR amounts (e.g. thresholds) that are not tied to an offering.
 */
export function resolveAmountMarkersForSemantic(text: string, lang: string): string {
  return text.replace(AMOUNT_MARKER_RE, (_match, amount: string) => {
    return formatSourcePrice(amount, lang);
  });
}
