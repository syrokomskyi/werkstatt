/*
<MODULE_CONTRACT>
<purpose>Unit tests for shared deepMerge utility with JSON Merge Patch semantics.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0781 — tests for null-delete, undefined skip, nested merge, array replacement.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { deepMerge, isPlainObject } from "../utils/deep-merge.js";

type Obj = Record<string, unknown>;
const dm = (base: Obj, overlay: Obj): Obj => deepMerge(base, overlay) as Obj;

describe("isPlainObject", () => {
  it("returns true for plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("returns false for arrays", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2])).toBe(false);
  });

  it("returns false for null and primitives", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject("string")).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });

  it("returns false for class instances", () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Set())).toBe(false);
    expect(isPlainObject(/regex/)).toBe(false);
  });
});

describe("deepMerge", () => {
  it("merges nested objects recursively", () => {
    const base = { a: { b: 1, c: 2 }, d: 3 };
    const overlay = { a: { b: 10 } };
    const result = dm(base, overlay);
    expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3 });
  });

  it("deletes keys when overlay value is null", () => {
    const base = { a: 1, b: 2, c: { d: 3 } };
    const overlay = { a: null, c: { d: null } };
    const result = dm(base, overlay);
    expect(result).toEqual({ b: 2, c: {} });
  });

  it("retains base value when overlay value is undefined", () => {
    const base = { a: 1, b: 2 };
    const overlay = { a: undefined, c: 3 };
    const result = dm(base, overlay);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("replaces arrays wholesale", () => {
    const base = { items: [1, 2, 3] };
    const overlay = { items: [4, 5] };
    const result = dm(base, overlay);
    expect(result).toEqual({ items: [4, 5] });
  });

  it("replaces primitives wholesale", () => {
    const base = { count: 5, name: "old" };
    const overlay = { count: 10, name: "new" };
    const result = dm(base, overlay);
    expect(result).toEqual({ count: 10, name: "new" });
  });

  it("replaces class instances wholesale (Date)", () => {
    const oldDate = new Date("2026-01-01");
    const newDate = new Date("2026-07-01");
    const base = { created: oldDate };
    const overlay = { created: newDate };
    const result = dm(base, overlay);
    expect(result).toEqual({ created: newDate });
    expect(result.created).toBe(newDate);
  });

  it("handles empty overlay object", () => {
    const base = { a: 1, b: { c: 2 } };
    const overlay = {};
    const result = dm(base, overlay);
    expect(result).toEqual({ a: 1, b: { c: 2 } });
  });

  it("handles empty base object", () => {
    const base = {};
    const overlay = { a: 1, b: { c: 2 } };
    const result = dm(base, overlay);
    expect(result).toEqual({ a: 1, b: { c: 2 } });
  });

  it("does not mutate inputs", () => {
    const base = { a: { b: 1 } };
    const overlay = { a: { c: 2 } };
    const baseCopy = JSON.parse(JSON.stringify(base));
    const overlayCopy = JSON.parse(JSON.stringify(overlay));
    dm(base, overlay);
    expect(base).toEqual(baseCopy);
    expect(overlay).toEqual(overlayCopy);
  });

  it("returns overlay when base is not a plain object", () => {
    const base = "string";
    const overlay = { a: 1 };
    const result = dm(base as unknown as Obj, overlay);
    expect(result).toBe(overlay);
  });

  it("returns base when overlay is not a plain object", () => {
    const base = { a: 1 };
    const overlay = null;
    const result = dm(base, overlay as unknown as Obj);
    expect(result).toBe(base);
  });

  it("handles deep nesting with mixed operations", () => {
    const base = {
      level1: {
        level2: {
          keep: "retained",
          remove: "deleted",
          replace: "old",
        },
        other: " stays",
      },
      top: "remains",
    };
    const overlay = {
      level1: {
        level2: {
          remove: null,
          replace: "new",
          added: "fresh",
        },
      },
    };
    const result = dm(base, overlay);
    expect(result).toEqual({
      level1: {
        level2: {
          keep: "retained",
          replace: "new",
          added: "fresh",
        },
        other: " stays",
      },
      top: "remains",
    });
  });
});
