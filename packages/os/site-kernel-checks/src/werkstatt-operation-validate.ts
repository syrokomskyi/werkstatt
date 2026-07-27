/*
<MODULE_CONTRACT>
<purpose>werkstatt.operation.validate command handler. Canonical implementation
now lives in @webgogol/forge/os/werkstatt/handlers/ (RFC-0556 dependency inversion).
This file re-exports it for backward-compatible imports from @warpgogol/site-kernel-checks.</purpose>
<non-goals>
  <item>Do not duplicate the implementation — always re-export from forge.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0362: initial operation.validate command handler.</item>
  <item>RFC-0556: moved canonical implementation to @webgogol/forge, this file is now a re-export.</item>
</CHANGE_SUMMARY>
*/

export {
  runWerkstattOperationValidate,
  type WerkstattOperationValidateData,
} from "@webgogol/forge/os/werkstatt";
