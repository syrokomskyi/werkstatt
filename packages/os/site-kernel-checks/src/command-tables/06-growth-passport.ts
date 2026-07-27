/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runGrowthEventsValidate } from "../growth-events.ts";
import { runGrowthFunnelValidate } from "../growth-funnel.ts";
import { runGrowthExperimentValidate, runGrowthExperimentArchive } from "../growth-experiment.ts";
import { runGrowthAdapterContract, runGrowthVendorResolve } from "../growth-adapter.ts";
import {
  runPassportEmit,
  runPassportVerify,
  runPassportKeyRotate,
  runStarMapRender,
  runNebulaScoreCompute,
  runPulsarHeartbeat,
} from "../passport.ts";

export const GROWTH_PASSPORT_COMMANDS: CheckCommandEntry[] = [
  /* Wave 0 (RFC-0027): Growth layer */
  {
    name: "growth.events.validate",
    description:
      "Validate emit() call sites use only closed EventName catalog values, and validate ontology event YAML files for structural completeness (DNA-27, RFC-0027).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "packages/ontology/growth/**/*.yaml"],
    execute: runGrowthEventsValidate,
  },
  {
    name: "growth.funnel.validate",
    description:
      "Validate funnel YAML files in packages/ontology/growth/funnels/ and cross-reference with system.yaml growth.funnels[] (DNA-28, RFC-0027).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "packages/ontology/growth/funnels/**/*.yaml"],
    execute: runGrowthFunnelValidate,
  },
  {
    name: "growth.experiment.validate",
    description:
      "Validate experiment YAML files in packages/ontology/growth/experiments/ and cross-reference with system.yaml growth.experiments[] (DNA-29, RFC-0027).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "packages/ontology/growth/experiments/**/*.yaml"],
    execute: runGrowthExperimentValidate,
  },
  {
    name: "growth.experiment.archive",
    description:
      "Validate archival hygiene: concluded/archived experiments not referenced in system.yaml, concluded experiments have concludedAt date (DNA-29, RFC-0027).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "packages/ontology/growth/experiments/**/*.yaml"],
    execute: runGrowthExperimentArchive,
  },
  {
    name: "growth.adapter.contract",
    description:
      "Validate all packages/growth-adapter-*/ exports satisfy the GrowthAdapter interface contract: id, init(), track() (DNA-30, RFC-0027).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/growth-adapters/*/src/**/*.ts"],
    execute: runGrowthAdapterContract,
  },
  {
    name: "growth.vendor.resolve",
    description:
      "Validate src/content/system.md growth.vendor.adapter references a known registered adapter id (DNA-30, RFC-0027).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    execute: runGrowthVendorResolve,
  },
  /* Wave 0 (RFC-0028): Cosmic Passport */
  {
    name: "nebula.score.compute",
    description:
      "Assemble Lighthouse + axe + content + DNA inputs and compute the composite 0-100 Nebula Score; write dist/.well-known/nebula-score.json (DNA-33, RFC-0028).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runNebulaScoreCompute,
  },
  {
    name: "star-map.render",
    description:
      "Render a deterministic SVG star map from system.yaml + uni.registry.yaml and write dist/.well-known/cosmic-star-map.svg (DNA-32, RFC-0028).",
    scope: "app",
    flags: {
      depth: {
        kind: "string",
        description: "Star-map render depth, usually 3 or 4.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "uni.registry.yaml"],
    execute: runStarMapRender,
  },
  {
    name: "passport.emit",
    description:
      "Run the full passport emission pipeline: validators → nebula score → star map → VC sign → write dist/.well-known/cosmic-passport.json (DNA-31, RFC-0028).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/dist/.well-known/cosmic-passport.json"],
    cacheable: false,
    execute: runPassportEmit,
  },
  {
    name: "passport.verify",
    description:
      "Parse dist/.well-known/cosmic-passport.json, verify Ed25519 VC signature, confirm systemHash matches current system.yaml (DNA-34, RFC-0028).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/dist/.well-known/cosmic-passport.json",
      "<app>/public/.well-known/cosmic-passport-key.json",
      "<app>/src/content/system.md",
    ],
    execute: runPassportVerify,
  },
  {
    name: "passport.key.rotate",
    description:
      "Generate a new Ed25519 keypair; update apps/<app>/public/.well-known/cosmic-passport-key.json; print private key to stdout for GitHub Actions secret storage (DNA-34, RFC-0028).",
    scope: "app",
    flags: {
      existingKey: {
        kind: "boolean",
        description: "Rotate from an existing passport key instead of initial creation.",
      },
    },
    supportsAllSites: false,
    mutatesState: true,
    writes: ["<app>/public/.well-known/cosmic-passport-key.json"],
    cacheable: false,
    execute: runPassportKeyRotate,
  },
  {
    name: "pulsar.heartbeat",
    description:
      "Fire a GET request to system.yaml release.passport.heartbeatUrl (5s timeout). Never fails the build — informational only (RFC-0028).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runPulsarHeartbeat,
  },
];
