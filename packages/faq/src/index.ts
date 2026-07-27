/*
<MODULE_CONTRACT>
<purpose>Public API entry point for @gogol/faq. Re-exports schema and types
for consumers that do not need Astro collection wiring.</purpose>
<non-goals>
  <item>Does not export Astro-dependent code — use @gogol/faq/astro for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0475: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export { faqSchema, faqGovernanceSchema, type FaqEntry, type FaqGovernance } from "./schema.ts";
