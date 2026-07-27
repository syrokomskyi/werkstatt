import { describe, it, expect } from "vitest";
import { effectAssignmentSchema } from "@gogol/share/schemas/effects";
import { classifyEffectIssue } from "../effects-contract.ts";

/**
 * RFC-0156: effects.contract.validate evaluates the same predicates as the
 * effectAssignmentSchema.superRefine guard. These fixtures prove the two rule
 * codes the RFC names — unsupported-kind-for-target and duplicate-kind-in-stack —
 * fire, and that the command's classifier maps them correctly.
 */
describe("effects.contract.validate predicates (RFC-0156)", () => {
  it("accepts glass on a surface target", () => {
    const r = effectAssignmentSchema.safeParse({
      target: "panel",
      stack: [{ kind: "glass", enabled: true }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a typographic kind on the heading target", () => {
    const r = effectAssignmentSchema.safeParse({
      target: "heading",
      stack: [{ kind: "shadow", enabled: true }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects glass on the heading target → unsupported-kind-for-target", () => {
    const r = effectAssignmentSchema.safeParse({
      target: "heading",
      stack: [{ kind: "glass", enabled: true }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const codes = r.error.issues.map((i) => classifyEffectIssue(i.message));
      expect(codes).toContain("unsupported-kind-for-target");
    }
  });

  it("rejects two glass effects in one stack → duplicate-kind-in-stack", () => {
    const r = effectAssignmentSchema.safeParse({
      target: "panel",
      stack: [
        { kind: "glass", enabled: true },
        { kind: "glass", enabled: false },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const codes = r.error.issues.map((i) => classifyEffectIssue(i.message));
      expect(codes).toContain("duplicate-kind-in-stack");
    }
  });
});
