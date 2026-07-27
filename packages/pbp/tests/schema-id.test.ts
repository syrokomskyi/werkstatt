import { describe, it, expect } from "vitest";
import {
  PBP_NAMESPACE,
  PBP_MAJOR_VERSION,
  pbpSchemaId,
  validateSchemaId,
} from "../src/schema-id.js";

describe("pbpSchemaId", () => {
  it("produces pbp/{entity}@1 pattern", () => {
    expect(pbpSchemaId("business")).toBe("pbp/business@1");
    expect(pbpSchemaId("product")).toBe("pbp/product@1");
    expect(pbpSchemaId("catalog-entry")).toBe("pbp/catalog-entry@1");
    expect(pbpSchemaId("offering")).toBe("pbp/offering@1");
  });

  it("uses the PBP_NAMESPACE and PBP_MAJOR_VERSION constants", () => {
    expect(PBP_NAMESPACE).toBe("pbp");
    expect(PBP_MAJOR_VERSION).toBe(1);
  });
});

describe("validateSchemaId", () => {
  it("returns entity and major for valid schema IDs", () => {
    expect(validateSchemaId("pbp/business@1")).toEqual({
      entity: "business",
      major: 1,
    });
    expect(validateSchemaId("pbp/catalog-entry@1")).toEqual({
      entity: "catalog-entry",
      major: 1,
    });
  });

  it("throws for wrong namespace", () => {
    expect(() => validateSchemaId("foo/business@1")).toThrow(/Invalid PBP schema ID/);
  });

  it("throws for missing @N", () => {
    expect(() => validateSchemaId("pbp/business")).toThrow(/Invalid PBP schema ID/);
  });

  it("throws for empty entity", () => {
    expect(() => validateSchemaId("pbp/@1")).toThrow(/Invalid PBP schema ID/);
  });

  it("throws for uppercase entity", () => {
    expect(() => validateSchemaId("pbp/Business@1")).toThrow(/Invalid PBP schema ID/);
  });
});
