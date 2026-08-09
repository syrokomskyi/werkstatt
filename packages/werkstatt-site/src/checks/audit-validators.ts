/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0074 deterministic audit validators over built assets, onboarding configs, and app manifests.</purpose>
<non-goals>
  <item>Do not perform LLM-backed qualitative judgment here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0074: Add deterministic audit validator commands.</item>
  <item>RFC-0303 Phase 3: split the flat 1245-line file into domain sub-modules under audit/validators/; this file is now the re-export shim.</item>
</CHANGE_SUMMARY>
*/

export { runAuditAgentReadinessValidate } from "./audit/validators/agent-readiness.ts";
export { runSeoMetaValidate } from "./audit/validators/seo-meta.ts";
export { runJsonLdUrlValidate, runJsonLdParityValidate } from "./audit/validators/jsonld.ts";
export { runRobotsPageValidate } from "./audit/validators/robots-page.ts";
export { runSeoTechnicalValidate } from "./audit/validators/seo-technical.ts";
export { runSeoStructuredDataValidate } from "./audit/validators/seo-structured-data.ts";
export { runSeoInternalLinkingValidate } from "./audit/validators/seo-internal-linking.ts";
export { runAnalyticsConfigValidate } from "./audit/validators/analytics-config.ts";
export { runFirstPartyDataValidate } from "./audit/validators/first-party-data.ts";
export { runInfraBriefValidate } from "./audit/validators/infra-brief.ts";
export { runWikidataValidate } from "./audit/validators/wikidata.ts";
