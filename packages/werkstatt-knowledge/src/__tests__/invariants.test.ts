import { describe, it, expect } from "vitest";
import { KNOWLEDGE_INVARIANTS } from "../invariants/knowledge-invariants.ts";

describe("KNOWLEDGE_INVARIANTS", () => {
  it("declares exactly 28 invariants", () => {
    expect(KNOWLEDGE_INVARIANTS).toHaveLength(28);
  });

  it("all invariants have unique sequential IDs KNO-001..028", () => {
    const ids = KNOWLEDGE_INVARIANTS.map((inv) => inv.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(28);
    for (let i = 1; i <= 28; i++) {
      const id = `KNO-${String(i).padStart(3, "0")}`;
      expect(ids).toContain(id);
    }
  });

  it("all invariants have non-empty descriptions", () => {
    for (const inv of KNOWLEDGE_INVARIANTS) {
      expect(inv.description).toBeTruthy();
      expect(inv.description.length).toBeGreaterThan(10);
    }
  });

  it("all invariants reference a valid check command", () => {
    const validChecks = new Set([
      "knowledge.verify",
      "knowledge.source.scan",
      "knowledge.source.verify",
      "knowledge.source.status",
      "knowledge.extract.run",
      "knowledge.audit",
      "knowledge.coverage",
      "knowledge.materialize.verify",
      "knowledge.release.check",
      "knowledge.promote",
    ]);
    for (const inv of KNOWLEDGE_INVARIANTS) {
      expect(validChecks.has(inv.check!)).toBe(true);
    }
  });

  it("KNO-001 maps to knowledge.verify", () => {
    const kno001 = KNOWLEDGE_INVARIANTS.find((inv) => inv.id === "KNO-001");
    expect(kno001?.check).toBe("knowledge.verify");
  });

  it("KNO-002 maps to knowledge.source.scan", () => {
    const kno002 = KNOWLEDGE_INVARIANTS.find((inv) => inv.id === "KNO-002");
    expect(kno002?.check).toBe("knowledge.source.scan");
  });

  it("KNO-006 maps to knowledge.extract.run", () => {
    const kno006 = KNOWLEDGE_INVARIANTS.find((inv) => inv.id === "KNO-006");
    expect(kno006?.check).toBe("knowledge.extract.run");
  });

  it("KNO-021 and KNO-022 map to knowledge.release.check", () => {
    const kno021 = KNOWLEDGE_INVARIANTS.find((inv) => inv.id === "KNO-021");
    const kno022 = KNOWLEDGE_INVARIANTS.find((inv) => inv.id === "KNO-022");
    expect(kno021?.check).toBe("knowledge.release.check");
    expect(kno022?.check).toBe("knowledge.release.check");
  });

  it("KNO-026 maps to knowledge.promote", () => {
    const kno026 = KNOWLEDGE_INVARIANTS.find((inv) => inv.id === "KNO-026");
    expect(kno026?.check).toBe("knowledge.promote");
  });
});
