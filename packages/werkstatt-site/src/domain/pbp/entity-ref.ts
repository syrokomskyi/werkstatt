/**
 * PBP EntityRef and identity relation types.
 *
 * @see pbp-specification-package/entity-model §4.1 (EntityRef)
 * @see pbp-specification-package/system-spec §5.5 (Identity equivalence)
 * @see RFC-0399
 */

export interface PbpEntityRef {
  ref: string;
  expectedType?: string;
}

export type PbpIdentityRelation =
  "sameIdentityAs" | "equivalentTo" | "similarTo" | "supersedes" | "derivedFrom";

export const PBP_IDENTITY_RELATIONS: readonly PbpIdentityRelation[] = [
  "sameIdentityAs",
  "equivalentTo",
  "similarTo",
  "supersedes",
  "derivedFrom",
] as const;
