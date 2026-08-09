/*
<MODULE_CONTRACT>
<purpose>Game onboarding module — registers scaffold command (RFC-0777).</purpose>
<keywords>onboarding, scaffold, game, phaser</keywords>
<non-goals>
  <item>Do not implement scaffold logic here — delegate to scaffold-project.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: initial game onboarding module — registers game.scaffold command.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";

export function createGameOnboardingModule(): KernelModule {
  return {
    name: "game-onboarding",
    version: "0.1.0",
    register() {
      // Scaffold command registered in Step 4
    },
  };
}
