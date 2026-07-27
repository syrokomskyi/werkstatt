/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/30-check-warpgogol.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0293..0302: initial command table for Check Warpgogol product surface.</item>
</CHANGE_SUMMARY>
*/

import {
  runServicesCheckRun,
  runServicesWorkspaceValidate,
  runCheckArtifactValidate,
  runCheckAccessibilityValidate,
  runCheckActionPackGenerate,
  runCheckAudienceProfileValidate,
  runCheckAudienceReviewRun,
  runCheckAudienceReviewValidate,
  runCheckCompare,
  runCheckContentSurfaceValidate,
  runCheckDeployAltRun,
  runCheckDeployMainGate,
  runCheckDeterministicRun,
  runCheckEvidenceCapture,
  runCheckEvidenceValidate,
  runCheckLocalizationValidate,
  runCheckReportGenerate,
  runCheckRun,
  runCheckRunnerInfo,
  runCheckSafetyValidate,
  runCheckTechnicalValidate,
  runCheckTargetValidate,
  runCheckWarpgogolAppValidate,
  runCheckWarpgogolRunnerValidate,
  runWarpgogolCheckHintsGenerate,
  runWarpgogolCheckHintsValidate,
} from "@warpgogol/site-kernel-check-warpgogol";
import type { CheckCommandEntry } from "./types.ts";

export const CHECK_WEBGOGOL_COMMANDS: CheckCommandEntry[] = [
  {
    name: "services.workspace.validate",
    description:
      "Validate services/* backend composition workspaces and import boundaries (RFC-0304).",
    scope: "workspace",
    reads: ["pnpm-workspace.yaml", "services/**", "apps/**/*.ts"],
    flags: {},
    execute: runServicesWorkspaceValidate,
  },
  {
    name: "services.check.run",
    description: "Run all service workspace validators (RFC-0304).",
    scope: "workspace",
    reads: ["pnpm-workspace.yaml", "services/**", "apps/**/*.ts"],
    flags: {},
    execute: runServicesCheckRun,
  },
  {
    name: "check-warpgogol.runner.validate",
    description: "Validate the Check Warpgogol Node runner backend and app API boundary (RFC-0304).",
    scope: "workspace",
    reads: [
      "services/check-warpgogol-runner/**",
      "apps/check-warpgogol-com/src/pages/api/check-runs/**",
    ],
    flags: {},
    execute: runCheckWarpgogolRunnerValidate,
  },
  {
    name: "check-warpgogol.app.validate",
    description:
      "Validate the check-warpgogol-com operator app scaffold and product-facing content (RFC-0300).",
    scope: "workspace",
    reads: ["apps/check-warpgogol-com/**"],
    flags: {},
    execute: runCheckWarpgogolAppValidate,
  },
  {
    name: "check.deploy-alt.run",
    description: "Run the alt-host Check Warpgogol sequence before a main deploy (RFC-0301).",
    scope: "workspace",
    mutatesState: true,
    requiresNetwork: true,
    timeoutMs: 180000,
    expectedDurationMs: 45000,
    cacheable: false,
    flags: {
      target: {
        kind: "string",
        required: true,
        description: "Path to a CheckTarget JSON file for the alt host.",
      },
      "run-id": { kind: "string", description: "Optional deterministic run id for scripted runs." },
    },
    reads: ["<target>"],
    writes: [".check-warpgogol/runs/**"],
    execute: runCheckDeployAltRun,
  },
  {
    name: "check.deploy-main.gate",
    description:
      "Gate deploy:main on the latest alt-host Check Warpgogol report thresholds (RFC-0301).",
    scope: "workspace",
    flags: {
      run: { kind: "string", description: "Path to .check-warpgogol/runs/<runId>/run.json." },
      report: { kind: "string", description: "Path to report.json." },
      "max-errors": {
        kind: "string",
        description: "Maximum allowed report errors. Defaults to 0.",
      },
      "max-warnings": {
        kind: "string",
        description: "Maximum allowed report warnings. Defaults to unlimited.",
      },
    },
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckDeployMainGate,
  },
  {
    name: "check.audience.profile.validate",
    description: "Validate a Check Warpgogol audience profile descriptor (RFC-0299).",
    scope: "workspace",
    flags: {
      profile: {
        kind: "string",
        description: "Path to an audience profile YAML file.",
      },
    },
    reads: ["packages/ontology/check-audiences/**"],
    execute: runCheckAudienceProfileValidate,
  },
  {
    name: "check.audience.review.run",
    description:
      "Generate or reuse a cached audience review artifact from captured evidence (RFC-0299).",
    scope: "workspace",
    mutatesState: true,
    cacheable: false,
    flags: {
      run: {
        kind: "string",
        description: "Path to .check-warpgogol/runs/<runId>/run.json.",
      },
      evidence: {
        kind: "string",
        description: "Path to .check-warpgogol/runs/<runId>/evidence.graph.json.",
      },
      profile: {
        kind: "string",
        description: "Path to an audience profile YAML file.",
      },
      force: {
        kind: "boolean",
        description: "Regenerate even when audience-review.json already exists.",
      },
    },
    reads: [".check-warpgogol/runs/**", "packages/ontology/check-audiences/**"],
    writes: [".check-warpgogol/runs/**"],
    execute: runCheckAudienceReviewRun,
  },
  {
    name: "check.audience.review.validate",
    description: "Validate a cached audience review artifact (RFC-0299).",
    scope: "workspace",
    flags: {
      review: {
        kind: "string",
        required: true,
        description: "Path to .check-warpgogol/runs/<runId>/audience-review.json.",
      },
    },
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckAudienceReviewValidate,
  },
  {
    name: "warpgogol.check-hints.generate",
    description:
      "Generate public .well-known/warpgogol-check.json hints for URL-first checkers (RFC-0295).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    reads: ["<app>/src/content/system.md"],
    writes: ["<app>/public/.well-known/warpgogol-check.json"],
    flags: {},
    execute: runWarpgogolCheckHintsGenerate,
  },
  {
    name: "warpgogol.check-hints.validate",
    description: "Validate the public .well-known/warpgogol-check.json hints artifact (RFC-0295).",
    scope: "app",
    supportsAllSites: true,
    reads: ["<app>/public/.well-known/warpgogol-check.json"],
    flags: {},
    execute: runWarpgogolCheckHintsValidate,
  },
  {
    name: "check.technical.validate",
    description: "Run deterministic technical checks against a captured evidence graph (RFC-0298).",
    scope: "workspace",
    flags: evidenceFlagSchema(),
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckTechnicalValidate,
  },
  {
    name: "check.localization.validate",
    description:
      "Run deterministic locale-surface checks against a captured evidence graph (RFC-0298).",
    scope: "workspace",
    flags: evidenceFlagSchema(),
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckLocalizationValidate,
  },
  {
    name: "check.accessibility.validate",
    description:
      "Run deterministic accessibility checks against a captured evidence graph (RFC-0298).",
    scope: "workspace",
    flags: evidenceFlagSchema(),
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckAccessibilityValidate,
  },
  {
    name: "check.content-surface.validate",
    description:
      "Run deterministic rendered content-surface checks against a captured evidence graph (RFC-0298).",
    scope: "workspace",
    flags: evidenceFlagSchema(),
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckContentSurfaceValidate,
  },
  {
    name: "check.deterministic.run",
    description:
      "Run all deterministic Check Warpgogol checks against a captured evidence graph (RFC-0298).",
    scope: "workspace",
    flags: evidenceFlagSchema(),
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckDeterministicRun,
  },
  {
    name: "check.report.generate",
    description:
      "Generate Check Warpgogol JSON and HTML reports from evidence and deterministic diagnostics (RFC-0297).",
    scope: "workspace",
    mutatesState: true,
    cacheable: false,
    flags: runOrEvidenceFlagSchema(),
    reads: [".check-warpgogol/runs/**"],
    writes: [".check-warpgogol/runs/**"],
    execute: runCheckReportGenerate,
  },
  {
    name: "check.action-pack.generate",
    description:
      "Generate an agent action pack with stable anchors from deterministic diagnostics (RFC-0297).",
    scope: "workspace",
    mutatesState: true,
    cacheable: false,
    flags: runOrEvidenceFlagSchema(),
    reads: [".check-warpgogol/runs/**"],
    writes: [".check-warpgogol/runs/**"],
    execute: runCheckActionPackGenerate,
  },
  {
    name: "check.compare",
    description: "Compare two Check Warpgogol report.json files for diagnostic drift (RFC-0297).",
    scope: "workspace",
    flags: {
      base: { kind: "string", required: true, description: "Base report.json path." },
      head: { kind: "string", required: true, description: "Head report.json path." },
    },
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckCompare,
  },
  {
    name: "check.evidence.capture",
    description:
      "Capture rendered page, section, link, and screenshot evidence for a URL target (RFC-0294).",
    scope: "workspace",
    mutatesState: true,
    requiresNetwork: true,
    timeoutMs: 120000,
    expectedDurationMs: 30000,
    cacheable: false,
    flags: {
      target: { kind: "string", required: true, description: "Path to a CheckTarget JSON file." },
      "run-id": { kind: "string", description: "Optional deterministic run id for scripted runs." },
    },
    reads: ["<target>"],
    writes: [".check-warpgogol/runs/**"],
    execute: runCheckEvidenceCapture,
  },
  {
    name: "check.evidence.validate",
    description:
      "Validate a rendered SiteEvidenceGraph schema, hash, screenshots, and leak boundary (RFC-0294).",
    scope: "workspace",
    flags: {
      evidence: {
        kind: "string",
        required: true,
        description: "Path to .check-warpgogol/runs/<runId>/evidence.graph.json.",
      },
    },
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckEvidenceValidate,
  },
  {
    name: "check.target.validate",
    description: "Validate a URL-first CheckTarget descriptor (RFC-0293).",
    scope: "workspace",
    flags: {
      target: { kind: "string", required: true, description: "Path to a CheckTarget JSON file." },
    },
    reads: ["<target>"],
    execute: runCheckTargetValidate,
  },
  {
    name: "check.safety.validate",
    description:
      "Validate Check Warpgogol host allowlists, secret references, and AI-review policy (RFC-0302).",
    scope: "workspace",
    flags: {
      target: { kind: "string", required: true, description: "Path to a CheckTarget JSON file." },
    },
    reads: ["<target>"],
    execute: runCheckSafetyValidate,
  },
  {
    name: "check.runner.info",
    description:
      "Print the installed Check Warpgogol runner capabilities and artifact version (RFC-0296).",
    scope: "workspace",
    flags: {},
    cacheable: false,
    execute: runCheckRunnerInfo,
  },
  {
    name: "check.artifact.validate",
    description: "Validate a Check Warpgogol run artifact layout and run.json envelope (RFC-0296).",
    scope: "workspace",
    flags: {
      run: {
        kind: "string",
        required: true,
        description: "Path to .check-warpgogol/runs/<runId>/run.json.",
      },
    },
    reads: [".check-warpgogol/runs/**"],
    execute: runCheckArtifactValidate,
  },
  {
    name: "check.run",
    description:
      "Capture evidence and create a canonical Check Warpgogol run envelope (RFC-0293, RFC-0294, RFC-0296).",
    scope: "workspace",
    mutatesState: true,
    requiresNetwork: true,
    timeoutMs: 120000,
    expectedDurationMs: 30000,
    cacheable: false,
    flags: {
      target: { kind: "string", required: true, description: "Path to a CheckTarget JSON file." },
      "run-id": { kind: "string", description: "Optional deterministic run id for scripted runs." },
    },
    reads: ["<target>"],
    writes: [".check-warpgogol/runs/**"],
    execute: runCheckRun,
  },
];

function evidenceFlagSchema() {
  return {
    evidence: {
      kind: "string" as const,
      required: true,
      description: "Path to .check-warpgogol/runs/<runId>/evidence.graph.json.",
    },
  };
}

function runOrEvidenceFlagSchema() {
  return {
    run: {
      kind: "string" as const,
      description: "Path to .check-warpgogol/runs/<runId>/run.json.",
    },
    evidence: {
      kind: "string" as const,
      description: "Path to .check-warpgogol/runs/<runId>/evidence.graph.json.",
    },
  };
}
