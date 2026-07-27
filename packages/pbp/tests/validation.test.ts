import { describe, it, expect } from "vitest";
import {
  validateDecimal,
  validateMoneyRange,
  containsHtml,
  isEmptyValue,
  DECIMAL_RE,
} from "../src/validation.js";
import type { PbpMoneyRange } from "../src/primitives.js";

describe("validateDecimal", () => {
  it("accepts valid decimal strings", () => {
    expect(validateDecimal("70.00")).toBe(true);
    expect(validateDecimal("0")).toBe(true);
    expect(validateDecimal("199")).toBe(true);
    expect(validateDecimal("-59.00")).toBe(true);
    expect(validateDecimal("0.5")).toBe(true);
  });

  it("rejects floats with leading zeros", () => {
    expect(validateDecimal("007")).toBe(false);
    expect(validateDecimal("00.5")).toBe(false);
  });

  it("rejects scientific notation", () => {
    expect(validateDecimal("1e5")).toBe(false);
    expect(validateDecimal("1.5E-10")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(validateDecimal("")).toBe(false);
  });

  it("rejects non-numeric strings", () => {
    expect(validateDecimal("abc")).toBe(false);
    expect(validateDecimal("70.00.00")).toBe(false);
  });
});

describe("validateMoneyRange", () => {
  it("accepts ranges with same currency", () => {
    const range: PbpMoneyRange = {
      minimum: { value: "59.00", currency: "EUR" },
      maximum: { value: "199.00", currency: "EUR" },
    };
    expect(validateMoneyRange(range)).toEqual({ ok: true });
  });

  it("rejects ranges with different currencies", () => {
    const range: PbpMoneyRange = {
      minimum: { value: "59.00", currency: "EUR" },
      maximum: { value: "199.00", currency: "USD" },
    };
    const result = validateMoneyRange(range);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Currency mismatch");
    }
  });
});

describe("containsHtml", () => {
  it("returns false for plain text", () => {
    expect(containsHtml("Hello world")).toBe(false);
    expect(containsHtml("Digitales Fundament")).toBe(false);
  });

  it("returns true for HTML tags", () => {
    expect(containsHtml("Hello<br>world")).toBe(true);
    expect(containsHtml("<b>bold</b>")).toBe(true);
    expect(containsHtml("<div>content</div>")).toBe(true);
  });

  it("returns false for bare angle brackets", () => {
    expect(containsHtml("1 < 2")).toBe(false);
    expect(containsHtml("x > y")).toBe(false);
  });
});

describe("isEmptyValue", () => {
  it("returns true for empty strings", () => {
    expect(isEmptyValue("")).toBe(true);
  });

  it("returns true for whitespace-only strings", () => {
    expect(isEmptyValue("   ")).toBe(true);
    expect(isEmptyValue("\t\n")).toBe(true);
  });

  it("returns false for non-empty strings", () => {
    expect(isEmptyValue("hello")).toBe(false);
    expect(isEmptyValue("  x  ")).toBe(false);
  });
});
