/*
<MODULE_CONTRACT>
<purpose>Video onboarding module — registers scaffold command (RFC-0778).</purpose>
<keywords>onboarding, scaffold, video, editframe</keywords>
<non-goals>
  <item>Do not implement scaffold logic here — delegate to scaffold-project.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial video onboarding module — registers video.scaffold command.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";

export function createVideoOnboardingModule(): KernelModule {
  return {
    name: "video-onboarding",
    version: "0.1.0",
    register() {
      // Scaffold command registered via hooks.scaffoldProject
    },
  };
}
