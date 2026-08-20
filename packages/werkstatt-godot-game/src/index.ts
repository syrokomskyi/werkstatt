/*
<MODULE_CONTRACT>
<purpose>Werkstatt Godot plugin entry point — Godot 4.x + C# stack implementing werkstatt/plugin@1.</purpose>
<keywords>plugin, godot, csharp, game, werkstatt</keywords>
<responsibilities>
  <item>Exports werkstattGodotPlugin: WerkstattPlugin with profileId "godot-csharp".</item>
  <item>Registers Godot-stack engine modules via moduleLoaders (checks).</item>
  <item>Provides deploy adapters (itch-io, github-releases) and lifecycle hooks.</item>
  <item>Declares Godot path conventions via StackPathConventions.</item>
  <item>Registers dev module (godot.dev.server, godot.test) via moduleLoaders.</item>
</responsibilities>
<non-goals>
  <item>Do not implement engine logic — delegate to @warpgogol/werkstatt.</item>
  <item>Do not import stack-specific dependencies into the engine package.</item>
  <item>Do not depend on Godot directly — validate project structure only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot plugin entry point — Godot path conventions, check/onboarding module loaders, deploy adapters, lifecycle hooks, GODOT-01..04 invariants.</item>
  <item>Fix: remove moduleLoaders.onboarding (no-op module deleted, scaffold handled via scaffoldProject hook).</item>
  <item>Enhancement: add dev module (godot.dev.server, godot.test) via moduleLoaders. GODOT-01..07 invariants.</item>
  <item>Enhancement: add script (GODOT-08), export-presets (GODOT-09), uid (GODOT-10), nuget (GODOT-11) validators. Add godot.smoke.test and godot.context.generate dev commands. GODOT-01..11 invariants.</item>
  <item>Enhancement: add addon (GODOT-12) validator, godot.playtest and godot.screenshot dev commands, godot-mcp-bridge skill. Enhanced context.generate with addons, display settings. GODOT-01..12 invariants.</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";
import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { godotPathConventions } from "./paths/godot-paths.ts";
import { GODOT_INVARIANTS } from "./invariants/godot-invariants.ts";

export const werkstattGodotPlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-godot-game",
  profileId: "godot-csharp",
  paths: godotPathConventions,
  moduleLoaders: {
    checks: async (): Promise<KernelModule> =>
      (await import("./checks/module.ts")).createGodotCheckModule(),
    dev: async (): Promise<KernelModule> =>
      (await import("./dev/module.ts")).createGodotDevModule(),
  },
  deployAdapters: {
    "itch-io": async () => {
      const { createItchIoAdapter } = await import("./deploy/itch-io.ts");
      return createItchIoAdapter();
    },
    "github-releases": async () => {
      const { createGitHubReleasesAdapter } = await import("./deploy/github-releases.ts");
      return createGitHubReleasesAdapter();
    },
  },
  hooks: {
    build: async (ctx) => {
      const { runDotnetBuild } = await import("./build/dotnet-build.ts");
      return runDotnetBuild(ctx);
    },
    checkGate: async (ctx) => {
      const { runGodotCheckGate } = await import("./checks/index.ts");
      return runGodotCheckGate(ctx);
    },
    releaseEvidence: async (ctx) => {
      const { generateGodotEvidence } = await import("./release-evidence/godot-evidence.ts");
      return generateGodotEvidence(ctx);
    },
    scaffoldProject: async (ctx) => {
      const { scaffoldGodotProject } = await import("./onboarding/scaffold-project.ts");
      return scaffoldGodotProject(ctx);
    },
  },
  invariants: GODOT_INVARIANTS,
};

export default werkstattGodotPlugin;
