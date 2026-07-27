/*
<MODULE_CONTRACT>
<purpose>RFC-0364: Lightweight entry point — byte hashing and stable JSON hashing only. No parser dependencies are loaded.</purpose>
<non-goals>
  <item>Do not export semantic fingerprint functions — those live in @gogol/fingerprint/semantic.</item>
  <item>Do not implement command runners — those live in site-kernel-checks.</item>
  <item>Do not define validation rules — those live in the lint/validate command modules.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Split public API: root entry point now exports primitives only. Semantic functions moved to @gogol/fingerprint/semantic.</item>
</CHANGE_SUMMARY>
*/

export { byteHash, byteHashFile, stableStringify, stableJsonHash } from "./primitives.ts";
export { hashHtml } from "./normalizers/html.ts";
export type { FingerprintOptions, FingerprintFileResult, FingerprintResult } from "./types.ts";
