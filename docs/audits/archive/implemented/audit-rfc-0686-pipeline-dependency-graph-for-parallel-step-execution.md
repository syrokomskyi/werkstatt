---
rfcId: RFC-0686
auditId: AUDIT-RFC-0686-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0686

## Verdict: Needs revision

The RFC has solid architectural instincts but contains factual errors about pipeline step counts, a fabricated command name, a contradiction between `successSignals` and the design body, and missing `commands.proposed` metadata. Several blind spots around telemetry concurrency and progress reporting need to be addressed before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0686` reports zero violations.

## Axis A — Structural completeness

- **successSignals contradiction (serious).** `successSignals` item 2 says "Steps without dependsOn execute in parallel automatically — no manual parallelization needed." The design body (§Backward compatibility) says the opposite: steps without `dependsOn` are treated as depending on the previous non-skipped step — i.e. sequential. Only `dependsOn: []` means "start immediately." The success signal describes behavior the RFC explicitly does not implement.

- **nonGoals misleading.** `nonGoals` item 4 says "Does not change pipeline step order for steps that declare dependsOn — only steps without dependencies are reordered." But the design says steps without `dependsOn` retain sequential ordering (implicit dependency on previous step). Nothing is "reordered" — steps with `dependsOn: []` simply start concurrently. This nonGoal misrepresents the mechanism.

- **Failure modes contradiction.** The "Dependency failure" section says "This matches the current behavior where a step failure aborts the pipeline — but now only dependents are skipped, not all remaining steps." These two statements are contradictory: the current behavior aborts ALL remaining steps (the `for` loop returns immediately on `!report.ok`); the new behavior skips only dependents and lets independent steps continue. The RFC should state clearly that this is a behavior change, not "matching" current behavior.

- **Missing `--concurrency` in TypeScript contracts.** The `ExecuteKernelPipelineOptions` interface (`types.ts:395–406`) is not shown in the TypeScript contracts section. The RFC adds a `--concurrency` flag to `executeKernelPipeline` but doesn't show the modified options type. The `concurrency` field should be documented alongside `KernelPipelineStep.dependsOn`.

- **`ScheduledStep.dependencies` uses indices but `dependsOn` uses command names.** The `ScheduledStep` interface has `dependencies: Set<number>` (step indices), but `KernelPipelineStep.dependsOn` is `string[]` (command names). The RFC doesn't document the translation from command names to indices in `buildSchedule`. This is a non-trivial resolution step (handling duplicate command names, forward references) that should be specified.

- **Rollout section says "No migration" but failure semantics change.** The rollout says "existing pipelines work unchanged" and "No migration." But the failure mode section describes a change: independent steps now continue after a step failure (instead of aborting). This is a semantic change that existing pipelines may depend on — some pipelines may assume that a step failure stops all subsequent work. The rollout should acknowledge this.

## Axis B — DNA alignment

- **DNA-35 claim loosely worded.** The RFC says "The canonical readiness signal runs all validators in dependency order." DNA-35 (`docs/architecture-dna.md:155–157`) says "runs every workspace and per-app validator in dependency order, aggregates results, and exits zero only if all are green." The "dependency order" in DNA-35 refers to the pipeline declaration order (the sequence in the steps array), not a dependency graph. The RFC introduces a new concept of dependency-graph-based ordering. The RFC should clarify that it extends DNA-35 by adding a dependency graph layer while preserving the declaration-order semantics for steps without explicit `dependsOn`.

## Axis C — Ecosystem fit

- **`pipeline.dependencies.validate` not in `commands.proposed`.** The RFC introduces a new command `pipeline.dependencies.validate` (§Pipeline validation, §File system responsibilities) but `commands.proposed: []` is empty. The new command should be listed in `commands.proposed` (and moved to `commands.added` upon implementation). This is an RFC-CMD metadata violation that `rfc.validate` will catch once the command is registered.

- **`--concurrency` flag not in `commands.changed`.** The RFC adds a `--concurrency` flag to `executeKernelPipeline`. While `executeKernelPipeline` is a function (not a registered command), the CLI layer (`src/cli/index.ts`) may need changes to parse and forward the flag. If any registered command's flag surface changes, it should be listed in `commands.changed`.

- **Fabricated command name `manifest.favicon.generate`.** The Context section lists `manifest.favicon.generate` as an example of independent steps in `build.prepare`. This command does not exist in `SITES_BUILD_PREPARE_PIPELINE` (`build-prepare.ts:24–137`). The closest commands are `public.icons.generate` and `icons.generate`. The example should use real command names from the pipeline.

## Axis D — Forward-only compliance

No issues. The RFC is forward-only — no shims, no dual-paths, no backward compatibility layers. The `dependsOn` field is optional and existing pipelines retain sequential behavior without changes.

## Axis E — Agent-facing policy

No issues. The status gate is correct (draft cannot be implemented). Implementation notes reference the correct governance RFCs (RFC-0224, RFC-0334). The anti-fabrication and storage policy axes are not applicable.

## Axis F — Pragmatism

- **`pipeline-scheduler.ts` as a separate module.** The RFC proposes a new `pipeline-scheduler.ts` module with `buildSchedule` and `executeScheduledSteps`. The `executeScheduledSteps` function takes an `executeStep` callback, but the actual step execution involves cache reads/writes, telemetry, progress reporting, context creation, and `--site` injection — all currently inlined in the `for` loop. The RFC doesn't justify why the scheduler must be a separate module rather than a refactored section of `execute-pipeline.ts`. If the scheduler is extracted, the callback signature needs to carry all these concerns, which is a significant abstraction. The RFC should either (a) justify the separate module with reuse scenarios, or (b) inline the scheduler into `execute-pipeline.ts`.

- **Step count estimates are significantly off.** The Context section says `build.prepare` has ~40 steps, `build.check` has ~15, and `build.post` has ~20. Actual counts from the pipeline definitions: `build.prepare` has 63 steps (`build-prepare.ts:24–137`), `build.check` has ~95 steps (85 from `SITES_CHECK_AUTHOR_PIPELINE` + 10 additional in `build-check.ts`), and `build.post` has ~32 steps (12 explicit + ~20 from `SITES_CHECK_POSTBUILD_PIPELINE`). The performance estimates based on these counts are unreliable.

## Axis G — Blind spots

- **Telemetry concurrency.** The current `for` loop `await`s `appendStepTelemetry` sequentially. With parallel steps, multiple telemetries could be appended concurrently. `appendStepTelemetry` writes to a file (likely NDJSON append) — concurrent appends may interleave or corrupt entries. The RFC mentions `stepIndex` in timing entries but doesn't address concurrent telemetry writes.

- **Progress reporting out of order.** The current `for` loop prints `[1/40] cmd …`, `[2/40] cmd …` sequentially. With parallel execution, progress lines would interleave and appear out of order (e.g. `[3/40]` before `[1/40]` finishes). The RFC doesn't address how progress reporting works with parallel steps. This is a UX concern for operators watching pipeline output.

- **Cache read/write concurrency.** The RFC says "concurrent reads are safe, concurrent writes to different keys are safe" for `moduleHashCache`. But `tryCacheRead` and `tryCacheWrite` also access the SQLite `CacheLayer` — concurrent SQLite writes from parallel steps could conflict. The RFC mentions "the cache layer uses serialized writes" but doesn't verify that the SQLite layer (`SqliteCacheLayer`) is actually safe for concurrent access from parallel async tasks within the same process. `better-sqlite3` is synchronous, so concurrent `await` calls are fine, but the RFC should state this explicitly.

- **`appendStepTelemetry` and `performance.now()` ordering.** `startedAtMonotonicMs` and `endedAtMonotonicMs` are recorded per step. With parallel execution, steps overlap, so the timing summary (`pipelineTimingSummary`) may produce misleading total duration if it sums per-step durations instead of computing wall-clock time from earliest start to latest end.

- **No acceptance criterion for telemetry safety.** The acceptance criteria include unit tests for execution behavior but not for telemetry correctness under parallel execution. A test should verify that telemetry entries are not corrupted or interleaved when steps run concurrently.

## Questions for the author

1. How does `appendStepTelemetry` handle concurrent writes from parallel steps? Is the NDJSON append atomic, or does it need a mutex/queue? If it needs a mutex, the RFC should specify the mechanism.
2. What happens to progress reporting (`[N/M] cmd …`) when steps run in parallel? Should the progress format change to show concurrency (e.g. `[running 3/40, done 2/40]`)?
3. The `build.check` pipeline has ~95 steps (not ~15 as stated). With this many steps, how many are genuinely independent (can safely declare `dependsOn: []`)? The RFC's performance estimates are based on incorrect step counts — have the estimates been validated against actual pipeline definitions?
