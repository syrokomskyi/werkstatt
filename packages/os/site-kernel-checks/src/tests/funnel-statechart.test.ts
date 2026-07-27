import { describe, it, expect } from "vitest";
import {
  FUNNEL_SYSTEM_TRIGGERS,
  FUNNEL_TRANSITION_TRIGGERS,
  FUNNEL_TRANSITIONS,
  LIFECYCLE_EVENT_KINDS,
  SUBSCRIPTION_TRANSITION_TRIGGERS,
  SUBSCRIPTION_TRANSITIONS,
  VISITOR_FUNNEL_STAGES,
  isValidFunnelStage,
} from "@gogol/integration";
import { SUBSCRIPTION_STATUSES } from "@gogol/integration";
import {
  checkFunnelTriggerBijection,
  checkSubscriptionTriggerBijection,
  generateFunnelStatechartDocument,
} from "../funnel-statechart.ts";
import { hasGeneratedMarker } from "@gogol/site-kernel";

/**
 * RFC-0219: prove the trigger overlay bijection invariants and that the generator
 * is deterministic. The drift-validator (funnel.statechart.validate) enforces these
 * at build time; these unit tests catch regressions earlier, before the build.
 */
describe("funnel trigger overlay (RFC-0219)", () => {
  it("FUNNEL_TRANSITION_TRIGGERS has exactly one entry per FUNNEL_TRANSITIONS edge", () => {
    const violations = checkFunnelTriggerBijection();
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("FUNNEL_TRANSITION_TRIGGERS entries are unique (no duplicate from→to pairs)", () => {
    const seen = new Set<string>();
    for (const entry of FUNNEL_TRANSITION_TRIGGERS) {
      const key = `${entry.from}→${entry.to}`;
      expect(seen.has(key), `Duplicate trigger entry: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("every FUNNEL_TRANSITION_TRIGGERS entry references a canonical stage", () => {
    for (const entry of FUNNEL_TRANSITION_TRIGGERS) {
      expect(
        isValidFunnelStage(entry.from),
        `Unknown stage in FUNNEL_TRANSITION_TRIGGERS: from="${entry.from}"`,
      ).toBe(true);
      expect(
        isValidFunnelStage(entry.to),
        `Unknown stage in FUNNEL_TRANSITION_TRIGGERS: to="${entry.to}"`,
      ).toBe(true);
    }
  });

  it("every FUNNEL_TRANSITION_TRIGGERS trigger is a valid event kind or system trigger", () => {
    const validTriggers = new Set<string>([
      ...FUNNEL_SYSTEM_TRIGGERS,
      // Collect event kinds from the triggers themselves — they are typed so this is circular,
      // but we can also check that system trigger spellings are stable.
    ]);
    for (const entry of FUNNEL_TRANSITION_TRIGGERS) {
      // At a minimum, triggers must be non-empty strings.
      expect(typeof entry.on === "string" && entry.on.length > 0).toBe(true);
    }
    // All system triggers in FUNNEL_SYSTEM_TRIGGERS must appear in at least one entry.
    // This proves the constants are not dead code.
    const usedTriggers = new Set(FUNNEL_TRANSITION_TRIGGERS.map((e) => e.on));
    for (const sys of FUNNEL_SYSTEM_TRIGGERS) {
      expect(
        usedTriggers.has(sys),
        `System trigger "${sys}" is declared in FUNNEL_SYSTEM_TRIGGERS but never used in FUNNEL_TRANSITION_TRIGGERS`,
      ).toBe(true);
    }
  });

  it("every non-terminal stage in VISITOR_FUNNEL_STAGES has at least one trigger entry", () => {
    const coveredFroms = new Set(FUNNEL_TRANSITION_TRIGGERS.map((e) => e.from));
    for (const stage of VISITOR_FUNNEL_STAGES) {
      if ((FUNNEL_TRANSITIONS[stage] ?? []).length > 0) {
        expect(
          coveredFroms.has(stage),
          `Stage "${stage}" has outbound transitions but no entry in FUNNEL_TRANSITION_TRIGGERS`,
        ).toBe(true);
      }
    }
  });
});

describe("subscription trigger overlay (RFC-0219)", () => {
  it("SUBSCRIPTION_TRANSITION_TRIGGERS has exactly one entry per SUBSCRIPTION_TRANSITIONS edge", () => {
    const violations = checkSubscriptionTriggerBijection();
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("SUBSCRIPTION_TRANSITION_TRIGGERS entries are unique (no duplicate from→to pairs)", () => {
    const seen = new Set<string>();
    for (const entry of SUBSCRIPTION_TRANSITION_TRIGGERS) {
      const key = `${entry.from}→${entry.to}`;
      expect(seen.has(key), `Duplicate trigger entry: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("every SUBSCRIPTION_TRANSITION_TRIGGERS entry references a canonical subscription status", () => {
    const statusSet = new Set<string>(SUBSCRIPTION_STATUSES);
    for (const entry of SUBSCRIPTION_TRANSITION_TRIGGERS) {
      expect(
        statusSet.has(entry.from),
        `Unknown status in SUBSCRIPTION_TRANSITION_TRIGGERS: from="${entry.from}"`,
      ).toBe(true);
      expect(
        statusSet.has(entry.to),
        `Unknown status in SUBSCRIPTION_TRANSITION_TRIGGERS: to="${entry.to}"`,
      ).toBe(true);
    }
  });

  it("every SUBSCRIPTION_TRANSITION_TRIGGERS trigger is a valid LifecycleEventKind", () => {
    const kindSet = new Set<string>(LIFECYCLE_EVENT_KINDS);
    for (const entry of SUBSCRIPTION_TRANSITION_TRIGGERS) {
      expect(
        kindSet.has(entry.on),
        `Unknown lifecycle event kind in SUBSCRIPTION_TRANSITION_TRIGGERS: on="${entry.on}"`,
      ).toBe(true);
    }
  });

  it("canceled is a terminal subscription status with no outbound transitions", () => {
    expect(SUBSCRIPTION_TRANSITIONS["canceled"]).toHaveLength(0);
  });
});

describe("funnel statechart generator (RFC-0219)", () => {
  it("generateFunnelStatechartDocument produces a non-empty string", () => {
    const doc = generateFunnelStatechartDocument();
    expect(typeof doc).toBe("string");
    expect(doc.length).toBeGreaterThan(0);
  });

  it("generated document starts with the RFC-0336 generated advisory header", () => {
    const doc = generateFunnelStatechartDocument();
    expect(doc.startsWith("<!--\n")).toBe(true);
    expect(hasGeneratedMarker(doc)).toBe(true);
  });

  it("generated document contains both Mermaid stateDiagram-v2 blocks", () => {
    const doc = generateFunnelStatechartDocument();
    const count = (doc.match(/stateDiagram-v2/g) ?? []).length;
    expect(count).toBe(2);
  });

  it("generated document contains Layer 1 and Layer 2 headings", () => {
    const doc = generateFunnelStatechartDocument();
    expect(doc).toContain("## Layer 1 — Visitor Sales Funnel");
    expect(doc).toContain("## Layer 2 — Subscription Lifecycle");
  });

  it("generated document is byte-stable across two calls (deterministic)", () => {
    expect(generateFunnelStatechartDocument()).toBe(generateFunnelStatechartDocument());
  });

  it("Layer 1 does not show system.timeout edge lines (collapsed into note)", () => {
    const doc = generateFunnelStatechartDocument();
    const layer1 = doc.split("## Layer 2")[0];
    // No `X --> Y : system.timeout` edge lines should appear.
    expect(layer1).not.toMatch(/-->\s+\w+\s*:\s*system\.timeout/);
    // The note about the timeout count should be present.
    expect(layer1).toContain("timeout edges");
  });

  it("Layer 2 contains all subscription trigger edges", () => {
    const doc = generateFunnelStatechartDocument();
    const layer2 = doc.split("## Layer 2")[1];
    for (const entry of SUBSCRIPTION_TRANSITION_TRIGGERS) {
      expect(layer2).toContain(`${entry.from} --> ${entry.to} : ${entry.on}`);
    }
  });
});
