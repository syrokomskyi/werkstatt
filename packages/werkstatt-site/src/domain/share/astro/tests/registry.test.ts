/*
<MODULE_CONTRACT>
<purpose>Unit tests for getRouteRegistry (ADR-0055) — verifies route registry loading from mocked system.md content collection.</purpose>
<non-goals>
  <item>Does not test entitlement gating logic — fail-open behavior is assumed.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0055: established unit test coverage for getRouteRegistry.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
  getEntry: vi.fn(),
}));

import { getCollection } from "astro:content";
import { getRouteRegistry, clearRouteRegistryCache } from "../routes/registry.js";
import { clearSurfaceCache } from "../surface-routes.js";

const mockedGetCollection = vi.mocked(getCollection);

beforeEach(() => {
  vi.clearAllMocks();
  clearRouteRegistryCache();
  clearSurfaceCache();
});

function makeSystemData(
  pages: unknown[],
  i18n?: { default: string; supported?: Record<string, unknown> },
) {
  return {
    id: "system",
    data: {
      i18n: i18n ?? { default: "de", supported: { de: true, en: true } },
      pages,
    },
  };
}

function setupSystem(
  pages: unknown[],
  i18n?: { default: string; supported?: Record<string, unknown> },
) {
  mockedGetCollection.mockImplementation(async (name: string) => {
    if (name === "system") return [makeSystemData(pages, i18n)];
    return [];
  });
}

describe("getRouteRegistry", () => {
  it("loads authored pages with correct pageId and routes", async () => {
    setupSystem([
      {
        pageId: "privacyPolicy",
        cosmicStar: "Privacy",
        routes: { de: "datenschutz", en: "privacy" },
      },
    ]);

    const registry = await getRouteRegistry();

    const entry = registry.byPageId.get("privacyPolicy");
    expect(entry).toBeDefined();
    expect(entry?.pageId).toBe("privacyPolicy");
    expect(entry?.cosmicStar).toBe("Privacy");
    expect(entry?.routes.de).toBe("datenschutz");
    expect(entry?.routes.en).toBe("privacy");
  });

  it("indexes routes by language and slug", async () => {
    setupSystem([
      {
        pageId: "privacyPolicy",
        routes: { de: "datenschutz", en: "privacy" },
      },
    ]);

    const registry = await getRouteRegistry();

    expect(registry.byLanguageAndSlug.get("de")?.get("datenschutz")?.pageId).toBe("privacyPolicy");
    expect(registry.byLanguageAndSlug.get("en")?.get("privacy")?.pageId).toBe("privacyPolicy");
  });

  it("generates routes for all supported languages", async () => {
    setupSystem(
      [
        {
          pageId: "home",
          routes: { de: "", en: "", uk: "" },
        },
      ],
      { default: "de", supported: { de: true, en: true, uk: true } },
    );

    const registry = await getRouteRegistry();

    expect(registry.supportedLanguages.sort()).toEqual(["de", "en", "uk"]);
    expect(registry.byLanguageAndSlug.has("de")).toBe(true);
    expect(registry.byLanguageAndSlug.has("en")).toBe(true);
    expect(registry.byLanguageAndSlug.has("uk")).toBe(true);
  });

  it("route slugs have no leading or trailing slashes", async () => {
    setupSystem([
      {
        pageId: "privacyPolicy",
        routes: { de: "datenschutz", en: "privacy" },
      },
    ]);

    const registry = await getRouteRegistry();

    for (const [, langMap] of registry.byLanguageAndSlug) {
      for (const slug of langMap.keys()) {
        if (slug === "") continue;
        expect(slug.startsWith("/")).toBe(false);
        expect(slug.endsWith("/")).toBe(false);
      }
    }
  });

  it("skips pages without pageId or routes", async () => {
    setupSystem([
      { pageId: "validPage", routes: { de: "valid" } },
      { pageId: undefined, routes: { de: "no-id" } },
      { pageId: "noRoutes" },
    ]);

    const registry = await getRouteRegistry();

    expect(registry.byPageId.has("validPage")).toBe(true);
    expect(registry.byPageId.size).toBe(1);
  });

  it("throws when i18n.default is missing", async () => {
    setupSystem([], { default: "", supported: { de: true } });

    await expect(getRouteRegistry()).rejects.toThrow(/i18n\.default is required/);
  });

  it("returns cached registry on second call", async () => {
    setupSystem([{ pageId: "home", routes: { de: "", en: "" } }]);

    const first = await getRouteRegistry();
    const callsAfterFirst = mockedGetCollection.mock.calls.length;
    const second = await getRouteRegistry();

    expect(first).toBe(second);
    expect(mockedGetCollection.mock.calls.length).toBe(callsAfterFirst);
  });

  it("carries parentPageId for breadcrumb hierarchy", async () => {
    setupSystem([
      {
        pageId: "team",
        routes: { de: "team", en: "team" },
      },
      {
        pageId: "member-jane",
        routes: { de: "team/jane", en: "team/jane" },
        parentPageId: "team",
      },
    ]);

    const registry = await getRouteRegistry();

    expect(registry.byPageId.get("member-jane")?.parentPageId).toBe("team");
  });

  it("carries standalone flag for dedicated-route pages", async () => {
    setupSystem([
      {
        pageId: "standalonePage",
        routes: { de: "standalone", en: "standalone" },
        standalone: true,
      },
    ]);

    const registry = await getRouteRegistry();

    expect(registry.byPageId.get("standalonePage")?.standalone).toBe(true);
  });

  it("sets defaultLanguage from i18n.default", async () => {
    setupSystem([{ pageId: "home", routes: { en: "", de: "" } }], {
      default: "en",
      supported: { en: true, de: true },
    });

    const registry = await getRouteRegistry();

    expect(registry.defaultLanguage).toBe("en");
  });
});
