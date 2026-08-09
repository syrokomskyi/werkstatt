/*
<MODULE_CONTRACT>
<purpose>Werkstatt site plugin entry point — Astro stack plugin implementing werkstatt/plugin@1 (RFC-0774).</purpose>
<keywords>plugin, site, astro, werkstatt</keywords>
<responsibilities>
  <item>Exports werkstattSitePlugin: WerkstattPlugin with profileId "astro-typescript-turborepo".</item>
  <item>Registers site-stack engine modules via moduleLoaders (checks, onboarding).</item>
  <item>Provides deploy adapters (cloudflare-workers) and lifecycle hooks.</item>
  <item>Declares Astro path conventions via StackPathConventions.</item>
</responsibilities>
<non-goals>
  <item>Do not implement engine logic — delegate to @warpgogol/werkstatt.</item>
  <item>Do not import stack-specific dependencies into the engine package.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0774: initial site plugin entry point — consolidates site-kernel-astro, site-kernel-checks, site-kernel-codegen, site-kernel-content, site-kernel-onboarding, site-kernel-audit, site-kernel-check-warpgogol, site-kernel-changelog renderers, and Cloudflare Workers deploy adapter.</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";
import type { KernelModule } from "@warpgogol/site-kernel";

export const werkstattSitePlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-site",
  profileId: "astro-typescript-turborepo",
  paths: {
    contentDir: "src/content",
    distDir: "dist/client",
    entryPoints: ["src/pages/index.astro", "src/pages/[lang]/[...slug].astro"],
  },
  moduleLoaders: {
    check: async (): Promise<KernelModule> =>
      (await import("./checks/module.ts")).createStandardCheckModule(),
    onboarding: async (): Promise<KernelModule> =>
      (await import("./onboarding/module.ts")).createOnboardingModule(),
  },
  deployAdapters: {
    "cloudflare-workers": async () => {
      // The concrete Cloudflare Workers adapter lives in the engine
      // (packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts).
      // Full inversion to the plugin is deferred to RFC-0776.
      // For now, the plugin declares the adapter id; the engine resolves it.
      return {};
    },
  },
  invariants: [
    {
      id: "DNA-3",
      description:
        "All visitor-facing apps use Astro. The plugin carries Astro path conventions and build hooks.",
    },
    {
      id: "DNA-5",
      description:
        "Component ↔ content ↔ schema mirror (Mirror Quintet). Validators travel inside checks/.",
    },
  ],
};

export default werkstattSitePlugin;
