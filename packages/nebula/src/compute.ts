/* <MODULE_CONTRACT>
<purpose>Facilitates the computation of a composite Nebula Score based on various performance, accessibility, content health, and architectural compliance metrics.</purpose>
<non-goals>
  <item>Do not handle raw data parsing or input validation beyond score computation.</item>
  <item>Do not manage external dependencies or orchestration of CI processes.</item>
  <item>Do not modify or persist state outside of score computation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Fix createStubNebulaInputs: performanceScore/accessibilityScore 0→100 to match all-passing JSDoc.</item>
  <item>Export derive functions for direct unit testing.</item>
  <item>Add toPassportScores projection helper to eliminate manual field mapping in passport emit.</item>
</CHANGE_SUMMARY> */

/**
 * @warpgogol/nebula — Nebula Score computation
 *
 * DNA-33 / RFC-0028
 *
 * DETERMINISM CONTRACT: Given identical NebulaInputs, computeNebulaScore()
 * produces identical output. No random, no Date.now() in the score values.
 * Only `computedAt` reflects wall time (excluded from digest).
 */

import { NEBULA_WEIGHTS, NEBULA_WEIGHTS_VERSION } from "./weights.ts";
import type { NebulaWeightKey } from "./weights.ts";
import type {
  NebulaInputs,
  NebulaScore,
  NebulaPillarScore,
  LighthouseResult,
  AxeResult,
  ContentCheckReport,
  DnaCheckReport,
} from "./types.ts";
import { computePillarScores } from "./pillar-registry.ts";

// ---------------------------------------------------------------------------
// Pillar score derivation
// ---------------------------------------------------------------------------

/**
 * Derive the Performance pillar score (0–100) from Lighthouse results.
 *
 * Uses the Lighthouse performance score directly (already 0–100).
 * Lighthouse CI is configured to run against the built artifact; the score
 * is the p50 of per-route performance scores.
 */
export function derivePerformanceScore(lighthouse: LighthouseResult): number {
  return clamp(Math.round(lighthouse.performanceScore), 0, 100);
}

/**
 * Derive the Accessibility pillar score (0–100) from Lighthouse + axe.
 *
 * Base: Lighthouse a11y score (0–100).
 * Penalty: each axe violation deducts 2 points (critical: 5 points).
 * Floor: 0.
 */
export function deriveAccessibilityScore(lighthouse: LighthouseResult, axe: AxeResult): number {
  const base = lighthouse.accessibilityScore;
  const normalViolations = (axe.totalViolations ?? 0) - (axe.criticalViolations ?? 0);
  const criticalViolations = axe.criticalViolations ?? 0;
  const penalty = normalViolations * 2 + criticalViolations * 5;
  return clamp(Math.round(base - penalty), 0, 100);
}

/**
 * Derive the Content Health pillar score (0–100) from content check results.
 *
 * Ratio of passing checks to total checks, scaled to 0–100.
 * 0 total checks = 100 (vacuously passing — no content checks authored yet).
 */
export function deriveContentHealthScore(contentChecks: ContentCheckReport): number {
  if (contentChecks.totalChecks === 0) return 100;
  const ratio = contentChecks.passingChecks / contentChecks.totalChecks;
  return clamp(Math.round(ratio * 100), 0, 100);
}

/**
 * Derive the Architectural Compliance pillar score (0–100) from DNA check results.
 *
 * Ratio of passing DNA validator commands to total DNA validator commands, scaled to 0–100.
 * 0 total commands = 100 (vacuously passing — no validators registered yet).
 */
export function deriveArchitecturalComplianceScore(dnaChecks: DnaCheckReport): number {
  if (dnaChecks.totalCommands === 0) return 100;
  const ratio = dnaChecks.passingCommands / dnaChecks.totalCommands;
  return clamp(Math.round(ratio * 100), 0, 100);
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Compute the composite Nebula Score from four input pillars.
 *
 * @param inputs — CI-captured pillar inputs (deterministic given same build)
 * @returns NebulaScore with composite score and per-pillar breakdown
 *
 * INVARIANT: Given identical inputs, this function produces identical output.
 * The only non-deterministic field is `computedAt` (wall time), which is
 * not included in any digest or signature.
 */
// @ai-invariant: computeNebulaScore is deterministic for identical inputs.
// Weights are versioned via NEBULA_WEIGHTS_VERSION — changing weights requires
// bumping the version. The score is embedded in the Cosmic Passport and must
// remain byte-stable for a given (inputs, weightsVersion) pair.

export function computeNebulaScore(inputs: NebulaInputs): NebulaScore {
  const pillars = computePillarScores(inputs);

  let compositeRaw = 0;
  for (const key of Object.keys(pillars) as Array<NebulaWeightKey>) {
    compositeRaw += pillars[key].contribution;
  }

  const nebula = clamp(Math.round(compositeRaw), 0, 100);

  // Guard: composite should never exceed bounds given clamped inputs
  if (nebula > 100 || nebula < 0) {
    throw new Error(
      `[nebula] Composite score ${nebula} is out of bounds [0,100]. ` +
        `This is a bug — check pillar clamping logic.`,
    );
  }

  return {
    nebula,
    pillars,
    weightsVersion: NEBULA_WEIGHTS_VERSION,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Stub input factory — used by validators and tests when real CI data
// is unavailable (e.g., during wave-1 wiring before CI is configured)
// ---------------------------------------------------------------------------

/**
 * Create a stub NebulaInputs with all-passing values.
 * Used by nebula.score.compute in --dry-run mode.
 */
export function createStubNebulaInputs(): NebulaInputs {
  return {
    lighthouse: { performanceScore: 100, accessibilityScore: 100 },
    axe: { totalViolations: 0 },
    contentChecks: { totalChecks: 0, passingChecks: 0 },
    dnaChecks: { totalCommands: 0, passingCommands: 0 },
  };
}

// ---------------------------------------------------------------------------
// Passport projection — strips contribution/weightsVersion/computedAt
// ---------------------------------------------------------------------------

/** Passport scores shape: per-pillar score + weight only (no contribution). */
export interface PassportPillarScore {
  score: number;
  weight: number;
}

/** Passport scores shape: composite + pillars (no weightsVersion/computedAt). */
export interface PassportScores {
  nebula: number;
  pillars: Record<NebulaWeightKey, PassportPillarScore>;
}

/** Project a NebulaScore into the passport schema's scores shape. */
export function toPassportScores(score: NebulaScore): PassportScores {
  const pillars = {} as Record<NebulaWeightKey, PassportPillarScore>;
  for (const key of Object.keys(score.pillars) as Array<NebulaWeightKey>) {
    const p = score.pillars[key];
    pillars[key] = { score: p.score, weight: p.weight };
  }
  return { nebula: score.nebula, pillars };
}
