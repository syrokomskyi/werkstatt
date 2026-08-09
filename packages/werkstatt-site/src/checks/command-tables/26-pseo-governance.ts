/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/26-pseo-governance.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0278/RFC-0279/RFC-0285: initial command table for PSEO autonomy, review, and escalation.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runAutonomyDemote,
  runAutonomyLevelReport,
  runAutonomyLevelValidate,
  runAutonomyPromote,
  runEscalationBudgetValidate,
  runEscalationQueueReport,
  runEscalationRoute,
  runSurfaceReviewCalibrate,
  runSurfaceReviewRun,
  runSurfaceReviewValidate,
} from "../pseo/pseo-governance.ts";

export const PSEO_GOVERNANCE_COMMANDS: CheckCommandEntry[] = [
  {
    name: "autonomy.level.validate",
    description:
      "Validate PSEO autonomy scopes, ceilings, typed approval authority, and calibration-backed levels (RFC-0278).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/surface/autonomy.state.yaml"],
    execute: runAutonomyLevelValidate,
  },
  {
    name: "autonomy.level.report",
    description:
      "Project current PSEO autonomy levels from module context into src/surface/autonomy.state.yaml (RFC-0278).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/autonomy.state.yaml"],
    reads: ["<app>/src/content/system.md"],
    execute: runAutonomyLevelReport,
  },
  {
    name: "autonomy.promote",
    description:
      "Promote a PSEO autonomy scope only when calibration evidence meets the requested level bar (RFC-0278).",
    scope: "app",
    flags: {
      scope: {
        kind: "string",
        description: "Command-specific scope selector.",
      },
      to: {
        kind: "string",
        description: "Target value.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/autonomy.state.yaml"],
    cacheable: false,
    execute: runAutonomyPromote,
  },
  {
    name: "autonomy.demote",
    description:
      "Demote a PSEO autonomy scope and record the transition in the Bordbuch (RFC-0278).",
    scope: "app",
    flags: {
      scope: {
        kind: "string",
        description: "Command-specific scope selector.",
      },
      to: {
        kind: "string",
        description: "Target value.",
      },
      reason: {
        kind: "string",
        description: "Human-readable reason.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: [
      "<app>/src/surface/autonomy.state.yaml",
      "<app>/src/bordbuch/**",
      "<app>/public/.well-known/bordbuch/**",
    ],
    cacheable: false,
    execute: runAutonomyDemote,
  },
  {
    name: "surface.review.run",
    description:
      "Run the offline governed review harness for frozen PSEO artifacts and append structured verdicts; never calls an LLM in normal builds (RFC-0279).",
    scope: "app",
    flags: {
      artifact: {
        kind: "string",
        description: "Artifact reference to review or route.",
      },
      fieldClass: {
        kind: "string",
        description: "Surface field class under review.",
      },
      confidence: {
        kind: "string",
        description: "Review confidence score.",
      },
      modelId: {
        kind: "string",
        description: "Model id recorded with the review.",
      },
      promptId: {
        kind: "string",
        description: "Prompt id recorded with the review.",
      },
      version: {
        kind: "string",
        description: "Version recorded with the review.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/review.log.ndjson"],
    cacheable: false,
    execute: runSurfaceReviewRun,
  },
  {
    name: "surface.review.calibrate",
    description:
      "Compute reviewer calibration metrics from verdict logs and append them for autonomy promotion decisions (RFC-0279/RFC-0278).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/autonomy.calibration.ndjson"],
    reads: ["<app>/src/surface/review.log.ndjson"],
    execute: runSurfaceReviewCalibrate,
  },
  {
    name: "surface.review.validate",
    description:
      "Validate review verdict log integrity, reviewer/generator separation, confidence, and grounding violation rules (RFC-0279).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/surface/review.log.ndjson"],
    execute: runSurfaceReviewValidate,
  },
  {
    name: "escalation.queue.report",
    description: "Report open human escalations and human-minutes-per-1000-pages KPI (RFC-0285).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/escalation-budget.generated.yaml"],
    reads: ["<app>/src/surface/escalations.ndjson"],
    execute: runEscalationQueueReport,
  },
  {
    name: "escalation.route",
    description: "Route a typed human escalation into the append-only escalation queue (RFC-0285).",
    scope: "app",
    flags: {
      reason: {
        kind: "string",
        description: "Human-readable reason.",
      },
      scope: {
        kind: "string",
        description: "Command-specific scope selector.",
      },
      artifact: {
        kind: "string",
        description: "Artifact reference to review or route.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/surface/escalations.ndjson"],
    cacheable: false,
    execute: runEscalationRoute,
  },
  {
    name: "escalation.budget.validate",
    description:
      "Validate escalation budget exhaustion, mandatory feedback, and near-zero L4 human-minute constraints (RFC-0285).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/surface/escalations.ndjson",
      "<app>/src/surface/escalation-budget.generated.yaml",
    ],
    execute: runEscalationBudgetValidate,
  },
];
