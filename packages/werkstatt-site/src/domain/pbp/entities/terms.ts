/**
 * PBP terms and commercial lifecycle.
 *
 * @see pbp-specification-package/entity-model §19 (Terms)
 * @see RFC-0438
 */

import type { PbpEntityRef } from "../entity-ref.js";

export type PbpRenewalMode = "automatic" | "manual" | "none";

export const PBP_RENEWAL_MODES: readonly PbpRenewalMode[] = [
  "automatic",
  "manual",
  "none",
] as const;

export function isPbpRenewalMode(value: string): value is PbpRenewalMode {
  return PBP_RENEWAL_MODES.includes(value as PbpRenewalMode);
}

export interface PbpTerms {
  minimumTerm?: string;
  renewal?: { mode: PbpRenewalMode; period: string };
  cancellation?: { policyRef: PbpEntityRef };
  priceChanges?: { policyRef: PbpEntityRef };
}
