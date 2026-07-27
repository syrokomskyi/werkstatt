/*
<MODULE_CONTRACT>
<purpose>
RFC-0308: pure, framework-free Ed25519 proof types and domain-separated
signing payload builder for Agent Surface artifacts. The signing and
verification primitives (Ed25519 sign/verify, multibase encoding) live in
@gogol/passport; this module owns only the canonical payload format and
the proof shape that generators, agent.surface.sign, and agent.surface.verify
share.
</purpose>
<non-goals>
  <item>Do not import or call Ed25519 signing/verification primitives — that
        is @gogol/passport's job. This module is pure and dependency-free.</item>
  <item>Do not read files or perform I/O.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0308: initial proof module — payload builder + proof type.</item>
</CHANGE_SUMMARY>
*/

/** Artifact kind for domain-separated signing (RFC-0308). */
export type AgentProofArtifactKind = "manifest" | "knowledge" | "openapi";

/**
 * W3C Ed25519Signature2020 proof object embedded in signed agent artifacts.
 *
 * `proofValue` is a multibase base58btc-encoded Ed25519 signature (prefix "z"),
 * consistent with the Cosmic Passport key encoding (RFC-0028).
 */
export interface AgentSurfaceProof {
  type: "Ed25519Signature2020";
  created: string;
  verificationMethod: string;
  proofPurpose: "assertionMethod";
  /** Multibase-encoded (base58btc, prefix "z") Ed25519 signature. */
  proofValue: string;
}

/** Domain-separation prefix for agent surface signing payloads (RFC-0308). */
export const AGENT_PROOF_DOMAIN = "WGOGOL_AGENT_SURFACE_V1";

/**
 * Build the domain-separated canonical signing payload for an agent surface
 * artifact.
 *
 * The signed input is:
 * ```
 * WGOGOL_AGENT_SURFACE_V1\n<artifact-kind>\n<absolute-canonical-url>\n<contentHash>
 * ```
 *
 * This prevents signature reuse across artifact kinds or URLs.
 */
export function buildAgentSigningPayload(
  kind: AgentProofArtifactKind,
  canonicalUrl: string,
  contentHash: string,
): Uint8Array {
  const text = `${AGENT_PROOF_DOMAIN}\n${kind}\n${canonicalUrl}\n${contentHash}`;
  return new TextEncoder().encode(text);
}
