/**
 * PBP PublicDocument entity.
 *
 * @see pbp-specification-package/entity-model §30 (PublicDocument)
 * @see RFC-0420
 */

import type { PbpEntity, PbpGovernance } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export const PUBLIC_DOCUMENT_SCHEMA_ID = pbpSchemaId("public-document");

export type PbpDocumentKind =
  "terms-and-conditions" | "privacy-policy" | "imprint" | "legal-notice";

export const PBP_DOCUMENT_KINDS: readonly PbpDocumentKind[] = [
  "terms-and-conditions",
  "privacy-policy",
  "imprint",
  "legal-notice",
] as const;

export function isPbpDocumentKind(value: string): value is PbpDocumentKind {
  return PBP_DOCUMENT_KINDS.includes(value as PbpDocumentKind);
}

export interface PbpPublicDocument extends PbpEntity {
  type: "public-document";
  kind: PbpDocumentKind;
  name: string;
  canonicalUrl: string;
  governance: PbpGovernance;
}
