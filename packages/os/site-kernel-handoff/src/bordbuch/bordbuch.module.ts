/*
<MODULE_CONTRACT>
  <purpose>Lazy-loading kernel module for RFC-0355 Bordbuch commands: append and validate, the append-only hash-chained event log for Sternsystems.</purpose>
  <non-goals>
    <item>Do not re-export types or utilities — the barrel bordbuch/index.ts remains the public API surface.</item>
    <item>Do not register mission or release commands here.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lazy loading refactor: extracted from bordbuch/index.ts to use dynamic imports inside async register().</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@gogol/site-kernel";

export function createBordbuchModule(): KernelModule {
  return {
    name: "bordbuch",
    version: "0.1.0",
    async register(registry) {
      const { runBordbuchAppend } = await import("./bordbuch-append.ts");
      const { runBordbuchValidate } = await import("./bordbuch-validate.ts");
      const { runBordbuchStatus } = await import("./bordbuch-status.ts");
      const { runBordbuchGenerate } = await import("./bordbuch-generate.ts");
      registry.registerCommand({
        name: "bordbuch.append",
        description:
          "Append a single entry to the Bordbuch through the controlled writer-role surface (RFC-0355).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          kind: { kind: "string", required: true, description: "Bordbuch entry kind." },
          summary: { kind: "string", required: true, description: "Human-readable event summary." },
          mission: { kind: "string", description: "Related mission id." },
          release: { kind: "string", description: "Related release id." },
          actor: { kind: "string", default: "agent", description: "Actor identity." },
          "writer-role": {
            kind: "string",
            required: true,
            description: "Controlled writer role allowed to append this entry kind.",
          },
          metadata: { kind: "string", description: "JSON metadata object." },
        },
        writes: ["systems/{system}/bordbuch/events.ndjson"],
        reads: ["systems/{system}/bordbuch/events.ndjson"],
        cacheable: false,
        execute: runBordbuchAppend,
      });
      registry.registerCommand({
        name: "bordbuch.validate",
        description:
          "Validate the Bordbuch hash-chain, lifecycle pairs, and sensitive payload guards (RFC-0355).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          system: {
            kind: "string",
            description:
              "Sternsystem id. Defaults to the site name when running in a site-scoped pipeline.",
          },
        },
        reads: ["systems/{system}/bordbuch/events.ndjson"],
        execute: runBordbuchValidate,
      });
      registry.registerCommand({
        name: "bordbuch.status",
        description:
          "Read-only Bordbuch status projection: ledger hash, event count, latest event, open escalations (RFC-0473).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          system: {
            kind: "string",
            description:
              "Sternsystem id. Defaults to the site name when running in a site-scoped pipeline.",
          },
        },
        reads: ["systems/{system}/bordbuch/events.ndjson"],
        execute: runBordbuchStatus,
      });
      registry.registerCommand({
        name: "bordbuch.generate",
        description:
          "Generate rich public Bordbuch projections (JSON + HTML + YAML) from the unified ledger (RFC-0473).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          system: {
            kind: "string",
            description:
              "Sternsystem id. Defaults to the site name when running in a site-scoped pipeline.",
          },
        },
        reads: ["systems/{system}/bordbuch/events.ndjson"],
        writes: [
          "systems/{system}/public/.well-known/bordbuch.json",
          "systems/{system}/public/.well-known/bordbuch/index.html",
          "systems/{system}/bordbuch/status.generated.yaml",
        ],
        cacheable: false,
        execute: runBordbuchGenerate,
      });
    },
  };
}
