/*
<MODULE_CONTRACT>
  <purpose>Lazy-loading kernel module for RFC-0358/0379/0608 Leitstand fleet propagation commands: propagate, promote, status, rollback, and health.</purpose>
  <non-goals>
    <item>Do not re-export types or utilities — the barrel leitstand/index.ts remains the public API surface.</item>
    <item>Do not register release or notausgang commands here.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lazy loading refactor: extracted from leitstand/index.ts to use dynamic imports inside async register().</item>
  <item>RFC-0627: add leitstand.deploy; update rollback (auto-detect channel); update status/health for dev channel.</item>
  <item>RFC-0628: replace leitstand.deploy with workpiece-based leitstand.dev-deploy; propagate gate checks published + commitSha + missionId; rollback auto-step removes dev-deployed.</item>
  <item>RFC-0700: add --release flag to leitstand.dev-deploy for deploying existing releases to dev without open mission; update reads to include releases/{release}/**.</item>
  <item>RFC-0842: add leitstand.pipeline.check command for release pipeline state inspection.</item>
  <item>RFC-0866: add leitstand.certify command; add --gate-decision, --candidate-id, --artifact-hash flags to dev-deploy, propagate, promote.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel";

export function createLeitstandModule(): KernelModule {
  return {
    name: "leitstand",
    version: "0.1.0",
    async register(registry) {
      const {
        runLeitstandDevDeploy,
        runLeitstandPropagate,
        runLeitstandPromote,
        runLeitstandStatus,
        runLeitstandRollback,
        runLeitstandHealth,
        runLeitstandPipelineCheck,
      } = await import("./leitstand-commands.ts");
      const { runLeitstandCertify } = await import("./certify.ts");
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
          system: {
            kind: "string",
            description: "Alias for --site.",
          },
          release: {
            kind: "string",
            description:
              "RFC-0700: Deploy an existing release to dev without open mission. When set, deploys from releases/<id>/dist/.",
          },
          "skip-evidence-sync": {
            kind: "boolean",
            description: "RFC-0652: Skip best-effort evidence.sync to R2 after axiom.report.",
          },
          "force-build": {
            kind: "boolean",
            description: "RFC-0653: Force pnpm build even when build-skip cache matches.",
          },
          "gate-decision": {
            kind: "string",
            description:
              "RFC-0866: Path to GateDecisionV1 JSON file. Defaults to systems-cache/{system}/gate-decisions/{release}-dev.json.",
          },
          "candidate-id": {
            kind: "string",
            description: "RFC-0866: Release candidate id (defaults to --site).",
          },
          "artifact-hash": {
            kind: "string",
            description:
              "Artifact hash (sha256:... format). Auto-resolved from releases/{release}/artifact.tar.gz or release.yaml distTreeHash if omitted.",
          },
        },
        writes: ["missions/{mission}/evidence/axiom/**"],
        reads: [
          "systems-cache/{system}/system-config.yaml",
          "systems-cache/{system}/system-state.yaml",
          "missions/{mission}/workpiece/**",
          "releases/{release}/**",
        ],
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
          site: {
            kind: "string",
            required: true,
            description: "Sternsystem id.",
          },
          system: {
            kind: "string",
            description: "Alias for --site.",
          },
          "gate-decision": {
            kind: "string",
            description:
              "RFC-0866: Path to GateDecisionV1 JSON file. Defaults to systems-cache/{system}/gate-decisions/{release}-alt.json.",
          },
          "candidate-id": {
            kind: "string",
            description: "RFC-0866: Release candidate id (defaults to --site).",
          },
          "artifact-hash": {
            kind: "string",
            description:
              "Artifact hash (sha256:... format). Auto-resolved from releases/{release}/artifact.tar.gz or release.yaml distTreeHash if omitted.",
          },
        },
        writes: [
          "systems-cache/{system}/system-state.yaml",
          "systems-cache/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
        ],
        reads: [
          "releases/{release}/**",
          "systems-cache/{system}/system-config.yaml",
          "systems-cache/{system}/system-state.yaml",
        ],
        cacheable: false,
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
          site: {
            kind: "string",
            required: true,
            description: "Sternsystem id.",
          },
          system: {
            kind: "string",
            description: "Alias for --site.",
          },
          "gate-decision": {
            kind: "string",
            description:
              "RFC-0866: Path to GateDecisionV1 JSON file. Defaults to systems-cache/{system}/gate-decisions/{release}-main.json.",
          },
          "main-verification-decision": {
            kind: "string",
            description:
              "RFC-0866: Path to MainVerificationDecisionV1 JSON file. Auto-resolved from systems-cache/{system}/gate-decisions/{release}-main-verification.json if omitted.",
          },
          "candidate-id": {
            kind: "string",
            description: "RFC-0866: Release candidate id (defaults to --site).",
          },
          "artifact-hash": {
            kind: "string",
            description:
              "Artifact hash (sha256:... format). Auto-resolved from releases/{release}/artifact.tar.gz or release.yaml distTreeHash if omitted.",
          },
        },
        writes: [
          "systems-cache/{system}/system-state.yaml",
          "systems-cache/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
        ],
        reads: [
          "releases/{release}/**",
          "systems-cache/{system}/system-config.yaml",
          "systems-cache/{system}/system-state.yaml",
        ],
        cacheable: false,
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
          system: { kind: "string", description: "Alias for --site." },
          channel: {
            kind: "string",
            description: "Filter to a single channel: dev, alt, or main.",
          },
        },
        reads: [
          "systems-cache/{system}/system-config.yaml",
          "systems-cache/{system}/system-state.yaml",
          "systems-cache/{system}/system.pin.json",
        ],
        cacheable: false,
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
          system: { kind: "string", description: "Alias for --site." },
          "to-release": { kind: "string", description: "Explicit target release id." },
        },
        writes: [
          "systems-cache/{system}/system-state.yaml",
          "systems-cache/{system}/bordbuch/events.ndjson",
          "releases/{release}/release.yaml",
        ],
        reads: [
          "systems-cache/{system}/system-config.yaml",
          "systems-cache/{system}/system-state.yaml",
          "releases/*/release.yaml",
        ],
        cacheable: false,
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
          system: { kind: "string", description: "Alias for --site." },
          channel: {
            kind: "string",
            description: "Deployment channel: dev, alt (default), or main.",
          },
        },
        cacheable: false,
        execute: runLeitstandHealth,
      });
      registry.registerCommand({
        name: "leitstand.pipeline.check",
        description:
          "Inspect deployment pipeline state for a release (RFC-0842). Flags: --release.",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          release: {
            kind: "string",
            required: true,
            description: "Release id to inspect.",
          },
          site: { kind: "string", description: "Sternsystem id." },
          system: { kind: "string", description: "Alias for --site." },
        },
        reads: [
          "releases/{release}/**",
          "systems-cache/{system}/system-config.yaml",
          "systems-cache/{system}/system-state.yaml",
        ],
        cacheable: false,
        execute: runLeitstandPipelineCheck,
      });
      registry.registerCommand({
        name: "leitstand.certify",
        description:
          "Produce a GateDecisionV1 JSON file via certification orchestration (RFC-0866). Flags: --site, --gate, --release, --artifact-hash.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: false,
        flags: {
          site: {
            kind: "string",
            required: true,
            description: "Sternsystem id.",
          },
          system: {
            kind: "string",
            description: "Alias for --site.",
          },
          gate: {
            kind: "string",
            required: true,
            description: "Certification gate: dev, alt, or main.",
          },
          release: {
            kind: "string",
            required: true,
            description: "Release id.",
          },
          "candidate-id": {
            kind: "string",
            description: "Release candidate id (defaults to --site).",
          },
          "artifact-hash": {
            kind: "string",
            description:
              "Artifact hash (sha256:... format). Auto-resolved from releases/{release}/artifact.tar.gz or release.yaml distTreeHash if omitted.",
          },
          "base-url": {
            kind: "string",
            description:
              "RFC-0866: Dev deployment URL for mission-check producer. Defaults to latest dev effect record URL.",
          },
          force: {
            kind: "boolean",
            description: "RFC-0867: Bypass evidence cache and re-execute producers.",
          },
        },
        writes: ["systems-cache/{system}/gate-decisions/**"],
        reads: [
          "systems-cache/{system}/system-config.yaml",
          "systems-cache/{system}/system-state.yaml",
          "systems-cache/{system}/gate-decisions/**",
        ],
        cacheable: false,
        execute: runLeitstandCertify,
      });

      const { runLeitstandServiceDevDeploy } = await import("./service-dev-deploy.ts");
      const { runLeitstandServicePromote } = await import("./service-promote.ts");
      const { runLeitstandServiceRollback } = await import("./service-rollback.ts");
      registry.registerCommand({
        name: "leitstand.service.dev-deploy",
        description:
          "Deploy a shared Cloudflare Worker service to the dev channel with pre-deploy gates, lock, and health check (RFC-0806). Flags: --service.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          service: {
            kind: "string",
            required: true,
            description: "Service id from the services: key in services/registry.yaml.",
          },
          "skip-health-check": {
            kind: "boolean",
            description: "Skip post-deploy health check.",
          },
        },
        writes: ["services/registry.yaml"],
        reads: ["services/registry.yaml", "services/{service}/**"],
        execute: runLeitstandServiceDevDeploy,
      });
      registry.registerCommand({
        name: "leitstand.service.promote",
        description:
          "Promote a shared Cloudflare Worker service to production with pre-deploy gates, subdomain validation, lock, and health check (RFC-0806). Flags: --service.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          service: {
            kind: "string",
            required: true,
            description: "Service id from the services: key in services/registry.yaml.",
          },
          "skip-health-check": {
            kind: "boolean",
            description: "Skip post-deploy health check.",
          },
        },
        writes: ["services/registry.yaml"],
        reads: ["services/registry.yaml", "services/{service}/**"],
        execute: runLeitstandServicePromote,
      });
      registry.registerCommand({
        name: "leitstand.service.rollback",
        description:
          "Rollback a shared Cloudflare Worker service to its previous deployment via wrangler rollback (RFC-0806). Flags: --service.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        flags: {
          service: {
            kind: "string",
            required: true,
            description: "Service id from the services: key in services/registry.yaml.",
          },
        },
        writes: ["services/registry.yaml"],
        reads: ["services/registry.yaml", "services/{service}/**"],
        execute: runLeitstandServiceRollback,
      });
    },
  };
}
