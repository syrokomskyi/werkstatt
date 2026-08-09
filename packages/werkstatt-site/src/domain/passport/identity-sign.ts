/*
<MODULE_CONTRACT>
<purpose>
RFC-0558: Identity credential signing and verification — canonicalization and
sign/verify wrappers for SiteOwnershipCredential and ActorDelegationCredential
subjects, built on the existing Ed25519 signBytes/verifyBytes primitives.
</purpose>
<non-goals>
  <item>Do not handle key storage or management — private keys arrive as env vars.</item>
  <item>Do not assemble full W3C VC envelopes — callers attach the proof after signing.</item>
  <item>Do not modify sign.ts — this module wraps signBytes/verifyBytes, not signCredential.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0558: initial identity credential signing module.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/werkstatt-site/passport/identity-sign — Identity credential signing (RFC-0558)
 *
 * Uses signBytes/verifyBytes from sign.ts with a dedicated canonicalization
 * function for identity credential subjects. signCredential is NOT reused —
 * it is typed to CredentialSubjectDigest (build provenance fields) and cannot
 * accept identity credential subjects.
 */

import { signBytes, verifyBytes } from "./sign.ts";
import type {
  SiteOwnershipCredentialSubject,
  ActorDelegationCredentialSubject,
  VCProof,
} from "./schema.ts";

export type IdentityCredentialSubject =
  SiteOwnershipCredentialSubject | ActorDelegationCredentialSubject;

/**
 * Produce canonical UTF-8 bytes from an identity credential subject.
 * DETERMINISM: identical inputs → identical bytes (sorted-key JSON, no whitespace).
 */
export function identityCredentialBytes(subject: IdentityCredentialSubject): Uint8Array {
  const canonical = JSON.stringify(subject, Object.keys(subject).sort());
  return new TextEncoder().encode(canonical);
}

/**
 * Sign an identity credential subject and produce a W3C VC proof.
 *
 * @param subject             — identity credential subject fields
 * @param privateKeyHex       — 32-byte Ed25519 private key as hex (from env secret)
 * @param verificationMethod  — DID key reference (e.g. "did:web:warpgogol.com#v1")
 * @param issuedAt            — ISO-8601 timestamp for the proof creation date
 */
export async function signIdentityCredential(
  subject: IdentityCredentialSubject,
  privateKeyHex: string,
  verificationMethod: string,
  issuedAt: string,
): Promise<VCProof> {
  const proofValue = await signBytes(privateKeyHex, identityCredentialBytes(subject));
  return {
    type: "Ed25519Signature2020",
    created: issuedAt,
    verificationMethod,
    proofPurpose: "assertionMethod",
    proofValue,
  };
}

/**
 * Verify an identity credential proof against the published public key.
 *
 * @param subject              — identity credential subject fields
 * @param proof                — proof object from the credential
 * @param publicKeyMultibase   — multibase public key from werkstatt.identity.json
 * @returns true if signature is valid
 */
export async function verifyIdentityCredential(
  subject: IdentityCredentialSubject,
  proof: VCProof,
  publicKeyMultibase: string,
): Promise<boolean> {
  return verifyBytes(publicKeyMultibase, identityCredentialBytes(subject), proof.proofValue);
}
