/*
<MODULE_CONTRACT>
<purpose>Public entrypoint for @warpgogol/werkstatt-site/audit — delta-scoped audit
handlers for the amend-onboarding chain (RFC-0136).</purpose>
<non-goals>
  <item>Do not register kernel commands here — registration is the consumer's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0136: Initial package — home of audit.delta.run.</item>
</CHANGE_SUMMARY>
*/

export { runAuditDeltaRun } from "./delta.ts";
