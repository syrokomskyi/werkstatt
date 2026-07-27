/*
<MODULE_CONTRACT>
<purpose>Facilitates structured representation of input and output types for Nebula Score computation.</purpose>
<non-goals>
  <item>Do not include implementation details for score calculations.</item>
  <item>Do not manage data fetching or processing beyond type definitions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Enhance navigability and clarity of type definitions for Nebula Score computation.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/nebula — Input and output types for Nebula Score computation
 *
 * DNA-33 / RFC-0028
 */

import type { NebulaWeightKey } from "./weights.ts";

// ---------------------------------------------------------------------------
// Input types — sourced from CI artifacts
// ---------------------------------------------------------------------------

/** Lighthouse CI result aggregated across all routes (p50 of per-route scores). */
export interface LighthouseResult {
  /** 0–100 Lighthouse performance score (p50 across all app routes) */
  performanceScore: number;
  /** 0–100 Lighthouse accessibility score (p50 across all app routes) */
  accessibilityScore: number;
  /**
   * Per-route raw metric values for audit trail.
   * Keys are route paths (e.g. "/de/", "/de/spenden-kontakt").
   */
  routes?: Record<
    string,
    {
      lcp?: number; // Largest Contentful Paint in ms
      tbt?: number; // Total Blocking Time in ms
      cls?: number; // Cumulative Layout Shift (unitless)
    }
  >;
}

/** axe-core accessibility scan result. */
export interface AxeResult {
  /**
   * Total number of axe-core violations across all pages.
   * 0 = perfect; used to penalise the accessibility pillar score.
   * Each violation deducts from the base Lighthouse a11y score.
   */
  totalViolations: number;
  /** Critical violations (weight higher in normalisation) */
  criticalViolations?: number;
}

/** Content health check report from @warpgogol/site-kernel-checks aggregate. */
export interface ContentCheckReport {
  /**
   * Total content checks performed (language completeness, prop validity,
   * link resolution, alt-text coverage, etc.).
   */
  totalChecks: number;
  /** Number of passing checks */
  passingChecks: number;
  /** Failing check details (optional, used for the passport JSON breakdown) */
  failures?: Array<{ rule: string; file: string; message: string }>;
}

/** DNA-validator aggregate from @warpgogol/site-kernel-checks. */
export interface DnaCheckReport {
  /**
   * Total DNA validator commands run in build.check.
   */
  totalCommands: number;
  /** Number of commands that passed (status: "pass") */
  passingCommands: number;
  /** Failing command names */
  failingCommands?: string[];
}

/** All inputs required to compute a Nebula Score. */
export interface NebulaInputs {
  lighthouse: LighthouseResult;
  axe: AxeResult;
  contentChecks: ContentCheckReport;
  dnaChecks: DnaCheckReport;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** Per-pillar score entry in the NebulaScore output. */
export interface NebulaPillarScore {
  /** Raw 0–100 score for this pillar before weighting */
  score: number;
  /** Weight applied to this pillar */
  weight: number;
  /** Weighted contribution to the composite score (score × weight) */
  contribution: number;
}

/** Full Nebula Score computation result. */
export interface NebulaScore {
  /** Composite 0–100 Nebula Score (sum of weighted pillar contributions, rounded) */
  nebula: number;
  /** Per-pillar breakdown */
  pillars: Record<NebulaWeightKey, NebulaPillarScore>;
  /** Weight version used for this computation */
  weightsVersion: string;
  /** ISO-8601 timestamp of computation */
  computedAt: string;
}
