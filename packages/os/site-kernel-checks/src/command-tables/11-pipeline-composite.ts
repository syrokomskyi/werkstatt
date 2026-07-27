/*
<MODULE_CONTRACT>
<purpose>Data-driven table for composite readiness, amend gates, and idempotency commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runAppContractFull } from "../contract-full.ts";
import {
  runAmendPhaseValidate,
  runAmendCheckAuthor,
  runAmendCheckPostbuild,
  runAmendCheckRun,
} from "../amend-workflow.ts";
import { runAuditDeltaRun } from "@gogol/site-kernel-audit";
import { runPipelineIdempotencySmoke } from "../pipeline/pipeline-idempotency.ts";
import { runDnaRegistryValidate } from "../dna-registry.ts";
import { runNeedMarkersValidate } from "../need-markers.ts";
import { runDistContentReferencesValidate } from "../dist-content-references.ts";

export const COMPOSITE_COMMANDS: CheckCommandEntry[] = [
  /* RFC-0029: Composite readiness gate */
  {
    name: "app.contract.full",
    description:
      "Composite readiness gate: runs every RFC-0023..0028 contract validator in dependency order and aggregates results. The canonical CI signal for 'is this app ready to deploy?' (DNA-35, RFC-0029).",
    scope: "app",
    flags: {
      app: {
        kind: "string",
        description: "App name to use when no app context is active.",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runAppContractFull,
  },
  /* RFC-0136: amend orchestration gates */
  {
    name: "amend.phase.validate",
    description:
      "RFC-0136: verify an amend batch phase's required outputs exist and are fresh against the batch manifest hash.",
    scope: "app",
    flags: {
      batch: {
        kind: "string",
        description: "Amend/onboarding batch id.",
      },
      phase: {
        kind: "string",
        description: "Validation phase selector.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/onboarding/.output/**", "<app>/src/content/**"],
    execute: runAmendPhaseValidate,
  },
  {
    name: "audit.delta.run",
    description:
      "RFC-0136: run the RFC-0074 audit validators over the amend batch delta (touched pages + new routes), reusing the LLM cache, with a non-regression guarantee.",
    scope: "app",
    flags: {
      batch: {
        kind: "string",
        description: "Amend/onboarding batch id.",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runAuditDeltaRun,
  },
  {
    name: "amend-check.author",
    description: "RFC-0136: amend content-author phase gate (delta-scoped, no dist/).",
    scope: "app",
    flags: {
      batch: {
        kind: "string",
        description: "Amend/onboarding batch id.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/content/**", "<app>/onboarding/.output/**"],
    execute: runAmendCheckAuthor,
  },
  {
    name: "amend-check.postbuild",
    description: "RFC-0136: amend post-build phase gate (delta audit + provenance validate).",
    scope: "app",
    flags: {
      batch: {
        kind: "string",
        description: "Amend/onboarding batch id.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/onboarding/.output/**"],
    execute: runAmendCheckPostbuild,
  },
  {
    name: "amend-check.run",
    description: "RFC-0136: run amend-check.author then amend-check.postbuild in order.",
    scope: "app",
    flags: {
      batch: {
        kind: "string",
        description: "Amend/onboarding batch id.",
      },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runAmendCheckRun,
  },
  /* RFC-0087 Wave 2 */
  {
    name: "pipeline.idempotency.smoke",
    description:
      "Run SITES_BUILD_PREPARE_PIPELINE twice for the target app and assert the second pass writes zero new bytes. Catches non-deterministic generators. Slow — opt-in via packages-check.run or CI (RFC-0087 Wave 2).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runPipelineIdempotencySmoke,
  },
  /* RFC-0154 */
  {
    name: "content.idempotency.validate",
    description:
      "Run SITES_BUILD_PREPARE_PIPELINE once and assert it left every tracked authored-content file under src/content/** byte-identical. Catches build steps that rewrite or blank NEED_THIS_* legal markers (RFC-0154).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runPipelineIdempotencySmoke,
  },
  /* RFC-0158 */
  {
    name: "dna.registry.validate",
    description:
      "Keep the canonical DNA registry (docs/architecture-dna.md) in sync with the RFCs that establish invariants (RFC-0158).",
    scope: "workspace",
    flags: {},
    reads: ["docs/architecture-dna.md", "docs/rfcs/**/*.md"],
    execute: runDnaRegistryValidate,
  },
  /* RFC-0095: post-build need-marker scan */
  {
    name: "need.markers.validate",
    description:
      "Scan every .html under apps/<id>/dist for residual NEED_THIS_<FIELD> placeholders emitted by the RFC-0042 need() helper (RFC-0095).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    execute: runNeedMarkersValidate,
  },
  /* RFC-0187 */
  {
    name: "dist.content-references.validate",
    description:
      "Scan every .html under apps/<id>/dist for residual {collection.file.field} brace tokens that were not resolved at render time (RFC-0187).",
    scope: "app",
    flags: {
      "allow-pattern": {
        kind: "string",
        description: "Regex pattern for allowed dist content references.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    execute: runDistContentReferencesValidate,
  },
];
