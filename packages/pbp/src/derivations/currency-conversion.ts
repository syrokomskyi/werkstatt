/*
<MODULE_CONTRACT>
<purpose>PBP Currency Conversion Derivation Contract — fixed pipeline for converting source currency to target currency with percentage/fixed adjustments, rounding, and price ending (RFC-0739).</purpose>
<non-goals>
  <item>Does not materialize derived prices — that is RFC-0740.</item>
  <item>Does not project prices to AI answer — that is RFC-0742.</item>
  <item>Does not implement decimal arithmetic — that is in decimal.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0739 — currency conversion derivation contract, pipeline, trace, and result types.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpDerivationContract, PbpDerivationResult } from "../derivation.js";
import type { PbpRoundingMode } from "../decimal.js";
import type { PbpRateDirection } from "../entities/rate-policy.js";
import type { PbpRateSnapshotSource } from "../entities/rate-snapshot.js";

export type { PbpRoundingMode } from "../decimal.js";
export { PBP_ROUNDING_MODES, isPbpRoundingMode } from "../decimal.js";

/**
 * Price ending mode. Only "subtract" is supported (for ...9 and ...99 endings).
 *
 * @see RFC-0739 §2 (Closed unions)
 */
export type PbpPriceEndingMode = "subtract";

export const PBP_PRICE_ENDING_MODES: readonly PbpPriceEndingMode[] = ["subtract"] as const;

export function isPbpPriceEndingMode(value: string): value is PbpPriceEndingMode {
  return PBP_PRICE_ENDING_MODES.includes(value as PbpPriceEndingMode);
}

/**
 * Fixed pipeline declaration for currency conversion price derivation.
 *
 * @see RFC-0739 §3 (Fixed pipeline execution)
 */
export interface PbpPriceDerivationPipeline {
  conversion: {
    sourceAmount: string;
    sourceCurrency: string;
    targetCurrency: string;
  };
  percentageAdjustment?: {
    percentage: string;
  };
  fixedAdjustment?: {
    value: string;
  };
  rounding: {
    mode: PbpRoundingMode;
    increment?: string;
    decimalPlaces?: number;
  };
  priceEnding?: {
    mode: PbpPriceEndingMode;
    value: string;
  };
}

/**
 * Currency conversion derivation contract.
 *
 * Extends PbpDerivationContract with typed parameters for rate policy/snapshot
 * references and the fixed pipeline.
 *
 * @see RFC-0739 §1 (PbpCurrencyConversionDerivation contract)
 */
export interface PbpCurrencyConversionDerivation extends PbpDerivationContract {
  derivationRef: "currency-conversion";
  parameters: {
    ratePolicyRef: PbpEntityRef;
    rateSnapshotRef: PbpEntityRef;
    pipeline: PbpPriceDerivationPipeline;
  };
}

/**
 * Currency conversion derivation result.
 *
 * Extends PbpDerivationResult with a typed `value` (amount, currency, price kind)
 * and a `trace` field containing the full calculation trace.
 *
 * Consumers of `runDerivations` results that need trace access should check
 * `derivationRef === "currency-conversion"` and cast to `PbpCurrencyConversionResult`.
 *
 * The trace is server-side only. `snapshotDigest` in the trace should be redacted
 * in client-facing AI projections (RFC-0742) to avoid fingerprinting vectors.
 *
 * @see RFC-0739 §6 (Derivation result)
 */
export interface PbpCurrencyConversionResult extends PbpDerivationResult {
  value: {
    amount: string;
    currency: string;
    priceKind: "derived";
    commercialMeaning: "derived-price";
  };
  trace: PbpCurrencyConversionTrace;
}

/**
 * Full calculation trace for AI agent consumption and debugging.
 *
 * @see RFC-0739 §7 (Full calculation trace)
 * @see RFC-0737 for PbpRateDirection
 * @see RFC-0738 for PbpRateSnapshotSource (re-exported from @warpgogol/pbp)
 */
export interface PbpCurrencyConversionTrace {
  source: {
    amount: string;
    currency: string;
  };
  rate: {
    value: string;
    pair: string;
    direction: PbpRateDirection;
    sourceKind: PbpRateSnapshotSource["kind"];
    observedAt: string;
    snapshotDigest: string;
  };
  model: {
    id: "currency-conversion";
    version: string;
  };
  calculation: {
    conversion: { input: string; rate: string; output: string };
    percentageAdjustment?: { percentage: string; output: string };
    fixedAdjustment?: { value: string; output: string };
    rounding: { mode: PbpRoundingMode; increment?: string; decimalPlaces?: number; output: string };
    priceEnding?: { operation: "subtract"; value: string; output: string };
  };
  result: {
    amount: string;
    currency: string;
  };
}
