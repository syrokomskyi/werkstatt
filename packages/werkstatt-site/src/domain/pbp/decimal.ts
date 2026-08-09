/*
<MODULE_CONTRACT>
<purpose>Decimal arithmetic helpers for currency conversion derivation (RFC-0739). All operations use big.js — never binary float (pbp-specification-package/ADR-012).</purpose>
<non-goals>
  <item>Does not implement currency conversion pipeline logic — that is in derivations/currency-conversion.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0739 — decimal helpers and PbpRoundingMode primitive.</item>
</CHANGE_SUMMARY>
*/

import Big from "big.js";

/**
 * Rounding modes supported by the currency conversion pipeline.
 *
 * @see RFC-0739 §2 (Closed unions)
 */
export type PbpRoundingMode = "ceiling" | "floor" | "half-up" | "half-even";

export const PBP_ROUNDING_MODES: readonly PbpRoundingMode[] = [
  "ceiling",
  "floor",
  "half-up",
  "half-even",
] as const;

export function isPbpRoundingMode(value: string): value is PbpRoundingMode {
  return PBP_ROUNDING_MODES.includes(value as PbpRoundingMode);
}

/**
 * Multiply two decimal strings. Returns a decimal string.
 *
 * @see pbp-specification-package/ADR-012 — never use binary float.
 */
export function decimalMultiply(a: string, b: string): string {
  return Big(a).times(Big(b)).toString();
}

/**
 * Add two decimal strings. Returns a decimal string.
 */
export function decimalAdd(a: string, b: string): string {
  return Big(a).plus(Big(b)).toString();
}

/**
 * Subtract b from a. Returns a decimal string.
 */
export function decimalSubtract(a: string, b: string): string {
  return Big(a).minus(Big(b)).toString();
}

/**
 * Divide a by b with the given precision (decimal places after the decimal point).
 *
 * Precision = target currency decimal places + 2 guard digits.
 * For example, UAH (2 decimal places) → precision = 4.
 * This retains enough precision for minor-unit rounding while minimizing loss.
 *
 * @see RFC-0739 §8 (Decimal arithmetic)
 */
export function decimalDivide(a: string, b: string, precision: number): string {
  return Big(a).div(Big(b)).round(precision, Big.roundHalfUp).toString();
}

/**
 * Round a decimal string using the specified mode.
 *
 * When `increment` is specified, the value is divided by the increment,
 * rounded to 0 decimal places, then multiplied back by the increment.
 * This implements "round to nearest increment" (e.g. round to nearest 10).
 *
 * When `decimalPlaces` is specified (and no increment), the value is rounded
 * to that many decimal places.
 *
 * @see RFC-0739 §4 (Rounding rules)
 */
export function decimalRound(
  value: string,
  mode: PbpRoundingMode,
  increment?: string,
  decimalPlaces?: number,
): string {
  const bigRoundMode = mapRoundingMode(mode);

  if (increment) {
    const inc = Big(increment);
    if (inc.lte(0)) {
      throw new Error(`Rounding increment must be positive, got: ${increment}`);
    }
    const quotient = Big(value).div(inc);
    const roundedQuotient = quotient.round(0, bigRoundMode);
    return roundedQuotient.times(inc).toString();
  }

  const dp = decimalPlaces ?? 0;
  return Big(value).round(dp, bigRoundMode).toString();
}

function mapRoundingMode(mode: PbpRoundingMode): 0 | 1 | 2 | 3 {
  switch (mode) {
    case "ceiling":
      return Big.roundUp;
    case "floor":
      return Big.roundDown;
    case "half-up":
      return Big.roundHalfUp;
    case "half-even":
      return Big.roundHalfEven;
  }
}
