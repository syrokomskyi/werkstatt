/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/leitstand/index.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0358: initial leitstand module.</item>
  <item>RFC-0379: add --channel flag to all four commands; rollback requires --channel.</item>
  <item>RFC-0608: propagate always alt (removes --channel); add leitstand.promote for alt→main with build-identity verification; rollback transitions release state.</item>
  <item>RFC-0627: add leitstand.deploy for dev channel with Axiom gate; rollback auto-detects channel and auto-steps release state; status/health support dev channel.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";
import {
  runLeitstandDeploy,
  runLeitstandPropagate,
  runLeitstandPromote,
  runLeitstandStatus,
  runLeitstandRollback,
  runLeitstandHealth,
} from "./leitstand-commands.ts";

export {
  runLeitstandDeploy,
  type LeitstandDeployData,
  runLeitstandPropagate,
  type LeitstandPropagateData,
  runLeitstandPromote,
  type LeitstandPromoteData,
  runLeitstandStatus,
  type LeitstandStatusData,
  runLeitstandRollback,
  type LeitstandRollbackData,
  runLeitstandHealth,
  type LeitstandHealthData,
} from "./leitstand-commands.ts";
export type {
  DeploymentAdapter,
  CommandRunner,
  PropagateInput,
  RollbackInput,
  HealthInput,
} from "./adapter.ts";

export function createLeitstandModule(): KernelModule {
  return {
    name: "leitstand",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand({
        name: "leitstand.deploy",
        description:
          "Deploy a published release to the dev channel with Axiom verification gate (RFC-0627). Flags: --release.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          release: {
            kind: "string",
            required: true,
            description: "Published or dev-deployed release id.",
          },
        },
        writes: [
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
          "missions/{mission}/evidence/axiom/**",
        ],
        reads: ["releases/{release}/**", "systems/registry.yaml"],
        cacheable: false,
        execute: runLeitstandDeploy,
      });
      registry.registerCommand({
        name: "leitstand.propagate",
        description:
          "Deploy a dev-deployed release with verified Axiom evidence to the alt channel (RFC-0627). Flags: --release.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          release: {
            kind: "string",
            required: true,
            description: "Dev-deployed release id with verified Axiom evidence.",
          },
        },
        writes: [
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
        ],
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
        execute: runLeitstandPromote,
      });
      registry.registerCommand({
        name: "leitstand.status",
        description:
          "Print deployment state for all channels (RFC-0627). Flags: --system, [--channel dev|alt|main].",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          channel: {
            kind: "string",
            description: "Filter to a single channel: dev, alt, or main.",
          },
        },
        execute: runLeitstandStatus,
      });
      registry.registerCommand({
        name: "leitstand.rollback",
        description:
          "Rollback to the previous published release; auto-detects channel from release state and auto-steps release state (RFC-0627). Flags: --system, [--to-release].",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          "to-release": { kind: "string", description: "Explicit target release id." },
        },
        writes: [
          "systems/registry.yaml",
          "systems/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
        ],
        execute: runLeitstandRollback,
      });
      registry.registerCommand({
        name: "leitstand.health",
        description:
          "Run health checks against a deployed channel (RFC-0379). Flags: --system, [--channel dev|alt|main].",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          system: { kind: "string", required: true, description: "Sternsystem id." },
          channel: {
            kind: "string",
            description: "Deployment channel: dev, alt (default), or main.",
          },
        },
        execute: runLeitstandHealth,
      });
    },
  };
}
