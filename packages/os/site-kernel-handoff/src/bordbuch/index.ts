/*
<MODULE_CONTRACT>
<purpose>RFC-0355: Bordbuch command module — registers append and validate commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0355: initial Bordbuch command module.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";

export { runBordbuchAppend, type BordbuchAppendData } from "./bordbuch-append.ts";
export { runBordbuchValidate, type BordbuchValidateData } from "./bordbuch-validate.ts";
export { runBordbuchStatus, type BordbuchStatusData } from "./bordbuch-status.ts";
export { runBordbuchGenerate } from "./bordbuch-generate.ts";
export {
  runBordbuchRepair,
  type BordbuchRepairResult,
  type BordbuchRepairOrphan,
} from "./bordbuch-repair.ts";
export {
  appendBordbuchEntry,
  readBordbuch,
  validateWriterRole,
  commitAndPushBordbuch,
  computeEntryHash,
  type BordbuchViolation,
  type CommitAndPushResult,
} from "./bordbuch-io.ts";

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
