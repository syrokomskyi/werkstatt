---
id: RFC-0247
title: "Complete canonical warning diagnostics and maintenance debt coverage"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-30
updatedAt: 2026-06-30
implementedAt: 2026-06-30
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0086
  - RFC-0203
  - RFC-0220
  - RFC-0245
commands:
  proposed: []
  added:
    - warning.diagnostics.lint
  changed:
    - diagnostic.shape.lint
    - maintenance.debt.report
    - material.credits.validate
    - asset.reference.validate
    - surface.validate
    - demands.hierarchy.validate
    - material.metadata.validate
    - apps-check.author
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "No standard check places `[warn:` or advisory findings only in `KernelCommandResult.summary`."
  - "`maintenance.debt.report --json` includes warning/info debt from asset references, surface validation, demand hierarchy, material credits, material metadata, and skipped advisory commands."
  - "`warning.diagnostics.lint` fails when a command returns warning-like prose without canonical `Diagnostic[]` data."
  - "Every warning surfaced in `apps-check.author --json` is available as a parseable `Diagnostic` with `ruleId`, `severity`, `message`, and optional `file` and `fixHint`."
nonGoals:
  - "Do not change the severity policy of every rule in this RFC; standardize transport first, then promote selected warnings separately."
  - "Do not add SARIF or external reporting adapters."
  - "Do not implement this hardening while the RFC remains draft."
---

# RFC-0247: Complete canonical warning diagnostics and maintenance debt coverage

## Context

RFC-0203 established a canonical `Diagnostic` model for static checks, and RFC-0245 introduced `maintenance.debt.report` as an agent-readable warning ledger. The 2026-06-30 audit found that important warnings still bypass the canonical path.

Concrete examples:

- `packages/os/site-kernel-checks/src/material-credits.ts` collects `proseWarnings` such as `[warn:missing-prose-credit] ...`, appends them to `summary`, and returns `passResult(...)`. `data.diagnostics` stays empty.
- `packages/os/site-kernel-checks/src/ecosystem.ts` aggregates only command results whose `data` already looks like a canonical `CheckResult`.
- The debt report currently covers a narrow advisory set and misses warning-mode checks in standard author pipelines, including `asset.reference.validate`, `surface.validate`, `demands.hierarchy.validate`, `material.credits.validate`, and `material.metadata.validate`.

For a human, summary prose may be acceptable. For an autonomous agent, it is hidden state.

## Problem

The unprotected invariant is: **every agent-facing warning must be a canonical diagnostic, not summary text.**

When warnings live only in free-form summaries:

- `maintenance.debt.report` cannot aggregate them.
- Agents cannot sort, dedupe, baseline, or fix them reliably.
- Warning-mode rollouts look green even when they carry actionable debt.
- The repository accumulates two diagnostic channels: machine-readable errors and human-readable warnings.

This directly undermines RFC-0203 and the purpose of RFC-0245.

## Decision

All standard pipeline checks and maintenance-ledger checks must emit advisory findings as canonical `Diagnostic[]` data.

The workspace gains a guard command, `warning.diagnostics.lint`, that fails when check code appears to encode warnings only in `summary` or with string markers such as `[warn:...]` outside diagnostics.

`maintenance.debt.report` expands to include all advisory commands that agents need for return-for-rework planning:

- `asset.reference.validate`
- `surface.validate`
- `demands.hierarchy.validate`
- `material.credits.validate`
- `material.metadata.validate`
- existing CKL and text/visual advisory reports already covered by RFC-0245

## Architectural fit

This is an enforcement extension of RFC-0203 and RFC-0245. It does not invent a new finding model. It requires existing checks to use the promoted canonical `CheckResult` transport.

The linter belongs beside `diagnostic.shape.lint` in `@gogol/site-kernel-checks`. The runtime renderer in `@gogol/site-kernel` remains the single pretty-output consumer of diagnostics.

Material-credit warnings relate to RFC-0220, but this RFC does not change the credits contract itself. It only makes current warn-first phases visible to agents.

## Design

### CLI surface

```sh
pnpm exec werkstatt run warning.diagnostics.lint --json
pnpm exec werkstatt run maintenance.debt.report --json
pnpm exec werkstatt run apps-check.author --app warpgogol-com --json
```

`warning.diagnostics.lint` is workspace-scoped and scans check modules for summary-only warning patterns.

Initial lint patterns:

- string literals containing `[warn:` passed into `summary` or `passResult`;
- local variables named `warnings` or `proseWarnings` that are appended only to summary text;
- `KernelCommandResult.summary` that includes warning counts while `data.diagnostics` is absent;
- commands in standard pipelines that return `passResult(command, summary)` after collecting non-empty advisory arrays.

False positives require a local suppression comment with a reason:

```ts
// warning-diagnostics-ok: pretty-only timing note, not an actionable finding
```

### TypeScript contracts

```ts
type AdvisoryCommandName =
  | "asset.reference.validate"
  | "surface.validate"
  | "demands.hierarchy.validate"
  | "material.credits.validate"
  | "material.metadata.validate"
  | "visual.report"
  | "text.normalize.report"
  | "content.claim.report"
  | "content.freshness.report"
  | "content.plan.status";

interface WarningDiagnosticsLintResult extends CheckResult {
  command: "warning.diagnostics.lint";
}

interface MaintenanceDebtItem {
  sourceCommand: AdvisoryCommandName | string;
  severity: "warning" | "info" | "skipped";
  app?: string;
  ruleId?: string;
  file?: string;
  line?: number;
  message: string;
  fixHint?: string;
}

interface MaintenanceDebtReport {
  command: "maintenance.debt.report";
  status: "pass" | "warn";
  items: MaintenanceDebtItem[];
}
```

`diagnosticsResult(command, diagnostics)` remains the standard producer path. A command with warnings and no errors returns `status: "warn"` and `exitCode: 0` unless that rule is already fail-hard.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/material-credits.ts` | Convert prose and attribution warnings into `Diagnostic` records |
| `packages/os/site-kernel-checks/src/ecosystem.ts` | Aggregate all advisory commands into the debt ledger |
| `packages/os/site-kernel-checks/src/diagnostic-shape-lint.ts` | Remains rule-id and shape guard |
| `packages/os/site-kernel-checks/src/warning-diagnostics-lint.ts` | New summary-warning guard |
| `packages/os/site-kernel-checks/src/pipelines/apps-check-author.ts` | Source of app advisory command coverage |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Includes warning diagnostics guard |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Registers any new warning lint rule ids |

### Output format

```json
{
  "command": "maintenance.debt.report",
  "status": "warn",
  "items": [
    {
      "sourceCommand": "material.credits.validate",
      "severity": "warning",
      "app": "warpgogol-com",
      "ruleId": "material.credits.validate",
      "file": "src/content/prose/de/credits.md",
      "message": "Prose authored material has no authorship credit sidecar.",
      "fixHint": "Add a sibling material credit sidecar or mark the reference decorative when it is not editorial."
    }
  ]
}
```

### Failure modes

`warning.diagnostics.lint` exits non-zero on summary-only warning patterns.

`maintenance.debt.report` exits zero when it reports warning or info debt. It exits non-zero only for infrastructure failures such as an unparseable command result or an execution error that prevents ledger construction.

Commands that already fail on errors continue to fail. Commands with only warnings return canonical `CheckResult.status = "warn"` and `exitCode = 0`.

## Rollout

1. Add `warning.diagnostics.lint` in warn-only local development mode, but fail-hard inside `PACKAGES_CHECK_PIPELINE` once current summary-only warnings are migrated.
2. Convert `material.credits.validate` prose and attribution warnings to canonical diagnostics.
3. Expand `maintenance.debt.report` command coverage to include app author warning-mode checks.
4. Add tests that simulate a summary-only warning and verify the lint catches it.
5. Add tests that verify `maintenance.debt.report` includes warnings from at least one app-scoped advisory command.
6. Update `packages/os/site-kernel-checks/AGENTS.md` with the rule that actionable warnings must never be emitted only in summary prose.

## Alternatives considered

Parsing warning strings from summaries inside `maintenance.debt.report` was rejected because it would bless the anti-pattern and force command-specific string parsing.

Promoting every warning to a failing error was rejected because CKL, material credits, and rollout checks intentionally use warn-first phases.

Extending only `diagnostic.shape.lint` was considered, but a separate `warning.diagnostics.lint` gives the repository a focused guard for the summary-only warning class while leaving RFC-0203 shape rules stable.

## Risks

Static detection of warning prose can false-positive on docs, examples, or non-actionable status text. Suppressions must be rare, local, and reasoned.

Expanding `maintenance.debt.report` may make the ledger noisier. The report should preserve source command, app, rule id, and severity so agents can filter instead of ignoring the whole ledger.

Converting warnings to `Diagnostic[]` can accidentally change exit behavior. Tests must pin `exitCode = 0` for warning-only results where the rollout policy is warn-first.

## Acceptance criteria

- [x] `warning.diagnostics.lint` is registered as a workspace-scoped command. (evidence: implemented historically)
- [x] Summary-only `[warn:...]` findings are rejected by `warning.diagnostics.lint`. (evidence: implemented historically)
- [x] `material.credits.validate` emits prose/authorship and attribution warnings as canonical diagnostics. (evidence: implemented historically)
- [x] `maintenance.debt.report --json` includes advisory diagnostics from asset, surface, demand, material credit, and material metadata checks. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Warning-only command results keep zero exit codes unless their existing policy is fail-hard. (evidence: implemented historically)
- [x] New rule ids are registered in `packages/os/site-kernel-checks/src/diagnostics/rules.ts`. (evidence: packages/ directory, package exists)
- [x] `packages-check.run --json`, affected `apps-check.author --app <app> --json`, and `rfc.validate` pass. (evidence: implemented historically)
- [x] Agent instructions mention that actionable warnings must never be summary-only. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted` or `status: implemented`.
- Agents MUST NOT silence warnings by deleting summary text unless an equivalent `Diagnostic` exists.
- Agents MUST preserve warn-first exit semantics while changing transport shape.
- Agents MUST add tests for both the lint and at least one debt-ledger aggregation path.
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` only after every acceptance criterion is satisfied, validators pass, and the implementing commit references `RFC-0247`.
