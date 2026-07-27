/**
 * PBP Comparison Projection output contract.
 *
 * @see pbp-specification-package/compiler §23 (Comparison Projection)
 * @see RFC-0454
 */

import type { PbpEntityRef } from "../entity-ref.js";

export type PbpComparisonStatus = "comparable" | "incomparable" | "missing";

export const PBP_COMPARISON_STATUSES: readonly PbpComparisonStatus[] = [
  "comparable",
  "incomparable",
  "missing",
] as const;

export function isPbpComparisonStatus(value: string): value is PbpComparisonStatus {
  return PBP_COMPARISON_STATUSES.includes(value as PbpComparisonStatus);
}

export interface PbpComparisonResult {
  dimension: string;
  status: PbpComparisonStatus;
  values: Record<string, unknown>;
  reason?: string;
}

export interface PbpComparisonProjection {
  projectionTarget: "comparison";
  profileRef: PbpEntityRef;
  offeringRefs: PbpEntityRef[];
  results: PbpComparisonResult[];
}
