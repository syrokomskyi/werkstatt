import { describe, it, expect } from "vitest";
import {
  generateEntries,
  parseBlueprint,
  resolvePolicy,
  resolveSlug,
  type Blueprint,
  type LocalizedUniverse,
} from "@gogol/surface";

/**
 * RFC-0199: per-language slug segments must localize the emitted URL while page identity
 * (pageId / matrix tuple) stays language-neutral. These tests lock that contract: changing the
 * LocalizedUniverse changes routes but never pageIds, and an absent localized slug falls back to
 * the neutral value (byte-identical to pre-RFC-0199 behavior).
 */

function blueprint(): Blueprint {
  const parsed = parseBlueprint({
    id: "test-local",
    entitlement: "pseo",
    dataset: { collection: "industries" },
    axes: [
      {
        id: "industry",
        universe: { collection: "industries", field: "slug" },
        match: { recordField: "industries" },
      },
    ],
    levels: [
      { depth: 0, slug: { de: "website", uk: "sait" }, constellation: "x" },
      { depth: 1, slug: { de: "website/{industry}", uk: "sait/{industry}" }, constellation: "x" },
    ],
    policy: { minRecordsPerDepth: { 0: 1, 1: 1 } },
  });
  if (!parsed.ok || !parsed.blueprint) throw new Error(parsed.errors.join("; "));
  return parsed.blueprint;
}

const data = {
  records: [{ slug: "elektriker", industries: ["elektriker"], status: "active" as const }],
  universes: { industry: ["elektriker"] },
  langs: ["de", "uk"] as const,
};

const localized: LocalizedUniverse = {
  industry: new Map([["elektriker", { neutral: "elektriker", byLang: { uk: "elektryk" } }]]),
};

describe("RFC-0199 localized slugs", () => {
  it("localizes the uk URL segment from the record slug override", () => {
    const bp = blueprint();
    const entries = generateEntries(bp, {
      ...data,
      langs: [...data.langs],
      localizedUniverse: localized,
    });
    const leaf = entries.find((e) => e.depth === 1)!;
    expect(leaf.routes.de).toBe("website/elektriker");
    expect(leaf.routes.uk).toBe("sait/elektryk");
  });

  it("falls back to the neutral slug when no localized slug is declared", () => {
    const bp = blueprint();
    const entries = generateEntries(bp, { ...data, langs: [...data.langs] }); // no localizedUniverse
    const leaf = entries.find((e) => e.depth === 1)!;
    expect(leaf.routes.de).toBe("website/elektriker");
    expect(leaf.routes.uk).toBe("sait/elektriker"); // neutral fallback
  });

  it("keeps pageId identity language-neutral regardless of localization", () => {
    const bp = blueprint();
    const withLoc = generateEntries(bp, {
      ...data,
      langs: [...data.langs],
      localizedUniverse: localized,
    });
    const noLoc = generateEntries(bp, { ...data, langs: [...data.langs] });
    const ids = (es: typeof withLoc) => es.map((e) => e.pageId).sort();
    // Identity (pageIds + their neutral axis tuples) is identical whether or not slugs localize.
    expect(ids(withLoc)).toEqual(ids(noLoc));
    const leafLoc = withLoc.find((e) => e.depth === 1)!;
    const leafNo = noLoc.find((e) => e.depth === 1)!;
    expect(leafLoc.pageId).toBe(leafNo.pageId);
    expect(leafLoc.axes).toEqual(leafNo.axes);
    expect(leafLoc.axes.industry).toBe("elektriker"); // neutral, never the localized "elektryk"
  });

  it("resolveSlug substitutes per-language segments with neutral fallback", () => {
    const bp = blueprint();
    const pattern = resolvePolicy(bp).segmentPattern;
    // resolveSlug substitutes only the {token}; the static prefix is whatever the template carries.
    expect(
      resolveSlug("sait/{industry}", { industry: "elektriker" }, "uk", localized, pattern),
    ).toBe("sait/elektryk");
    expect(
      resolveSlug("website/{industry}", { industry: "elektriker" }, "de", localized, pattern),
    ).toBe("website/elektriker");
    // Empty universe ⇒ neutral fallback (legacy behavior).
    expect(resolveSlug("sait/{industry}", { industry: "elektriker" }, "uk", {}, pattern)).toBe(
      "sait/elektriker",
    );
  });
});
