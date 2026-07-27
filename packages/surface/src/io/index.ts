/*
<MODULE_CONTRACT>
<purpose>RFC-0473: Barrel for @gogol/surface/io — I/O helpers extracted from site-kernel-checks.</purpose>
<non-goals>
  <item>Does not contain pure domain logic — that lives in the root @gogol/surface entry points.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0473: initial io barrel for cross-package I/O helpers.</item>
</CHANGE_SUMMARY>
*/

export {
  loadSurfaceModuleContexts,
  type LoadedModuleContexts,
} from "./surface-module-context-io.ts";

export { readVisibilityOutcomes, type OutcomesPayload } from "./visibility-outcomes-io.ts";
