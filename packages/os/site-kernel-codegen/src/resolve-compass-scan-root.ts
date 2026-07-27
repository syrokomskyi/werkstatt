/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-codegen/src/resolve-compass-scan-root.ts as an authored site-kernel-codegen authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not implement scan-root resolution logic here; it lives in site-kernel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: updated header to v2 two-block contract.</item>
</CHANGE_SUMMARY>
*/

// Canonical implementation lives in @gogol/site-kernel so both site-kernel-checks
// and site-kernel-codegen can share it without a circular dependency.
export { resolveCompassScanRoot } from "@gogol/site-kernel";
