/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/release/index.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0357: initial release module.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@gogol/site-kernel";
import {
  runReleasePrepare,
  runReleasePublish,
  runReleaseValidate,
  runReleaseList,
  runReleaseRollback,
} from "./release-commands.ts";

export {
  runReleasePrepare,
  type ReleasePrepareData,
  runReleasePublish,
  type ReleasePublishData,
  runReleaseValidate,
  type ReleaseValidateData,
  runReleaseList,
  type ReleaseListData,
  runReleaseRollback,
  type ReleaseRollbackData,
} from "./release-commands.ts";

export function createReleaseModule(): KernelModule {
  return {
    name: "release",
    version: "0.1.0",
    register(registry) {
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
        execute: runReleaseRollback,
      });
    },
  };
}
