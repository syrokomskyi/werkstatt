/*
<MODULE_CONTRACT>
<purpose>Godot onboarding module — registers scaffold command.</purpose>
<keywords>onboarding, scaffold, godot</keywords>
<non-goals>
  <item>Do not implement scaffold logic here — delegate to scaffold-project.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot onboarding module.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";

export function createGodotOnboardingModule(): KernelModule {
  return {
    name: "godot-onboarding",
    version: "0.1.0",
    register() {
      // Scaffold command registered via scaffoldProject hook
    },
  };
}
