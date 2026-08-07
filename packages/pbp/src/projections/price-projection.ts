/*
<MODULE_CONTRACT>
<purpose>PBP Price Projection — currency-aware price projection for website and AI consumers (RFC-0742).</purpose>
<non-goals>
  <item>Does not define materialized derived prices — that is RFC-0740 (materialized-derived-price.ts).</item>
  <item>Does not define currency conversion derivation — that is RFC-0739 (derivations/currency-conversion.ts).</item>
  <item>Does not define the currency selector UI — that is RFC-0743.</item>
  <item>Does not define Schema.org output — that is RFC-0745.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0742 — PbpPriceProjection, PbpPriceDisplayConfig, buildPriceProjection.</item>
</CHANGE_SUMMARY>
*/

import type { PbpMaterializedDerivedPrice, PbpPriceKind, PbpCommercialMeaning } from "../materialized-derived-price.js";
import type { PbpCurrentUses } from "../entities/currency-pricing-policy.js";
import type { PbpCurrencyConversionTrace } from "../derivations/currency-conversion.js";

/**
 * Display configuration for a price projection.
 *
 * Controls what the UI shows alongside the formatted price. All defaults
 * come from RFC-0735 design decisions adopted from the research document.
 *
 * @see RFC-0742 §2 (Display config defaults)
 */
export interface PbpPriceDisplayConfig {
  /** Show the source EUR price alongside the derived price. Decision #31: false. */
  showSourcePrice: boolean;
  /** Show the exchange rate to the customer. Decision #29: true. */
  showRate: boolean;
  /** Show the rate date near the price. Decision #34: false. */
  showRateDateNearPrice: boolean;
  /** Localized disclosure note, or null when no note is needed. */
  note: string | null;
}

/**
 * Currency-aware price projection for a single Offering × currency × locale.
 *
 * Produced by {@link buildPriceProjection} from a {@link PbpMaterializedDerivedPrice}.
 * The UI receives this projection and renders it as-is — it does NOT compute,
 * format, or compose notes.
 *
 * @see RFC-0742 §1 (PbpPriceProjection type)
 */
export interface PbpPriceProjection {
  amount: {
    /** Decimal string of the derived amount (e.g. "3239.00"). */
    value: string;
    /** Target currency ISO 4217 code (e.g. "UAH"). */
    currency: string;
    /** Locale-formatted amount via Intl.NumberFormat (e.g. "3\u00A0239\u00A0₴"). */
    formatted: string;
  };
  priceKind: PbpPriceKind;
  commercialMeaning: PbpCommercialMeaning;
  display: PbpPriceDisplayConfig;
  allowedUses: PbpCurrentUses;
  rate: {
    /** Decimal string of the exchange rate (e.g. "46.18"). */
    value: string;
    /** Currency pair in "SOURCE/TARGET" format (e.g. "EUR/UAH"). */
    pair: string;
    /** Locale-formatted rate (e.g. "1 EUR = 46,18 UAH"). */
    formatted: string;
  };
}

/**
 * Default display config following RFC-0735 design decisions.
 *
 * - `showSourcePrice: false` — decision #31: do NOT show source EUR price.
 * - `showRate: true` — decision #29: show rate to customer.
 * - `showRateDateNearPrice: false` — decision #34: no rate date near price.
 * - `note: null` — set per price kind by the projection builder.
 */
export const DEFAULT_DISPLAY_CONFIG: PbpPriceDisplayConfig = {
  showSourcePrice: false,
  showRate: true,
  showRateDateNearPrice: false,
  note: null,
};

/** Site-supported locales. Used for locale validation and fallback. */
const SUPPORTED_LOCALES = ["uk", "de"] as const;
const DEFAULT_LOCALE = "uk" as const;

/**
 * Disclosure note templates per locale and commercialMeaning.
 *
 * No `≈` symbol (decision #33). Brief explanation, not formula (decision #32).
 * `{rate}` and `{currency}` placeholders are filled from the materialized price.
 */
const NOTE_TEMPLATES: Record<string, Record<PbpCommercialMeaning, string>> = {
  uk: {
    "derived-price": "Ціна розрахована за курсом 1 EUR = {rate} {currency}.",
  },
  de: {
    "derived-price": "Preis berechnet nach Kurs 1 EUR = {rate} {currency}.",
  },
};

/**
 * Validate locale against site-supported locales. Fall back to default if unsupported.
 */
function resolveLocale(locale: string): string {
  if (SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])) {
    return locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Compose the disclosure note for the given commercialMeaning and locale.
 *
 * Returns null when no template exists for the given commercialMeaning.
 */
function composeNote(
  commercialMeaning: PbpCommercialMeaning,
  locale: string,
  rateValue: string,
  targetCurrency: string,
): string | null {
  const resolvedLocale = resolveLocale(locale);
  const templates = NOTE_TEMPLATES[resolvedLocale];
  if (!templates) return null;
  const template = templates[commercialMeaning];
  if (!template) return null;
  return template.replace("{rate}", rateValue).replace("{currency}", targetCurrency);
}

/**
 * Format a currency amount using Intl.NumberFormat.
 *
 * Falls back to "{value} {currency}" on formatting failure.
 */
function formatCurrencyAmount(value: string, currency: string, locale: string): string {
  try {
    const number = Number(value);
    if (Number.isNaN(number)) return `${value} ${currency}`;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${value} ${currency}`;
  }
}

/**
 * Format an exchange rate as "1 {sourceCurrency} = {rateValue} {targetCurrency}".
 *
 * Falls back to "1 {sourceCurrency} = {rateValue} {targetCurrency}" on formatting failure.
 */
function formatRate(rateValue: string, sourceCurrency: string, targetCurrency: string, locale: string): string {
  try {
    const number = Number(rateValue);
    if (Number.isNaN(number)) return `1 ${sourceCurrency} = ${rateValue} ${targetCurrency}`;
    const formattedRate = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(number);
    return `1 ${sourceCurrency} = ${formattedRate} ${targetCurrency}`;
  } catch {
    return `1 ${sourceCurrency} = ${rateValue} ${targetCurrency}`;
  }
}

/**
 * Build a currency-aware price projection from a materialized derived price.
 *
 * Returns `null` when `allowedUses.presentation` is false — the price is not
 * included in the website projection. This enforcement is in place for future
 * phases when transactional scopes are enabled (RFC-0742 §7).
 *
 * @param materialized — the materialized derived price from RFC-0740
 * @param locale — site locale (uk, de); unsupported locales fall back to uk
 * @see RFC-0742 §4 (buildPriceProjection function)
 */
export function buildPriceProjection(
  materialized: PbpMaterializedDerivedPrice,
  locale: string,
): PbpPriceProjection | null {
  if (!materialized.allowedUses.presentation) {
    return null;
  }

  const resolvedLocale = resolveLocale(locale);
  const targetCurrency = materialized.amount.currency;
  const sourceCurrency = materialized.trace.source.currency;
  const rateValue = materialized.trace.rate.value;
  const ratePair = materialized.trace.rate.pair;

  const formattedAmount = formatCurrencyAmount(materialized.amount.value, targetCurrency, resolvedLocale);
  const formattedRate = formatRate(rateValue, sourceCurrency, targetCurrency, resolvedLocale);
  const note = composeNote(materialized.commercialMeaning, resolvedLocale, rateValue, targetCurrency);

  return {
    amount: {
      value: materialized.amount.value,
      currency: targetCurrency,
      formatted: formattedAmount,
    },
    priceKind: materialized.priceKind,
    commercialMeaning: materialized.commercialMeaning,
    display: {
      ...DEFAULT_DISPLAY_CONFIG,
      note,
    },
    allowedUses: materialized.allowedUses,
    rate: {
      value: rateValue,
      pair: ratePair,
      formatted: formattedRate,
    },
  };
}

// Re-export trace type for convenience — consumers of priceTraces need it.
export type { PbpCurrencyConversionTrace };
