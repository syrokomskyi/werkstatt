/*
<MODULE_CONTRACT>
  <purpose>Lazy-loading kernel module for RFC-0357 release discipline commands: prepare, publish, validate, list, and rollback.</purpose>
  <non-goals>
    <item>Do not re-export types or utilities — the barrel release/index.ts remains the public API surface.</item>
    <item>Do not register artifact-store or leitstand commands here.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lazy loading refactor: extracted from release/index.ts to use dynamic imports inside async register().</item>
  <item>RFC-0655: add release.state.validate command for release pipeline consistency checks.</item>
  <item>RFC-0656: add dist.determinism.validate command for non-deterministic build artifact detection.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";

export function createReleaseModule(): KernelModule {
  return {
    name: "release",
    version: "0.1.0",
    async register(registry) {
      const {
        runReleasePrepare,
        runReleasePublish,
        runReleaseValidate,
        runReleaseList,
        runReleaseRollback,
        runReleaseStateValidate,
        runDistDeterminismValidate,
      } = await import("./release-commands.ts");
      registry.registerCommand({
        name: "release.prepare",
        description:
          "Prepare a release candidate from a validated mission (RFC-0357). Flags: --mission, [--semver].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id to release." },
          semver: { kind: "string", default: "0.1.0", description: "Release semantic version." },
        },
        writes: ["releases/{release}/**"],
        reads: ["missions/{mission}/**", "systems/registry.yaml"],
        cacheable: false,
        execute: runReleasePrepare,
      });
      registry.registerCommand({
        name: "release.publish",
        description:
          "Publish a prepared release with discipline gates and artifact storage (RFC-0357). Flags: --release.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          release: { kind: "string", required: true, description: "Release id to publish." },
        },
        writes: [
          "releases/{release}/release.yaml",
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
        reads: ["releases/{release}/**", "systems/registry.yaml"],
        cacheable: false,
        execute: runReleasePublish,
      });
      registry.registerCommand({
        name: "release.validate",
        description: "Validate a release artifact (RFC-0357). Flags: --release.",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          release: { kind: "string", required: true, description: "Release id to validate." },
        },
        reads: ["releases/{release}/**"],
        execute: runReleaseValidate,
      });
      registry.registerCommand({
        name: "release.list",
        description: "List releases, optionally filtered by system (RFC-0357). Flags: [--system].",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          system: { kind: "string", description: "Filter by Sternsystem id." },
        },
        reads: ["releases/*/release.yaml", "systems/registry.yaml"],
        execute: runReleaseList,
      });
      registry.registerCommand({
        name: "release.rollback",
        description:
          "Mark a published release as rolled-back and append Bordbuch entry (RFC-0357). Flags: --release.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          release: { kind: "string", required: true, description: "Release id to roll back." },
        },
        writes: ["releases/{release}/release.yaml", "systems/{system}/bordbuch/events.ndjson"],
        reads: ["releases/{release}/**", "systems/registry.yaml"],
        cacheable: false,
        execute: runReleaseRollback,
      });
      registry.registerCommand({
        name: "release.state.validate",
        description:
          "Validate release pipeline consistency between mission.yaml, close-report.json, release.yaml, bordbuch, and registry.yaml (RFC-0655). Flags: --mission, --release, --system.",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          mission: { kind: "string", description: "Mission id to validate." },
          release: { kind: "string", description: "Release id to validate." },
          system: {
            kind: "string",
            description: "System id — validates all releases for the system.",
          },
        },
        reads: [
          "missions/{mission}/mission.yaml",
          "missions/{mission}/evidence/close-report.json",
          "releases/{release}/release.yaml",
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
        execute: runReleaseStateValidate,
      });
      registry.registerCommand({
        name: "dist.determinism.validate",
        description:
          "Report non-deterministic files in a dist directory by comparing stable vs byte hashes (RFC-0656). Flags: --release, --mission.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: false,
        flags: {
          release: { kind: "string", description: "Release id whose dist to validate." },
          mission: {
            kind: "string",
            description: "Mission id whose workpiece/dist or distribution/dist to validate.",
          },
        },
        reads: [
          "releases/{release}/dist/**",
          "missions/{mission}/workpiece/dist/**",
          "missions/{mission}/distribution/dist/**",
        ],
        execute: runDistDeterminismValidate,
      });
    },
  };
}
