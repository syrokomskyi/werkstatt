/* <MODULE_CONTRACT>
<purpose>Facilitates Ed25519 key generation, signing, and verification for verifiable credentials.</purpose>
<non-goals>
  <item>Do not handle raw key storage or management.</item>
  <item>Do not perform network operations or external API calls.</item>
  <item>Do not parse or validate credential content beyond signing/verification.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY> */

/**
 * @warpgogol/werkstatt-site/passport — Ed25519 VC signing helpers
 *
 * DNA-34 / RFC-0028
 *
 * Uses the Web Crypto API (available in Node.js 16+ and all modern browsers).
 * No private keys are ever written to disk by this module.
 *
 * SECURITY CONTRACT:
 * - Private keys arrive exclusively as environment variable `PASSPORT_SIGNING_KEY`
 *   (hex-encoded, 32 bytes) or as a runtime parameter in key-rotate.ts.
 * - This module never logs, writes, or returns private key material.
 */

import * as ed from "@noble/ed25519";
import bs58 from "bs58";
import type { VCProof, VerifiableCredential } from "./schema.ts";

// ---------------------------------------------------------------------------
// Multibase base58btc encoding (prefix "z")
// ---------------------------------------------------------------------------

/** Encode bytes as multibase base58btc (prefix "z"). */
export function toMultibase(bytes: Uint8Array): string {
  return "z" + bs58.encode(bytes);
}

/** Decode multibase base58btc string (prefix "z") to bytes. */
export function fromMultibase(multibase: string): Uint8Array {
  if (!multibase.startsWith("z")) {
    throw new Error(
      `Unsupported multibase prefix "${multibase[0]}". Only "z" (base58btc) is supported.`,
    );
  }
  return bs58.decode(multibase.slice(1));
}

// ---------------------------------------------------------------------------
// The canonical credential subject digest
// ---------------------------------------------------------------------------

/** The data signed in the VC proof — composition hash + commit SHA. */
export interface CredentialSubjectDigest {
  systemHash: string;
  commitSha: string;
  issuedAt: string;
  appId: string;
}

/**
 * Produce the canonical UTF-8 bytes that are signed/verified.
 * DETERMINISM: identical inputs → identical bytes.
 */
export function credentialBytes(subject: CredentialSubjectDigest): Uint8Array {
  // Stable JSON: sorted keys, no whitespace
  const canonical = JSON.stringify({
    appId: subject.appId,
    commitSha: subject.commitSha,
    issuedAt: subject.issuedAt,
    systemHash: subject.systemHash,
  });
  return new TextEncoder().encode(canonical);
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Generate a new Ed25519 keypair.
 * @returns { privateKeyHex, publicKeyBytes, publicKeyMultibase }
 *
 * The private key is returned as a hex string for one-time copy into a
 * GitHub Actions secret. It is NEVER written to disk by this function.
 */
export async function generateKeypair(): Promise<{
  privateKeyHex: string;
  publicKeyBytes: Uint8Array;
  publicKeyMultibase: string;
}> {
  const privateKeyBytes = ed.utils.randomSecretKey();
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
  return {
    privateKeyHex: Buffer.from(privateKeyBytes).toString("hex"),
    publicKeyBytes,
    publicKeyMultibase: toMultibase(publicKeyBytes),
  };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Sign the credential subject and produce a W3C VC proof.
 *
 * @param subject       — canonical credential subject fields
 * @param privateKeyHex — 32-byte Ed25519 private key as hex (from env secret)
 * @param verificationMethod — DID key reference (e.g. "did:web:example.org#key-v1")
 */
// @ai-invariant: signCredential uses @noble/ed25519. Private keys arrive
// exclusively as hex env vars — never logged, written to disk, or returned.
// The signed output is a W3C VC with Ed25519Signature2020 proof.

export async function signCredential(
  subject: CredentialSubjectDigest,
  privateKeyHex: string,
  verificationMethod: string,
): Promise<VCProof> {
  const privateKeyBytes = new Uint8Array(Buffer.from(privateKeyHex, "hex"));
  const message = credentialBytes(subject);
  const signatureBytes = await ed.signAsync(message, privateKeyBytes);

  return {
    type: "Ed25519Signature2020",
    created: subject.issuedAt,
    verificationMethod,
    proofPurpose: "assertionMethod",
    proofValue: toMultibase(signatureBytes),
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify a VC proof against the published public key.
 *
 * @param subject           — credential subject fields from passport.json
 * @param proof             — proof object from passport.json
 * @param publicKeyMultibase — multibase public key from cosmic-passport-key.json
 * @returns true if signature is valid
 */
export async function verifyCredential(
  subject: CredentialSubjectDigest,
  proof: VCProof,
  publicKeyMultibase: string,
): Promise<boolean> {
  try {
    const publicKeyBytes = fromMultibase(publicKeyMultibase);
    const signatureBytes = fromMultibase(proof.proofValue);
    const message = credentialBytes(subject);
    return await ed.verifyAsync(signatureBytes, message, publicKeyBytes);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Raw detached signing (RFC-0135 amend provenance trail)
// ---------------------------------------------------------------------------

/**
 * Sign arbitrary bytes with an Ed25519 private key, returning a multibase
 * base58btc detached signature. Reused by the amend provenance trail
 * (RFC-0135) so provenance records carry the same signing facility as the
 * Cosmic Passport (RFC-0028).
 *
 * @param privateKeyHex — 32-byte Ed25519 private key as hex (from env secret)
 * @param message       — canonical bytes to sign
 */
export async function signBytes(privateKeyHex: string, message: Uint8Array): Promise<string> {
  const privateKeyBytes = new Uint8Array(Buffer.from(privateKeyHex, "hex"));
  const signatureBytes = await ed.signAsync(message, privateKeyBytes);
  return toMultibase(signatureBytes);
}

/**
 * Verify a multibase detached signature produced by {@link signBytes} against
 * a multibase public key. Returns false on any decode/verify failure.
 */
export async function verifyBytes(
  publicKeyMultibase: string,
  message: Uint8Array,
  signatureMultibase: string,
): Promise<boolean> {
  try {
    const publicKeyBytes = fromMultibase(publicKeyMultibase);
    const signatureBytes = fromMultibase(signatureMultibase);
    return await ed.verifyAsync(signatureBytes, message, publicKeyBytes);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Assemble full VC
// ---------------------------------------------------------------------------

export function assembleVerifiableCredential(
  appId: string,
  domain: string,
  subject: CredentialSubjectDigest,
  proof: VCProof,
  keyVersion: string,
): VerifiableCredential {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "CosmicPassportCredential"],
    issuer: `did:web:${domain}`,
    issuanceDate: subject.issuedAt,
    credentialSubject: {
      id: `urn:warpgogol:app:${appId}`,
      systemHash: subject.systemHash,
      commitSha: subject.commitSha,
    },
    proof: {
      ...proof,
      verificationMethod: `did:web:${domain}#key-${keyVersion}`,
    },
  };
}
