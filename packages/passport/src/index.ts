/*
<MODULE_CONTRACT>
<purpose>Facilitates the export of passport-related schemas, types, and utility functions for credential management.</purpose>
<non-goals>
  <item>Do not implement business logic for credential validation or user authentication.</item>
  <item>Do not manage raw data parsing or transport orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

/**
 * @gogol/passport — Cosmic Passport
 * DNA-31, DNA-34 / RFC-0028
 */

export {
  PassportSchema,
  PassportPublicKeyFileSchema,
  PassportPublicKeyEntrySchema,
} from "./schema.ts";
export type {
  PassportJson,
  PassportPublicKeyFile,
  PassportPublicKeyEntry,
  VCProof,
  VerifiableCredential,
} from "./schema.ts";

export { emitPassport } from "./emit.ts";
export type { PassportEmitOptions } from "./emit.ts";

export { verifyPassport } from "./verify.ts";
export type { VerifyResult } from "./verify.ts";

export { rotateKey } from "./key-rotate.ts";
export type { KeyRotateOptions, KeyRotateResult } from "./key-rotate.ts";

export { loadPassportData } from "./data.ts";

export { signBytes, verifyBytes } from "./sign.ts";
