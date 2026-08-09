/**
 * PBP Disclosure entity.
 *
 * @see pbp-specification-package/entity-model §26 (Disclosure)
 * @see RFC-0417
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const DISCLOSURE_SCHEMA_ID = pbpSchemaId("disclosure");

export type PbpDisclosureKind =
  "technology-dependency" | "data-processing" | "ownership-change" | "regulatory";

export const PBP_DISCLOSURE_KINDS: readonly PbpDisclosureKind[] = [
  "technology-dependency",
  "data-processing",
  "ownership-change",
  "regulatory",
] as const;

export function isPbpDisclosureKind(value: string): value is PbpDisclosureKind {
  return PBP_DISCLOSURE_KINDS.includes(value as PbpDisclosureKind);
}

export type PbpDisclosureMateriality = "informative" | "material" | "critical";

export const PBP_DISCLOSURE_MATERIALITIES: readonly PbpDisclosureMateriality[] = [
  "informative",
  "material",
  "critical",
] as const;

export function isPbpDisclosureMateriality(value: string): value is PbpDisclosureMateriality {
  return PBP_DISCLOSURE_MATERIALITIES.includes(value as PbpDisclosureMateriality);
}

export interface PbpDisclosure extends PbpEntity {
  type: "disclosure";
  kind: PbpDisclosureKind;
  name: string;
  statement: string;
  scope?: { offeringRefs?: Record<string, PbpEntityRef> };
  relatedPartyRef?: PbpEntityRef;
  materiality: PbpDisclosureMateriality;
  publication: { required: boolean };
}
