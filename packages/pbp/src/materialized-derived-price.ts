/*
<MODULE_CONTRACT>
<purpose>PBP Materialized Derived Price type — persisted derived price attached to Offerings in the compiled graph (RFC-0740).</purpose>
<non-goals>
  <item>Does not implement materialization logic — that is in compiler/materialize.ts.</item>
  <item>Does not define the currency conversion derivation — that is RFC-0739.</item>
  <item>Does not define projection-side consumption — that is RFC-0742.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0740 — PbpMaterializedDerivedPrice, PbpPriceKind, PbpCommercialMeaning types.</item>
</CHANGE_SUMMARY>
*/

import type { PbpCurrencyConversionTrace } from "./derivations/currency-conversion.js";
import type { PbpCurrentUses } from "./entities/currency-pricing-policy.js";

/**
 * Price kind. Only "derived" is supported in the current phase.
 * "indicative" is reserved for future use when allowLastKnownValue
 * produces a price from a stale snapshot.
 *
 * @see RFC-0740 §7 (priceKind and commercialMeaning)
 */
export type PbpPriceKind = "derived";

export const PBP_PRICE_KINDS: readonly PbpPriceKind[] = ["derived"] as const;

export function isPbpPriceKind(value: string): value is PbpPriceKind {
  return PBP_PRICE_KINDS.includes(value as PbpPriceKind);
}

/**
 * Commercial meaning. Only "derived-price" is supported in the current phase.
 * "indicative-price" is reserved for future use.
 *
 * @see RFC-0740 §7 (priceKind and commercialMeaning)
 */
export type PbpCommercialMeaning = "derived-price";

export const PBP_COMMERCIAL_MEANINGS: readonly PbpCommercialMeaning[] = ["derived-price"] as const;

export function isPbpCommercialMeaning(value: string): value is PbpCommercialMeaning {
  return PBP_COMMERCIAL_MEANINGS.includes(value as PbpCommercialMeaning);
}

/**
 * A materialized derived price attached to an Offering in the compiled graph.
 *
 * Produced by the `derived-prices.materialize` command (RFC-0740) by running
 * the currency-conversion derivation (RFC-0739) for each fixed Charge in each
 * Offering, for each target currency declared in the CurrencyPricingPolicy.
 *
 * @see RFC-0740 §1 (PbpMaterializedDerivedPrice type)
 */
export interface PbpMaterializedDerivedPrice {
  /** Charge key within pricing.charges (e.g. "monthly", "activation"). */
  chargeRef: string;
  targetCurrency: string;
  amount: {
    value: string;
    currency: string;
  };
  priceKind: PbpPriceKind;
  commercialMeaning: PbpCommercialMeaning;
  derivation: {
    /** Derivation contract ref (e.g. "pbp-derivation:currency-conversion/1"). */
    modelRef: string;
    modelVersion: string;
    /** ISO 8601 UTC timestamp when the derivation was executed. */
    calculatedAt: string;
  };
  trace: PbpCurrencyConversionTrace;
  allowedUses: PbpCurrentUses;
}
