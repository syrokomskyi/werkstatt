/*
<MODULE_CONTRACT>
  <purpose>RFC-0707: Nachweis barrel — re-exports command handlers and I/O utilities. Module registration lives in nachweis.module.ts.</purpose>
  <non-goals>
    <item>Do not define createNachweisModule here — that lives in nachweis.module.ts.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis barrel exports.</item>
  <item>RFC-0714: add nachweis.approve and nachweis.public-derivative exports.</item>
</CHANGE_SUMMARY>
*/

export {
  computeSourceSha256,
  generateRecordId,
  resolveNachweisR2Path,
  resolveNachweisPublicR2Path,
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
  type NachweisApproveResult,
  type NachweisPublicDerivativeResult,
} from "./nachweis-io.ts";

export { runNachweisIngest } from "./nachweis-ingest.ts";
export { runNachweisValidate } from "./nachweis-validate.ts";
export { runNachweisManifestGenerate } from "./nachweis-manifest.ts";
export { runNachweisConsentUpdate } from "./nachweis-consent.ts";
export { runNachweisPublish } from "./nachweis-publish.ts";
export { runNachweisWithdraw } from "./nachweis-withdraw.ts";
export { runNachweisApprove } from "./nachweis-approve.ts";
export { runNachweisPublicDerivative } from "./nachweis-public-derivative.ts";
export { createNachweisModule } from "./nachweis.module.ts";
