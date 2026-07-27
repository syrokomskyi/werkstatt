/**
 * PBP Normalization contract.
 *
 * @see pbp-specification-package/migration-plan §3.6 (Decision statuses), §3.3 (Provenance)
 * @see pbp-specification-package/system-spec §3.9 (Minimize hidden inferences)
 * @see RFC-0424
 */

export type PbpNormalizationDecision =
  | "transformed"
  | "derived-not-stored"
  | "merged"
  | "discarded-as-presentation"
  | "discarded-as-duplicate"
  | "moved-private"
  | "needs-owner-decision"
  | "invalid-source"
  | "not-applicable";

export const PBP_NORMALIZATION_DECISIONS: readonly PbpNormalizationDecision[] = [
  "transformed",
  "derived-not-stored",
  "merged",
  "discarded-as-presentation",
  "discarded-as-duplicate",
  "moved-private",
  "needs-owner-decision",
  "invalid-source",
  "not-applicable",
] as const;

export function isPbpNormalizationDecision(value: string): value is PbpNormalizationDecision {
  return PBP_NORMALIZATION_DECISIONS.includes(value as PbpNormalizationDecision);
}

export interface PbpNormalizationRule {
  sourceField: string;
  targetField?: string;
  decision: PbpNormalizationDecision;
  reason: string;
  provenance: "business-declared" | "derived";
}

export interface PbpNormalizationResult {
  rules: PbpNormalizationRule[];
  unresolved: string[];
}
