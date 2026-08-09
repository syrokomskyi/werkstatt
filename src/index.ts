/*
<MODULE_CONTRACT>
<purpose>Barrel exports for @warpgogol/werkstatt — plugin contract types and registry (RFC-0770).</purpose>
<non-goals>
  <item>Do not re-export Node-only modules — this barrel may be imported by client-side code.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0770: initial barrel exporting plugin contract types and registry.</item>
</CHANGE_SUMMARY>
*/

export type {
  WerkstattPlugin,
  WerkstattPluginHooks,
  PluginHookContext,
  HookResult,
  StackPathConventions,
  StackInvariant,
  DeployAdapterFactory,
} from "./plugin-contract.ts";

export type { PluginRegistry } from "./plugin-registry.ts";
export { createPluginRegistry } from "./plugin-registry.ts";
