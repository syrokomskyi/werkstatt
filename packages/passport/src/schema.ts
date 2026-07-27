/******************************************************************************* 
<MODULE_CONTRACT> 
<purpose>Defines JSON schemas for passport-related data structures, ensuring data integrity and validation.</purpose> 
 
 
<non-goals> 
  <item>Do not handle data persistence or retrieval logic.</item> 
  <item>Do not perform runtime data transformations outside of validation.</item> 
  <item>Do not manage application state or side effects.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY> 
*******************************************************************************/

/**
 * @gogol/passport — Passport JSON schema (schemaVersion 1.0)
 *
 * DNA-31 / RFC-0028
 *
 * This is the authoritative schema for dist/.well-known/cosmic-passport.json.
 * Additive changes bump schemaVersion minor; breaking changes require a
 * superseding RFC.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const PlanetPinSchema = z.object({
  cosmicPlanet: z.string().min(1),
  pin: z.string().min(1),
  semanticId: z.string().optional(),
});

const StarCompositionSchema = z.object({
  route: z.string().min(1),
  cosmicStar: z.string().min(1),
  planets: z.array(PlanetPinSchema).default([]),
});

const CompositionSchema = z.object({
  /**
   * SHA-256 hash of the canonical system.yaml content at build time.
   * Format: "sha256:<hex>"
   */
  systemHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  constellation: z.string().min(1),
  biome: z.string().min(1),
  stars: z.array(StarCompositionSchema).default([]),
});

const VCProofSchema = z.object({
  type: z.literal("Ed25519Signature2020"),
  created: z.string(),
  verificationMethod: z.string(),
  proofPurpose: z.literal("assertionMethod"),
  /** Multibase-encoded Ed25519 signature */
  proofValue: z.string(),
});

const VerifiableCredentialSchema = z.object({
  "@context": z.array(z.string()),
  type: z.array(z.string()),
  issuer: z.string(),
  issuanceDate: z.string(),
  credentialSubject: z.object({
    id: z.string(),
    systemHash: z.string(),
    commitSha: z.string(),
  }),
  proof: VCProofSchema,
});

const ProvenanceSchema = z.object({
  commitSha: z.string().min(1),
  commitAt: z.string(),
  builtAt: z.string(),
  buildDurationMs: z.number().int().nonnegative(),
  builder: z.string().min(1),
  keyVersion: z.string().min(1),
  verifiableCredential: VerifiableCredentialSchema,
});

const NebulaPillarSchema = z.object({
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
});

const ScoresSchema = z.object({
  nebula: z.number().int().min(0).max(100),
  pillars: z.object({
    performance: NebulaPillarSchema,
    accessibility: NebulaPillarSchema,
    contentHealth: NebulaPillarSchema,
    architecturalCompliance: NebulaPillarSchema,
  }),
});

const LinksSchema = z.object({
  starMapSvg: z.string(),
  publicKey: z.string(),
  dnaReport: z.string(),
});

// ---------------------------------------------------------------------------
// Root schema
// ---------------------------------------------------------------------------

export const PassportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  appId: z.string().min(1),
  issuedAt: z.string(),
  composition: CompositionSchema,
  provenance: ProvenanceSchema,
  scores: ScoresSchema,
  links: LinksSchema,
});

// ---------------------------------------------------------------------------
// Public key file schema (/.well-known/cosmic-passport-key.json)
// ---------------------------------------------------------------------------

export const PassportPublicKeyEntrySchema = z.object({
  version: z.string().min(1),
  active: z.boolean(),
  type: z.literal("Ed25519VerificationKey2020"),
  /** Multibase-encoded (base58btc, prefix "z") Ed25519 public key */
  publicKeyMultibase: z.string().regex(/^z[1-9A-HJ-NP-Za-km-z]+$/),
  createdAt: z.string(),
});

export const PassportPublicKeyFileSchema = z.object({
  schemaVersion: z.literal("1.0"),
  appId: z.string().min(1),
  keys: z.array(PassportPublicKeyEntrySchema).min(1),
});

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type PassportJson = z.infer<typeof PassportSchema>;
export type PassportPublicKeyFile = z.infer<typeof PassportPublicKeyFileSchema>;
export type PassportPublicKeyEntry = z.infer<typeof PassportPublicKeyEntrySchema>;
export type VCProof = z.infer<typeof VCProofSchema>;
export type VerifiableCredential = z.infer<typeof VerifiableCredentialSchema>;
