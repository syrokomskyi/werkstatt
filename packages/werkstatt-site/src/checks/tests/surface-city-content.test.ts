/*
<MODULE_CONTRACT>
  <purpose>RFC-0494: unit tests for uniqueFaqList, localEvidenceList helpers
  and depth-4 city content specialization in bakePage.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0494: initial tests for city content helpers and bakePage depth-4 specialization.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { uniqueFaqList, localEvidenceList } from "../surface-expand/bake-helpers.ts";
import { bakePage } from "../surface-expand/bake.ts";
import type { BakeCtx } from "../surface-expand/bake.ts";
import type { VirtualRouteEntry, BlueprintLevel } from "@warpgogol/surface";

function makeEntry(
  surfaceId: string,
  depth: number,
  axes: Record<string, string | undefined>,
): VirtualRouteEntry {
  return {
    surfaceId,
    pageId: `${surfaceId}:${Object.values(axes).filter(Boolean).join(":")}`,
    routes: { de: `${surfaceId}/${Object.values(axes).filter(Boolean).join("/")}` },
    axes,
    depth,
    recordCount: 1,
    indexable: true,
    noindex: false,
  } as VirtualRouteEntry;
}

function makeCtx(
  axisDataByLang: Map<string, Map<string, Map<string, Record<string, unknown>>>>,
  opts?: { recordsByPageId?: Map<string, Array<Record<string, unknown>>> },
): BakeCtx {
  return {
    axisDataByLang,
    recordsByPageId: opts?.recordsByPageId ?? new Map(),
    defaultLang: "de",
    entries: [],
    axisOrder: ["industry", "country", "region", "city", "demand"],
    levels: [] as BlueprintLevel[],
    narratives: new Map(),
  };
}

describe("uniqueFaqList", () => {
  it("extracts complete Q&A pairs", () => {
    const values = [
      {
        uniqueFaq: [
          { question: "Q1", answer: "A1" },
          { question: "Q2", answer: "A2" },
        ],
      },
    ];
    expect(uniqueFaqList(values)).toEqual([
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ]);
  });

  it("filters out incomplete pairs", () => {
    const values = [
      {
        uniqueFaq: [
          { question: "Q1", answer: "" },
          { question: "", answer: "A2" },
        ],
      },
    ];
    expect(uniqueFaqList(values)).toEqual([]);
  });

  it("returns empty when field is absent", () => {
    const values = [{ otherField: "x" }];
    expect(uniqueFaqList(values)).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(uniqueFaqList([])).toEqual([]);
  });
});

describe("localEvidenceList", () => {
  it("extracts non-empty strings", () => {
    const values = [{ localEvidence: ["fact1", "fact2", "fact3"] }];
    expect(localEvidenceList(values)).toEqual(["fact1", "fact2", "fact3"]);
  });

  it("filters out empty and non-string entries", () => {
    const values = [{ localEvidence: ["fact1", "", 123, "fact2"] }];
    expect(localEvidenceList(values)).toEqual(["fact1", "fact2"]);
  });

  it("returns empty when field is absent", () => {
    const values = [{ otherField: "x" }];
    expect(localEvidenceList(values)).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(localEvidenceList([])).toEqual([]);
  });
});

describe("bakePage depth-4 city content specialization", () => {
  it("uses uniqueIntro as hero lead when present", () => {
    const entry = makeEntry("website-local", 4, {
      industry: "elektriker",
      country: "deu",
      region: "bw",
      city: "stuttgart",
      demand: "wallbox",
    });

    const cityData = new Map<string, Record<string, unknown>>([
      ["stuttgart", { name: "Stuttgart", uniqueIntro: "City-specific intro text" }],
    ]);
    const cityAxis = new Map<string, Map<string, Record<string, unknown>>>([["city", cityData]]);
    const perLang = new Map<string, Map<string, Map<string, Record<string, unknown>>>>([
      ["de", cityAxis],
    ]);

    const ctx = makeCtx(perLang);
    const page = bakePage(entry, "de", ctx);
    expect(page).toBeDefined();
    if (!page) return;

    const heroBlock = page.blocks.find((b) => b.type === "hero");
    const props = (heroBlock?.props ?? {}) as Record<string, unknown>;
    expect(props.description).toBe("City-specific intro text");
  });

  it("emits uniqueFaq as md blocks after citySpecificQa blocks", () => {
    const entry = makeEntry("website-local", 4, {
      industry: "elektriker",
      country: "deu",
      region: "bw",
      city: "stuttgart",
      demand: "wallbox",
    });

    const cityData = new Map<string, Record<string, unknown>>([
      [
        "stuttgart",
        {
          name: "Stuttgart",
          uniqueFaq: [{ question: "City Q?", answer: "City A." }],
        },
      ],
    ]);
    const cityAxis = new Map<string, Map<string, Record<string, unknown>>>([["city", cityData]]);
    const perLang = new Map<string, Map<string, Map<string, Record<string, unknown>>>>([
      ["de", cityAxis],
    ]);

    const recordsByPageId = new Map<string, Array<Record<string, unknown>>>([
      [entry.pageId, [{ citySpecificQa: [{ question: "Demand Q?", answer: "Demand A." }] }]],
    ]);

    const ctx = makeCtx(perLang, { recordsByPageId });
    const page = bakePage(entry, "de", ctx);
    expect(page).toBeDefined();
    if (!page) return;

    const mdBlocks = page.blocks.filter((b) => b.type === "markdown");
    const headings = mdBlocks.map((b) => {
      const props = (b.props ?? {}) as Record<string, unknown>;
      return props.heading;
    });

    expect(headings).toContain("Demand Q?");
    expect(headings).toContain("City Q?");
    const demandIdx = headings.indexOf("Demand Q?");
    const cityIdx = headings.indexOf("City Q?");
    expect(cityIdx).toBeGreaterThan(demandIdx);
  });

  it("emits localEvidence as listCards block after localFacts block", () => {
    const entry = makeEntry("website-local", 4, {
      industry: "elektriker",
      country: "deu",
      region: "bw",
      city: "stuttgart",
      demand: "wallbox",
    });

    const cityData = new Map<string, Record<string, unknown>>([
      [
        "stuttgart",
        {
          name: "Stuttgart",
          localEvidence: ["evidence1", "evidence2", "evidence3"],
        },
      ],
    ]);
    const cityAxis = new Map<string, Map<string, Record<string, unknown>>>([["city", cityData]]);
    const perLang = new Map<string, Map<string, Map<string, Record<string, unknown>>>>([
      ["de", cityAxis],
    ]);

    const recordsByPageId = new Map<string, Array<Record<string, unknown>>>([
      [entry.pageId, [{ localFacts: [{ text: "fact1" }, { text: "fact2" }] }]],
    ]);

    const ctx = makeCtx(perLang, { recordsByPageId });
    const page = bakePage(entry, "de", ctx);
    expect(page).toBeDefined();
    if (!page) return;

    // listCards() returns type "audience-cards" — filter by heading to distinguish blocks.
    const listBlocks = page.blocks.filter((b) => b.type === "audience-cards");
    expect(listBlocks.length).toBeGreaterThanOrEqual(2);

    const firstListProps = (listBlocks[0].props ?? {}) as Record<string, unknown>;
    const secondListProps = (listBlocks[1].props ?? {}) as Record<string, unknown>;
    const firstBody = firstListProps.body as Record<string, unknown>;
    const secondBody = secondListProps.body as Record<string, unknown>;
    const firstItems = firstBody.cards as unknown[];
    const secondItems = secondBody.cards as unknown[];
    expect(firstItems.length).toBe(2);
    expect(secondItems.length).toBe(3);
  });

  it("produces same output without city content as before (graceful degradation)", () => {
    const entry = makeEntry("website-local", 4, {
      industry: "elektriker",
      country: "deu",
      region: "bw",
      city: "stuttgart",
      demand: "wallbox",
    });

    const cityData = new Map<string, Record<string, unknown>>([
      ["stuttgart", { name: "Stuttgart" }],
    ]);
    const cityAxis = new Map<string, Map<string, Record<string, unknown>>>([["city", cityData]]);
    const perLang = new Map<string, Map<string, Map<string, Record<string, unknown>>>>([
      ["de", cityAxis],
    ]);

    const ctx = makeCtx(perLang);
    const page = bakePage(entry, "de", ctx);
    expect(page).toBeDefined();
    if (!page) return;

    const heroBlock = page.blocks.find((b) => b.type === "hero");
    const props = (heroBlock?.props ?? {}) as Record<string, unknown>;
    expect(props.description).toBeUndefined();

    const mdBlocks = page.blocks.filter((b) => b.type === "markdown");
    const cityFaqHeadings = mdBlocks.filter((b) => {
      const p = (b.props ?? {}) as Record<string, unknown>;
      return p.heading === "City Q?";
    });
    expect(cityFaqHeadings).toEqual([]);

    // No audience-cards blocks from localFacts or localEvidence.
    const cardBlocks = page.blocks.filter((b) => b.type === "audience-cards");
    expect(cardBlocks.length).toBe(0);
  });
});
