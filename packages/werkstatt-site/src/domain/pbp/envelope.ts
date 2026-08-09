/**
 * PBP entity envelope, status vocabulary, and governance block.
 *
 * @see pbp-specification-package/entity-model §3 (Entity envelope)
 * @see RFC-0399
 */

export type PbpEntityStatus = "draft" | "published" | "suspended" | "retired" | "superseded";

export const PBP_ENTITY_STATUSES: readonly PbpEntityStatus[] = [
  "draft",
  "published",
  "suspended",
  "retired",
  "superseded",
] as const;

export function isPbpEntityStatus(value: string): value is PbpEntityStatus {
  return PBP_ENTITY_STATUSES.includes(value as PbpEntityStatus);
}

export interface PbpGovernance {
  authorityRef: string;
  effectiveFrom?: string;
  reviewedAt?: string;
  reviewEvery?: string;
  maintenanceOwnerRef?: string;
}

export interface PbpEntity {
  schema: string;
  id: string;
  type: string;
  status: PbpEntityStatus;
  name?: string;
  summary?: string;
  governance?: PbpGovernance;
  locale?: string;
}
