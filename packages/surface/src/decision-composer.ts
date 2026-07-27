/*
<MODULE_CONTRACT>
<purpose>
  Architecture review 2026-07-10: compose the final IndexDecision from pure gate results.
  Each gate (demand, evidence, substance, freshness, budget) is a small pure function that
  returns a GateResult. The composer applies precedence and produces the final IndexDecision.
  This concentrates all indexability logic in one module instead of scattered inline mutations
  in the consumer's expandBlueprint.
</purpose>
<non-goals>
  <item>Do not load data from the filesystem — gate inputs are supplied by the caller.</item>
  <item>Do not mutate VirtualRouteEntry — the caller applies the composed decision.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-10: initial implementation of composeIndexDecision and pure gate functions.</item>
</CHANGE_SUMMARY>
*/

import type { IndexDecision, IndexReason } from "./types.ts";

/** The outcome of one gate evaluation. */
export interface GateResult {
  readonly gate: "demand" | "evidence" | "substance" | "freshness" | "budget";
  readonly pass: boolean;
  readonly reason?: IndexReason;
  readonly noindex: boolean;
  /** When true, the entry should be dropped entirely (do-not-emit). */
  readonly suppress?: boolean;
  /** Gate-specific score (e.g. substance score 0..100). */
  readonly score?: number;
  /** Gate-specific metadata (e.g. werkEvidenceCount). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Precedence order: earlier gates take priority for the reason field when multiple fail. */
const GATE_PRECEDENCE: readonly GateResult["gate"][] = [
  "demand",
  "evidence",
  "freshness",
  "substance",
  "budget",
];

/**
 * Compose the final IndexDecision from a base decision (record gate) and an array of gate results.
 * Applies precedence: the first failing gate in precedence order sets the reason. Any failing gate
 * sets noindex=true. If any gate requests suppress, the entry should be dropped entirely.
 */
export function composeIndexDecision(
  base: IndexDecision,
  results: readonly GateResult[],
): { decision: IndexDecision; suppress: boolean } {
  let decision = { ...base };
  let suppress = false;

  const byGate = new Map<GateResult["gate"], GateResult>();
  for (const r of results) byGate.set(r.gate, r);

  for (const r of results) {
    if (r.suppress) suppress = true;
    if (!r.pass && r.noindex) decision.noindex = true;
    if (r.score !== undefined) decision.substanceScore = r.score;
    if (r.metadata?.werkEvidenceCount !== undefined) {
      decision.werkEvidenceCount = r.metadata.werkEvidenceCount as number;
    }
  }

  for (const gate of GATE_PRECEDENCE) {
    const r = byGate.get(gate);
    if (r && !r.pass && r.reason) {
      decision.reason = r.reason;
      break;
    }
  }

  if (byGate.get("demand")) decision.demandGate = byGate.get("demand")!.pass;
  if (byGate.get("evidence")) decision.evidenceGate = byGate.get("evidence")!.pass;
  if (byGate.get("substance")) decision.substanceGate = byGate.get("substance")!.pass;
  if (byGate.get("freshness")) decision.fresh = byGate.get("freshness")!.pass;
  if (byGate.get("budget")) decision.withinBudget = byGate.get("budget")!.pass;

  return { decision, suppress };
}

/** Demand gate: checks whether at least one qualifying demand signal exists for this entry. */
export function evaluateDemandGate(
  hasMatchingDemand: boolean,
  missingPolicy: "noindex" | "do-not-emit" = "noindex",
): GateResult {
  if (hasMatchingDemand) {
    return { gate: "demand", pass: true, noindex: false };
  }
  return {
    gate: "demand",
    pass: false,
    reason: "missing-demand",
    noindex: true,
    suppress: missingPolicy === "do-not-emit",
  };
}

/** Evidence gate: checks whether enough Werk evidence records exist for this entry. */
export function evaluateEvidenceGate(
  matchingCount: number,
  minRequired: number | undefined,
  existenceSource: "works" | undefined,
): GateResult {
  if (typeof minRequired !== "number" && !existenceSource) {
    return { gate: "evidence", pass: true, noindex: false };
  }
  const pass = typeof minRequired !== "number" || matchingCount >= minRequired;
  if (pass) {
    return {
      gate: "evidence",
      pass: true,
      noindex: false,
      metadata: { werkEvidenceCount: matchingCount },
    };
  }
  return {
    gate: "evidence",
    pass: false,
    reason: "missing-werk-evidence",
    noindex: true,
    suppress: existenceSource === "works",
    metadata: { werkEvidenceCount: matchingCount },
  };
}

/** Substance gate: checks whether the page substance score meets the minimum threshold. */
export function evaluateSubstanceGate(score: number, substanceMin: number): GateResult {
  if (substanceMin === 0 || score >= substanceMin) {
    return { gate: "substance", pass: true, noindex: false, score };
  }
  return { gate: "substance", pass: false, reason: "thin", noindex: true, score };
}

/** Freshness gate: checks whether the page's records are fresh within the SLA. */
export function evaluateFreshnessGate(fresh: boolean, hasInvalidDate: boolean): GateResult {
  if (hasInvalidDate) {
    return { gate: "freshness", pass: false, reason: "invalid-freshness", noindex: true };
  }
  if (fresh) {
    return { gate: "freshness", pass: true, noindex: false };
  }
  return { gate: "freshness", pass: false, reason: "decayed", noindex: true };
}

/** Budget gate: checks whether the entry is within the index budget. */
export function evaluateBudgetGate(withinBudget: boolean): GateResult {
  if (withinBudget) {
    return { gate: "budget", pass: true, noindex: false };
  }
  return { gate: "budget", pass: false, reason: "over-budget", noindex: true };
}
