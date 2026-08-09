/*
<MODULE_CONTRACT>
<purpose>Compass audit command handlers (plan, record, baseline, validate). Canonical
implementation now lives in @warpgogol/forge/os/compass/handlers/ (RFC-0556 dependency
inversion). This file re-exports them for backward-compatible imports from
@warpgogol/site-kernel-checks.</purpose>
<non-goals>
  <item>Do not duplicate the implementation — always re-export from forge.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0352: initial implementation of compass.audit.plan, compass.audit.record, compass.audit.baseline, compass.audit.validate.</item>
  <item>RFC-0556: moved canonical implementation to @warpgogol/forge, this file is now a re-export.</item>
</CHANGE_SUMMARY>
*/

export {
  runCompassAuditPlan,
  runCompassAuditRecord,
  runCompassAuditBaseline,
  runCompassAuditValidate,
  isAuditDue,
} from "@warpgogol/forge/os/compass";
