/*
<MODULE_CONTRACT>
<purpose>
RFC-0565: DHT entry signing and verification — canonicalization and sign/verify
wrappers for DHTSiteEntry, built on the existing Ed25519 signBytes/verifyBytes
primitives from sign.ts. Analogous to identity-sign.ts but for the DHT site
entry shape.
</purpose>
<non-goals>
  <item>Do not handle key storage or management — private keys arrive as env vars.</item>
  <item>Do not assemble W3C VC envelopes — DHT entries use a simple signature string, not VCProof.</item>
  <item>Do not modify sign.ts — this module wraps signBytes/verifyBytes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0565: initial DHT entry signing module.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/werkstatt-site/passport/dht-sign — DHT entry signing (RFC-0565)
 *
 * Uses signBytes/verifyBytes from sign.ts with a dedicated canonicalization
 * function for DHT site entries. The signature field is excluded from
 * canonicalization (it is computed over the entry data without the signature).
 */

import { signBytes, verifyBytes } from "./sign.ts";
import type { DHTSiteEntry } from "@warpgogol/werkstatt-site/ontology/operations";

/**
 * DHTSiteEntry without the signature field — the data that is actually signed.
 */
export type DHTEntryData = Omit<DHTSiteEntry, "signature">;

/**
 * Produce canonical UTF-8 bytes from a DHT entry (excluding signature).
 * DETERMINISM: identical inputs → identical bytes (sorted-key JSON, no whitespace).
 */
export function dhtEntryBytes(entry: DHTEntryData): Uint8Array {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(entry).sort()) {
    sorted[key] = (entry as Record<string, unknown>)[key];
  }
  const canonical = JSON.stringify(sorted);
  return new TextEncoder().encode(canonical);
}

/**
 * Sign a DHT entry and return a multibase Ed25519 signature string.
 *
 * @param entry          — DHT entry data (without signature)
 * @param privateKeyHex  — 32-byte Ed25519 private key as hex (from env secret)
 * @returns multibase base58btc signature string
 */
export async function signDhtEntry(entry: DHTEntryData, privateKeyHex: string): Promise<string> {
  return signBytes(privateKeyHex, dhtEntryBytes(entry));
}

/**
 * Verify a DHT entry signature against the published public key.
 *
 * @param entry              — full DHT site entry (including signature)
 * @param publicKeyMultibase — multibase public key from werkstatt.identity.json
 * @returns true if signature is valid
 */
export async function verifyDhtEntry(
  entry: DHTSiteEntry,
  publicKeyMultibase: string,
): Promise<boolean> {
  const { signature, ...entryData } = entry;
  return verifyBytes(publicKeyMultibase, dhtEntryBytes(entryData), signature);
}
