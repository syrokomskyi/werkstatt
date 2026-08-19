/*
<MODULE_CONTRACT>
<purpose>Unit tests for resolvePageRoute (ADR-0055) — verifies standard page IDs, synthetic Nachweis page IDs, block prop injection, and missing page error cases with mocked astro:content.</purpose>
<non-goals>
  <item>Does not test semantic model building — buildSemanticModel callback is optional and not passed.</item>
  <item>Does not test surface/person routes — those require surface artifact and people collection mocks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0055: established unit test coverage for resolvePageRoute.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
  getEntry: vi.fn(),
}));

import { getCollection, getEntry } from "astro:content";
import { resolvePageRoute } from "../page-handler/resolve-route.js";
import { clearRouteRegistryCache } from "../routes/registry.js";
import { clearSurfaceCache } from "../surface-routes.js";

const mockedGetCollection = vi.mocked(getCollection);
const mockedGetEntry = vi.mocked(getEntry);

function makePageEntry(title: string, blocks: Array<Record<string, unknown>> = []) {
  return {
    kind: "page",
    cosmicStar: "Sol",
    title,
    description: "Test description.",
    lang: "de",
    blocks,
  };
}

function makeSystemData(pages: unknown[]) {
  return {
    id: "system",
    data: {
      i18n: { default: "de", supported: { de: true, en: true } },
      pages,
      identity: { biome: "test-biome" },
    },
  };
}

function setupMocks(options: {
  pages?: unknown[];
  pageEntries?: Record<string, unknown>;
  siteEntries?: Record<string, unknown>;
  businessProfileEntries?: Array<{ id: string; data: Record<string, unknown> }>;
}) {
  const systemData = makeSystemData(options.pages ?? []);
  const pageEntries = options.pageEntries ?? {};
  const siteEntries = options.siteEntries ?? {};
  const bpEntries = options.businessProfileEntries ?? [];

  mockedGetCollection.mockImplementation(async (name: string) => {
    if (name === "system") return [systemData];
    if (name === "business-profile") return bpEntries;
    if (name === "people") return [];
    if (name === "navigation") return [];
    return [];
  });

  mockedGetEntry.mockImplementation(async (collection: string, id: string) => {
    if (collection === "system") return undefined;
    if (collection === "pages") {
      const entry = pageEntries[id];
      if (entry) return { id, data: entry };
      return undefined;
    }
    if (collection === "site") {
      const entry = siteEntries[id];
      if (entry) return { id, data: entry };
      return undefined;
    }
    return undefined;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRouteRegistryCache();
  clearSurfaceCache();
  process.env.NODE_ENV = "production";
});

describe("resolvePageRoute", () => {
  it("resolves a standard authored page with correct pageId and title", async () => {
    setupMocks({
      pages: [
        { pageId: "home", routes: { de: "", en: "" } },
        { pageId: "about", routes: { de: "ueber-uns", en: "about" } },
      ],
      pageEntries: {
        "de/about": makePageEntry("Ueber uns", [{ type: "hero", props: {} }]),
      },
      siteEntries: {
        "de/layout": { skipLinkLabel: "Zum Inhalt", defaultDescription: "Beschreibung." },
        "de/labels": { orchestrator: {} },
      },
    });

    const result = await resolvePageRoute({
      lang: "de",
      slug: "ueber-uns",
      siteUrl: "https://example.com",
    });

    expect(result.pageId).toBe("about");
    expect(result.page.title).toBe("Ueber uns");
    expect(result.defaultLanguageCode).toBe("de");
    expect(result.supportedLangs).toEqual(["de", "en"]);
    expect(result.biome).toBe("test-biome");
    expect(result.printMode).toBe(false);
  });

  it("throws when pageId cannot be resolved from path", async () => {
    setupMocks({
      pages: [{ pageId: "home", routes: { de: "", en: "" } }],
    });

    await expect(
      resolvePageRoute({ lang: "de", slug: "nonexistent", siteUrl: "https://example.com" }),
    ).rejects.toThrow(/No page found for path/);
  });

  it("throws when page entry is missing for a known pageId", async () => {
    setupMocks({
      pages: [{ pageId: "about", routes: { de: "ueber-uns", en: "about" } }],
      pageEntries: {},
    });

    await expect(
      resolvePageRoute({ lang: "de", slug: "ueber-uns", siteUrl: "https://example.com" }),
    ).rejects.toThrow(/Missing page entry for pageId/);
  });

  it("resolves a Nachweis detail synthetic page ID and injects slug into block props", async () => {
    const nachweisSlug = "iso-9001";
    setupMocks({
      pages: [
        { pageId: "home", routes: { de: "", en: "" } },
        { pageId: "nachweis-detail", routes: { de: "nachweise", en: "nachweise" } },
      ],
      pageEntries: {
        "de/nachweis-detail": makePageEntry("Nachweis Detail", [
          { type: "nachweis-detail", props: { title: "Default" } },
          { type: "hero", props: { heading: "Hero" } },
        ]),
      },
      siteEntries: {
        "de/layout": { skipLinkLabel: "Skip", defaultDescription: "Desc." },
        "de/labels": { orchestrator: {} },
      },
      businessProfileEntries: [
        {
          id: `de/evidence/${nachweisSlug}`,
          data: {
            type: "evidence-source",
            kind: "certificate",
            status: "published",
            slug: nachweisSlug,
          },
        },
      ],
    });

    const result = await resolvePageRoute({
      lang: "de",
      slug: `nachweise/${nachweisSlug}`,
      siteUrl: "https://example.com",
    });

    expect(result.pageId).toBe(`nachweis:${nachweisSlug}`);
    const nachweisBlock = result.page.blocks.find((b) => b.planetName === "Kerberos");
    expect(nachweisBlock).toBeDefined();
    expect(nachweisBlock!.props.slug).toBe(nachweisSlug);
  });

  it("resolves a Nachweis verify synthetic page ID and injects slug into block props", async () => {
    const nachweisSlug = "iso-9001";
    const version = "v1";
    setupMocks({
      pages: [
        { pageId: "home", routes: { de: "", en: "" } },
        { pageId: "nachweis-verify", routes: { de: "nachweise/verify", en: "nachweise/verify" } },
      ],
      pageEntries: {
        "de/nachweis-verify": makePageEntry("Nachweis Verify", [
          { type: "nachweis-verify", props: { title: "Verify" } },
        ]),
      },
      siteEntries: {
        "de/layout": { skipLinkLabel: "Skip", defaultDescription: "Desc." },
        "de/labels": { orchestrator: {} },
      },
      businessProfileEntries: [
        {
          id: `de/evidence/${nachweisSlug}`,
          data: {
            type: "evidence-source",
            kind: "certificate",
            status: "published",
            slug: nachweisSlug,
          },
        },
      ],
    });

    const result = await resolvePageRoute({
      lang: "de",
      slug: `nachweise/verify/${version}`,
      siteUrl: "https://example.com",
    });

    expect(result.pageId).toBe(`nachweis-verify:${nachweisSlug}:${version}`);
    const verifyBlock = result.page.blocks.find((b) => b.planetName === "Styx");
    expect(verifyBlock).toBeDefined();
    expect(verifyBlock!.props.slug).toBe(nachweisSlug);
  });

  it("computes alternateLinks from the route registry", async () => {
    setupMocks({
      pages: [
        { pageId: "home", routes: { de: "", en: "" } },
        { pageId: "about", routes: { de: "ueber-uns", en: "about" } },
      ],
      pageEntries: {
        "de/about": makePageEntry("Ueber uns", [{ type: "hero", props: {} }]),
      },
      siteEntries: {
        "de/layout": { skipLinkLabel: "Skip", defaultDescription: "Desc." },
        "de/labels": { orchestrator: {} },
      },
    });

    const result = await resolvePageRoute({
      lang: "de",
      slug: "ueber-uns",
      siteUrl: "https://example.com",
    });

    expect(result.alternateLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lang: "de", href: "https://example.com/ueber-uns" }),
        expect.objectContaining({ lang: "en", href: "https://example.com/en/about" }),
        expect.objectContaining({ lang: "x-default", href: "https://example.com/ueber-uns" }),
      ]),
    );
  });

  it("computes localizedSiblingPath for language switcher", async () => {
    setupMocks({
      pages: [
        { pageId: "home", routes: { de: "", en: "" } },
        { pageId: "about", routes: { de: "ueber-uns", en: "about" } },
      ],
      pageEntries: {
        "de/about": makePageEntry("Ueber uns", [{ type: "hero", props: {} }]),
      },
      siteEntries: {
        "de/layout": { skipLinkLabel: "Skip", defaultDescription: "Desc." },
        "de/labels": { orchestrator: {} },
      },
    });

    const result = await resolvePageRoute({
      lang: "de",
      slug: "ueber-uns",
      siteUrl: "https://example.com",
    });

    expect(result.localizedSiblingPath).toBe("/en/about");
  });

  it("falls back to default-language page entry when localized entry is missing", async () => {
    setupMocks({
      pages: [
        { pageId: "home", routes: { de: "", en: "" } },
        { pageId: "about", routes: { de: "ueber-uns", en: "about" } },
      ],
      pageEntries: {
        "de/about": makePageEntry("Ueber uns", [{ type: "hero", props: {} }]),
      },
      siteEntries: {
        "de/layout": { skipLinkLabel: "Skip", defaultDescription: "Desc." },
        "de/labels": { orchestrator: {} },
        "en/layout": { skipLinkLabel: "Skip", defaultDescription: "Desc." },
        "en/labels": { orchestrator: {} },
      },
    });

    const result = await resolvePageRoute({
      lang: "en",
      slug: "about",
      siteUrl: "https://example.com",
    });

    expect(result.pageId).toBe("about");
    expect(result.page.title).toBe("Ueber uns");
    expect(result.page.lang).toBe("de");
  });
});
