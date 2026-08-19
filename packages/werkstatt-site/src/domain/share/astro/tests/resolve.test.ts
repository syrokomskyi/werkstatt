/*
<MODULE_CONTRACT>
<purpose>Unit tests for getStaticPathsFromRegistry and resolve helpers (ADR-0055) — verifies static path generation from the route registry.</purpose>
<non-goals>
  <item>Does not test entitlement gating — fail-open behavior is assumed.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0055: established unit test coverage for getStaticPathsFromRegistry.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
  getEntry: vi.fn(),
}));

import { getCollection } from "astro:content";
import { clearRouteRegistryCache } from "../routes/registry.js";
import { clearSurfaceCache } from "../surface-routes.js";
import {
  getStaticPathsFromRegistry,
  resolveLocalizedPagePath,
  resolvePageIdFromPath,
} from "../routes/resolve.js";

const mockedGetCollection = vi.mocked(getCollection);

beforeEach(() => {
  vi.clearAllMocks();
  clearRouteRegistryCache();
  clearSurfaceCache();
});

function setupSystem(pages: unknown[], i18n?: { default: string; supported?: Record<string, unknown> }) {
  mockedGetCollection.mockImplementation(async (name: string) => {
    if (name === "system") {
      return [
        {
          id: "system",
          data: {
            i18n: i18n ?? { default: "de", supported: { de: true, en: true } },
            pages,
          },
        },
      ];
    }
    return [];
  });
}

describe("getStaticPathsFromRegistry", () => {
  it("generates static paths for all supported languages", async () => {
    setupSystem([
      { pageId: "home", routes: { de: "", en: "" } },
      { pageId: "about", routes: { de: "ueber-uns", en: "about" } },
    ]);

    const paths = await getStaticPathsFromRegistry();

    const langParams = paths.map((p) => p.params.lang);
    expect(langParams).toContain("de");
    expect(langParams).toContain("en");
  });

  it("emits home page as { params: { lang } } without slug", async () => {
    setupSystem([
      { pageId: "home", routes: { de: "", en: "" } },
    ]);

    const paths = await getStaticPathsFromRegistry();

    const homePaths = paths.filter((p) => p.params.slug === undefined);
    expect(homePaths.length).toBeGreaterThanOrEqual(2);
    for (const p of homePaths) {
      expect(p.params.lang).toBeDefined();
      expect(p.params.slug).toBeUndefined();
    }
  });

  it("emits non-home pages with slug", async () => {
    setupSystem([
      { pageId: "about", routes: { de: "ueber-uns", en: "about" } },
    ]);

    const paths = await getStaticPathsFromRegistry();

    for (const p of paths) {
      expect(p.params.slug).toBeDefined();
      expect(p.params.slug).not.toBe("");
    }
  });

  it("route slugs have no leading or trailing slashes", async () => {
    setupSystem([
      { pageId: "about", routes: { de: "ueber-uns", en: "about" } },
      { pageId: "privacy", routes: { de: "datenschutz", en: "privacy" } },
    ]);

    const paths = await getStaticPathsFromRegistry();

    for (const p of paths) {
      const slug = p.params.slug;
      if (slug === undefined || slug === "") continue;
      expect(slug.startsWith("/")).toBe(false);
      expect(slug.endsWith("/")).toBe(false);
    }
  });

  it("excludes standalone pages", async () => {
    setupSystem([
      { pageId: "normal", routes: { de: "normal", en: "normal" } },
      { pageId: "standalone", routes: { de: "standalone", en: "standalone" }, standalone: true },
    ]);

    const paths = await getStaticPathsFromRegistry();

    const slugs = paths.map((p) => p.params.slug).filter(Boolean);
    expect(slugs).toContain("normal");
    expect(slugs).not.toContain("standalone");
  });

  it("filters by specified languages", async () => {
    setupSystem(
      [
        { pageId: "home", routes: { de: "", en: "", uk: "" } },
      ],
      { default: "de", supported: { de: true, en: true, uk: true } },
    );

    const paths = await getStaticPathsFromRegistry(["de"]);

    expect(paths.every((p) => p.params.lang === "de")).toBe(true);
  });

  it("skips locale-scoped pages not opting into the locale", async () => {
    setupSystem([
      {
        pageId: "deOnly",
        routes: { de: "nur-de", en: "de-only" },
        locales: ["de"],
      },
    ]);

    const paths = await getStaticPathsFromRegistry();

    const dePaths = paths.filter((p) => p.params.lang === "de");
    const enPaths = paths.filter((p) => p.params.lang === "en");
    expect(dePaths.length).toBeGreaterThan(0);
    expect(enPaths.length).toBe(0);
  });
});

describe("resolveLocalizedPagePath", () => {
  it("resolves pageId and lang to localized URL path", async () => {
    setupSystem([
      { pageId: "privacy", routes: { de: "datenschutz", en: "privacy" } },
    ]);

    const dePath = await resolveLocalizedPagePath("privacy", "de");
    const enPath = await resolveLocalizedPagePath("privacy", "en");

    expect(dePath).toBe("/datenschutz");
    expect(enPath).toBe("/en/privacy");
  });

  it("returns null for unknown pageId", async () => {
    setupSystem([
      { pageId: "privacy", routes: { de: "datenschutz", en: "privacy" } },
    ]);

    const path = await resolveLocalizedPagePath("nonexistent", "de");
    expect(path).toBeNull();
  });
});

describe("resolvePageIdFromPath", () => {
  it("resolves lang and slug to pageId", async () => {
    setupSystem([
      { pageId: "privacy", routes: { de: "datenschutz", en: "privacy" } },
    ]);

    const pageId = await resolvePageIdFromPath("de", "datenschutz");
    expect(pageId).toBe("privacy");
  });

  it("returns null for unknown slug", async () => {
    setupSystem([
      { pageId: "privacy", routes: { de: "datenschutz", en: "privacy" } },
    ]);

    const pageId = await resolvePageIdFromPath("de", "nonexistent");
    expect(pageId).toBeNull();
  });
});
