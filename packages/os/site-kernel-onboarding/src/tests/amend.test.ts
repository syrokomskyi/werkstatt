/*
<MODULE_CONTRACT>
<purpose>Unit tests for the RFC-0135 amend pure logic: the 00-amend-brief.md schema
(AmendBrief / AmendSource), the Jaccard similarity used by amend.atoms.merge, and the
source-version ordering used by the cumulative coverage ledger's supersession rule.</purpose>
<keywords>amend, rfc-0135, test, zod, similarity, version</keywords>
<responsibilities>
  <item>Verify AmendBrief accepts a well-formed brief and rejects malformed intents/ids/versions.</item>
  <item>Verify jaccardSimilarity thresholds (identical, disjoint, partial overlap).</item>
  <item>Verify isNewerVersion handles dotted numeric segments incl. v0.9 vs v0.10.</item>
</responsibilities>
<non-goals>
  <item>Do not exercise fs-backed handlers (covered by the amend dry-run).</item>
</non-goals>
</MODULE_CONTRACT>
*/

import { describe, it, expect } from "vitest";
import { AmendBrief } from "../amend.ts";
import { applySitePlanDelta } from "../amend-system-merge.ts";
import { jaccardSimilarity, isNewerVersion, splitMarkdownParagraphs } from "../amend-gates.ts";

const VALID_BRIEF = {
  amend: { batch: "amend-001", targetApp: "webgogol-com" },
  sources: [
    {
      file: "Leistungen_v0.2.md",
      sourceId: "leistungen-vertiefung",
      version: "v0.2",
      intent: "strengthen",
      pageId: "leistungen",
    },
    {
      file: "Sichtpass_v0.1.md",
      sourceId: "sichtpass",
      version: "v0.1",
      intent: "new-route",
      pageId: "sichtpass",
    },
  ],
};

describe("AmendBrief schema (RFC-0135)", () => {
  it("accepts a well-formed brief", () => {
    expect(AmendBrief.safeParse(VALID_BRIEF).success).toBe(true);
  });

  it("rejects a batch id that is not amend-<NNN>", () => {
    const bad = structuredClone(VALID_BRIEF);
    bad.amend.batch = "batch-1";
    expect(AmendBrief.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown intent", () => {
    const bad = structuredClone(VALID_BRIEF);
    (bad.sources[0] as { intent: string }).intent = "replace";
    expect(AmendBrief.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-vN version string", () => {
    const bad = structuredClone(VALID_BRIEF);
    bad.sources[0].version = "0.2";
    expect(AmendBrief.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty sources array", () => {
    const bad = structuredClone(VALID_BRIEF);
    bad.sources = [];
    expect(AmendBrief.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level keys (strict)", () => {
    const bad = { ...structuredClone(VALID_BRIEF), extra: true };
    expect(AmendBrief.safeParse(bad).success).toBe(false);
  });
});

describe("jaccardSimilarity (amend.atoms.merge guard)", () => {
  it("identical text is 1", () => {
    const text = "provenance on every claim beats interactivity";
    expect(jaccardSimilarity(text, text)).toBe(1);
  });

  it("disjoint text is 0", () => {
    expect(jaccardSimilarity("alpha bravo charlie", "delta echo foxtrot")).toBe(0);
  });

  it("partial overlap is between 0 and 1 and symmetric", () => {
    const a = "signed quarterly site passport";
    const b = "signed quarterly export archive";
    const ab = jaccardSimilarity(a, b);
    expect(ab).toBeGreaterThan(0);
    expect(ab).toBeLessThan(1);
    expect(ab).toBe(jaccardSimilarity(b, a));
  });

  it("empty input is 0", () => {
    expect(jaccardSimilarity("", "anything here")).toBe(0);
  });
});

describe("splitMarkdownParagraphs (amend.atoms.merge source fidelity)", () => {
  it("preserves Markdown hard line breaks inside a paragraph", () => {
    const paragraphs = splitMarkdownParagraphs(`---
kind: prose
lang: uk
---

**Податковий номер:**  
{business.legal.tax.taxNumber}

Короткий завершальний абзац для проходження порога довжини.`);

    expect(paragraphs[0]).toBe("**Податковий номер:**  \n{business.legal.tax.taxNumber}");
  });
});

describe("isNewerVersion (coverage-ledger supersession)", () => {
  it("basic ordering", () => {
    expect(isNewerVersion("v0.2", "v0.1")).toBe(true);
    expect(isNewerVersion("v0.1", "v0.2")).toBe(false);
    expect(isNewerVersion("v0.2", "v0.2")).toBe(false);
  });

  it("v0.10 is newer than v0.9 (numeric, not lexical)", () => {
    expect(isNewerVersion("v0.10", "v0.9")).toBe(true);
    expect(isNewerVersion("v0.9", "v0.10")).toBe(false);
  });

  it("differing segment counts", () => {
    expect(isNewerVersion("v1", "v0.9")).toBe(true);
    expect(isNewerVersion("v1.0.1", "v1")).toBe(true);
    expect(isNewerVersion("v1", "v1.0.0")).toBe(false);
  });
});

describe("AmendSource expand-locale intent (amend-001 fix P3)", () => {
  it("accepts expand-locale with a locale", () => {
    const r = AmendBrief.safeParse({
      amend: { batch: "amend-001", targetApp: "webgogol-com" },
      sources: [
        {
          file: "x.uk.md",
          sourceId: "x-uk",
          version: "v0.2",
          intent: "expand-locale",
          pageId: "datenschutz",
          locale: "uk",
        },
      ],
    });
    expect(r.success).toBe(true);
  });
  it("rejects expand-locale without a locale", () => {
    const r = AmendBrief.safeParse({
      amend: { batch: "amend-001", targetApp: "webgogol-com" },
      sources: [
        {
          file: "x.uk.md",
          sourceId: "x-uk",
          version: "v0.2",
          intent: "expand-locale",
          pageId: "datenschutz",
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("applySitePlanDelta (amend-001 fix P1)", () => {
  it("adds a new page, expands a locale, and is idempotent", () => {
    const base = () => ({
      app: "webgogol-com",
      version: "1.0.0",
      identity: { systemStar: "Vega", biome: "b" },
      i18n: { default: "de", supported: { de: {}, uk: {} } },
      pages: [
        { pageId: "impressum", routes: { de: "impressum" }, locales: ["de"], cosmicStar: "Vega" },
      ],
    });
    const delta = {
      addPages: [{ pageId: "agb", routes: { de: "agb", uk: "umovy" }, cosmicStar: "Vega" }],
      expandLocales: [{ pageId: "impressum", locale: "uk", route: "pravova" }],
    };
    const sys = base() as Record<string, unknown>;
    const first = applySitePlanDelta(sys, delta);
    expect(first.addedPages).toEqual(["agb"]);
    expect(first.expandedLocales).toEqual(["impressum:uk"]);
    const pages = first.system.pages as Array<Record<string, unknown>>;
    const impressum = pages.find((p) => p.pageId === "impressum")!;
    expect((impressum.routes as Record<string, string>).uk).toBe("pravova");
    expect(impressum.locales).toEqual(["de", "uk"]);
    // idempotent re-apply
    const second = applySitePlanDelta(first.system, delta);
    expect(second.addedPages).toEqual([]);
    expect(second.expandedLocales).toEqual([]);
  });
});
