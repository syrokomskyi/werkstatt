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
  <item>RFC-0628: replace leitstand.deploy with workpiece-based leitstand.dev-deploy; propagate gate checks published + commitSha + missionId; rollback auto-step removes dev-deployed.</item>
  <item>RFC-0751: add leitstand.service.deploy for shared Cloudflare Worker services.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";
import {
  runLeitstandDevDeploy,
  runLeitstandPropagate,
  runLeitstandPromote,
  runLeitstandStatus,
  runLeitstandRollback,
  runLeitstandHealth,
} from "./leitstand-commands.ts";
import { runLeitstandServiceDeploy } from "./service-deploy.ts";

export {
  runLeitstandDevDeploy,
  type DevDeployResult,
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
export { runLeitstandServiceDeploy, type ServiceDeployData } from "./service-deploy.ts";
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
        reads: ["systems/registry.yaml", "missions/{mission}/workpiece/**"],
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
        execute: runLeitstandHealth,
      });
      registry.registerCommand({
        name: "leitstand.service.deploy",
        description:
          "Deploy a shared Cloudflare Worker service with preflight, subdomain validation, wrangler deploy, and health check (RFC-0751). Flags: --service.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          service: {
            kind: "string",
            required: true,
            description: "Service id from the services: key in systems/registry.yaml.",
          },
        },
        writes: ["systems/registry.yaml"],
        reads: ["systems/registry.yaml", "services/{service}/**"],
        execute: runLeitstandServiceDeploy,
      });
    },
  };
}
