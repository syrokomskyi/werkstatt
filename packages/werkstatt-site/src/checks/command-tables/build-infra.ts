/*
<MODULE_CONTRACT>
<purpose>Consolidated command table for build infrastructure: runtime diagnostics, pipeline telemetry, and behavior snapshot validation.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Merged 21-runtime-diagnostics.ts, 23-pipeline-telemetry.ts, 24-behavior-snapshot.ts into build-infra.ts.</item>
  <item>RFC-0721: add behavior.snapshot.staleness.check command (moved from 01-codegen.ts, scope fixed to app).</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runRuntimeWarningsLint } from "../runtime-warnings-lint.ts";
import { runSectionDefaultsValidate } from "../section-defaults.ts";
import { runSemanticTargetsValidate } from "../semantic-targets.ts";
import {
  runPipelineTimingReport,
  runPipelineTimeoutValidate,
} from "../pipeline/pipeline-telemetry.ts";
import { runPipelineCacheParity } from "../pipeline/pipeline-cache-parity.ts";
import { runPipelineDependenciesValidate } from "../pipeline/pipeline-dependencies-validate.ts";
import { runBehaviorSnapshotGenerate, runBehaviorSnapshotValidate } from "../behavior-snapshot.ts";
import { runBehaviorSnapshotStalenessCheck } from "../behavior-snapshot-staleness.ts";
import {
  runContentRegressionCheck,
  runContentRegressionSnapshotUpdate,
  runContentRegressionReviewGenerate,
  runContentRegressionApply,
} from "../content-regression.ts";

export const BUILD_INFRA_COMMANDS: CheckCommandEntry[] = [
  {
    name: "section.defaults.validate",
    description:
      "Validate shared UI section/component fallback defaults and reject app-specific asset/pageId tokens (RFC-0250).",
    scope: "workspace",
    flags: {},
    reads: ["packages/werkstatt-site/src/domain/ui/**/*.ts", "packages/werkstatt-site/src/domain/ui/**/*.tsx"],
    execute: runSectionDefaultsValidate,
  },
  {
    name: "semantic.targets.validate",
    description:
      "Validate authored and generated semantic pageId targets against the app route registry before render (RFC-0250).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runSemanticTargetsValidate,
  },
  {
    name: "runtime.warnings.lint",
    description:
      "Verify actionable runtime warning classes have canonical static Diagnostic[] coverage (RFC-0250).",
    scope: "workspace",
    flags: {},
    reads: ["packages/os/site-kernel-checks/src/**/*.ts"],
    execute: runRuntimeWarningsLint,
  },
  {
    name: "pipeline.timing.report",
    description:
      "Report Site OS pipeline timing telemetry support and configured standard pipeline timing metadata (RFC-0255).",
    scope: "workspace",
    flags: {},
    cacheable: false,
    execute: runPipelineTimingReport,
  },
  {
    name: "pipeline.timeout.validate",
    description:
      "Validate Site OS command and pipeline timeout metadata in warning mode for missing long-running budgets (RFC-0255).",
    scope: "workspace",
    flags: {},
    reads: ["packages/os/site-kernel-checks/src/**/*.ts", "packages/os/site-kernel/src/**/*.ts"],
    execute: runPipelineTimeoutValidate,
  },
  {
    name: "pipeline.dependencies.validate",
    description:
      "RFC-0686: validate dependsOn fields in all standard pipelines — checks for missing references, forward references, duplicate command names, and circular dependencies.",
    scope: "workspace",
    flags: {},
    reads: ["packages/os/site-kernel-checks/src/**/*.ts", "packages/os/site-kernel/src/**/*.ts"],
    execute: runPipelineDependenciesValidate,
  },
  {
    name: "pipeline.cache.parity",
    description:
      "RFC-0259: prove a turbo cache-restored (warm) app build is byte-identical to a from-scratch (cold) build. Runs a real cold + warm build cycle; expensive, CI-scheduled, not a per-PR gate. CACHE-PARITY-01 file missing after warm; CACHE-PARITY-02 file differs after warm.",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    cacheable: false,
    longRunning: true,
    expectedDurationMs: 300_000,
    timeoutMs: 1_800_000,
    writes: [
      "<app>/dist/**",
      "<app>/.astro/**",
      "<app>/public/_img/**",
      "<app>/public/_video/**",
      "<app>/public/*.{xml,txt}",
      "<app>/src/*.generated.yaml",
      "<app>/src/styles/*.generated.css",
    ],
    reads: ["<app>/dist/**", "<app>/.astro/**"],
    flags: {
      app: {
        kind: "string",
        description: "App target name (alternative to --site <name>).",
      },
    },
    execute: runPipelineCacheParity,
  },
  {
    name: "behavior.snapshot.generate",
    description:
      "Read the built dist/client and write apps/<app>/behavior.snapshot.generated.yaml — a deterministic, " +
      "reviewable projection of the app's public behavior surface (routes' title/meta/canonical/hreflang/OG/" +
      "Twitter/JSON-LD, headers, redirects). Runs in build.post after the Astro build (RFC-0269).",
    scope: "app",
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/behavior.snapshot.generated.yaml"],
    reads: ["<app>/dist/client/**/*.html", "<app>/src/content/system.md"],
    flags: {},
    execute: runBehaviorSnapshotGenerate,
  },
  {
    name: "behavior.snapshot.validate",
    description:
      "Regenerate the behavior snapshot in-memory and fail (SNAP-01) on drift against the committed " +
      "apps/<app>/behavior.snapshot.generated.yaml, with a per-route changed-field summary. SNAP-02 when the " +
      "committed file is missing, hand-edited, or dist/client is absent. Runs in sites-check.postbuild (RFC-0269).",
    scope: "app",
    supportsAllSites: true,
    flags: {},
    reads: [
      "<app>/behavior.snapshot.generated.yaml",
      "<app>/dist/client/**/*.html",
      "<app>/src/content/system.md",
    ],
    execute: runBehaviorSnapshotValidate,
  },
  {
    name: "behavior.snapshot.staleness.check",
    description:
      "Warn when system.md pages[] routes are absent from behavior.snapshot.generated.yaml (RFC-0721). " +
      "Advisory — does not fail the pipeline. One-directional: only checks newRoutes (system.md routes missing from snapshot).",
    scope: "app",
    supportsAllSites: true,
    flags: {},
    reads: ["<app>/src/content/system.md", "<app>/behavior.snapshot.generated.yaml"],
    execute: runBehaviorSnapshotStalenessCheck,
  },
  {
    name: "content.regression.check",
    description:
      "RFC-0732: snapshot resolved page content (block text, prose body, FAQ Q&A) per-route and diff " +
      "against golden baseline in cache clone. CREG-01 content drift, CREG-02 route set mismatch, " +
      "CREG-03 no golden snapshot (cold start warning).",
    scope: "app",
    supportsAllSites: true,
    cacheable: false,
    flags: {
      site: { kind: "string", description: "Site to validate (required, app scope)." },
      "dry-run": {
        kind: "boolean",
        description: "Render snapshot without writing; return diagnostics only.",
      },
      "skip-content-regression": {
        kind: "boolean",
        description: "Skip the content regression gate (escape hatch).",
      },
      "auto-accept": {
        kind: "boolean",
        description:
          "RFC-0764: auto-accept all detected content drift, update golden baseline directly, " +
          "and pass. Generates review.yaml (audit trail) and apply-result.json. " +
          "Default behavior (fail on drift) is unchanged without this flag.",
      },
    },
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runContentRegressionCheck,
  },
  {
    name: "content.regression.snapshot.update",
    description:
      "RFC-0732: update the golden content regression snapshot in the cache clone after operator review. " +
      "Prints diff first; requires --confirm to write.",
    scope: "app",
    supportsAllSites: true,
    cacheable: false,
    flags: {
      site: { kind: "string", description: "Site to update (required, app scope)." },
      confirm: {
        kind: "boolean",
        description: "Required to write; without it, prints diff and exits 0.",
      },
    },
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runContentRegressionSnapshotUpdate,
  },
  {
    name: "content.regression.review.generate",
    description:
      "RFC-0734: generate a review.yaml manifest with per-change golden/current values " +
      "for operator review. Reads current snapshot and golden snapshot, diffs them, and " +
      "writes review.yaml to missions/{missionId}/evidence/content-regression/review.yaml.",
    scope: "app",
    supportsAllSites: true,
    cacheable: false,
    flags: {
      site: { kind: "string", description: "Site to generate review for (required, app scope)." },
      "dry-run": {
        kind: "boolean",
        description: "Print review YAML to stdout without writing file.",
      },
      "auto-accept": {
        kind: "boolean",
        description:
          "RFC-0748: pre-set all non-removed-route changes to decision: accept, " +
          "allowing immediate content.regression.apply without manual YAML editing. " +
          "Removed routes remain pending (structural change requires explicit confirmation).",
      },
    },
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runContentRegressionReviewGenerate,
  },
  {
    name: "content.regression.apply",
    description:
      "RFC-0734: apply review.yaml decisions to update the golden snapshot. Verifies " +
      "that reject decisions were reverted and fix values were applied in source content. " +
      "CREG-04 workpiece content mismatch. Writes apply-result.json for mission.close enforcement.",
    scope: "app",
    supportsAllSites: true,
    cacheable: false,
    flags: {
      site: { kind: "string", description: "Site to apply review to (required, app scope)." },
      review: { kind: "string", description: "Path to filled-in review.yaml (required)." },
      force: {
        kind: "boolean",
        description: "Apply even if some decisions are pending (escape hatch).",
      },
    },
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runContentRegressionApply,
  },
];
