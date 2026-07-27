/*
<MODULE_CONTRACT>
<purpose>Compass inventory and validation command handlers. Canonical implementation
now lives in @webgogol/forge/os/compass/handlers/ (RFC-0556 dependency inversion).
This file re-exports them for backward-compatible imports from @warpgogol/site-kernel-checks.</purpose>
<non-goals>
  <item>Do not duplicate the implementation — always re-export from forge.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: v2 two-block contract — XML output updated, compass.validate emits COMPASS-* diagnostics, summary uses standard-required-files.</item>
  <item>RFC-0350: added COMPASS-TODO-01 diagnostic for unfilled Compass TODO sentinels.</item>
  <item>RFC-0556: moved canonical implementation to @webgogol/forge, this file is now a re-export.</item>
</CHANGE_SUMMARY>
*/

export { runCompassInventory, runCompassValidation } from "@webgogol/forge/os/compass";
