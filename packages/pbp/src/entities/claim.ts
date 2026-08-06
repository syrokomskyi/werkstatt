/**
 * PBP Claim entity.
 *
 * @see pbp-specification-package/entity-model §24 (Claim)
 * @see RFC-0405
 * @see RFC-0706 (statementLang extension)
 * @see ADR-0028 (verificationLevel extension)
 */

import type { PbpEntity, PbpGovernance } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const CLAIM_SCHEMA_ID = pbpSchemaId("claim");

export type PbpClaimClass =
  | "comparative-commercial"
  | "comparative-technical"
  | "factual"
  | "risk"
  | "benefit"
  | "limitation";

export const PBP_CLAIM_CLASSES: readonly PbpClaimClass[] = [
  "comparative-commercial",
  "comparative-technical",
  "factual",
  "risk",
  "benefit",
  "limitation",
] as const;

export type PbpClaimKind =
  "risk" | "benefit" | "comparison" | "fact" | "limitation" | "recommendation";

export const PBP_CLAIM_KINDS: readonly PbpClaimKind[] = [
  "risk",
  "benefit",
  "comparison",
  "fact",
  "limitation",
  "recommendation",
] as const;

// ADR-0028: Nachweisregister verification levels (N0–N3)
export type PbpVerificationLevel = "N0" | "N1" | "N2" | "N3";

export const PBP_VERIFICATION_LEVELS: readonly PbpVerificationLevel[] = [
  "N0",
  "N1",
  "N2",
  "N3",
] as const;

export interface PbpClaim extends PbpEntity {
  type: "claim";
  claimClass: PbpClaimClass;
  claimKind: PbpClaimKind;
  subject: {
    kind: string;
    name: string;
  };
  statement: string;
  evidenceRefs?: Record<string, PbpEntityRef>;
  governance: PbpGovernance;
  publication?: {
    staleBehavior: "block" | "warn" | "omit";
    showAsOfDate: boolean;
    showEvidenceLabel: boolean;
  };
  confidence?: "high" | "medium" | "low";
  statementLang?: string;
  verificationLevel?: PbpVerificationLevel;
}
