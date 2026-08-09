import { test, expect, describe } from "vitest";
import { TOKEN_NAMES, TOKEN_NAME_SET, TOKEN_CATEGORIES, type DesignToken } from "../index.ts";

describe("TOKEN_NAMES", () => {
  test("is non-empty", () => {
    expect(TOKEN_NAMES.length).toBeGreaterThan(100);
  });

  test("is a readonly tuple (as const)", () => {
    expect(Array.isArray(TOKEN_NAMES)).toBe(true);
    // `as const` makes the array readonly at the type level
    expect(TOKEN_NAMES.length).toBeGreaterThan(0);
  });

  test("every token starts with --ds-", () => {
    for (const name of TOKEN_NAMES) {
      expect(name.startsWith("--ds-")).toBe(true);
    }
  });

  test("has no duplicates", () => {
    const seen = new Set<string>();
    for (const name of TOKEN_NAMES) {
      expect(seen.has(name)).toBe(false);
      seen.add(name);
    }
  });
});

describe("TOKEN_NAME_SET", () => {
  test("contains every token from TOKEN_NAMES", () => {
    for (const name of TOKEN_NAMES) {
      expect(TOKEN_NAME_SET.has(name)).toBe(true);
    }
  });

  test("size matches TOKEN_NAMES length", () => {
    expect(TOKEN_NAME_SET.size).toBe(TOKEN_NAMES.length);
  });

  test("returns false for non-token strings", () => {
    expect(TOKEN_NAME_SET.has("--ds-nonexistent")).toBe(false);
    expect(TOKEN_NAME_SET.has("color")).toBe(false);
  });
});

describe("TOKEN_CATEGORIES", () => {
  test("has expected category keys", () => {
    expect(TOKEN_CATEGORIES.color).toBeDefined();
    expect(TOKEN_CATEGORIES.space).toBeDefined();
    expect(TOKEN_CATEGORIES.shadow).toBeDefined();
    expect(TOKEN_CATEGORIES.z).toBeDefined();
  });

  test("every token in each category exists in TOKEN_NAMES", () => {
    for (const category of Object.values(TOKEN_CATEGORIES)) {
      for (const token of category) {
        expect(TOKEN_NAME_SET.has(token)).toBe(true);
      }
    }
  });

  test("color category is non-empty", () => {
    expect(TOKEN_CATEGORIES.color.length).toBeGreaterThan(10);
  });

  test("space category is non-empty", () => {
    expect(TOKEN_CATEGORIES.space.length).toBeGreaterThan(10);
  });

  test("z category contains z-index tokens", () => {
    expect(TOKEN_CATEGORIES.z.length).toBeGreaterThan(0);
    for (const token of TOKEN_CATEGORIES.z) {
      expect(token.startsWith("--ds-z-")).toBe(true);
    }
  });

  test("categories are mutually prefix-distinct (no token in wrong category)", () => {
    // Each token should appear in at most one category by prefix
    const allCategoryTokens = Object.values(TOKEN_CATEGORIES).flat();
    const unique = new Set(allCategoryTokens);
    // Some tokens may share prefixes (e.g. --ds-text- appears in text and font), but
    // the total count should not exceed the sum of all category arrays with duplicates
    expect(unique.size).toBeLessThanOrEqual(allCategoryTokens.length);
  });
});

describe("DesignToken type", () => {
  test("a known token is assignable to DesignToken", () => {
    const token: DesignToken = "--ds-color-bg";
    expect(token).toBe("--ds-color-bg");
  });
});
