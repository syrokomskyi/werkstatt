/*
<MODULE_CONTRACT>
<purpose>Werkstatt game plugin entry point — Phaser turborepo stack implementing werkstatt/plugin@1 (RFC-0777).</purpose>
<keywords>plugin, game, phaser, werkstatt</keywords>
<responsibilities>
  <item>Exports werkstattGamePlugin: WerkstattPlugin with profileId "phaser-turborepo".</item>
  <item>Registers game-stack engine modules via moduleLoaders (checks, onboarding).</item>
  <item>Provides deploy adapters (github-pages, cloudflare-pages) and lifecycle hooks.</item>
  <item>Declares Phaser path conventions via StackPathConventions.</item>
</responsibilities>
<non-goals>
  <item>Do not implement engine logic — delegate to @warpgogol/werkstatt.</item>
  <item>Do not import stack-specific dependencies into the engine package.</item>
  <item>Do not depend on Phaser directly — validate project structure only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: initial game plugin entry point — Phaser path conventions, check/onboarding module loaders, deploy adapters, lifecycle hooks, GAME-01..04 invariants.</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";
import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { phaserPathConventions } from "./paths/phaser-paths.ts";
import { GAME_INVARIANTS } from "./invariants/game-invariants.ts";

export const werkstattGamePlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-game",
  profileId: "phaser-turborepo",
  paths: phaserPathConventions,
  moduleLoaders: {
    checks: async (): Promise<KernelModule> =>
      (await import("./checks/module.ts")).createGameCheckModule(),
    onboarding: async (): Promise<KernelModule> =>
      (await import("./onboarding/module.ts")).createGameOnboardingModule(),
  },
  deployAdapters: {
    "github-pages": async () => {
      const { createGitHubPagesAdapter } = await import("./deploy/github-pages.ts");
      return createGitHubPagesAdapter();
    },
    "cloudflare-pages": async () => {
      const { createCloudflarePagesAdapter } = await import("./deploy/cloudflare-pages.ts");
      return createCloudflarePagesAdapter();
    },
  },
  hooks: {
    build: async (ctx) => {
      const { runViteBuild } = await import("./build/vite-build.ts");
      return runViteBuild(ctx);
    },
    checkGate: async (ctx) => {
      const { runGameCheckGate } = await import("./checks/index.ts");
      return runGameCheckGate(ctx);
    },
    releaseEvidence: async (ctx) => {
      const { generateGameEvidence } = await import("./release-evidence/game-evidence.ts");
      return generateGameEvidence(ctx);
    },
    scaffoldProject: async (ctx) => {
      const { scaffoldPhaserProject } = await import("./onboarding/scaffold-project.ts");
      return scaffoldPhaserProject(ctx);
    },
  },
  invariants: GAME_INVARIANTS,
};

export default werkstattGamePlugin;
