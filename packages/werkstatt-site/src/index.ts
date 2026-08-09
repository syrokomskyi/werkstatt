/*
<MODULE_CONTRACT>
<purpose>Werkstatt site plugin entry point — Astro stack plugin implementing werkstatt/plugin@1 (RFC-0774).</purpose>
<keywords>plugin, site, astro, werkstatt</keywords>
<responsibilities>
  <item>Exports werkstattSitePlugin: WerkstattPlugin with profileId "astro-typescript-turborepo".</item>
  <item>Registers site-stack engine modules via moduleLoaders (checks, codegen, content, onboarding, audit, changelog).</item>
  <item>Provides deploy adapters (cloudflare-workers) and lifecycle hooks (materialize, build, checkGate, releaseEvidence, scaffoldProject).</item>
  <item>Declares Astro path conventions via StackPathConventions.</item>
</responsibilities>
<non-goals>
  <item>Do not import from @warpgogol/werkstatt-site/* subpath exports — use relative intra-plugin imports.</item>
  <item>Do not implement engine logic — delegate to @warpgogol/werkstatt.</item>
  <item>Do not import stack-specific dependencies into the engine package.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0774: initial site plugin entry point — consolidates site-kernel-astro, site-kernel-checks, site-kernel-codegen, site-kernel-content, site-kernel-onboarding, site-kernel-audit, site-kernel-check-warpgogol, site-kernel-changelog renderers, and Cloudflare Workers deploy adapter.</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";

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
    // Filled as modules move in (Steps 2–4)
  },
  // pipelines, deployAdapters, hooks filled in Step 5
};

export default werkstattSitePlugin;
