/*
<MODULE_CONTRACT>
<purpose>Re-export shim for result-helpers moved to @warpgogol/werkstatt-shared (RFC-0868).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: moved to werkstatt-shared, this file re-exports for backward compatibility.</item>
</CHANGE_SUMMARY>
*/

export {
  diagnosticsResult,
  passResult,
  failResult,
  resultFromViolations,
} from "@warpgogol/werkstatt-shared/checks/result-helpers";
