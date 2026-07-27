/*
<MODULE_CONTRACT>
<purpose>RFC-0354: Sternsystem command module — registers all four sternsystem.* commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0354: initial sternsystem command module.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";
import { runSternsystemRegister } from "./sternsystem-register.ts";
import { runSternsystemList } from "./sternsystem-list.ts";
import { runSternsystemValidate } from "./sternsystem-validate.ts";
import { runSternsystemPin } from "./sternsystem-pin.ts";
import { runSternsystemExtract } from "./sternsystem-extract.ts";
import { runSternsystemSync } from "./sternsystem-sync.ts";
import { runSternsystemStatus } from "./sternsystem-status.ts";

export { runSternsystemRegister, type SternsystemRegisterData } from "./sternsystem-register.ts";
export { runSternsystemList, type SternsystemListData } from "./sternsystem-list.ts";
export { runSternsystemValidate, type SternsystemValidateData } from "./sternsystem-validate.ts";
export { runSternsystemPin, type SternsystemPinData } from "./sternsystem-pin.ts";
export { runSternsystemExtract, type SternsystemExtractData } from "./sternsystem-extract.ts";
export { runSternsystemSync, type SternsystemSyncData } from "./sternsystem-sync.ts";
export { runSternsystemStatus, type SternsystemStatusData } from "./sternsystem-status.ts";

export function createSternsystemModule(): KernelModule {
  return {
    name: "sternsystem",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand({
        name: "sternsystem.register",
        description:
          "Register a new Sternsystem in systems/registry.yaml (RFC-0354, RFC-0532). Flags: --id, --cosmicStar, --repo, [--platform], [--mirror], [--owner], [--amend], [--amend-id].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          id: { kind: "string", required: true, description: "Sternsystem id." },
          cosmicStar: { kind: "string", required: true, description: "Reserved page cosmic star." },
          repo: { kind: "string", required: true, description: "Sternsystem repository URL." },
          platform: { kind: "string", description: "Pinned platform version." },
          mirror: { kind: "string", description: "External mirror repository URL (optional)." },
          owner: {
            kind: "string",
            description:
              "VC subject id (did:web:<domain>#<key-version>) for site owner (RFC-0561).",
          },
        },
        writes: ["systems/registry.yaml"],
        execute: runSternsystemRegister,
      });
      registry.registerCommand({
        name: "sternsystem.list",
        description:
          "List all registered Sternsystems with their id, cosmicStar, pinned platform, status (RFC-0354).",
        scope: "workspace",
        supportsAllSites: false,
        flags: {},
        execute: runSternsystemList,
      });
      registry.registerCommand({
        name: "sternsystem.validate",
        description:
          "Validate registry invariants, bundle contract, and pin file for one or all Sternsystems (RFC-0354). Flags: --id.",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          id: { kind: "string", description: "Optional Sternsystem id to validate." },
        },
        execute: runSternsystemValidate,
      });
      registry.registerCommand({
        name: "sternsystem.pin",
        description:
          "Write or update system.pin.json for a Sternsystem (RFC-0354). Flags: --id, [--platform].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          id: { kind: "string", required: true, description: "Sternsystem id." },
          platform: { kind: "string", description: "Pinned platform version." },
        },
        writes: ["systems/{id}/system.pin.json", "systems/registry.yaml"],
        execute: runSternsystemPin,
      });
      registry.registerCommand({
        name: "sternsystem.extract",
        description:
          "Extract an apps/<site>/ site into a Sternsystem git repo (RFC-0356). Flags: --site, [--repo].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          site: { kind: "string", required: true, description: "Site id to extract." },
          repo: { kind: "string", description: "Sternsystem repository URL." },
        },
        writes: ["systems/{site}/**", "systems/registry.yaml"],
        execute: runSternsystemExtract,
      });
      registry.registerCommand({
        name: "sternsystem.sync",
        description:
          "Synchronize a Sternsystem's local bare repo with an external mirror (RFC-0472). Flags: --id, [--direction push|pull|both], [--all].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          id: { kind: "string", required: true, description: "Sternsystem id." },
          direction: {
            kind: "string",
            description: "Sync direction: push (default), pull, or both.",
          },
          all: {
            kind: "boolean",
            description: "Sync all branches + tags instead of current branch only.",
          },
        },
        writes: ["systems/{id}/bordbuch/events.ndjson"],
        execute: runSternsystemSync,
      });
      registry.registerCommand({
        name: "sternsystem.status",
        description:
          "Read-only synchronization state inspection for a Sternsystem (RFC-0477). Flags: --id, [--all].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: false,
        flags: {
          id: { kind: "string", description: "Sternsystem id (required unless --all is set)." },
          all: { kind: "boolean", description: "Show status for all registered systems." },
        },
        reads: [
          "systems/registry.yaml",
          "systems/{id}/bordbuch/events.ndjson",
          "missions/*/mission.yaml",
        ],
        execute: runSternsystemStatus,
      });
    },
  };
}
