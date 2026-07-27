/*
<MODULE_CONTRACT>
  <purpose>RFC-0496: unit tests for injectServiceCatalogLinks — verify that
  service catalog blocks are injected into industry pages, not service pages,
  and that the block is inserted before the closing CTA.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0496: initial tests for injectServiceCatalogLinks.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { injectServiceCatalogLinks } from "../surface/service-catalog-links.ts";
import type { PageEntry, VirtualRouteEntry } from "@gogol/surface";

function makeEntry(
  surfaceId: string,
  depth: number,
  axes: Record<string, string>,
  title: string,
): VirtualRouteEntry {
  return {
    pageId: `${surfaceId}-${Object.values(axes).join("-")}`,
    surfaceId,
    depth,
    axes,
    routes: { de: `${surfaceId}/${Object.values(axes).join("/")}` },
    indexable: true,
    recordCount: 1,
    noindex: false,
    page: {
      kind: "page",
      cosmicStar: "Vega",
      title,
      description: `${title} description`,
      lang: "de",
      blocks: [
        { type: "hero", props: { heading: title } },
        { type: "final-cta", props: { heading: "CTA" } },
      ],
    } as PageEntry,
    pages: {
      de: {
        kind: "page",
        cosmicStar: "Vega",
        title,
        description: `${title} description`,
        lang: "de",
        blocks: [
          { type: "hero", props: { heading: title } },
          { type: "final-cta", props: { heading: "CTA" } },
        ],
      } as PageEntry,
    },
  } as VirtualRouteEntry;
}

describe("injectServiceCatalogLinks", () => {
  it("injects a service catalog block before the CTA in industry pages", () => {
    const industry = makeEntry("website-local", 1, { industry: "elektriker" }, "Elektriker");
    const service1 = makeEntry(
      "website-service",
      1,
      { industry: "elektriker", service: "website-erstellung" },
      "Website-Erstellung",
    );
    const service2 = makeEntry(
      "website-service",
      1,
      { industry: "elektriker", service: "seo-audit" },
      "SEO-Audit",
    );

    injectServiceCatalogLinks([industry, service1, service2], "de");

    const blocks = industry.pages!.de.blocks as unknown as Array<Record<string, unknown>>;
    const catalogIdx = blocks.findIndex((b) => b.type === "audience-cards");
    const ctaIdx = blocks.findIndex((b) => b.type === "final-cta");

    expect(catalogIdx).toBeGreaterThan(-1);
    expect(ctaIdx).toBeGreaterThan(-1);
    expect(catalogIdx).toBeLessThan(ctaIdx);
  });

  it("does not inject a block when no services match the industry", () => {
    const industry = makeEntry("website-local", 1, { industry: "friseur" }, "Friseur");
    const service = makeEntry(
      "website-service",
      1,
      { industry: "elektriker", service: "website-erstellung" },
      "Website-Erstellung",
    );

    injectServiceCatalogLinks([industry, service], "de");

    const blocks = industry.pages!.de.blocks as unknown as Array<Record<string, unknown>>;
    const catalogIdx = blocks.findIndex((b) => b.type === "audience-cards");
    expect(catalogIdx).toBe(-1);
  });

  it("does not modify service pages", () => {
    const industry = makeEntry("website-local", 1, { industry: "elektriker" }, "Elektriker");
    const service = makeEntry(
      "website-service",
      1,
      { industry: "elektriker", service: "website-erstellung" },
      "Website-Erstellung",
    );

    injectServiceCatalogLinks([industry, service], "de");

    const serviceBlocks = service.pages!.de.blocks as unknown as Array<Record<string, unknown>>;
    const catalogIdx = serviceBlocks.findIndex((b) => b.type === "audience-cards");
    expect(catalogIdx).toBe(-1);
  });

  it("is a no-op when there are no service entries", () => {
    const industry = makeEntry("website-local", 1, { industry: "elektriker" }, "Elektriker");
    const originalBlockCount = industry.pages!.de.blocks.length;

    injectServiceCatalogLinks([industry], "de");

    expect(industry.pages!.de.blocks.length).toBe(originalBlockCount);
  });
});
