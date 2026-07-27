/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/types.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Created as the shared type alias for the refactored command tables.</item>
</CHANGE_SUMMARY>
*/

import type { KernelCommandDefinition } from "@gogol/site-kernel";

/**
 * A single check command entry ready for bulk registration.
 * Identical to KernelCommandDefinition so it can be spread directly into
 * registry.registerCommand(...).
 */
export type CheckCommandEntry = KernelCommandDefinition;
