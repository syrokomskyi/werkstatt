/*
<MODULE_CONTRACT>
<purpose>RFC-0355: Mission command module — registers open, status, close, abort, list commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0355: initial mission command module.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";
import { runMissionOpen } from "./mission-open.ts";
import { runMissionStatus } from "./mission-status.ts";
import { runMissionClose } from "./mission-close.ts";
import { runMissionAbort } from "./mission-abort.ts";
import { runMissionList } from "./mission-list.ts";
import { runMissionMaterialize } from "./mission-materialize.ts";
import {
  runMissionValidate,
  runMissionBuild,
  runMissionDiff,
  runMissionReconcile,
} from "./mission-materialization-commands.ts";
import { runMissionPreview } from "./mission-preview.ts";

export { runMissionOpen, type MissionOpenData } from "./mission-open.ts";
export { runMissionStatus, type MissionStatusData } from "./mission-status.ts";
export { runMissionClose, type MissionCloseData } from "./mission-close.ts";
export { runMissionAbort, type MissionAbortData } from "./mission-abort.ts";
export { runMissionList, type MissionListData } from "./mission-list.ts";
export { runMissionMaterialize, type MissionMaterializeData } from "./mission-materialize.ts";
export {
  runMissionValidate,
  type MissionValidateData,
  runMissionBuild,
  type MissionBuildData,
  runMissionDiff,
  type MissionDiffData,
  runMissionReconcile,
  type MissionReconcileData,
} from "./mission-materialization-commands.ts";
export { runMissionPreview, type MissionPreviewData } from "./mission-preview.ts";
export {
  runMissionGitCommit,
  type MissionGitCommitData,
  isWorkpieceDirty,
  type WorkpieceDirtyResult,
  investigateUntrackedFiles,
  type UntrackedFileReport,
} from "./mission-git-commit.ts";
export { runMissionCleanup, type MissionCleanupData } from "./mission-cleanup.ts";
export { resolveActorFromEnv, resolveActor, type ActorIdentity } from "./actor-identity.ts";
export { createSignedCommit, type SignedCommitResult } from "./signed-commit.ts";
export { resolveMissionEvidenceDir, resolveMissionDir } from "./mission-io.ts";

export function createMissionModule(): KernelModule {
  return {
    name: "mission",
    version: "0.2.0",
    register(registry) {
      registry.registerCommand({
        name: "mission.open",
        description: "Open a new mission for a Sternsystem (RFC-0355).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          brief: { kind: "string", required: true, description: "Mission brief." },
          actor: {
            kind: "string",
            default: "unknown",
            description: "Actor identity (VC subject id or free-text).",
          },
          "actor-from-auth": {
            kind: "boolean",
            description:
              "Read actor identity from WERKSTATT_ACTOR_ID env var set by Studio Gate auth.",
          },
        },
        writes: [
          "missions/{mission}/**",
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
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
          actor: {
            kind: "string",
            default: "unknown",
            description: "Actor identity (VC subject id or free-text).",
          },
          "actor-from-auth": {
            kind: "boolean",
            description:
              "Read actor identity from WERKSTATT_ACTOR_ID env var set by Studio Gate auth.",
          },
          release: { kind: "string", description: "Release id produced by this mission." },
          "skip-evidence-sync": {
            kind: "boolean",
            description: "Skip mandatory evidence.sync to R2 (escape hatch, RFC-0652).",
          },
          "skip-content-regression": {
            kind: "boolean",
            description: "Skip CREG-05 content regression review check (escape hatch, RFC-0734).",
          },
        },
        writes: [
          "missions/{mission}/mission.yaml",
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
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
          actor: {
            kind: "string",
            default: "unknown",
            description: "Actor identity (VC subject id or free-text).",
          },
          "actor-from-auth": {
            kind: "boolean",
            description:
              "Read actor identity from WERKSTATT_ACTOR_ID env var set by Studio Gate auth.",
          },
        },
        writes: [
          "missions/{mission}/mission.yaml",
          "missions/{mission}/workpiece/**",
          "missions/{mission}/distribution/**",
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
        ],
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
        execute: runMissionMaterialize,
      });
      registry.registerCommand({
        name: "mission.validate",
        description: "Validate the materialized Werkstück (RFC-0356).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          mission: { kind: "string", required: true, description: "Mission id." },
          "skip-content-regression": {
            kind: "boolean",
            description: "RFC-0732: Skip content regression gate (escape hatch).",
          },
          "auto-accept-regression": {
            kind: "boolean",
            description:
              "RFC-0764: Auto-accept all content regression drift, update golden baseline directly.",
          },
        },
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
        writes: ["missions/{mission}/workpiece/src/content-ref-index.generated.yaml"],
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
          actor: {
            kind: "string",
            default: "unknown",
            description: "Actor identity (VC subject id or free-text).",
          },
          "actor-from-auth": {
            kind: "boolean",
            description:
              "Read actor identity from WERKSTATT_ACTOR_ID env var set by Studio Gate auth.",
          },
        },
        writes: [
          "missions/{mission}/mission.yaml",
          "missions/{mission}/evidence/reconciliation-report.json",
          "missions/{mission}/evidence/untracked-files-report.json",
        ],
        execute: runMissionReconcile,
      });
    },
  };
}
