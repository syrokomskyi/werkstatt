/**
 * PBP EvidenceSource entity.
 *
 * @see pbp-specification-package/entity-model §25 (EvidenceSource)
 * @see RFC-0416
 * @see RFC-0706 (Nachweisregister evidence kind + items extensions)
 * @see ADR-0028 (Nachweisregister as PBP trust-layer extension)
 */

import type { PbpEntity } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export const EVIDENCE_SOURCE_SCHEMA_ID = pbpSchemaId("evidence-source");

export type PbpEvidenceKind =
  | "external-web-sources"
  | "verified-record"
  | "third-party-registry"
  // RFC-0706: Nachweisregister evidence types
  | "client-statement"
  | "project-confirmation"
  | "certificate"
  | "operational-evidence";

export const PBP_EVIDENCE_KINDS: readonly PbpEvidenceKind[] = [
  "external-web-sources",
  "verified-record",
  "third-party-registry",
  // RFC-0706: Nachweisregister evidence types
  "client-statement",
  "project-confirmation",
  "certificate",
  "operational-evidence",
] as const;

export function isPbpEvidenceKind(value: string): value is PbpEvidenceKind {
  return PBP_EVIDENCE_KINDS.includes(value as PbpEvidenceKind);
}

export interface PbpEvidenceSource extends PbpEntity {
  type: "evidence-source";
  name: string;
  kind: PbpEvidenceKind;
  authority: { kind: string };
  // RFC-0706: items fields are optional for file-based evidence without public URLs
  items?: Record<
    string,
    {
      url?: string;
      retrievedAt?: string;
      sha256?: string;
      storage?: "private" | "public";
      mediaType?: string;
      qualityStatus?:
        "unverified" | "verified" | "verified_with_quality_issue" | "changed" | "rejected";
    }
  >;
}
