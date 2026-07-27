/**
 * PBP Signature Envelope contract.
 *
 * @see pbp-specification-package/compiler Phase 14 (Publication), §24.4 (Signature)
 * @see RFC-0459
 */

export type PbpSignatureAlgorithm = "ed25519" | "rsa-pss-sha256" | "ecdsa-p256-sha256";

export const PBP_SIGNATURE_ALGORITHMS: readonly PbpSignatureAlgorithm[] = [
  "ed25519",
  "rsa-pss-sha256",
  "ecdsa-p256-sha256",
] as const;

export function isPbpSignatureAlgorithm(value: string): value is PbpSignatureAlgorithm {
  return PBP_SIGNATURE_ALGORITHMS.includes(value as PbpSignatureAlgorithm);
}

export interface PbpSignatureEnvelope {
  algorithm: PbpSignatureAlgorithm;
  value: string;
  publicKeyRef?: string;
  signedAt: string;
}
