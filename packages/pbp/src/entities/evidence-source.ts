/**
 * PBP EvidenceSource entity.
 *
 * @see pbp-specification-package/entity-model §25 (EvidenceSource)
 * @see RFC-0416
 */

import type { PbpEntity } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export const EVIDENCE_SOURCE_SCHEMA_ID = pbpSchemaId("evidence-source");

export type PbpEvidenceKind = "external-web-sources" | "verified-record" | "third-party-registry";

export const PBP_EVIDENCE_KINDS: readonly PbpEvidenceKind[] = [
  "external-web-sources",
  "verified-record",
  "third-party-registry",
] as const;

export function isPbpEvidenceKind(value: string): value is PbpEvidenceKind {
  return PBP_EVIDENCE_KINDS.includes(value as PbpEvidenceKind);
}

export interface PbpEvidenceSource extends PbpEntity {
  type: "evidence-source";
  name: string;
  kind: PbpEvidenceKind;
  authority: { kind: string };
  items?: Record<string, { url: string; retrievedAt: string }>;
}
