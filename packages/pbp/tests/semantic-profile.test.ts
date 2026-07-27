import { describe, it, expect, vi } from "vitest";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  getCollection: vi.fn(),
}));

import { projectToSemanticSiteProfile } from "../src/semantic-profile.js";
import type { PbpCompilerResult } from "../src/compiler/types.js";
import type { PbpBuildContext, PbpBuildStrictness } from "../src/compiler-pipeline.js";
import type { PbpSourceInventoryReport } from "../src/compiler-pipeline.js";
import type { PbpFallbackReport } from "../src/locale.js";

function makeBuildContext(locale: string): PbpBuildContext {
  return {
    buildId: "test-build",
    sourceRevision: "test-rev",
    buildTime: "2026-07-25T00:00:00Z",
    locale,
    defaultLocale: "de",
    schemaSetDigest: "test-digest",
    derivationSetDigest: "test-digest",
    runtimeSnapshotId: null,
  };
}

function makeInventory(): PbpSourceInventoryReport {
  return { sources: [], recordsDiscovered: 0, recordsBySchema: {} };
}

function makeFallbackReport(): PbpFallbackReport {
  return { entries: [], locale: "de", status: "complete" } as unknown as PbpFallbackReport;
}

function makeMinimalResult(
  overrides: Partial<PbpCompilerResult["resolvedGraph"]> = {},
): PbpCompilerResult {
  return {
    context: makeBuildContext("de"),
    inventory: makeInventory(),
    entityIndex: new Map(),
    resolvedGraph: {
      business: {
        schema: "pbp/business@1",
        id: "business",
        type: "business",
        status: "published",
        name: "Test Business",
        description: "A test business",
        ...overrides.business,
      } as PbpCompilerResult["resolvedGraph"]["business"],
      places: {},
      contactPoints: {},
      webPresences: overrides.webPresences ?? {},
      products: {},
      categories: {},
      catalogEntries: {},
      offerings: {},
      policies: {},
      claims: {},
      evidenceSources: {},
      disclosures: {},
      publicDocuments: {},
      ...overrides,
    } as PbpCompilerResult["resolvedGraph"],
    fallbackReport: makeFallbackReport(),
    graphErrors: [],
    cycleResults: [],
    validationErrors: [],
    derivationResults: [],
    projections: { website: [], aiAnswer: [], schemaOrg: {} },
  } as unknown as PbpCompilerResult;
}

describe("RFC-0530: sameAs projection in projectToSemanticSiteProfile", () => {
  it("projects Business.externalIdentifiers to sameAs URLs", () => {
    const result = makeMinimalResult({
      business: {
        schema: "pbp/business@1",
        id: "business",
        type: "business",
        status: "published",
        name: "Test Business",
        externalIdentifiers: {
          wikidata: { schemeRef: "https://www.wikidata.org/wiki/", value: "Q123456" },
        },
      } as PbpCompilerResult["resolvedGraph"]["business"],
    });

    const profile = projectToSemanticSiteProfile(result, "https://example.com");
    expect(profile.organization.sameAs).toEqual(["https://www.wikidata.org/wiki/Q123456"]);
  });

  it("projects social-profile WebPresence.sameAs to sameAs URLs", () => {
    const result = makeMinimalResult({
      webPresences: {
        linkedin: {
          schema: "pbp/web-presence@1",
          id: "linkedin",
          type: "web-presence",
          status: "published",
          name: "LinkedIn",
          kind: "social-profile",
          canonicalUrl: "https://linkedin.com/company/test",
          businessRef: { ref: "business" },
          control: "business-controlled",
          sameAs: ["https://linkedin.com/company/test", "https://github.com/test"],
        },
      },
    });

    const profile = projectToSemanticSiteProfile(result, "https://example.com");
    expect(profile.organization.sameAs).toEqual([
      "https://linkedin.com/company/test",
      "https://github.com/test",
    ]);
  });

  it("omits sameAs when no externalIdentifiers or social-profile sameAs exist", () => {
    const result = makeMinimalResult();

    const profile = projectToSemanticSiteProfile(result, "https://example.com");
    expect(profile.organization.sameAs).toBeUndefined();
  });

  it("concatenates Business.externalIdentifiers and WebPresence.sameAs", () => {
    const result = makeMinimalResult({
      business: {
        schema: "pbp/business@1",
        id: "business",
        type: "business",
        status: "published",
        name: "Test Business",
        externalIdentifiers: {
          wikidata: { schemeRef: "https://www.wikidata.org/wiki/", value: "Q123456" },
        },
      } as PbpCompilerResult["resolvedGraph"]["business"],
      webPresences: {
        linkedin: {
          schema: "pbp/web-presence@1",
          id: "linkedin",
          type: "web-presence",
          status: "published",
          name: "LinkedIn",
          kind: "social-profile",
          canonicalUrl: "https://linkedin.com/company/test",
          businessRef: { ref: "business" },
          control: "business-controlled",
          sameAs: ["https://linkedin.com/company/test"],
        },
      },
    });

    const profile = projectToSemanticSiteProfile(result, "https://example.com");
    expect(profile.organization.sameAs).toEqual([
      "https://www.wikidata.org/wiki/Q123456",
      "https://linkedin.com/company/test",
    ]);
  });

  it("does not project sameAs from non-social-profile WebPresence", () => {
    const result = makeMinimalResult({
      webPresences: {
        primary: {
          schema: "pbp/web-presence@1",
          id: "primary",
          type: "web-presence",
          status: "published",
          name: "Primary Website",
          kind: "primary-website",
          canonicalUrl: "https://example.com",
          businessRef: { ref: "business" },
          control: "business-controlled",
          sameAs: ["https://example.com"],
        },
      },
    });

    const profile = projectToSemanticSiteProfile(result, "https://example.com");
    expect(profile.organization.sameAs).toBeUndefined();
  });
});
