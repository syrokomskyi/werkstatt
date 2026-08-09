/*
<MODULE_CONTRACT>
<purpose>Unit tests for RFC-0570 formula evaluation module — extractNumeric, scanFormulas, resolveFormula.
RFC-0729: pipe syntax, formatter registry, money formatter, REF-10 error.</purpose>
</MODULE_CONTRACT>
*/

import { describe, it, expect } from "vitest";
import {
  extractNumeric,
  scanFormulas,
  resolveFormula,
  registerPipeFormatter,
  getPipeFormatter,
} from "../formula-eval.ts";
import type { ContentRefIndex, SourceRef } from "../content-reference.ts";
import { EMPTY_CONTENT_REF_INDEX } from "../content-reference.ts";

describe("extractNumeric", () => {
  it("extracts number from string with currency suffix", () => {
    expect(extractNumeric("200 €")).toBe(200);
  });

  it("extracts number with thin space thousands separator", () => {
    expect(extractNumeric("1\u202f040 €")).toBe(1040);
  });

  it("extracts number with period thousands separator (German)", () => {
    expect(extractNumeric("1.040 €")).toBe(1040);
  });

  it("extracts number with comma decimal separator (German)", () => {
    expect(extractNumeric("70,50 €")).toBe(70.5);
  });

  it("extracts negative number", () => {
    expect(extractNumeric("-200 €")).toBe(-200);
  });

  it("extracts number with unit suffix", () => {
    expect(extractNumeric("70 €/Monat")).toBe(70);
  });

  it("extracts plain number string", () => {
    expect(extractNumeric("1040")).toBe(1040);
  });

  it("extracts number with period decimal separator", () => {
    expect(extractNumeric("70.50")).toBe(70.5);
  });

  it("extracts number with both period thousands and comma decimal (German)", () => {
    expect(extractNumeric("1.040,50 €")).toBe(1040.5);
  });

  it("returns null for non-numeric string", () => {
    expect(extractNumeric("no number")).toBeNull();
  });

  it("returns null for null", () => {
    expect(extractNumeric(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(extractNumeric(undefined)).toBeNull();
  });

  it("returns null for boolean", () => {
    expect(extractNumeric(true)).toBeNull();
  });

  it("returns number for number input", () => {
    expect(extractNumeric(200)).toBe(200);
  });

  it("returns null for NaN", () => {
    expect(extractNumeric(Number.NaN)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractNumeric("")).toBeNull();
  });
});

describe("scanFormulas", () => {
  it("returns empty array for text without formulas", () => {
    expect(scanFormulas("no formula here")).toEqual([]);
  });

  it("returns empty array for text without =( prefix", () => {
    expect(scanFormulas("(a + b) without prefix")).toEqual([]);
  });

  it("scans simple formula", () => {
    const result = scanFormulas("=(a + b)");
    expect(result).toHaveLength(1);
    expect(result[0].expression).toBe("a + b");
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(8);
  });

  it("scans formula with nested parentheses", () => {
    const result = scanFormulas("=(a + (b * c))");
    expect(result).toHaveLength(1);
    expect(result[0].expression).toBe("a + (b * c)");
  });

  it("scans multiple formulas in text", () => {
    const result = scanFormulas("text =(a) more =(b) end");
    expect(result).toHaveLength(2);
    expect(result[0].expression).toBe("a");
    expect(result[1].expression).toBe("b");
  });

  it("scans formula with surrounding text", () => {
    const result = scanFormulas("Total: =(a + b * 12) €");
    expect(result).toHaveLength(1);
    expect(result[0].expression).toBe("a + b * 12");
  });

  it("handles unbalanced parentheses gracefully", () => {
    const result = scanFormulas("=(a + b");
    expect(result).toEqual([]);
  });

  it("fast path: returns empty array when text lacks =( prefix", () => {
    expect(scanFormulas("just some text without any formula")).toEqual([]);
  });
});

describe("resolveFormula", () => {
  const mockIndex: ContentRefIndex = {
    version: 1,
    generatedAt: "2026-01-01",
    collections: ["business-profile"],
    entries: {
      "business-profile": {
        "offerings/digital-foundation": {
          de: {
            presentation: {
              price: {
                setup: "200 €",
                monthly: "70 €",
              },
            },
          },
        },
      },
    },
  };

  it("resolves formula with two references and arithmetic", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.setup + business-profile.offerings/digital-foundation.presentation.price.monthly * 12",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("1040");
  });

  it("resolves formula with numeric literal and reference", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.setup + 100",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("300");
  });

  it("resolves formula with nested parentheses", () => {
    const result = resolveFormula(
      mockIndex,
      "(business-profile.offerings/digital-foundation.presentation.price.setup + business-profile.offerings/digital-foundation.presentation.price.monthly) * 2",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("540");
  });

  it("returns REF-06 for unresolved reference", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/nonexistent.presentation.price.setup + 100",
      "de",
      "de",
    );
    expect(result.resolved).toBe(false);
    expect(result.error).toContain("REF-06");
  });

  it("returns REF-07 for non-numeric operand", () => {
    const indexWithNonNumeric: ContentRefIndex = {
      ...mockIndex,
      entries: {
        "business-profile": {
          "offerings/digital-foundation": {
            de: {
              presentation: {
                price: {
                  setup: "not a number",
                  monthly: "70 €",
                },
              },
            },
          },
        },
      },
    };
    const result = resolveFormula(
      indexWithNonNumeric,
      "business-profile.offerings/digital-foundation.presentation.price.setup + 100",
      "de",
      "de",
    );
    expect(result.resolved).toBe(false);
    expect(result.error).toContain("REF-07");
  });

  it("returns REF-08 for syntax error", () => {
    const result = resolveFormula(mockIndex, "200 +", "de", "de");
    expect(result.resolved).toBe(false);
    expect(result.error).toContain("REF-08");
  });

  it("returns REF-09 for division by zero", () => {
    const result = resolveFormula(mockIndex, "200 / 0", "de", "de");
    expect(result.resolved).toBe(false);
    expect(result.error).toContain("REF-09");
  });

  it("resolves formula with empty index (no refs, pure arithmetic)", () => {
    const result = resolveFormula(EMPTY_CONTENT_REF_INDEX, "200 + 300", "de", "de");
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("500");
  });

  it("RFC-0723: returns string value for single-ref expression with non-numeric value", () => {
    const indexWithStringValue: ContentRefIndex = {
      ...mockIndex,
      entries: {
        "business-profile": {
          "offerings/digital-foundation": {
            de: {
              presentation: {
                price: {
                  setup: "200 €",
                  monthly: "70 €",
                },
                tagline: "Digitales Fundament",
              },
            },
          },
        },
      },
    };
    const result = resolveFormula(
      indexWithStringValue,
      "business-profile.offerings/digital-foundation.presentation.tagline",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("Digitales Fundament");
  });

  it("RFC-0723: returns full string value for single-ref expression with numeric value", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.setup",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("200 €");
  });

  it("RFC-0723: returns REF-07 for multi-ref expression with non-numeric operand", () => {
    const indexWithNonNumeric: ContentRefIndex = {
      ...mockIndex,
      entries: {
        "business-profile": {
          "offerings/digital-foundation": {
            de: {
              presentation: {
                price: {
                  setup: "not a number",
                  monthly: "70 €",
                },
              },
            },
          },
        },
      },
    };
    const result = resolveFormula(
      indexWithNonNumeric,
      "business-profile.offerings/digital-foundation.presentation.price.setup + business-profile.offerings/digital-foundation.presentation.price.monthly",
      "de",
      "de",
    );
    expect(result.resolved).toBe(false);
    expect(result.error).toContain("REF-07");
  });
});

describe("RFC-0729: pipe syntax", () => {
  const mockIndex: ContentRefIndex = {
    version: 1,
    generatedAt: "2026-01-01",
    collections: ["business-profile"],
    entries: {
      "business-profile": {
        "offerings/digital-foundation": {
          de: {
            presentation: {
              price: {
                setup: "200 €",
                monthly: "70 €",
              },
            },
          },
        },
      },
    },
  };

  it("formats with money formatter in German locale", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.monthly | money currency=EUR locale=de",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("70\u00A0€");
  });

  it("formats with money formatter in Ukrainian locale", () => {
    const indexWithUk: ContentRefIndex = {
      ...mockIndex,
      entries: {
        "business-profile": {
          "offerings/digital-foundation": {
            de: {
              presentation: {
                price: { setup: "200 €", monthly: "70 €" },
              },
            },
            uk: {
              presentation: {
                price: { setup: "200 €", monthly: "70 €" },
              },
            },
          },
        },
      },
    };
    const result = resolveFormula(
      indexWithUk,
      "business-profile.offerings/digital-foundation.presentation.price.monthly | money currency=EUR locale=uk",
      "uk",
      "uk",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("70\u00A0€");
  });

  it("formats with currency conversion to UAH in German locale", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.monthly | money currency=EUR locale=de targetCurrency=UAH rate=45",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("3.150\u00A0₴");
  });

  it("formats arithmetic result with pipe", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.monthly * 12 | money currency=EUR locale=de",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("840\u00A0€");
  });

  it("preserves existing behavior for expressions without pipe", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.monthly * 12",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("840");
  });

  it("preserves RFC-0723 single-ref string return without pipe", () => {
    const indexWithString: ContentRefIndex = {
      ...mockIndex,
      entries: {
        "business-profile": {
          "offerings/digital-foundation": {
            de: {
              presentation: {
                price: {
                  setup: "200 €",
                  monthly: "70 €",
                },
                tagline: "Digitales Fundament",
              },
            },
          },
        },
      },
    };
    const result = resolveFormula(
      indexWithString,
      "business-profile.offerings/digital-foundation.presentation.tagline",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("Digitales Fundament");
  });

  it("uses context.lang as default locale when no locale param", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.monthly | money currency=EUR",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("70\u00A0€");
  });
});

describe("RFC-0729: formatter registry", () => {
  it("registers and retrieves a custom formatter", () => {
    const customFn = (_value: number, _params: Record<string, string>) => "custom";
    registerPipeFormatter("custom-test", customFn);
    expect(getPipeFormatter("custom-test")).toBe(customFn);
  });

  it("returns undefined for unregistered formatter", () => {
    expect(getPipeFormatter("nonexistent-formatter")).toBeUndefined();
  });

  it("money formatter is registered by default", () => {
    expect(getPipeFormatter("money")).toBeDefined();
  });
});

describe("RFC-0729: REF-10 unknown formatter", () => {
  const mockIndex: ContentRefIndex = {
    version: 1,
    generatedAt: "2026-01-01",
    collections: ["business-profile"],
    entries: {
      "business-profile": {
        "offerings/digital-foundation": {
          de: {
            presentation: {
              price: {
                setup: "200 €",
                monthly: "70 €",
              },
            },
          },
        },
      },
    },
  };

  it("returns REF-10 for unknown formatter name", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.monthly | unknownFormatter",
      "de",
      "de",
    );
    expect(result.resolved).toBe(false);
    expect(result.error).toContain("REF-10");
    expect(result.error).toContain("unknownFormatter");
  });

  it("returns REF-10 for empty formatter name", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.monthly |",
      "de",
      "de",
    );
    expect(result.resolved).toBe(false);
    expect(result.error).toContain("REF-10");
  });
});

describe("RFC-0729: invalid rate param", () => {
  const mockIndex: ContentRefIndex = {
    version: 1,
    generatedAt: "2026-01-01",
    collections: ["business-profile"],
    entries: {
      "business-profile": {
        "offerings/digital-foundation": {
          de: {
            presentation: {
              price: {
                setup: "200 €",
                monthly: "70 €",
              },
            },
          },
        },
      },
    },
  };

  it("ignores conversion when rate is non-numeric", () => {
    const result = resolveFormula(
      mockIndex,
      "business-profile.offerings/digital-foundation.presentation.price.monthly | money currency=EUR locale=de targetCurrency=UAH rate=abc",
      "de",
      "de",
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("70\u00A0€");
  });
});

describe("RFC-0731: this. self-reference in formulas", () => {
  const mockIndex: ContentRefIndex = {
    version: 1,
    generatedAt: "2026-01-01",
    collections: ["business-profile"],
    entries: {
      "business-profile": {
        "offerings/digital-foundation": {
          de: {
            pricing: {
              charges: {
                monthlySubscription: { amount: { value: "70.00" } },
                setup: { amount: { value: "200.00" } },
              },
            },
            presentation: {
              price: {
                setup: "200 €",
                monthly: "70 €",
              },
            },
          },
        },
      },
    },
  };

  const sourceRef: SourceRef = {
    collection: "business-profile",
    file: "offerings/digital-foundation",
  };

  it("resolves this. in arithmetic formula expression", () => {
    const result = resolveFormula(
      mockIndex,
      "this.pricing.charges.monthlySubscription.amount.value + this.pricing.charges.setup.amount.value",
      "de",
      "de",
      sourceRef,
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("270");
  });

  it("resolves this. as single-ref string interpolation =(this.field)", () => {
    const result = resolveFormula(
      mockIndex,
      "this.presentation.price.monthly",
      "de",
      "de",
      sourceRef,
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toBe("70 €");
  });

  it("resolves this. with pipe formatter =(this.field | money)", () => {
    const result = resolveFormula(
      mockIndex,
      "this.pricing.charges.monthlySubscription.amount.value | money currency=EUR locale=de",
      "de",
      "de",
      sourceRef,
    );
    expect(result.resolved).toBe(true);
    expect(result.value).toContain("70");
  });

  it("returns REF-12 when this. is used without sourceRef", () => {
    const result = resolveFormula(
      mockIndex,
      "this.pricing.charges.monthlySubscription.amount.value",
      "de",
      "de",
    );
    expect(result.resolved).toBe(false);
    expect(result.error).toContain("REF-12");
  });
});
