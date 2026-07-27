/*
<MODULE_CONTRACT>
  <purpose>Lazy-loading kernel module for RFC-0358/0379 Leitstand fleet propagation commands: propagate, status, rollback, and health.</purpose>
  <non-goals>
    <item>Do not re-export types or utilities — the barrel leitstand/index.ts remains the public API surface.</item>
    <item>Do not register release or notausgang commands here.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lazy loading refactor: extracted from leitstand/index.ts to use dynamic imports inside async register().</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";

export function createLeitstandModule(): KernelModule {
  return {
    name: "leitstand",
    version: "0.1.0",
    async register(registry) {
      const {
        runLeitstandPropagate,
        runLeitstandStatus,
        runLeitstandRollback,
        runLeitstandHealth,
      } = await import("./leitstand-commands.ts");
      registry.registerCommand({
        name: "leitstand.propagate",
        description:
          "Deploy a published release to a channel (RFC-0379). Flags: --release, [--channel alt|main].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          release: { kind: "string", required: true, description: "Published release id." },
          channel: { kind: "string", description: "Deployment channel: alt (default) or main." },
        },
        writes: ["systems/registry.yaml", "systems/{system}/bordbuch/events.ndjson"],
        reads: ["releases/{release}/**", "systems/registry.yaml"],
        cacheable: false,
        execute: runLeitstandPropagate,
      });
      registry.registerCommand({
        name: "leitstand.status",
        description:
          "Print deployment state for both channels (RFC-0379). Flags: --system, [--channel alt|main].",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          channel: { kind: "string", description: "Filter to a single channel: alt or main." },
        },
        reads: ["systems/registry.yaml", "systems/{system}/system.pin.json"],
        cacheable: false,
        execute: runLeitstandStatus,
      });
      registry.registerCommand({
        name: "leitstand.rollback",
        description:
          "Rollback a channel to the previous published release (RFC-0379). Flags: --system, --channel alt|main, [--to-release].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          channel: {
            kind: "string",
            required: true,
            description: "Deployment channel: alt or main.",
          },
          "to-release": { kind: "string", description: "Explicit target release id." },
        },
        writes: ["systems/registry.yaml", "systems/{system}/bordbuch/events.ndjson"],
        reads: ["systems/registry.yaml", "releases/*/release.yaml"],
        cacheable: false,
        execute: runLeitstandRollback,
      });
      registry.registerCommand({
        name: "leitstand.health",
        description:
          "Run health checks against a deployed channel (RFC-0379). Flags: --system, [--channel alt|main].",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          channel: { kind: "string", description: "Deployment channel: alt (default) or main." },
        },
        cacheable: false,
        execute: runLeitstandHealth,
      });
    },
  };
}
