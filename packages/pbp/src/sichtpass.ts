/**
 * PBP Sichtpass / Verifiable Credential mapping.
 *
 * @see pbp-specification-package/compiler Phase 14 (Publication)
 * @see RFC-0460
 */

import type { PbpEntityRef } from "./entity-ref.js";
import type { PbpSignatureAlgorithm } from "./signature.js";

export interface PbpVerifiableCredentialMapping {
  vcType: string;
  entityRef: PbpEntityRef;
  claimMapping: Record<string, string>;
  proofType: PbpSignatureAlgorithm;
}

export interface PbpSichtpassMapping {
  publicationSnapshotRef: string;
  credentialMappings: PbpVerifiableCredentialMapping[];
  issuerRef: PbpEntityRef;
}
