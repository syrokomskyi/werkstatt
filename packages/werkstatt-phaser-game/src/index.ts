/*
<MODULE_CONTRACT>
<purpose>Werkstatt Phaser plugin entry point — Phaser + Vite + Turborepo stack implementing werkstatt/plugin@1.</purpose>
<keywords>plugin, phaser, game, werkstatt</keywords>
<responsibilities>
  <item>Exports werkstattPhaserPlugin: WerkstattPlugin with profileId "phaser-turborepo".</item>
  <item>Registers Phaser-stack engine modules via moduleLoaders (checks).</item>
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
  <item>Initial Phaser plugin entry point — Phaser path conventions, check module loader, deploy adapters, lifecycle hooks, PHASER-01..04 invariants.</item>
  <item>Migration from werkstatt-game to werkstatt-phaser — renamed plugin id, commands, and invariants. Removed onboarding module loader (scaffold handled via scaffoldProject hook directly).</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";
import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { phaserPathConventions } from "./paths/phaser-paths.ts";
import { PHASER_INVARIANTS } from "./invariants/phaser-invariants.ts";

export const werkstattPhaserPlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-phaser-game",
  profileId: "phaser-turborepo",
  paths: phaserPathConventions,
  moduleLoaders: {
    checks: async (): Promise<KernelModule> =>
      (await import("./checks/module.ts")).createPhaserCheckModule(),
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
      const { runPhaserCheckGate } = await import("./checks/index.ts");
      return runPhaserCheckGate(ctx);
    },
    releaseEvidence: async (ctx) => {
      const { generatePhaserEvidence } = await import("./release-evidence/phaser-evidence.ts");
      return generatePhaserEvidence(ctx);
    },
    scaffoldProject: async (ctx) => {
      const { scaffoldPhaserProject } = await import("./onboarding/scaffold-project.ts");
      return scaffoldPhaserProject(ctx);
    },
  },
  invariants: PHASER_INVARIANTS,
};

export default werkstattPhaserPlugin;
