---
id: RFC-0809
title: "Add pipeline collect-errors mode for fail-fast diagnostic relief"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-12
updatedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0390
  - RFC-0686
satisfies:
  - DNA-2
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - "pipeline executor (internal)"
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
acceptance:
  - probe: run
    command: "werkstatt run mission.validate --site warpgogol-com --mission warpgogol-com-m000050 --collect-errors"
    expect:
      exitCode: 0
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

1. **All independent steps execute** regardless of other step failures (already the case for concurrency > 1; for concurrency = 1, the sequential chain is broken at failures but independent branches still run).
2. **Dependent steps are still skipped** when their dependency fails — this is not changed. If validator B depends on generator A and A fails, B cannot run.
3. **The caller aggregates all failed reports** and prints a summary table at the end instead of stopping at the first failure.
4. **Exit code is non-zero** if any step failed.

The default behavior (fail-fast) is unchanged. Collect-errors is opt-in via `--collect-errors`.

## Architectural fit

- **DNA-2 (pnpm workspace + Turborepo)**: No change to workspace structure.
- **RFC-0390 (pipeline cache)**: No change to cache behavior. Cache hits/misses work identically in both modes.
- **RFC-0686 (dependency-aware concurrency)**: The scheduler already supports dependency-aware execution. Collect-errors mode changes only the **caller's post-processing** of results, not the scheduler itself. The scheduler already executes independent steps in parallel and skips dependents of failed steps.

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
   *  and aggregate all errors in the final report. Default: false (fail-fast). */
  collectErrors?: boolean;
}
```

```ts
// packages/werkstatt/src/kernel/runtime/pipeline-scheduler.ts — no changes needed.
// The scheduler already executes independent steps and skips dependents.
// The change is in the caller (execute-pipeline.ts).
```

```ts
// packages/werkstatt/src/kernel/runtime/execute-pipeline.ts — change post-processing

// Before (fail-fast):
const failed = reports.find((report) => !report.ok);

// After (collect-errors mode):
const failedReports = reports.filter((report) => !report.ok && !report.dependencySkipped);
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
| `packages/werkstatt/src/kernel/types.ts` | Add `collectErrors` to `ExecuteKernelPipelineOptions` |
| `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` | Aggregate failures in post-processing |
| `packages/werkstatt/src/kernel/cli.ts` (or equivalent) | Accept `--collect-errors` flag and pass to options |

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
- **With `--collect-errors`**: All independent steps run. Dependent steps are skipped. Summary table lists all failures. Exit code is non-zero.
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
- **Confusion about which errors are root causes**: Multiple failures may include cascading errors from dependent steps. The summary table should distinguish "failed" from "skipped (dependency failed)" — this is already tracked via `dependencySkipped` in `StepExecutionResult`.
- **Cache pollution**: Failed steps are not cached (only successful results are cached per RFC-0390). No change needed.

## Acceptance criteria

- [ ] `collectErrors` field added to `ExecuteKernelPipelineOptions`
- [ ] `--collect-errors` flag accepted by pipeline-running commands
- [ ] All independent step failures aggregated in final report
- [ ] Dependent steps still skipped when dependency fails
- [ ] Default fail-fast behavior unchanged
- [ ] `--json` output includes `failedSteps` array
- [ ] Unit test: multiple independent failures reported in one run
- [ ] Unit test: dependent steps still skipped in collect-errors mode
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken the default fail-fast behavior.
- The `--collect-errors` flag is a runner-level option — it MUST NOT be added to `KernelPipelineStep`.
- When implementing, check that `concurrency = 1` mode (full sequential) also respects collect-errors: the sequential chain should break at failures (so dependent steps are skipped) but independent branches should still execute.
