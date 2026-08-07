/*
<MODULE_CONTRACT>
<purpose>Price variant utilities for currency-aware price display (RFC-0743) — formatPrice, loadDerivedPrices, and buildPriceVariants extracted from price-card-section.astro for testability.</purpose>
<non-goals>
  <item>Does not format recurrence — delegates to formatRecurrence from share.</item>
  <item>Does not render HTML — returns structured data for the .astro template.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from price-card-section.astro for testability (review fix G-3).</item>
<item>Review fix A-1: exported formatPrice to eliminate duplication. Review fix G-3: added loadDerivedPrices with ENOENT handling.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatRecurrence } from "@warpgogol/share/formula-eval";

export interface DerivedPriceEntry {
  chargeRef: string;
  targetCurrency: string;
  amount: { value: string; currency: string };
  trace: {
    source: { amount: string; currency: string };
    rate: { value: string; pair: string };
  };
}

export interface PriceVariant {
  currency: string;
  formatted: string;
  note: string | null;
}

export interface SourcePriceProp {
  amount?: string;
  currency?: string;
  recurrence?: string;
}

export function formatPrice(prop: SourcePriceProp | undefined, lang: string): string {
  if (!prop || !prop.amount || prop.amount.trim() === "") return "";
  const numericAmount = Number(prop.amount);
  if (!Number.isFinite(numericAmount)) return "";
  const currency = prop.currency ?? "EUR";
  const formatted = new Intl.NumberFormat(lang, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericAmount);
  const suffix = formatRecurrence(prop.recurrence, lang);
  return suffix ? `${formatted}\u00A0${suffix}` : formatted;
}

export function loadDerivedPrices(
  cwd: string = process.cwd(),
): Record<string, DerivedPriceEntry[]> | null {
  const filePath = join(cwd, "src", "derived-prices.generated.json");
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(raw) as Record<string, DerivedPriceEntry[]>;
}

export function buildPriceVariants(
  sourceProp: SourcePriceProp | undefined,
  chargeRef: string,
  lang: string,
  offeringRef: string | undefined,
  derivedPrices: Record<string, DerivedPriceEntry[]> | null,
  noteTemplate: string | undefined,
): PriceVariant[] | null {
  if (!offeringRef || !derivedPrices || !sourceProp) return null;
  const entries = derivedPrices[offeringRef];
  if (!entries) return null;
  const matching = entries.filter((e) => e.chargeRef === chargeRef);
  if (matching.length === 0) return null;

  const variants: PriceVariant[] = [];

  const sourceCurrency = sourceProp.currency ?? "EUR";
  const sourceFormatted = formatPrice(sourceProp, lang);
  if (sourceFormatted) {
    variants.push({ currency: sourceCurrency, formatted: sourceFormatted, note: null });
  }

  for (const entry of matching) {
    const numericAmount = Number(entry.amount.value);
    if (!Number.isFinite(numericAmount)) continue;
    const formatted = new Intl.NumberFormat(lang, {
      style: "currency",
      currency: entry.amount.currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numericAmount);
    const suffix = formatRecurrence(sourceProp.recurrence, lang);
    const formattedWithSuffix = suffix ? `${formatted}\u00A0${suffix}` : formatted;
    const note = noteTemplate
      ? noteTemplate
          .replace("{rate}", entry.trace.rate.value)
          .replace("{currency}", entry.amount.currency)
      : null;
    variants.push({
      currency: entry.amount.currency,
      formatted: formattedWithSuffix,
      note,
    });
  }

  return variants.length > 1 ? variants : null;
}
