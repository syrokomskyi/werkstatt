/**
 * PBP SemanticStatus — closed vocabulary for field-value semantic state.
 *
 * Distinct from PbpEntityStatus (publication state).
 *
 * @see pbp-specification-package/entity-model §4.9 (SemanticStatus)
 * @see RFC-0400
 */

export type PbpSemanticStatus =
  | "declared"
  | "derived"
  | "not-declared"
  | "not-applicable"
  | "unavailable"
  | "invalid"
  | "stale"
  | "not-comparable";

export const PBP_SEMANTIC_STATUSES: readonly PbpSemanticStatus[] = [
  "declared",
  "derived",
  "not-declared",
  "not-applicable",
  "unavailable",
  "invalid",
  "stale",
  "not-comparable",
] as const;

export function isPbpSemanticStatus(value: string): value is PbpSemanticStatus {
  return PBP_SEMANTIC_STATUSES.includes(value as PbpSemanticStatus);
}
