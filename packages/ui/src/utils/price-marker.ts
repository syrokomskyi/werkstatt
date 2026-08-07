import {
  buildPriceVariants,
  loadDerivedPrices,
  type SourcePriceProp,
} from "../sections/price-card/price-variants.ts";

export type TextPart = { kind: "text"; value: string };
export type PricePart = { kind: "price"; variants: ReturnType<typeof buildPriceVariants> };
export type TextOrPrice = TextPart | PricePart;

const offeringUriPrefix = "https://warpgogol.com/id/offerings/";
const priceMarkerRe = /\{price:([a-zA-Z0-9_-]+):([a-zA-Z0-9_.-]+)\}/g;

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
    const variants = buildPriceVariants(
      sourceProp,
      chargeRef,
      lang,
      ref,
      derivedPrices,
      undefined,
    );
    parts.push({ kind: "price", variants });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIndex) });
  }
  if (parts.length === 0) parts.push({ kind: "text", value: text });
  return parts;
}
