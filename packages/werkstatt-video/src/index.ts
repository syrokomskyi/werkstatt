/*
<MODULE_CONTRACT>
<purpose>Werkstatt video plugin entry point — Editframe stack implementing werkstatt/plugin@1 (RFC-0778).</purpose>
<keywords>plugin, video, editframe, werkstatt</keywords>
<responsibilities>
  <item>Exports werkstattVideoPlugin: WerkstattPlugin with profileId "editframe".</item>
  <item>Registers video-stack engine modules via moduleLoaders (checks, onboarding).</item>
  <item>Provides deploy adapter (local-render) and lifecycle hooks.</item>
  <item>Declares Editframe path conventions via StackPathConventions.</item>
</responsibilities>
<non-goals>
  <item>Do not implement engine logic — delegate to @warpgogol/werkstatt.</item>
  <item>Do not import stack-specific dependencies into the engine package.</item>
  <item>Do not depend on Editframe directly — validate project structure only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial video plugin entry point — Editframe path conventions, check/onboarding module loaders, deploy adapter, lifecycle hooks, WV-01..09 invariants.</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";
import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { editframePathConventions } from "./paths/editframe-paths.ts";
import { VIDEO_INVARIANTS } from "./invariants/video-invariants.ts";

export const werkstattVideoPlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-video",
  profileId: "editframe",
  paths: editframePathConventions,
  moduleLoaders: {
    checks: async (): Promise<KernelModule> =>
      (await import("./checks/module.ts")).createVideoCheckModule(),
    onboarding: async (): Promise<KernelModule> =>
      (await import("./onboarding/module.ts")).createVideoOnboardingModule(),
  },
  deployAdapters: {
    "local-render": async () => {
      const { createLocalRenderAdapter } = await import("./deploy/local-render.ts");
      return createLocalRenderAdapter();
    },
  },
  hooks: {
    build: async (ctx) => {
      const { runEditframeBuild } = await import("./build/editframe-build.ts");
      return runEditframeBuild(ctx);
    },
    checkGate: async (ctx) => {
      const { runVideoCheckGate } = await import("./checks/index.ts");
      return runVideoCheckGate(ctx);
    },
    releaseEvidence: async (ctx) => {
      const { generateVideoEvidence } = await import("./release-evidence/video-evidence.ts");
      return generateVideoEvidence(ctx);
    },
    scaffoldProject: async (ctx) => {
      const { scaffoldEditframeProject } = await import("./onboarding/scaffold-project.ts");
      return scaffoldEditframeProject(ctx);
    },
  },
  invariants: VIDEO_INVARIANTS,
};

export default werkstattVideoPlugin;
