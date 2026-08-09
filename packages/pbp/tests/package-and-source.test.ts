import { describe, it, expect } from "vitest";
import {
  PBP_SOURCE_ADAPTER_TYPES,
  isPbpSourceAdapterType,
  type PbpPackageManifest,
  type PbpBuildRequest,
} from "../src/index.js";

describe("PbpSourceAdapterType", () => {
  it("exports the 5 adapter types", () => {
    expect(PBP_SOURCE_ADAPTER_TYPES).toEqual([
      "manifest-directory",
      "jsonl-dataset",
      "sql-adapter",
      "external-api-adapter",
      "runtime-overlay-adapter",
    ]);
  });

  it("isPbpSourceAdapterType narrows correctly", () => {
    expect(isPbpSourceAdapterType("manifest-directory")).toBe(true);
    expect(isPbpSourceAdapterType("sql-adapter")).toBe(true);
    expect(isPbpSourceAdapterType("unknown")).toBe(false);
    expect(isPbpSourceAdapterType("")).toBe(false);
  });
});

describe("PbpPackageManifest", () => {
  it("accepts a valid manifest", () => {
    const manifest: PbpPackageManifest = {
      schema: "pbp/package@1",
      id: "https://warpgogol.com/id/package/public-business-profile",
      defaultLocale: "de",
      locales: {
        de: { sourceRef: "./de" },
        uk: { sourceRef: "./uk", fallbackRef: "./de" },
      },
      sources: {
        curated: { type: "manifest-directory", path: "." },
      },
      build: { strict: true, failOnWarnings: false },
    };
    expect(manifest.defaultLocale).toBe("de");
    expect(manifest.locales.uk.fallbackRef).toBe("./de");
  });
});

describe("PbpBuildRequest", () => {
  it("accepts a valid build request", () => {
    const request: PbpBuildRequest = {
      locale: "uk",
      asOf: "2026-07-18T18:00:00+02:00",
      projectionTargets: ["website", "ai-answer", "schema-org", "buyer-view"],
      includeRuntimeState: false,
      strictness: "production",
    };
    expect(request.strictness).toBe("production");
  });
});
