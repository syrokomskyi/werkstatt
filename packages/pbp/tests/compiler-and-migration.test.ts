import { describe, it, expect } from "vitest";
import type {
  PbpLocaleFieldPolicy,
  PbpLocaleResolutionStatus,
  PbpFallbackEntry,
  PbpFallbackReport,
  PbpReferenceClass,
  PbpExternalRefKind,
  PbpGraphErrorKind,
  PbpGraphIntegrityError,
  PbpCycleCheckType,
  PbpCycleCheckResult,
  PbpLegacySourceFile,
  PbpMigrationDecision,
  PbpUnresolvedItem,
  PbpExtractionResult,
} from "../src/index.js";

describe("RFC-0406: Locale types", () => {
  it("PbpLocaleFieldPolicy has 4 values", () => {
    const policies: PbpLocaleFieldPolicy[] = [
      "localizable",
      "invariant",
      "locale-variant-allowed",
      "not-localized",
    ];
    expect(policies).toHaveLength(4);
  });

  it("PbpLocaleResolutionStatus has 3 values", () => {
    const statuses: PbpLocaleResolutionStatus[] = [
      "full-locale",
      "full-file-fallback",
      "partial-fallback",
    ];
    expect(statuses).toHaveLength(3);
  });

  it("PbpFallbackReport shape", () => {
    const report: PbpFallbackReport = {
      locale: "uk",
      fallbacks: [
        {
          entityId: "https://example/id/product/foo",
          path: "/outcomes/operation/name",
          sourceLocale: "de",
          targetLocale: "uk",
          severity: "warning",
        } satisfies PbpFallbackEntry,
      ],
    };
    expect(report.fallbacks).toHaveLength(1);
  });
});

describe("RFC-0407: Reference resolution types", () => {
  it("PbpReferenceClass has 4 values", () => {
    const classes: PbpReferenceClass[] = [
      "required",
      "optional",
      "external-opaque",
      "deferred-runtime",
    ];
    expect(classes).toHaveLength(4);
  });

  it("PbpExternalRefKind has 4 values", () => {
    const kinds: PbpExternalRefKind[] = [
      "trusted-registry-snapshot",
      "resolvable-https",
      "cached-verified-record",
      "opaque-identifier",
    ];
    expect(kinds).toHaveLength(4);
  });

  it("PbpGraphErrorKind has 5 values", () => {
    const errors: PbpGraphErrorKind[] = [
      "missing-internal-ref",
      "type-mismatch",
      "cycle-detected",
      "external-ref-unresolvable",
      "locale-suffix-in-id",
    ];
    expect(errors).toHaveLength(5);
  });

  it("PbpCycleCheckResult shape", () => {
    const result: PbpCycleCheckResult = {
      checkType: "requires" satisfies PbpCycleCheckType,
      hasCycle: false,
    };
    expect(result.hasCycle).toBe(false);
  });

  it("PbpGraphIntegrityError shape", () => {
    const error: PbpGraphIntegrityError = {
      kind: "missing-internal-ref",
      entityId: "https://example/id/product/foo",
      refPath: "/authorityRef",
      message: "Entity not found in build graph",
    };
    expect(error.kind).toBe("missing-internal-ref");
  });
});

describe("RFC-0408: Migration extraction types", () => {
  it("PbpMigrationDecision has 4 values", () => {
    const decisions: PbpMigrationDecision[] = [
      "extracted",
      "needs-owner-decision",
      "deferred",
      "not-applicable",
    ];
    expect(decisions).toHaveLength(4);
  });

  it("PbpExtractionResult shape", () => {
    const result: PbpExtractionResult = {
      sourceFile: "company.md",
      targetEntities: ["business", "brand"],
      decisions: { name: "extracted" },
      unresolved: [
        {
          field: "hourlyRate",
          reason: "Unresolved per ADR-044",
          sourceFile: "offer.md",
        } satisfies PbpUnresolvedItem,
      ],
    };
    expect(result.targetEntities).toHaveLength(2);
    expect(result.unresolved).toHaveLength(1);
  });

  it("PbpLegacySourceFile shape", () => {
    const file: PbpLegacySourceFile = {
      file: "company.md",
      currentRole: "business description",
      problem: "mixes Business, Brand, market, territory and Product promise",
    };
    expect(file.file).toBe("company.md");
  });
});
