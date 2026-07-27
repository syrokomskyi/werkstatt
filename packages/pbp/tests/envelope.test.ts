import { describe, it, expect, expectTypeOf } from "vitest";
import {
  PBP_ENTITY_STATUSES,
  isPbpEntityStatus,
  PBP_IDENTITY_RELATIONS,
  type PbpEntity,
  type PbpEntityStatus,
  type PbpGovernance,
  type PbpEntityRef,
  type PbpIdentityRelation,
} from "../src/index.js";

describe("PbpEntityStatus", () => {
  it("exports the closed vocabulary", () => {
    expect(PBP_ENTITY_STATUSES).toEqual([
      "draft",
      "published",
      "suspended",
      "retired",
      "superseded",
    ]);
  });

  it("isPbpEntityStatus narrows correctly", () => {
    expect(isPbpEntityStatus("draft")).toBe(true);
    expect(isPbpEntityStatus("published")).toBe(true);
    expect(isPbpEntityStatus("invalid")).toBe(false);
    expect(isPbpEntityStatus("")).toBe(false);
  });
});

describe("PbpEntity interface", () => {
  it("accepts a minimal entity", () => {
    const entity: PbpEntity = {
      schema: "pbp/business@1",
      id: "https://example.com/id/business/example",
      type: "business",
      status: "draft",
    };
    expect(entity.status).toBe("draft");
  });

  it("accepts a full entity with governance", () => {
    const governance: PbpGovernance = {
      authorityRef: "https://example.com/id/business/example",
      effectiveFrom: "2026-07-01",
      reviewedAt: "2026-07-01",
      reviewEvery: "P1Y",
      maintenanceOwnerRef: "agent:business-maintainer",
    };
    const entity: PbpEntity = {
      schema: "pbp/business@1",
      id: "https://example.com/id/business/example",
      type: "business",
      status: "published",
      name: "Example GmbH",
      summary: "A sample business",
      governance,
    };
    expect(entity.governance?.authorityRef).toBe(governance.authorityRef);
  });

  it("PbpEntityStatus type is the union", () => {
    expectTypeOf<PbpEntityStatus>().toEqualTypeOf<
      "draft" | "published" | "suspended" | "retired" | "superseded"
    >();
  });
});

describe("PbpEntityRef", () => {
  it("accepts a ref with optional expectedType", () => {
    const ref: PbpEntityRef = {
      ref: "https://example.com/id/product/example",
      expectedType: "product",
    };
    expect(ref.expectedType).toBe("product");

    const bare: PbpEntityRef = { ref: "https://example.com/id/product/example" };
    expect(bare.expectedType).toBeUndefined();
  });
});

describe("PbpIdentityRelation", () => {
  it("exports the five relation types", () => {
    expect(PBP_IDENTITY_RELATIONS).toEqual([
      "sameIdentityAs",
      "equivalentTo",
      "similarTo",
      "supersedes",
      "derivedFrom",
    ]);
  });

  it("PbpIdentityRelation type is the union", () => {
    expectTypeOf<PbpIdentityRelation>().toEqualTypeOf<
      "sameIdentityAs" | "equivalentTo" | "similarTo" | "supersedes" | "derivedFrom"
    >();
  });
});
