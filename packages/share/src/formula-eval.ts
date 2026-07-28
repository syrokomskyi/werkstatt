/*
<MODULE_CONTRACT>
<purpose>RFC-0570 formula evaluation module — extracts numeric values from field strings,
scans text for =(...) formula expressions, and evaluates arithmetic over content references
using a sandboxed math parser (expr-eval).</purpose>
<non-goals>
  <item>Do not resolve content references directly — use resolveReference from @warpgogol/share/content-reference.</item>
  <item>Do not format results with locale-specific thousands separators — formula output is a bare number.</item>
  <item>Do not support non-arithmetic expressions (string concatenation, conditionals, date math).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0570: Initial implementation of formula evaluation for content references.</item>
</CHANGE_SUMMARY>
*/

import { Parser } from "expr-eval";
import type { ContentRefIndex } from "./content-reference.ts";
import { resolveReference } from "./content-reference.ts";

export interface FormulaResolution {
  value: string;
  resolved: boolean;
  error?: string;
}

export interface FormulaMatch {
  start: number;
  end: number;
  expression: string;
}

const parser = new Parser();

const REF_IN_FORMULA_PATTERN = /[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+/g;

const FORMULA_PREFIX = "=(";

/**
 * Extracts a numeric value from a field string.
 * Handles: leading number, thin-space (\u202f) / period / comma thousands separators,
 * comma decimal separator (German), negative numbers.
 * Strips non-numeric prefix/suffix.
 * Returns null for non-numeric values.
 */
export function extractNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Remove currency symbols, units, and non-numeric prefix/suffix
  // Keep: digits, period, comma, minus, plus, thin space, regular space
  const cleaned = trimmed
    .replace(/^[^0-9\-+]+/, "") // strip non-numeric prefix
    .replace(/[^0-9.,\-\u202f\s+]+$/, "") // strip non-numeric suffix
    .replace(/\u202f/g, "") // thin space thousands separator
    .replace(/\s/g, "") // regular space thousands separator
    .trim();

  if (cleaned === "" || cleaned === "-" || cleaned === "+") return null;

  // Detect format: if both period and comma are present, period=thousands, comma=decimal (German)
  // If only comma is present, it's a decimal separator (German)
  // If only period is present, it's a decimal separator (English)
  let normalized: string;
  const hasPeriod = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasPeriod && hasComma) {
    // Period = thousands, comma = decimal (German format: 1.040,50)
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Comma = decimal (German format: 70,50)
    normalized = cleaned.replace(",", ".");
  } else if (hasPeriod) {
    // Period only: could be thousands (German: 1.040) or decimal (English: 70.50)
    // Heuristic: if the period is followed by exactly 3 digits and nothing after,
    // treat as thousands separator. Otherwise treat as decimal.
    const periodIndex = cleaned.lastIndexOf(".");
    const afterPeriod = cleaned.slice(periodIndex + 1);
    if (/^\d{3}$/.test(afterPeriod) && cleaned.indexOf(".") === periodIndex) {
      // Single period followed by exactly 3 digits → thousands separator
      normalized = cleaned.replace(/\./g, "");
    } else {
      normalized = cleaned;
    }
  } else {
    normalized = cleaned;
  }

  const result = Number.parseFloat(normalized);
  return Number.isFinite(result) ? result : null;
}

/**
 * Scans text for =(...) formula patterns using a paren-depth counter
 * to handle nested parentheses: =(a + (b * c)) is matched correctly.
 * Returns an array of { start, end, expression } for each formula found.
 * Fast path: returns [] immediately if text does not contain "=(".
 */
export function scanFormulas(text: string): FormulaMatch[] {
  if (!text.includes(FORMULA_PREFIX)) return [];

  const matches: FormulaMatch[] = [];
  let i = 0;

  while (i < text.length - 1) {
    // Look for "=(" prefix
    if (text[i] === "=" && text[i + 1] === "(") {
      const start = i;
      let depth = 1;
      let j = i + 2;

      while (j < text.length && depth > 0) {
        if (text[j] === "(") {
          depth++;
        } else if (text[j] === ")") {
          depth--;
        }
        j++;
      }

      if (depth === 0) {
        const expression = text.slice(start + 2, j - 1);
        matches.push({ start, end: j, expression });
        i = j;
      } else {
        // Unbalanced parens — skip this match
        i = start + 1;
      }
    } else {
      i++;
    }
  }

  return matches;
}

/**
 * Evaluates a formula expression after substituting all content references.
 * Uses expr-eval for sandboxed arithmetic.
 * Returns { value, resolved, error? } with REF-06..09 error codes.
 */
export function resolveFormula(
  index: ContentRefIndex,
  expression: string,
  lang: string,
  defaultLang: string,
): FormulaResolution {
  // Find all content references in the expression
  const refs: string[] = [];
  const refPattern = new RegExp(REF_IN_FORMULA_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = refPattern.exec(expression)) !== null) {
    const candidate = match[0];
    const collectionMatch = candidate.match(/^([a-z][a-z-]*)\./);
    if (!collectionMatch) continue;
    const collection = collectionMatch[1];
    if (!index.entries[collection]) continue;
    refs.push(candidate);
  }

  // Resolve each reference and extract numeric value
  let substitutedExpression = expression;

  for (const ref of refs) {
    const result = resolveReference(index, ref, lang, defaultLang);
    if (!result.resolved) {
      return {
        value: "",
        resolved: false,
        error: `REF-06: Formula reference unresolved: ${ref}`,
      };
    }

    const numeric = extractNumeric(result.value);
    if (numeric === null) {
      return {
        value: "",
        resolved: false,
        error: `REF-07: Formula operand not numeric: ${ref} resolved to "${String(result.value)}"`,
      };
    }

    substitutedExpression = substitutedExpression.replaceAll(ref, String(numeric));
  }

  // Evaluate the arithmetic expression
  try {
    const expr = parser.parse(substitutedExpression);
    const result = expr.evaluate();

    if (typeof result !== "number" || !Number.isFinite(result)) {
      // Check for division by zero (expr-eval returns Infinity, not an error)
      if (typeof result === "number" && !Number.isFinite(result)) {
        return {
          value: "",
          resolved: false,
          error: `REF-09: Formula division by zero: ${expression}`,
        };
      }
      return {
        value: "",
        resolved: false,
        error: `REF-08: Formula produced non-numeric result: ${expression}`,
      };
    }

    return {
      value: String(result),
      resolved: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("divide") && message.includes("zero")) {
      return {
        value: "",
        resolved: false,
        error: `REF-09: Formula division by zero: ${expression}`,
      };
    }

    return {
      value: "",
      resolved: false,
      error: `REF-08: Formula syntax error: ${message}`,
    };
  }
}
