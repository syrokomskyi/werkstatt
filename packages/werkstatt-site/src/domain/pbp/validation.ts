/**
 * PBP validation utilities — decimal, money range, HTML, empty value.
 *
 * @see pbp-specification-package/entity-model §4.3 (Decimal), §4.5 (MoneyRange)
 * @see pbp-specification-package/decision-log ADR-012, ADR-037, ADR-038
 * @see RFC-0400
 */

import type { PbpMoneyRange } from "./primitives.js";

export const DECIMAL_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

export function validateDecimal(value: string): boolean {
  return DECIMAL_RE.test(value);
}

export function validateMoneyRange(
  range: PbpMoneyRange,
): { ok: true } | { ok: false; reason: string } {
  if (range.minimum.currency !== range.maximum.currency) {
    return {
      ok: false,
      reason: `Currency mismatch: minimum="${range.minimum.currency}", maximum="${range.maximum.currency}". Both bounds MUST use the same currency.`,
    };
  }
  return { ok: true };
}

const HTML_TAG_RE = /<[a-z][\s\S]*?>/i;

export function containsHtml(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

export function isEmptyValue(value: string): boolean {
  return value.trim() === "";
}
