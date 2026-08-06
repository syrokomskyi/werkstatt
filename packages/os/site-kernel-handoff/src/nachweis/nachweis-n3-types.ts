/*
<MODULE_CONTRACT>
<purpose>RFC-0715: Shared types and re-exports for N3 cryptographic verification commands.</purpose>
<keywords>nachweis, n3, crypto, signature, timestamp, types</keywords>
<responsibilities>
  <item>Defines result interfaces for nachweis.sign, nachweis.timestamp, nachweis.verify-signature.</item>
  <item>Re-exports common helpers from nachweis-io.ts to avoid circular imports.</item>
</responsibilities>
<non-goals>
  <item>Does not define command handlers — those live in nachweis-*.ts files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0715: initial N3 shared types module.</item>
</CHANGE_SUMMARY>
*/

export {
  isNachweisEntitled,
  makeSkipResult,
  resolveNachweisCachePath,
  resolvePbpEntityDir,
} from "./nachweis-io.ts";

export interface NachweisSignResult {
  slug: string;
  systemId: string;
  signatureHex: string;
  publicKeyHex: string;
  bordbuchEventId: string | null;
  idempotent: boolean;
}

export interface NachweisTimestampResult {
  slug: string;
  systemId: string;
  timestampTokenBase64: string;
  tsaUrl: string;
  bordbuchEventId: string | null;
  idempotent: boolean;
}

export interface NachweisVerifySignatureResult {
  slug: string;
  systemId: string;
  signatureValid: boolean;
  timestampVerified: boolean;
  publicKeyHex: string | null;
  details: string;
}
