/*
<MODULE_CONTRACT>
<purpose>CHANGE_SUMMARY classification, validation, and deterministic tidy logic.
Canonical implementation now lives in @webgogol/forge/os/compass/handlers/ (RFC-0556
dependency inversion). This file re-exports them for backward-compatible imports from
@warpgogol/site-kernel-checks.</purpose>
<non-goals>
  <item>Do not duplicate the implementation — always re-export from forge.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0349: initial implementation of classifyChangeSummaryItem, compass.changesummary.validate, and compass.changesummary.tidy.</item>
  <item>RFC-0538: renamed compass.changesummary.tidy to compass.summary.trim, raised cap from 3 unprotected to 30 total items, aligned validate cap to 30 total.</item>
  <item>RFC-0556: moved canonical implementation to @webgogol/forge, this file is now a re-export.</item>
</CHANGE_SUMMARY>
*/

export {
  runCompassChangeSummaryValidate,
  runCompassSummaryTrim,
  classifyChangeSummaryItem,
  type ChangeSummaryItemClass,
} from "@webgogol/forge/os/compass";
