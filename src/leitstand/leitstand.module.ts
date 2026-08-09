/*
<MODULE_CONTRACT>
  <purpose>Lazy-loading kernel module for RFC-0358/0379/0608 Leitstand fleet propagation commands: propagate, promote, status, rollback, and health.</purpose>
  <non-goals>
    <item>Do not re-export types or utilities — the barrel leitstand/index.ts remains the public API surface.</item>
    <item>Do not register release or notausgang commands here.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lazy loading refactor: extracted from leitstand/index.ts to use dynamic imports inside async register().</item>
  <item>RFC-0627: add leitstand.deploy; update rollback (auto-detect channel); update status/health for dev channel.</item>
  <item>RFC-0628: replace leitstand.deploy with workpiece-based leitstand.dev-deploy; propagate gate checks published + commitSha + missionId; rollback auto-step removes dev-deployed.</item>
  <item>RFC-0700: add --release flag to leitstand.dev-deploy for deploying existing releases to dev without open mission; update reads to include releases/{release}/**.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";

export function createLeitstandModule(): KernelModule {
  return {
    name: "leitstand",
    version: "0.1.0",
    async register(registry) {
      const {
        runLeitstandDevDeploy,
        runLeitstandPropagate,
        runLeitstandPromote,
        runLeitstandStatus,
        runLeitstandRollback,
        runLeitstandHealth,
      } = await import("./leitstand-commands.ts");
      registry.registerCommand({
        name: "leitstand.dev-deploy",
        description:
          "Deploy workpiece to dev channel with Axiom verification gate (RFC-0628). Flags: --site.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: false,
        flags: {
          site: {
            kind: "string",
            required: true,
            description: "Sternsystem id with an active mission.",
          },
          release: {
            kind: "string",
            description:
              "RFC-0700: Deploy an existing release to dev without open mission. When set, deploys from releases/<id>/dist/.",
          },
          "skip-evidence-sync": {
            kind: "boolean",
            description: "RFC-0652: Skip best-effort evidence.sync to R2 after axiom.report.",
          },
          "force-build": {
            kind: "boolean",
            description: "RFC-0653: Force pnpm build even when build-skip cache matches.",
          },
        },
        writes: ["missions/{mission}/evidence/axiom/**"],
        reads: [
          "systems/registry.yaml",
          "missions/{mission}/workpiece/**",
          "releases/{release}/**",
        ],
        cacheable: false,
        execute: runLeitstandDevDeploy,
      });
      registry.registerCommand({
        name: "leitstand.propagate",
        description:
          "Deploy a published release with verified Axiom evidence to the alt channel (RFC-0628). Flags: --release.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          release: {
            kind: "string",
            required: true,
            description:
              "Published release id with verified Axiom evidence (commitSha + missionId match).",
          },
        },
        writes: [
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
        ],
        reads: ["releases/{release}/**", "systems/registry.yaml"],
        cacheable: false,
        execute: runLeitstandPropagate,
      });
      registry.registerCommand({
        name: "leitstand.promote",
        description:
          "Promote a verified alt-deployed release to the main channel with live build-identity verification (RFC-0608). Flags: --release.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          release: {
            kind: "string",
            required: true,
            description: "Alt-deployed release id to promote.",
          },
        },
        writes: [
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
        ],
        reads: ["releases/{release}/**", "systems/registry.yaml"],
        cacheable: false,
        execute: runLeitstandPromote,
      });
      registry.registerCommand({
        name: "leitstand.status",
        description:
          "Print deployment state for all channels (RFC-0627). Flags: --site, [--channel dev|alt|main].",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          site: { kind: "string", required: true, description: "Sternsystem id." },
          channel: {
            kind: "string",
            description: "Filter to a single channel: dev, alt, or main.",
          },
        },
        reads: ["systems/registry.yaml", "systems/{system}/system.pin.json"],
        cacheable: false,
        execute: runLeitstandStatus,
      });
      registry.registerCommand({
        name: "leitstand.rollback",
        description:
          "Rollback to the previous published release; auto-detects channel from release state and auto-steps release state (RFC-0628). Flags: --site, [--to-release].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          site: { kind: "string", required: true, description: "Sternsystem id." },
          "to-release": { kind: "string", description: "Explicit target release id." },
        },
        writes: [
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
        ],
        reads: ["systems/registry.yaml", "releases/*/release.yaml"],
        cacheable: false,
        execute: runLeitstandRollback,
      });
      registry.registerCommand({
        name: "leitstand.health",
        description:
          "Run health checks against a deployed channel (RFC-0379). Flags: --site, [--channel dev|alt|main].",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          site: { kind: "string", required: true, description: "Sternsystem id." },
          channel: {
            kind: "string",
            description: "Deployment channel: dev, alt (default), or main.",
          },
        },
        cacheable: false,
        execute: runLeitstandHealth,
      });
    },
  };
}
