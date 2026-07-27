import { describe, it, expect } from "vitest";
import { validateSchemaCompatibility, type PbpSchemaDefinition } from "../src/schema-evolution.js";

describe("validateSchemaCompatibility", () => {
  const base: PbpSchemaDefinition = {
    schemaId: "pbp/business@1",
    fields: [
      { name: "schema", type: "string", required: true },
      { name: "id", type: "string", required: true },
      { name: "type", type: "string", required: true },
      { name: "status", type: "PbpEntityStatus", required: true },
      { name: "name", type: "string", required: false },
    ],
  };

  it("accepts additive-only changes (new optional field)", () => {
    const after: PbpSchemaDefinition = {
      ...base,
      fields: [...base.fields, { name: "summary", type: "string", required: false }],
    };
    expect(validateSchemaCompatibility(base, after)).toEqual({ ok: true });
  });

  it("detects key renames (field removed)", () => {
    const after: PbpSchemaDefinition = {
      ...base,
      fields: base.fields.filter((f) => f.name !== "name"),
    };
    const result = validateSchemaCompatibility(base, after);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContainEqual({
        kind: "key-rename",
        field: "name",
        before: "name",
        after: "(removed)",
      });
    }
  });

  it("detects type changes", () => {
    const after: PbpSchemaDefinition = {
      ...base,
      fields: base.fields.map((f) => (f.name === "name" ? { ...f, type: "LocalizedString" } : f)),
    };
    const result = validateSchemaCompatibility(base, after);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContainEqual({
        kind: "type-change",
        field: "name",
        before: "string",
        after: "LocalizedString",
      });
    }
  });

  it("detects optional-to-required promotions", () => {
    const after: PbpSchemaDefinition = {
      ...base,
      fields: base.fields.map((f) => (f.name === "name" ? { ...f, required: true } : f)),
    };
    const result = validateSchemaCompatibility(base, after);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContainEqual({
        kind: "optional-to-required",
        field: "name",
        before: "optional",
        after: "required",
      });
    }
  });

  it("accepts identical schemas", () => {
    expect(validateSchemaCompatibility(base, base)).toEqual({ ok: true });
  });
});
