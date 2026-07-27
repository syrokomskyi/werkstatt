/*
<MODULE_CONTRACT>
  <purpose>RFC-0497: unit tests for applyIntersectionGate — pure pipeline stage
  that filters depth-5 entries based on approved intersection records.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0497: initial tests for applyIntersectionGate.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { applyIntersectionGate, type IntersectionRecord } from "../surface-expand/pipeline.ts";
import type { VirtualRouteEntry } from "@warpgogol/surface";

function makeEntry(
  depth: number,
  axes: Record<string, string | undefined>,
  pageId?: string,
): VirtualRouteEntry {
  return {
    surfaceId: "website-local",
    pageId: pageId ?? `test:${depth}:${Object.values(axes).join(":")}`,
    routes: { de: `/test/${Object.values(axes).filter(Boolean).join("/")}` },
    axes,
    depth,
    recordCount: 1,
    indexable: true,
    noindex: false,
  };
}

const DEPTH_5 = 5;

describe("applyIntersectionGate", () => {
  it("drops all depth-5 entries when intersections list is empty", () => {
    const entries = [
      makeEntry(DEPTH_5, { industry: "friseur", city: "stuttgart", demand: "haarschnitt" }),
      makeEntry(DEPTH_5, { industry: "elektriker", city: "karlsruhe", demand: "elektroinstallation" }),
      makeEntry(4, { industry: "friseur", city: "stuttgart" }),
    ];
    const result = applyIntersectionGate(entries, [], DEPTH_5);
    expect(result).toHaveLength(1);
    expect(result[0]!.depth).toBe(4);
  });

  it("keeps depth-5 entries that have an approved intersection record", () => {
    const entries = [
      makeEntry(DEPTH_5, { industry: "friseur", city: "stuttgart", demand: "haarschnitt" }),
      makeEntry(DEPTH_5, { industry: "elektriker", city: "karlsruhe", demand: "elektroinstallation" }),
    ];
    const intersections: IntersectionRecord[] = [
      {
        intersectionId: "friseur/stuttgart/haarschnitt",
        industryId: "friseur",
        cityId: "stuttgart",
        serviceId: "haarschnitt",
        publicationDecision: "approved",
      },
    ];
    const result = applyIntersectionGate(entries, intersections, DEPTH_5);
    expect(result).toHaveLength(1);
    expect(result[0]!.axes.industry).toBe("friseur");
  });

  it("drops depth-5 entries with rejected or pending intersection records", () => {
    const entries = [
      makeEntry(DEPTH_5, { industry: "friseur", city: "stuttgart", demand: "haarschnitt" }),
      makeEntry(DEPTH_5, { industry: "elektriker", city: "karlsruhe", demand: "elektroinstallation" }),
    ];
    const intersections: IntersectionRecord[] = [
      {
        intersectionId: "friseur/stuttgart/haarschnitt",
        industryId: "friseur",
        cityId: "stuttgart",
        serviceId: "haarschnitt",
        publicationDecision: "rejected",
      },
      {
        intersectionId: "elektriker/karlsruhe/elektroinstallation",
        industryId: "elektriker",
        cityId: "karlsruhe",
        serviceId: "elektroinstallation",
        publicationDecision: "pending",
      },
    ];
    const result = applyIntersectionGate(entries, intersections, DEPTH_5);
    expect(result).toHaveLength(0);
  });

  it("does not affect entries at other depths", () => {
    const entries = [
      makeEntry(0, {}),
      makeEntry(1, { industry: "friseur" }),
      makeEntry(4, { industry: "friseur", city: "stuttgart" }),
      makeEntry(DEPTH_5, { industry: "friseur", city: "stuttgart", demand: "haarschnitt" }),
    ];
    const intersections: IntersectionRecord[] = [
      {
        intersectionId: "friseur/stuttgart/haarschnitt",
        industryId: "friseur",
        cityId: "stuttgart",
        serviceId: "haarschnitt",
        publicationDecision: "approved",
      },
    ];
    const result = applyIntersectionGate(entries, intersections, DEPTH_5);
    expect(result).toHaveLength(4);
  });

  it("drops depth-5 entries with missing axis values", () => {
    const entries = [
      makeEntry(DEPTH_5, { industry: "friseur", city: undefined, demand: "haarschnitt" }),
      makeEntry(DEPTH_5, { industry: undefined, city: "stuttgart", demand: "haarschnitt" }),
      makeEntry(DEPTH_5, { industry: "friseur", city: "stuttgart", demand: undefined }),
    ];
    const intersections: IntersectionRecord[] = [
      {
        intersectionId: "friseur/stuttgart/haarschnitt",
        industryId: "friseur",
        cityId: "stuttgart",
        serviceId: "haarschnitt",
        publicationDecision: "approved",
      },
    ];
    const result = applyIntersectionGate(entries, intersections, DEPTH_5);
    expect(result).toHaveLength(0);
  });

  it("handles multiple approved intersections correctly", () => {
    const entries = [
      makeEntry(DEPTH_5, { industry: "friseur", city: "stuttgart", demand: "haarschnitt" }),
      makeEntry(DEPTH_5, { industry: "elektriker", city: "karlsruhe", demand: "elektroinstallation" }),
      makeEntry(DEPTH_5, { industry: "friseur", city: "karlsruhe", demand: "balayage" }),
    ];
    const intersections: IntersectionRecord[] = [
      {
        intersectionId: "friseur/stuttgart/haarschnitt",
        industryId: "friseur",
        cityId: "stuttgart",
        serviceId: "haarschnitt",
        publicationDecision: "approved",
      },
      {
        intersectionId: "elektriker/karlsruhe/elektroinstallation",
        industryId: "elektriker",
        cityId: "karlsruhe",
        serviceId: "elektroinstallation",
        publicationDecision: "approved",
      },
    ];
    const result = applyIntersectionGate(entries, intersections, DEPTH_5);
    expect(result).toHaveLength(2);
    const pageIds = result.map((e) => e.pageId).sort();
    expect(pageIds).toContain("test:5:friseur:stuttgart:haarschnitt");
    expect(pageIds).toContain("test:5:elektriker:karlsruhe:elektroinstallation");
  });
});
