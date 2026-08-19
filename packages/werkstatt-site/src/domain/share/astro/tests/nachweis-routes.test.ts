/*
<MODULE_CONTRACT>
<purpose>Unit tests for nachweis-routes.ts (ADR-0055) — verifies route generation for Nachweis detail and verify pages with mocked getCollection.</purpose>
<non-goals>
  <item>Does not test entitlement gating — that is covered by registry tests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0055: established unit test coverage for Nachweis route generators.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("astro:content", () => ({
  getCollection: vi.fn(),
  getEntry: vi.fn(),
}));

import { getCollection } from "astro:content";
import {
  nachweisPageId,
  nachweisVerifyPageId,
  getNachweisRoutes,
  getNachweisVerifyRoutes,
} from "../nachweis-routes.js";

const mockedGetCollection = vi.mocked(getCollection);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeSystemEntry(defaultLang: string, supported: Record<string, unknown>) {
  return {
    id: "system",
    data: { i18n: { default: defaultLang, supported } },
  };
}

function makeEvidenceEntry(id: string, data: Record<string, unknown>) {
  return { id, data };
}

function setupCollections(
  system: ReturnType<typeof makeSystemEntry>,
  businessProfiles: ReturnType<typeof makeEvidenceEntry>[],
) {
  mockedGetCollection.mockImplementation(async (name: string) => {
    if (name === "system") return [system];
    if (name === "business-profile") return businessProfiles;
    return [];
  });
}

describe("nachweisPageId", () => {
  it("creates synthetic pageId with nachweis: prefix", () => {
    expect(nachweisPageId("iso-9001")).toBe("nachweis:iso-9001");
  });
});

describe("nachweisVerifyPageId", () => {
  it("creates synthetic pageId with nachweis-verify: prefix and version suffix", () => {
    expect(nachweisVerifyPageId("iso-9001", "v1")).toBe("nachweis-verify:iso-9001:v1");
  });
});

describe("getNachweisRoutes", () => {
  it("generates correct route for published evidence record with slug", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true, en: true }),
      [
        makeEvidenceEntry("de/iso-9001", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "iso-9001",
        }),
      ],
    );

    const routes = await getNachweisRoutes();

    expect(routes).toHaveLength(1);
    expect(routes[0].pageId).toBe("nachweis:iso-9001");
    expect(routes[0].slug).toBe("iso-9001");
    expect(routes[0].routes.de).toBe("nachweise/iso-9001");
    expect(routes[0].routes.en).toBe("nachweise/iso-9001");
  });

  it("throws when slug is absent from frontmatter", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true }),
      [
        makeEvidenceEntry("de/no-slug", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
        }),
      ],
    );

    await expect(getNachweisRoutes()).rejects.toThrow(/missing required frontmatter "slug"/);
  });

  it("generates routes without leading or trailing slashes", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true, en: true }),
      [
        makeEvidenceEntry("de/iso-9001", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "iso-9001",
        }),
      ],
    );

    const routes = await getNachweisRoutes();

    for (const route of routes) {
      for (const path of Object.values(route.routes)) {
        expect(path.startsWith("/")).toBe(false);
        expect(path.endsWith("/")).toBe(false);
      }
    }
  });

  it("generates routes for all supported languages", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true, en: true, uk: true }),
      [
        makeEvidenceEntry("de/iso-9001", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "iso-9001",
        }),
      ],
    );

    const routes = await getNachweisRoutes();

    expect(Object.keys(routes[0].routes).sort()).toEqual(["de", "en", "uk"]);
  });

  it("excludes draft records", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true }),
      [
        makeEvidenceEntry("de/draft-cert", {
          type: "evidence-source",
          kind: "certificate",
          status: "draft",
          slug: "draft-cert",
        }),
        makeEvidenceEntry("de/published-cert", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "published-cert",
        }),
      ],
    );

    const routes = await getNachweisRoutes();

    expect(routes).toHaveLength(1);
    expect(routes[0].slug).toBe("published-cert");
  });

  it("excludes non-evidence-source types", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true }),
      [
        makeEvidenceEntry("de/business", {
          type: "business",
          status: "published",
          slug: "business",
        }),
        makeEvidenceEntry("de/cert", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "cert",
        }),
      ],
    );

    const routes = await getNachweisRoutes();

    expect(routes).toHaveLength(1);
    expect(routes[0].slug).toBe("cert");
  });

  it("excludes non-Nachweis evidence kinds", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true }),
      [
        makeEvidenceEntry("de/other-kind", {
          type: "evidence-source",
          kind: "some-other-kind",
          status: "published",
          slug: "other-kind",
        }),
        makeEvidenceEntry("de/client-statement", {
          type: "evidence-source",
          kind: "client-statement",
          status: "published",
          slug: "client-statement",
        }),
      ],
    );

    const routes = await getNachweisRoutes();

    expect(routes).toHaveLength(1);
    expect(routes[0].slug).toBe("client-statement");
  });

  it("only reads default-language entries", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true, en: true }),
      [
        makeEvidenceEntry("de/iso-9001", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "iso-9001",
        }),
        makeEvidenceEntry("en/iso-9001", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "iso-9001",
        }),
      ],
    );

    const routes = await getNachweisRoutes();

    expect(routes).toHaveLength(1);
  });
});

describe("getNachweisVerifyRoutes", () => {
  it("generates verify routes with version suffix", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true, en: true }),
      [
        makeEvidenceEntry("de/iso-9001", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "iso-9001",
        }),
      ],
    );

    const routes = await getNachweisVerifyRoutes();

    expect(routes).toHaveLength(1);
    expect(routes[0].pageId).toBe("nachweis-verify:iso-9001:v1");
    expect(routes[0].slug).toBe("iso-9001");
    expect(routes[0].version).toBe("v1");
    expect(routes[0].routes.de).toBe("nachweise/verify/v1");
    expect(routes[0].routes.en).toBe("nachweise/verify/v1");
  });

  it("generates verify routes without leading or trailing slashes", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true, en: true }),
      [
        makeEvidenceEntry("de/iso-9001", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "iso-9001",
        }),
      ],
    );

    const routes = await getNachweisVerifyRoutes();

    for (const route of routes) {
      for (const path of Object.values(route.routes)) {
        expect(path.startsWith("/")).toBe(false);
        expect(path.endsWith("/")).toBe(false);
      }
    }
  });

  it("generates verify routes for all supported languages", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true, en: true, uk: true }),
      [
        makeEvidenceEntry("de/iso-9001", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
          slug: "iso-9001",
        }),
      ],
    );

    const routes = await getNachweisVerifyRoutes();

    expect(Object.keys(routes[0].routes).sort()).toEqual(["de", "en", "uk"]);
  });

  it("throws when slug is absent", async () => {
    setupCollections(
      makeSystemEntry("de", { de: true }),
      [
        makeEvidenceEntry("de/no-slug", {
          type: "evidence-source",
          kind: "certificate",
          status: "published",
        }),
      ],
    );

    await expect(getNachweisVerifyRoutes()).rejects.toThrow(/missing required frontmatter "slug"/);
  });
});
