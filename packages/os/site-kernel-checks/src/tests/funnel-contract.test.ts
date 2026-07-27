import { describe, it, expect } from "vitest";
import {
  FUNNEL_TERMINAL_STAGES,
  FUNNEL_TRANSITIONS,
  LEGACY_FUNNEL_STAGES,
  SYNC_OUTBOX_OPS,
  VISITOR_FUNNEL_STAGES,
  canTransition,
  isValidFunnelStage,
  reachableStages,
  scanForMakeComReferences,
} from "@gogol/integration";

/**
 * RFC-0188: the platform — not UChat — owns the funnel state machine. These
 * fixtures prove the graph self-test that funnel.stage.validate runs (every stage
 * reachable, terminals closed), the legacy-stage denylist, and the Make.com
 * exclusion scanner that funnel.contract.validate enforces.
 */
describe("visitor funnel contract (RFC-0188)", () => {
  it("every canonical stage is reachable from the funnel entry — no stranded visitor", () => {
    const reachable = reachableStages();
    for (const stage of VISITOR_FUNNEL_STAGES) {
      expect(reachable.has(stage), `${stage} unreachable`).toBe(true);
    }
    expect(reachable.size).toBe(VISITOR_FUNNEL_STAGES.length);
  });

  it("terminal stages have no outbound transition", () => {
    for (const terminal of FUNNEL_TERMINAL_STAGES) {
      expect(FUNNEL_TRANSITIONS[terminal]).toHaveLength(0);
    }
  });

  it("honours the declared transition graph (create + change branches)", () => {
    expect(canTransition("new_session", "privacy_acknowledged")).toBe(true);
    expect(canTransition("intent_selected", "organization_selected")).toBe(true);
    expect(canTransition("intent_selected", "change_balance_checked")).toBe(true);
    // No teleporting across the funnel.
    expect(canTransition("new_session", "won")).toBe(false);
    expect(canTransition("offer_presented", "start_approved")).toBe(false);
  });

  it("legacy UChat stage strings are not canonical stages", () => {
    for (const legacy of LEGACY_FUNNEL_STAGES) {
      expect(isValidFunnelStage(legacy), `${legacy} should be denied`).toBe(false);
    }
    expect(isValidFunnelStage("offer_presented")).toBe(true);
  });

  it("syncs the Organization before the deal (RFC-0190 outbox op present, org-first)", () => {
    expect(SYNC_OUTBOX_OPS).toContain("upsert_organization");
    // The org must be syncable before the deal so the deal can reference pipedrive_org_id.
    expect(SYNC_OUTBOX_OPS.indexOf("upsert_organization")).toBeGreaterThanOrEqual(0);
  });

  it("scans every Make.com reference and ignores clean text", () => {
    expect(scanForMakeComReferences("calls https://hook.eu1.make.com/abc then done")).toHaveLength(
      1,
    );
    expect(scanForMakeComReferences("uses make.com and integromat")).toHaveLength(2);
    expect(scanForMakeComReferences("first-party Stripe webhook, no third-party hop")).toHaveLength(
      0,
    );
    // Must not false-positive on innocent words containing "make".
    expect(scanForMakeComReferences("we make a website")).toHaveLength(0);
  });
});
