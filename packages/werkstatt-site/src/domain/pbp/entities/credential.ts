/**
 * PBP Credential entity (federated identity layer).
 *
 * @see pbp-specification-package/entity-model §28 (Credential)
 * @see pbp-specification-package/system-spec §4.2 (Federated Identity Layer)
 * @see RFC-0418
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const CREDENTIAL_SCHEMA_ID = pbpSchemaId("credential");

export type PbpCredentialKind =
  "professional-qualification" | "certification" | "license" | "accreditation";

export const PBP_CREDENTIAL_KINDS: readonly PbpCredentialKind[] = [
  "professional-qualification",
  "certification",
  "license",
  "accreditation",
] as const;

export function isPbpCredentialKind(value: string): value is PbpCredentialKind {
  return PBP_CREDENTIAL_KINDS.includes(value as PbpCredentialKind);
}

export interface PbpCredential extends PbpEntity {
  type: "credential";
  kind: PbpCredentialKind;
  credentialTypeRef: string;
  holderRef: PbpEntityRef;
  issuerRef: PbpEntityRef;
  issuedAt: string;
  expiresAt?: string | null;
  verification?: {
    evidenceRef?: PbpEntityRef;
    verifiableCredentialRef?: string | null;
  };
}
