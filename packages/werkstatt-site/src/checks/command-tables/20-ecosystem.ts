/*
<MODULE_CONTRACT>
<purpose>Data-driven table for Agent Control Plane and autonomous CI gate commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0245: register Agent Control Plane and maintenance debt ledger commands.</item>
  <item>RFC-0246: register workspace.surface.validate for Agent Control Plane surface hardening.</item>
  <item>RFC-0249: register test.signal.validate and ci.local.validate.</item>
  <item>RFC-0251: register test signal policy and maintenance debt baseline commands.</item>
  <item>RFC-0256: register maintenance debt queue generate, validate, and report commands.</item>
  <item>RFC-0258: register workspace.write.boundary.lint (atomic + allowlisted shared writes).</item>
  <item>RFC-0519: register gate.catalog.generate and gate.catalog.validate.</item>
  <item>RFC-0533: register ecosystem.commit command.</item>
  <item>RFC-0557: register template.imports.validate and workpiece.imports.validate.</item>
  <item>RFC-0703: register platform.commit.discipline.validate.</item>
  <item>RFC-0754: update ecosystem.commit description for auto-detect and split-commit behavior.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runCiLocalValidate } from "../ci-local.ts";
import { runGithubBranchProtectionValidate } from "../github-branch-protection.ts";
import { runCommandManifestValidateWithOwnership } from "../command-manifest-validate.ts";
import {
  runEcosystemCommit,
  runEcosystemManifestGenerate,
  runEcosystemManifestValidate,
  runMaintenanceDebtReport,
  runWorkspaceDiscoveryValidate,
  runWorkspaceSurfaceValidate,
} from "../ecosystem.ts";
import {
  runMaintenanceDebtBaselineValidate,
  runMaintenanceDebtBaselineWrite,
  runMaintenanceDebtTriageReport,
} from "../maintenance/maintenance-debt-baseline.ts";
import {
  runMaintenanceDebtQueueGenerate,
  runMaintenanceDebtQueueReport,
  runMaintenanceDebtQueueValidate,
} from "../maintenance/maintenance-debt-queue.ts";
import { runTestSignalPolicyValidate, runTestSignalValidate } from "../test-signal.ts";
import { runWorkspaceWriteBoundaryLint } from "../workspace-write-boundary.ts";
import { runGateCatalogGenerate, runGateCatalogValidate } from "../gate-catalog.ts";
import { runTemplateImportsValidate } from "../template-imports-validate.ts";
import { runWorkpieceImportsValidate } from "../workpiece-imports-validate.ts";
import { runTemplateDepsDrift } from "../template-deps-drift.ts";
import { runPlatformCommitDisciplineValidate } from "../platform-commit-discipline.ts";

export const ECOSYSTEM_COMMANDS: CheckCommandEntry[] = [
  {
    name: "ecosystem.manifest.generate",
    description:
      "Generate docs/ecosystem.generated.yaml from live workspace state: apps, packages, commands, pipelines, RFC counts, and generated ownership (RFC-0245).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    writes: ["docs/ecosystem.generated.yaml"],
    reads: [
      "pnpm-workspace.yaml",
      "turbo.json",
      "systems/registry.yaml",
      "packages/*/package.json",
      "docs/rfcs/**/*.md",
    ],
    execute: runEcosystemManifestGenerate,
  },
  {
    name: "ecosystem.manifest.validate",
    description:
      "Validate docs/ecosystem.generated.yaml against live workspace state and fail on drift (RFC-0245).",
    scope: "workspace",
    flags: {},
    reads: [
      "docs/ecosystem.generated.yaml",
      "pnpm-workspace.yaml",
      "turbo.json",
      "systems/registry.yaml",
      "packages/*/package.json",
    ],
    execute: runEcosystemManifestValidate,
    gate: {
      severity: "error",
      phase: "workspace",
      blocks: ["release.prepare"],
    },
  },
  {
    name: "command.manifest.validate",
    description:
      "Validate docs/command-manifest.generated.yaml against the live command registry (CMD-MAN-01 stale), " +
      "flag mutatesState commands with no declared writes (CMD-MAN-02), and cross-check GENERATOR_OWNERSHIP_MAP " +
      "outputs against each owner's writes (CMD-MAN-03) (RFC-0266).",
    scope: "workspace",
    flags: {},
    reads: [
      "docs/command-manifest.generated.yaml",
      "packages/os/site-kernel-checks/src/**/*.ts",
      "packages/os/site-kernel/src/**/*.ts",
    ],
    execute: runCommandManifestValidateWithOwnership,
  },
  {
    name: "workspace.surface.validate",
    description:
      "Validate pnpm workspace package discovery, root pipeline representation, and Agent Control Plane schema v2 surface (RFC-0246).",
    scope: "workspace",
    flags: {},
    reads: ["pnpm-workspace.yaml", "turbo.json", "packages/*/package.json"],
    execute: runWorkspaceSurfaceValidate,
  },
  {
    name: "workspace.discovery.validate",
    description:
      "Validate shared pnpm workspace package discovery helper behavior and diagnostics (RFC-0253).",
    scope: "workspace",
    flags: {},
    reads: ["pnpm-workspace.yaml", "packages/*/package.json"],
    execute: runWorkspaceDiscoveryValidate,
  },
  {
    name: "template.imports.validate",
    description:
      "Validate that all @warpgogol/* and @warpgogol/* imports in template files are resolvable from root package.json devDependencies, and run pnpm install --frozen-lockfile to detect lockfile drift (RFC-0557).",
    scope: "workspace",
    flags: {},
    reads: ["packages/os/*/src/templates/**/*.template.*", "package.json", "pnpm-lock.yaml"],
    execute: runTemplateImportsValidate,
  },
  {
    name: "workpiece.imports.validate",
    description:
      "Validate that all @warpgogol/* and @warpgogol/* imports in materialized workpiece files resolve from root node_modules (RFC-0557).",
    scope: "workspace",
    flags: {},
    reads: [
      "missions/*/workpiece/tools/**/*.ts",
      "missions/*/workpiece/src/**/*.{ts,mjs,astro}",
      "node_modules/@warpgogol/*",
      "node_modules/@warpgogol/*",
    ],
    execute: runWorkpieceImportsValidate,
  },
  {
    name: "template.deps.drift",
    description:
      "Compare dependency versions between workpiece package.json and package.template.json (RFC-0800).",
    scope: "app",
    flags: {
      site: {
        kind: "string",
        required: false,
        description: "Site id to resolve workpiece.",
      },
      "workpiece-dir": {
        kind: "string",
        required: false,
        description: "Override workpiece directory path (relative to workspace root).",
      },
    },
    reads: [
      "packages/werkstatt-site/src/onboarding/templates/package.template.json",
      "missions/*/workpiece/package.json",
    ],
    execute: runTemplateDepsDrift,
  },
  {
    name: "maintenance.debt.report",
    description:
      "Aggregate advisory warning-mode checks into one parseable maintenance debt ledger. Always exits 0 for warning debt (RFC-0245).",
    scope: "workspace",
    flags: {},
    cacheable: false,
    execute: runMaintenanceDebtReport,
  },
  {
    name: "maintenance.debt.baseline.write",
    description:
      "Write docs/maintenance-debt.baseline.generated.yaml from the reviewed current advisory debt backlog (RFC-0251).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    writes: ["docs/maintenance-debt.baseline.generated.yaml"],
    cacheable: false,
    execute: runMaintenanceDebtBaselineWrite,
  },
  {
    name: "maintenance.debt.baseline.validate",
    description:
      "Validate the committed maintenance debt baseline and fail on new unbaselined advisory debt (RFC-0251).",
    scope: "workspace",
    flags: {},
    reads: ["docs/maintenance-debt.baseline.generated.yaml"],
    execute: runMaintenanceDebtBaselineValidate,
  },
  {
    name: "maintenance.debt.triage.report",
    description:
      "Group current maintenance debt by priority and source command for agent return-for-rework planning (RFC-0251).",
    scope: "workspace",
    flags: {},
    cacheable: false,
    execute: runMaintenanceDebtTriageReport,
  },
  {
    name: "maintenance.debt.queue.generate",
    description:
      "Generate or preview docs/maintenance-debt.queues.generated.yaml and initial authored queue scaffolding from current accepted advisory debt (RFC-0256).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    writes: ["docs/maintenance-debt.queues.generated.yaml", "docs/maintenance-debt/queues/*.yaml"],
    cacheable: false,
    execute: runMaintenanceDebtQueueGenerate,
  },
  {
    name: "maintenance.debt.queue.validate",
    description:
      "Validate authored advisory maintenance debt queues against the current debt report and committed baseline (RFC-0256).",
    scope: "workspace",
    flags: {},
    reads: ["docs/maintenance-debt/queues/*.yaml", "docs/maintenance-debt.baseline.generated.yaml"],
    execute: runMaintenanceDebtQueueValidate,
  },
  {
    name: "maintenance.debt.queue.report",
    description:
      "Emit the next bounded actionable batch for an active advisory maintenance debt queue (RFC-0256).",
    scope: "workspace",
    flags: {},
    cacheable: false,
    execute: runMaintenanceDebtQueueReport,
  },
  {
    name: "test.signal.validate",
    description:
      "Classify each pnpm workspace package test script as real, noop, absent, or skipped (RFC-0249).",
    scope: "workspace",
    flags: {},
    reads: ["packages/*/package.json", "packages/*/turbo.json"],
    execute: runTestSignalValidate,
  },
  {
    name: "test.signal.policy.validate",
    description:
      "Validate that every workspace package has real tests or explicit skipped-test owner/rationale/review metadata (RFC-0251).",
    scope: "workspace",
    flags: {},
    reads: ["packages/*/package.json", "packages/*/turbo.json"],
    execute: runTestSignalPolicyValidate,
  },
  {
    name: "ci.local.validate",
    description:
      "Validate that the general PR CI workflow mirrors the autonomous local quality gate and pnpm version contract (RFC-0249).",
    scope: "workspace",
    flags: {},
    reads: [
      ".github/workflows/ci.yml",
      "docs/policies/github-branch-protection.yaml",
      "package.json",
    ],
    execute: runCiLocalValidate,
  },
  {
    name: "workspace.write.boundary.lint",
    description:
      "Validate that every workspace-shared file write (workspace root, docs/, packages/werkstatt-site/src/domain/ontology/) is atomic (writeFileAtomic) and declared on SHARED_WRITE_ALLOWLIST (RFC-0258).",
    scope: "workspace",
    flags: {},
    reads: [
      "packages/os/site-kernel/src/**/*.ts",
      "packages/os/site-kernel-checks/src/**/*.ts",
      "packages/forge/os/**/*.ts",
    ],
    execute: runWorkspaceWriteBoundaryLint,
  },
  {
    name: "github.branch-protection.validate",
    description:
      "RFC-0476: validate the authored GitHub branch-protection policy against the stable CI workflow job name and required RFC validation step. Offline — never calls the GitHub API.",
    scope: "workspace",
    flags: {},
    reads: ["docs/policies/github-branch-protection.yaml", ".github/workflows/ci.yml"],
    execute: runGithubBranchProtectionValidate,
  },
  {
    name: "gate.catalog.generate",
    description:
      "Generate docs/gate-catalog.generated.yaml from live command registrations and gate metadata (RFC-0519).",
    scope: "workspace",
    flags: {},
    mutatesState: true,
    writes: ["docs/gate-catalog.generated.yaml"],
    reads: [
      "packages/os/site-kernel/src/types.ts",
      "packages/os/site-kernel-checks/src/command-tables/*.ts",
      "packages/os/site-kernel-checks/src/pipelines/*.ts",
      "packages/os/site-kernel-checks/src/gate-catalog.ts",
      "tools/kernel.config.ts",
      "docs/ecosystem.generated.yaml",
    ],
    execute: runGateCatalogGenerate,
  },
  {
    name: "gate.catalog.validate",
    description:
      "Validate docs/gate-catalog.generated.yaml for drift against live command registrations and gate metadata (RFC-0519).",
    scope: "workspace",
    flags: {},
    reads: [
      "docs/gate-catalog.generated.yaml",
      "packages/os/site-kernel/src/types.ts",
      "packages/os/site-kernel-checks/src/command-tables/*.ts",
      "packages/os/site-kernel-checks/src/pipelines/*.ts",
      "packages/os/site-kernel-checks/src/gate-catalog.ts",
      "tools/kernel.config.ts",
      "docs/ecosystem.generated.yaml",
    ],
    execute: runGateCatalogValidate,
    gate: {
      severity: "error",
      phase: "workspace",
      blocks: ["release.prepare"],
    },
  },
  {
    name: "ecosystem.commit",
    description:
      "Auto-detects scope and commits with atomic version bump, semantic hash, and trailers for platform-scope changes (RFC-0533, RFC-0754). Non-platform-only commits delegate to git commit without bump. Mixed-scope commits split into platform + non-platform commits. Replaces direct git commit for packages/**, integrations/**, services/**.",
    scope: "workspace",
    flags: {
      message: {
        kind: "string",
        required: true,
        description: 'Commit message subject (e.g. "fix: resolve null pointer in handler").',
      },
      rfc: {
        kind: "string",
        required: false,
        description: "RFC id to reference (e.g. RFC-0533). Reads versionBump from RFC frontmatter.",
      },
      "dry-run": {
        kind: "boolean",
        required: false,
        default: false,
        description:
          "Output planned bump, new version, hash, and PC-02/PC-03 forecast without committing.",
      },
      amend: {
        kind: "boolean",
        required: false,
        default: false,
        description: "Amend the previous ecosystem.commit commit instead of creating a new one.",
      },
      bump: {
        kind: "string",
        required: false,
        description:
          "Override version bump type (patch, minor, major). Takes precedence over RFC versionBump frontmatter.",
      },
    },
    mutatesState: true,
    cacheable: false,
    writes: ["package.json", "docs/platform-version-log.generated.yaml"],
    reads: ["package.json", "docs/rfcs/**/*.md", "packages/**", "integrations/**", "services/**"],
    execute: runEcosystemCommit,
  },
  {
    name: "platform.commit.discipline.validate",
    description:
      "Per-PR CI gate: check that every platform-scope commit (packages/**, integrations/**, services/**) in the --base..HEAD range has an X-Platform-Bump trailer (RFC-0703).",
    scope: "workspace",
    flags: {
      base: {
        kind: "string",
        required: true,
        description: "Base git ref for the commit range (e.g. origin/main).",
      },
    },
    reads: [".git", "packages/**", "integrations/**", "services/**"],
    cacheable: false,
    execute: runPlatformCommitDisciplineValidate,
    gate: {
      severity: "error",
      phase: "workspace",
      blocks: ["release.prepare"],
    },
  },
];
