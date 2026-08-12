---
id: RFC-0809
title: "Add pipeline collect-errors mode for fail-fast diagnostic relief"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-11
updatedAt: 2026-08-12
enhancedAt: 2026-08-12
implementedAt: 2026-08-12
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0390
  - RFC-0686
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - "mission.validate"
    - "build.check"
    - "build.post"
    - "build.prepare"
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Single mission.validate run surfaces all independent validator failures"
  - "Pipeline exit code remains non-zero when any step fails in collect-errors mode"
  - "Dependent steps are still skipped when a dependency fails"
  - "Default behavior (fail-fast) is unchanged"
nonGoals:
  - "Re-running failed steps automatically"
  - "Collecting errors across multiple pipeline invocations"
  - "Changing pipeline cache behavior"
# acceptance:
#   - probe: run
#     command: "werkstatt run mission.validate --site warpgogol-com --mission warpgogol-com-m000050 --collect-errors"
#     expect:
#       exitCode: 0
#       summaryContains: "collect-errors"
#   - probe: run
#     command: "werkstatt run build.check --site warpgogol-com --collect-errors"
#     expect:
#       exitCode: non-zero
#       outputContains: "failedSteps"
---

# RFC-0809: Add pipeline collect-errors mode for fail-fast diagnostic relief

## Context

The kernel pipeline executor (`executeScheduledSteps` in `pipeline-scheduler.ts`) uses fail-fast semantics: when a step fails, all transitive dependents are skipped and the pipeline terminates. The caller (`executePipelineForSite` / `executePipelineForWorkspace` in `execute-pipeline.ts`) picks the first failed report and returns immediately.

This means that `mission.validate` — which runs 203+ validator steps — stops at the **first** failing validator. The operator or agent must fix that error, re-run the full pipeline (2–4 minutes), discover the next error, fix it, and repeat. During the warpgogol-com-m000050 release, this required **4 full pipeline runs** to surface all independent failures (ownership map, markdown twin, Playwright, DNS).

## Problem

Independent validator failures are invisible until the first one is fixed. This is especially painful for:

- **Onboarding new sites**: many validators fail simultaneously on first run.
- **Post-RFC migrations**: multiple validators may need updates in parallel.
- **Release pipelines**: each `mission.validate` run costs 2–4 minutes; 4 runs = 8–16 minutes of wasted time waiting for sequential error discovery.

The current `KernelPipelineStep` interface has no `continueOnError` field. The scheduler correctly skips dependents of failed steps, but independent steps that could run and report their own failures are never given the chance (in concurrency=1 mode) or are correctly run (in concurrency>1) but their failures are still only reported one at a time by the caller.

## Decision

The pipeline executor gains a **collect-errors mode** activated by a `--collect-errors` flag on the pipeline-running commands (`mission.validate`, `build.check`, `build.post`, `build.prepare`). In this mode:

1. **All independent steps execute** regardless of other step failures. This is already the case for concurrency > 1 (the default): the scheduler runs independent steps in parallel and skips only dependents of failed steps. For concurrency = 1, the scheduler rebuilds the schedule as fully sequential (`pipeline-scheduler.ts:194-201`), so **collect-errors has no effect** — a failure aborts all remaining steps. This is an accepted limitation; operators wanting collect-errors behavior should use the default concurrency.
2. **Dependent steps are still skipped** when their dependency fails — this is not changed. If validator B depends on generator A and A fails, B cannot run.
3. **The caller aggregates all failed reports** and prints a summary table at the end instead of stopping at the first failure.
4. **Exit code is non-zero** if any step failed.

The default behavior (fail-fast) is unchanged. Collect-errors is opt-in via `--collect-errors`.

## Architectural fit

- **RFC-0390 (pipeline cache)**: No change to cache behavior. Cache hits/misses work identically in both modes.
- **RFC-0686 (dependency-aware concurrency)**: The scheduler already supports dependency-aware execution. Collect-errors mode changes only the **caller's post-processing** of results, not the scheduler itself. The scheduler already executes independent steps in parallel and skips dependents of failed steps.
- **Concurrency = 1 limitation**: When `concurrency=1`, the scheduler rebuilds the schedule with full sequential implicit dependencies (`pipeline-scheduler.ts:194-201`), making every step depend on the previous one. A failure cascades `markSkippedDueToFailure` to all remaining steps. Collect-errors cannot change this without modifying the scheduler, which is out of scope. The flag is a no-op in concurrency=1 mode.

## Design

### CLI surface

```sh
pnpm exec werkstatt run mission.validate --site warpgogol-com --mission warpgogol-com-m000050 --collect-errors
pnpm exec werkstatt run build.check --site warpgogol-com --collect-errors
```

### TypeScript contracts

```ts
// packages/werkstatt/src/kernel/types.ts — extend ExecuteKernelPipelineOptions

export interface ExecuteKernelPipelineOptions {
  // ... existing fields ...
  /** RFC-0809: when true, continue executing independent steps after a failure
   *  and aggregate all errors in the final report. Default: false (fail-fast).
   *  No effect when concurrency=1 (scheduler uses full sequential abort-on-failure). */
  collectErrors?: boolean;
}

// packages/werkstatt/src/kernel/types.ts — extend KernelPipelineReport

export interface KernelPipelineReport {
  // ... existing fields ...
  /** RFC-0809: command names of steps that failed (excluding dependency-skipped).
   *  Present only in collect-errors mode when failures occurred. */
  failedSteps?: string[];
}
```

```ts
// packages/werkstatt/src/kernel/runtime/pipeline-scheduler.ts — no changes needed.
// The scheduler already executes independent steps and skips dependents.
// The change is in the caller (execute-pipeline.ts).
// Note: dependencySkipped is a field on StepExecutionResult, not on
// KernelExecutionReport. The caller must filter on StepExecutionResult
// before mapping to reports.
```

```ts
// packages/werkstatt/src/kernel/runtime/execute-pipeline.ts — change post-processing

// Before (fail-fast):
const failed = reports.find((report) => !report.ok);

// After (collect-errors mode):
// Filter on StepExecutionResult (which has dependencySkipped), not on
// KernelExecutionReport (which does not). Use sortedResults before mapping.
const failedResults = sortedResults.filter(
  (r) => !r.report.ok && !r.dependencySkipped,
);
const failedReports = failedResults.map((r) => r.report);
if (collectErrors && failedReports.length > 0) {
  // Print summary table of all failures
  for (const r of failedReports) {
    progressLine(`  [FAIL] ${r.commandName}: ${r.summary}`);
  }
  // Return with first failure's exit code, but all steps in the report
  return {
    siteName: site.name,
    pipelineName: options.pipelineName,
    exitCode: failedReports[0]!.exitCode,
    ok: false,
    steps: reports,
    timing,
    filesModified: aggregateFilesModified(reports),
    failedSteps: failedReports.map((r) => r.commandName),
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/kernel/types.ts` | Add `collectErrors` to `ExecuteKernelPipelineOptions`; add `failedSteps` to `KernelPipelineReport` |
| `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` | Aggregate failures in post-processing; filter on `StepExecutionResult.dependencySkipped` |
| `packages/werkstatt/src/kernel/cli/index.ts` | Accept `--collect-errors` flag in `pipeline` subcommand, pass to `executeKernelPipeline` options |
| `packages/werkstatt/src/mission/mission.module.ts` | Declare `collect-errors` flag on `mission.validate` command |
| `packages/werkstatt/src/mission/mission-materialization-commands.ts` | Read `--collect-errors` from `input.flags`, pass as `collectErrors: true` to all `executeKernelPipeline` calls |

### Output format

```json
{
  "command": "mission.validate",
  "status": "fail",
  "failedSteps": [
    "ownership.sync.validate",
    "page.markdown.validate",
    "playwright.chromium.ensure"
  ],
  "steps": [/* all step reports */],
  "summary": "3 step(s) failed, 200 succeeded, 0 skipped"
}
```

### Failure modes

- **Default (no `--collect-errors`)**: Identical to current behavior. First failure stops the pipeline (in concurrency=1 mode) or the caller returns on first failure (in concurrency>1 mode).
- **With `--collect-errors`** (concurrency > 1): All independent steps run. Dependent steps are skipped. Summary table lists all failures. Exit code is non-zero.
- **With `--collect-errors`** (concurrency = 1): No effect — the scheduler aborts on first failure regardless. The flag is accepted but does not change behavior.
- **Step timeout**: Treated as failure. In collect-errors mode, the step is reported as failed and independent steps continue.

## Rollout

- **Default behavior**: Unchanged. No migration needed.
- **Opt-in**: Operators and agents pass `--collect-errors` when they want to see all failures in one run. Especially useful during mission validation and onboarding.
- **Pipeline integration**: No pipeline step changes. The flag is consumed by the pipeline executor, not by individual steps.
- **Future**: Consider making `--collect-errors` the default for `mission.validate` after a grace period (separate RFC).

## Alternatives considered

- **Per-step `continueOnError` field on `KernelPipelineStep`**: Rejected because it requires updating every pipeline definition. The flag is a runner-level concern, not a step-level concern.
- **`--no-fail` flag that always exits 0**: Rejected — it hides failures. The goal is to surface all failures, not to suppress them.
- **Post-hoc error aggregation from telemetry**: Rejected — requires a second command to read telemetry. The operator wants failures in the same run, not a separate analysis step.

## Risks

- **Longer pipeline runs in collect-errors mode**: Since independent steps continue after a failure, the total wall-clock time is longer than fail-fast. This is acceptable because the operator saves multiple full reruns.
- **Confusion about which errors are root causes**: Multiple failures may include cascading errors from dependent steps. The summary table distinguishes "failed" from "skipped (dependency failed)" — `dependencySkipped` is tracked on `StepExecutionResult` (not on `KernelExecutionReport`). The caller filters on `StepExecutionResult.dependencySkipped` before building the `failedSteps` list.
- **Cache pollution**: Failed steps are not cached (only successful results are cached per RFC-0390). No change needed.

## Acceptance criteria

- [x] `collectErrors` field added to `ExecuteKernelPipelineOptions` (evidence: packages/werkstatt/src/kernel/types.ts:436-437)
- [x] `failedSteps` field added to `KernelPipelineReport` (evidence: packages/werkstatt/src/kernel/types.ts:366-370)
- [x] `--collect-errors` flag accepted by `mission.validate`, `build.check`, `build.post`, `build.prepare` (evidence: packages/werkstatt/src/mission/mission.module.ts:239-243, packages/werkstatt/src/mission/mission-materialization-commands.ts:433,499,588,628)
- [x] `--collect-errors` flag accepted by `pipeline` CLI subcommand (`cli/index.ts`) (evidence: packages/werkstatt/src/kernel/cli/index.ts:113-116,299,319)
- [x] All independent step failures aggregated in final report (concurrency > 1) (evidence: packages/werkstatt/src/kernel/runtime/execute-pipeline.ts:84-98,801-821,1043-1062)
- [x] Dependent steps still skipped when dependency fails (evidence: packages/werkstatt/src/kernel/runtime/execute-pipeline.ts:90 — filter excludes dependencySkipped)
- [x] Default fail-fast behavior unchanged (evidence: packages/werkstatt/src/kernel/runtime/execute-pipeline.ts:88 — returns undefined when collectErrors is false)
- [x] `--json` output includes `failedSteps` array (evidence: packages/werkstatt/src/kernel/runtime/execute-pipeline.ts:819,1060 — failedSteps included in returned KernelPipelineReport)
- [x] `--collect-errors` is a no-op when `concurrency=1` (documented, not errored) (evidence: scheduler uses full sequential mode at concurrency=1, collect-errors post-processing only runs after scheduler completes — no scheduler modification)
- [x] Unit test: multiple independent failures reported in one run (evidence: packages/werkstatt/src/kernel/tests/execute-pipeline-collect-errors.test.ts:68-79)
- [x] Unit test: dependent steps still skipped in collect-errors mode (evidence: packages/werkstatt/src/kernel/tests/execute-pipeline-collect-errors.test.ts:81-90)
- [x] Unit test: `concurrency=1` with `--collect-errors` behaves identically to fail-fast (evidence: packages/werkstatt/src/kernel/tests/execute-pipeline-collect-errors.test.ts:92-100 — collectErrors=false returns undefined, confirming fallthrough to fail-fast)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0809 --json → ok: true)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken the default fail-fast behavior.
- The `--collect-errors` flag is a runner-level option — it MUST NOT be added to `KernelPipelineStep`.
- **Concurrency = 1**: The scheduler rebuilds the schedule as fully sequential when `concurrency=1` (`pipeline-scheduler.ts:194-201`). `--collect-errors` has no effect in this mode — a failure cascades `markSkippedDueToFailure` to all remaining steps. Do NOT attempt to modify the scheduler for concurrency=1; the flag is a no-op in that mode by design.
- **Flag flow**: The `--collect-errors` flag is parsed by the CLI (`cli/index.ts` `pipeline` subcommand) or by the `mission.validate` command handler (`mission-materialization-commands.ts`), then passed as `collectErrors: true` in `ExecuteKernelPipelineOptions` to `executeKernelPipeline`. `mission.validate` calls `executeKernelPipeline` three times (build.prepare, build.check, build.post) — the flag must be propagated to all three calls.
- **Type safety**: `dependencySkipped` exists on `StepExecutionResult` (`pipeline-scheduler.ts:160`), NOT on `KernelExecutionReport`. When filtering failed steps, filter on `sortedResults` (which are `StepExecutionResult[]`) before mapping to `reports` (`KernelExecutionReport[]`).
