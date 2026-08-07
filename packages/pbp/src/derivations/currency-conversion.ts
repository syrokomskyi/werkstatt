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
  <item>Reviewed and fixed — A1: named precision constant, A2: Big-based zero-check, G1: deterministic now parameter.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpDerivationContract, PbpDerivationResult } from "../derivation.js";
import type { PbpRoundingMode } from "../decimal.js";
import type { PbpRateDirection } from "../entities/rate-policy.js";
import type { PbpRateSnapshotSource } from "../entities/rate-snapshot.js";
import type { PbpResolvedGraph } from "../compiler/types.js";
import Big from "big.js";
import {
  decimalMultiply,
  decimalAdd,
  decimalSubtract,
  decimalDivide,
  decimalRound,
} from "../decimal.js";

const TARGET_CURRENCY_DECIMAL_PLACES: ReadonlyMap<string, number> = new Map([
  ["JPY", 0],
  ["KRW", 0],
  ["BHD", 3],
]);

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

/**
 * Execute the currency conversion derivation pipeline.
 *
 * The pipeline is fixed: conversion → percentageAdjustment → fixedAdjustment → rounding → priceEnding.
 * All intermediate values are decimal strings. No binary float at any step (ADR-012).
 *
 * The contract is cast to PbpCurrencyConversionDerivation internally after dispatch by
 * derivationRef === "currency-conversion". The generic signature is compatible with the
 * existing executeContract dispatcher pattern.
 *
 * @see RFC-0739 §3 (Fixed pipeline execution)
 * @see RFC-0739 §5 (Failure modes)
 */
export function computeCurrencyConversion(
  graph: PbpResolvedGraph,
  contract: PbpDerivationContract,
  now: string = new Date().toISOString(),
): PbpCurrencyConversionResult {
  const typedContract = contract as unknown as PbpCurrencyConversionDerivation;
  const params = typedContract.parameters;
  const pipeline = params.pipeline;
  const { sourceAmount, sourceCurrency, targetCurrency } = pipeline.conversion;

  const snapshotRef = resolveRef(params.rateSnapshotRef);
  const snapshot = graph.rateSnapshots[snapshotRef];

  if (!snapshot) {
    return skippedResult(contract, `Rate snapshot not found: ${snapshotRef}`);
  }

  const rateValue = snapshot.value;
  const direction = snapshot.quotation.direction;
  const pair = `${snapshot.pair.sourceCurrency}/${snapshot.pair.targetCurrency}`;

  if (snapshot.freshUntil < now) {
    return skippedResult(contract, `Rate snapshot past freshUntil: ${snapshot.freshUntil}`);
  }

  const targetDecimalPlaces = TARGET_CURRENCY_DECIMAL_PLACES.get(targetCurrency) ?? 2;
  const precision = targetDecimalPlaces + 2;

  let conversionOutput: string;
  if (direction === "target-per-source") {
    conversionOutput = decimalMultiply(sourceAmount, rateValue);
  } else {
    conversionOutput = decimalDivide(sourceAmount, rateValue, precision);
  }

  const traceCalc: Partial<PbpCurrencyConversionTrace["calculation"]> = {
    conversion: { input: sourceAmount, rate: rateValue, output: conversionOutput },
  };

  let adjusted = conversionOutput;

  if (pipeline.percentageAdjustment) {
    const pct = pipeline.percentageAdjustment.percentage;
    const factor = decimalAdd("1", decimalDivide(pct, "100", 10));
    adjusted = decimalMultiply(adjusted, factor);
    traceCalc.percentageAdjustment = { percentage: pct, output: adjusted };
  }

  if (pipeline.fixedAdjustment) {
    const fixedValue = pipeline.fixedAdjustment.value;
    adjusted = decimalAdd(adjusted, fixedValue);
    traceCalc.fixedAdjustment = { value: fixedValue, output: adjusted };
  }

  const roundingMode = pipeline.rounding.mode;
  const roundingIncrement = pipeline.rounding.increment;
  const roundingDecimalPlaces = pipeline.rounding.decimalPlaces;
  const rounded = decimalRound(adjusted, roundingMode, roundingIncrement, roundingDecimalPlaces);
  traceCalc.rounding = {
    mode: roundingMode,
    ...(roundingIncrement !== undefined && { increment: roundingIncrement }),
    ...(roundingDecimalPlaces !== undefined && { decimalPlaces: roundingDecimalPlaces }),
    output: rounded,
  };

  let finalAmount = rounded;

  if (pipeline.priceEnding) {
    const endingValue = pipeline.priceEnding.value;
    if (endingValue === "1.00" && roundingIncrement !== "10" && roundingIncrement !== "100") {
      return failedResult(
        contract,
        "PBP-CURRENCY-CONVERSION-ENDING-INCOMPATIBLE",
        `Price ending value "1.00" requires rounding increment "10" or "100", got: ${roundingIncrement ?? "none"}`,
      );
    }
    finalAmount = decimalSubtract(finalAmount, endingValue);
    traceCalc.priceEnding = { operation: "subtract", value: endingValue, output: finalAmount };
  }

  if (finalAmount.startsWith("-")) {
    return failedResult(
      contract,
      "PBP-CURRENCY-CONVERSION-NEGATIVE",
      `Pipeline produced negative amount: ${finalAmount}`,
    );
  }

  if (Big(finalAmount).abs().eq(0)) {
    if (Big(sourceAmount).gt(0)) {
      return failedResult(
        contract,
        "PBP-CURRENCY-CONVERSION-ZERO",
        `Pipeline produced zero for positive source amount: ${sourceAmount}`,
      );
    }
  }

  const trace: PbpCurrencyConversionTrace = {
    source: { amount: sourceAmount, currency: sourceCurrency },
    rate: {
      value: rateValue,
      pair,
      direction,
      sourceKind: snapshot.source.kind,
      observedAt: snapshot.observedAt,
      snapshotDigest: snapshot.digest.value,
    },
    model: {
      id: "currency-conversion",
      version: typedContract.implementationVersion,
    },
    calculation: traceCalc as PbpCurrencyConversionTrace["calculation"],
    result: { amount: finalAmount, currency: targetCurrency },
  };

  return {
    status: "derived",
    mode: "exact",
    value: {
      amount: finalAmount,
      currency: targetCurrency,
      priceKind: "derived",
      commercialMeaning: "derived-price",
    },
    trace,
    provenance: {
      derivationRef: "currency-conversion",
      implementationVersion: contract.implementationVersion,
      inputDigests: [
        `source:${sourceAmount}:${sourceCurrency}`,
        `rate:${rateValue}:${direction}`,
        `snapshot:${snapshotRef}:${snapshot.digest.value}`,
        `pipeline:${JSON.stringify(pipeline)}`,
      ],
    },
  };
}

function resolveRef(ref: PbpEntityRef): string {
  if (typeof ref === "string") return ref;
  return (ref as { ref: string }).ref;
}

function skippedResult(
  contract: PbpDerivationContract,
  reason: string,
): PbpCurrencyConversionResult {
  return {
    status: "skipped",
    mode: "exact",
    value: undefined as unknown as PbpCurrencyConversionResult["value"],
    trace: {} as PbpCurrencyConversionTrace,
    provenance: {
      derivationRef: "currency-conversion",
      implementationVersion: contract.implementationVersion,
      inputDigests: [],
    },
    formulaDescription: reason,
  };
}

function failedResult(
  contract: PbpDerivationContract,
  errorCode: string,
  reason: string,
): PbpCurrencyConversionResult {
  return {
    status: "failed",
    mode: "exact",
    value: undefined as unknown as PbpCurrencyConversionResult["value"],
    trace: {} as PbpCurrencyConversionTrace,
    provenance: {
      derivationRef: "currency-conversion",
      implementationVersion: contract.implementationVersion,
      inputDigests: [],
    },
    formulaDescription: `${errorCode}: ${reason}`,
  };
}
