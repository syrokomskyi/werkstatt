/*
<MODULE_CONTRACT>
  <purpose>Lazy-loading kernel module for RFC-0355/0356/0480 mission lifecycle commands: open, status, close, abort, list, materialize, validate, preview, build, diff, reconcile, git.commit, cleanup.</purpose>
  <non-goals>
    <item>Do not re-export types or utilities — the barrel mission/index.ts remains the public API surface.</item>
    <item>Do not register sternsystem, bordbuch, or release commands here.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lazy loading refactor: extracted from mission/index.ts to use dynamic imports inside async register().</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@gogol/site-kernel";

export function createMissionModule(): KernelModule {
  return {
    name: "mission",
    version: "0.2.0",
    async register(registry) {
      const { runMissionOpen } = await import("./mission-open.ts");
      const { runMissionStatus } = await import("./mission-status.ts");
      const { runMissionClose } = await import("./mission-close.ts");
      const { runMissionAbort } = await import("./mission-abort.ts");
      const { runMissionList } = await import("./mission-list.ts");
      const { runMissionMaterialize } = await import("./mission-materialize.ts");
      const { runMissionMigrate } = await import("./mission-migrate.ts");
      const { runMissionGitCommit } = await import("./mission-git-commit.ts");
      const { runMissionPreview } = await import("./mission-preview.ts");
      const { runMissionCleanup } = await import("./mission-cleanup.ts");
      const { runMissionValidate, runMissionBuild, runMissionDiff, runMissionReconcile } =
        await import("./mission-materialization-commands.ts");
      const { runWorkpieceRead } = await import("../workpiece/workpiece-read.ts");
      const { runWorkpieceWrite } = await import("../workpiece/workpiece-write.ts");
      registry.registerCommand({
        name: "mission.open",
        description: "Open a new mission for a Sternsystem (RFC-0355).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          brief: { kind: "string", required: true, description: "Mission brief." },
          actor: { kind: "string", default: "agent", description: "Actor identity." },
        },
        writes: [
          "missions/{mission}/**",
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
        reads: ["systems/registry.yaml", "systems/{system}/system.pin.json"],
        cacheable: false,
        execute: runMissionOpen,
      });
      registry.registerCommand({
        name: "mission.status",
        description: "Print mission manifest and Bordbuch entries (RFC-0355).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
        },
        reads: ["missions/{mission}/**", "systems/{system}/bordbuch/events.ndjson"],
        execute: runMissionStatus,
      });
      registry.registerCommand({
        name: "mission.close",
        description: "Close an open mission (RFC-0355).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          actor: { kind: "string", default: "agent", description: "Actor identity." },
          release: { kind: "string", description: "Release id produced by this mission." },
        },
        writes: [
          "missions/{mission}/mission.yaml",
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
        reads: ["missions/{mission}/mission.yaml", "systems/registry.yaml"],
        cacheable: false,
        execute: runMissionClose,
      });
      registry.registerCommand({
        name: "mission.abort",
        description: "Abort an open mission and discard Werkstück/Distribution (RFC-0355).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          reason: { kind: "string", description: "Abort reason." },
          actor: { kind: "string", default: "agent", description: "Actor identity." },
        },
        writes: [
          "missions/{mission}/mission.yaml",
          "missions/{mission}/workpiece/**",
          "missions/{mission}/distribution/**",
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
        reads: ["missions/{mission}/mission.yaml", "systems/registry.yaml"],
        cacheable: false,
        execute: runMissionAbort,
      });
      registry.registerCommand({
        name: "mission.list",
        description: "List missions, optionally filtered by system (RFC-0355).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          system: { kind: "string", description: "Filter by Sternsystem id." },
        },
        reads: ["missions/*/mission.yaml", "systems/registry.yaml"],
        execute: runMissionList,
      });
      registry.registerCommand({
        name: "mission.materialize",
        description:
          "Populate the mission Werkstück from the pinned Sternsystem bundle (RFC-0356).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          "report-only": {
            kind: "boolean",
            description: "Only report materialization readiness; do not write workpiece files.",
          },
        },
        writes: [
          "missions/{mission}/workpiece/**",
          "missions/{mission}/evidence/materialization-report.json",
        ],
        reads: ["missions/{mission}/mission.yaml", "systems/{system}/system.pin.json"],
        cacheable: false,
        execute: runMissionMaterialize,
      });
      registry.registerCommand({
        name: "mission.migrate",
        description:
          "Apply pending migrators from the RFC-id-keyed registry to the workpiece (RFC-0479).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          "report-only": {
            kind: "boolean",
            description: "Only report pending migrators; do not apply.",
          },
        },
        writes: [
          "missions/{mission}/workpiece/**",
          "missions/{mission}/evidence/migration-report.json",
          "missions/{mission}/mission.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
        reads: ["missions/{mission}/**", "systems/{system}/system.pin.json"],
        cacheable: false,
        execute: runMissionMigrate,
      });
      registry.registerCommand({
        name: "mission.validate",
        description: "Validate the materialized Werkstück (RFC-0356).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
        },
        reads: ["missions/{mission}/**"],
        execute: runMissionValidate,
        gate: {
          severity: "error",
          phase: "mission",
          blocks: ["mission.close", "release.prepare"],
        },
      });
      registry.registerCommand({
        name: "mission.preview",
        description:
          "Start a blocking dev server for the mission workpiece (RFC-0480). Works for open, closed, and aborted missions.",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          port: { kind: "string", description: "Port number (default: 4321)." },
          production: { kind: "boolean", description: "Use astro preview instead of astro dev." },
        },
        writes: [],
        reads: ["missions/{mission}/workpiece/**", "missions/{mission}/mission.yaml"],
        cacheable: false,
        execute: runMissionPreview,
      });
      registry.registerCommand({
        name: "mission.build",
        description: "Build the Werkstück into a local Distribution (RFC-0356).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
        },
        writes: [
          "missions/{mission}/distribution/**",
          "missions/{mission}/evidence/build-report.json",
        ],
        reads: ["missions/{mission}/workpiece/**"],
        cacheable: false,
        execute: runMissionBuild,
      });
      registry.registerCommand({
        name: "mission.diff",
        description: "Compute the data-set diff between Werkstück and pinned state (RFC-0356).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
        },
        reads: ["missions/{mission}/workpiece/**", "systems/{system}/system.pin.json"],
        execute: runMissionDiff,
      });
      registry.registerCommand({
        name: "mission.reconcile",
        description:
          "Reconcile validated Werkstück data changes to the Sternsystem repo (RFC-0356).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          message: { kind: "string", description: "Reconciliation message." },
        },
        writes: [
          "missions/{mission}/mission.yaml",
          "missions/{mission}/evidence/reconciliation-report.json",
        ],
        reads: ["missions/{mission}/**", "systems/{system}/system.pin.json"],
        cacheable: false,
        execute: runMissionReconcile,
      });
      registry.registerCommand({
        name: "mission.git.commit",
        description: "Commit operator edits to the mission workpiece git repository (RFC-0480).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          message: { kind: "string", required: true, description: "Commit message." },
        },
        writes: ["missions/{mission}/workpiece/**"],
        reads: ["missions/{mission}/workpiece/**", "missions/{mission}/mission.yaml"],
        cacheable: false,
        execute: runMissionGitCommit,
      });
      registry.registerCommand({
        name: "mission.cleanup",
        description:
          "Remove workpiece/distribution for a closed or aborted mission, or clean old missions by age (RFC-0480).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", description: "Mission id (for single-mission cleanup)." },
          "older-than": {
            kind: "string",
            description: "Age threshold (e.g. '30d') for batch cleanup.",
          },
        },
        writes: ["missions/{mission}/workpiece/**", "missions/{mission}/distribution/**"],
        reads: ["missions/*/mission.yaml"],
        cacheable: false,
        execute: runMissionCleanup,
      });
      registry.registerCommand({
        name: "workpiece.read",
        description: "Read a file from a mission workpiece with DNA-22 path validation (RFC-0555).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          path: { kind: "string", required: true, description: "Relative path within workpiece." },
        },
        reads: ["missions/{mission}/workpiece/**"],
        cacheable: false,
        execute: runWorkpieceRead,
      });
      registry.registerCommand({
        name: "workpiece.write",
        description:
          "Write a file to a mission workpiece with DNA-22 path validation. Content via stdin. No auto-commit (RFC-0555).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          path: { kind: "string", required: true, description: "Relative path within workpiece." },
          stdin: { kind: "boolean", required: true, description: "Read content from stdin." },
        },
        writes: ["missions/{mission}/workpiece/**"],
        reads: ["missions/{mission}/workpiece/src/content/system.md"],
        cacheable: false,
        execute: runWorkpieceWrite,
      });
    },
  };
}
