import { describe, it, expect } from "vitest";
import {
  BUSINESS_SCHEMA_ID,
  PRODUCT_SCHEMA_ID,
  PBP_PRODUCT_KINDS,
  isPbpProductKind,
  CLAIM_SCHEMA_ID,
  PBP_CLAIM_CLASSES,
  PBP_CLAIM_KINDS,
  CURRENCY_PRICING_POLICY_SCHEMA_ID,
  PBP_CURRENCY_STRATEGIES,
  isPbpCurrencyStrategy,
} from "../src/index.js";

describe("RFC-0403: Business", () => {
  it("exports BUSINESS_SCHEMA_ID", () => {
    expect(BUSINESS_SCHEMA_ID).toBe("pbp/business@1");
  });
});

describe("RFC-0404: Product", () => {
  it("exports PRODUCT_SCHEMA_ID", () => {
    expect(PRODUCT_SCHEMA_ID).toBe("pbp/product@1");
  });

  it("has 13 product kinds", () => {
    expect(PBP_PRODUCT_KINDS).toHaveLength(13);
  });

  it("isPbpProductKind validates known kinds", () => {
    expect(isPbpProductKind("service")).toBe(true);
    expect(isPbpProductKind("composite-service")).toBe(true);
    expect(isPbpProductKind("unknown")).toBe(false);
  });
});

describe("RFC-0405: Claim", () => {
  it("exports CLAIM_SCHEMA_ID", () => {
    expect(CLAIM_SCHEMA_ID).toBe("pbp/claim@1");
  });

  it("has claim classes", () => {
    expect(PBP_CLAIM_CLASSES).toHaveLength(6);
    expect(PBP_CLAIM_CLASSES).toContain("comparative-commercial");
  });

  it("has claim kinds", () => {
    expect(PBP_CLAIM_KINDS).toHaveLength(6);
    expect(PBP_CLAIM_KINDS).toContain("risk");
  });
});

describe("RFC-0736: CurrencyPricingPolicy", () => {
  it("exports CURRENCY_PRICING_POLICY_SCHEMA_ID", () => {
    expect(CURRENCY_PRICING_POLICY_SCHEMA_ID).toBe("pbp/currency-pricing-policy@1");
  });

  it("has 2 currency strategies", () => {
    expect(PBP_CURRENCY_STRATEGIES).toHaveLength(2);
    expect(PBP_CURRENCY_STRATEGIES).toContain("derived");
    expect(PBP_CURRENCY_STRATEGIES).toContain("fixed");
  });

  it("isPbpCurrencyStrategy validates known strategies", () => {
    expect(isPbpCurrencyStrategy("derived")).toBe(true);
    expect(isPbpCurrencyStrategy("fixed")).toBe(true);
    expect(isPbpCurrencyStrategy("unknown")).toBe(false);
  });
});
