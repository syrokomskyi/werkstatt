/*
<MODULE_CONTRACT>
  <purpose>RFC-0707: Nachweis barrel — re-exports command handlers and I/O utilities. Module registration lives in nachweis.module.ts.</purpose>
  <non-goals>
    <item>Do not define createNachweisModule here — that lives in nachweis.module.ts.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis barrel exports.</item>
</CHANGE_SUMMARY>
*/

export {
  computeSourceSha256,
  generateRecordId,
  resolveNachweisR2Path,
  uploadToR2,
  isMissingEnvError,
  resolveNachweisCachePath,
  readEntitledFeaturesFromCache,
  isNachweisEntitled,
  makeSkipResult,
  type NachweisRecord,
  type NachweisIngestResult,
  type NachweisManifestEntry,
  type NachweisManifest,
  type NachweisPublicationGate,
  type NachweisValidateResult,
  type NachweisViolation,
  type NachweisConsentUpdateResult,
  type NachweisPublishResult,
  type NachweisWithdrawResult,
} from "./nachweis-io.ts";

export { runNachweisIngest } from "./nachweis-ingest.ts";
export { runNachweisValidate } from "./nachweis-validate.ts";
export { runNachweisManifestGenerate } from "./nachweis-manifest.ts";
export { runNachweisConsentUpdate } from "./nachweis-consent.ts";
export { runNachweisPublish } from "./nachweis-publish.ts";
export { runNachweisWithdraw } from "./nachweis-withdraw.ts";
export { createNachweisModule } from "./nachweis.module.ts";
