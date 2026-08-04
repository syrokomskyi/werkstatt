---
id: RFC-0686
title: "Add pipeline dependency graph for parallel step execution"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-04
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0390
  - RFC-0685
  - RFC-0687
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-35
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - pipeline.dependencies.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "Independent pipeline steps run concurrently, reducing wall time for build.prepare and build.post"
  - "Steps with dependsOn: [] execute in parallel automatically — explicit opt-in per step"
  - "Step ordering is preserved for steps without explicit dependsOn — they retain sequential behavior via implicit dependency on the previous non-skipped step"
  - "Pipeline report includes concurrency metadata (which steps ran in parallel)"
nonGoals:
  - "Does not change the command-result cache (RFC-0390) — parallel steps still check cache independently"
  - "Does not introduce cross-site parallelism — sites remain sequential (each site's pipeline runs independently)"
  - "Does not add a new pipeline command — the dependency graph is a metadata field on existing step definitions"
  - "Does not change pipeline step order for steps without explicit dependsOn — they retain sequential behavior via implicit dependency on the previous non-skipped step"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0686: Add pipeline dependency graph for parallel step execution

## Context

The kernel pipeline executor (`packages/os/site-kernel/src/runtime/execute-pipeline.ts`) runs pipeline steps in a strict sequential `for` loop. Each step awaits completion before the next begins. The `build.prepare` pipeline has 63 steps, `build.check` has ~95 steps (85 from `SITES_CHECK_AUTHOR_PIPELINE` + 10 additional), and `build.post` has ~32 steps (12 explicit + ~20 from `SITES_CHECK_POSTBUILD_PIPELINE`). Many of these steps are independent — they read different inputs and write different outputs — but they are serialized because the executor has no dependency metadata.

For example, in `build.prepare`: `security.txt.generate`, `humans.generate`, `indexnow.key.generate`, `robots.generate`, and `public.artifact.generate` all produce independent output files with no cross-dependencies. Yet they run one after another. Similarly, in `build.post`: `passport.emit`, `dist.sitemap.images.generate`, and `dist.generated-marker.strip` are independent.

The `KernelPipelineStep` type (`packages/os/site-kernel/src/types.ts:279–286`) has no `dependsOn` field — only `command`, `args`, `timeoutMs`, `expectedDurationMs`, `skip`, and `skipReason`.

## Problem

Without dependency metadata, the executor cannot determine which steps are safe to run concurrently. Every step must wait for the previous one to finish, even when they operate on completely unrelated files. This serializes independent I/O-bound and CPU-bound work, making pipeline wall time the sum of all step durations rather than the critical path length.

Concretely: if `build.prepare` has 63 steps averaging 200ms each, the sequential wall time is ~12.6s. If 20 of those steps are independent and could run in parallel (5 groups of 4), the wall time could drop to ~9s. The current architecture makes this optimization impossible without manual code changes to the pipeline executor.

## Decision

The `KernelPipelineStep` type gains an optional `dependsOn?: string[]` field listing command names that must complete before this step starts. The pipeline executor is refactored from a sequential `for` loop to a dependency-aware scheduler: steps whose dependencies are all completed (or whose `dependsOn` is empty) start concurrently, up to a configurable concurrency limit. Steps without `dependsOn` retain backward-compatible sequential ordering relative to their position in the steps array — they are treated as depending on the previous non-skipped step.

**Behavior change:** the current executor aborts all remaining steps on the first step failure (the `for` loop returns immediately on `!report.ok`). The new scheduler changes this: when a step fails, only its transitive dependents are skipped — independent steps continue executing. This is a deliberate behavior change, not a preservation of current semantics. Pipelines that depend on abort-on-first-failure semantics must set `--concurrency 1` (which degrades to the current sequential behavior including abort-on-failure).

## Architectural fit

- **DNA-35 (`app.contract.full`):** DNA-35 states the canonical readiness signal "runs every workspace and per-app validator in dependency order." The "dependency order" in DNA-35 refers to the pipeline declaration order (the sequence in the steps array). This RFC extends DNA-35 by adding an explicit dependency graph layer: steps with `dependsOn` declare their ordering explicitly, while steps without `dependsOn` retain the declaration-order semantics (implicit dependency on the previous non-skipped step). The gate still exits zero only if all steps pass — parallelism does not weaken the readiness signal.
- **RFC-0390 (Command-result cache):** Parallel steps check the cache independently. Cache reads and writes are already per-command and do not conflict. The `moduleHashCache` is shared within a pipeline run and is a `Map` — concurrent reads are safe, concurrent writes to different keys are safe.
- **RFC-0685 (Workspace tree index):** The tree index is built once per pipeline run and shared across all parallel steps — no conflict.
- **Site OS operator model:** No new commands. The dependency graph is metadata on existing pipeline step definitions in `packages/os/site-kernel-checks/src/pipelines/`. The scheduler is internal to `packages/os/site-kernel/src/runtime/execute-pipeline.ts`.
- **Scaling Playbook:** Applies uniformly — the concurrency limit defaults to `os.availableParallelism()` and can be overridden via `--concurrency` flag.

## Design

### Backward compatibility: implicit dependencies

To preserve backward compatibility, steps without `dependsOn` are treated as depending on the previous non-skipped step in the array. This means existing pipeline definitions that do not use `dependsOn` retain their current sequential behavior — no pipeline definition changes are required for existing pipelines.

To declare that a step is independent (can start immediately), set `dependsOn: []` (empty array). This explicitly means "no dependencies — may start as soon as the pipeline begins."

### Dependency resolution

The scheduler maintains a set of completed step command names. Before starting a step, it checks that all command names in `dependsOn` are in the completed set. If a dependency was skipped (`step.skip === true`), it is treated as completed — skipped steps do not block downstream steps.

If multiple steps in the pipeline have the same `command` name, `dependsOn` refers to the first matching command that appears before the current step in the array. This is an error condition detected by a new pipeline validation step.

**Cross-pipeline scope:** `dependsOn` only matches commands within the same pipeline definition. A step in `build.check` cannot depend on a step in `build.prepare` — those are separate pipeline invocations with separate scheduler instances.

**Skip handling:** there are two kinds of skip: (1) explicit skip (`step.skip === true` in the pipeline definition) — treated as completed, does not block dependents; (2) dependency-failure skip (a step is skipped because one of its dependencies failed) — DOES block its own dependents, which are also skipped transitively with `skipReason: "dependency-failed: <failed-command>"`.

### Concurrency limit

The scheduler uses a configurable concurrency limit:

- Default: `Math.min(os.availableParallelism(), 8)` — capped at 8 to avoid overwhelming I/O.
- Override: `--concurrency <N>` flag on `executeKernelPipeline`.
- When concurrency is 1, the scheduler degrades to sequential execution (identical to current behavior).

### TypeScript contracts

```ts
// packages/os/site-kernel/src/types.ts (modified)

export interface KernelPipelineStep {
  command: string;
  args?: string[];
  timeoutMs?: number;
  expectedDurationMs?: number;
  skip?: boolean;
  skipReason?: string;
  /**
   * RFC-0686: command names that must complete before this step starts.
   * When absent, the step depends on the previous non-skipped step (backward compatible).
   * When empty ([]), the step has no dependencies and may start immediately.
   */
  dependsOn?: string[];
}

// packages/os/site-kernel/src/types.ts (modified)

export interface ExecuteKernelPipelineOptions {
  // ... existing fields ...
  /** RFC-0686: maximum number of steps to run concurrently. Default: Math.min(os.availableParallelism(), 8). */
  concurrency?: number;
}
```

```ts
// packages/os/site-kernel/src/runtime/pipeline-scheduler.ts (new)

export interface ScheduledStep {
  step: KernelPipelineStep;
  stepIndex: number;
  dependencies: Set<number>; // indices of steps this step depends on
}

/**
 * Builds a schedule from pipeline steps. Translates command names in `dependsOn`
 * to step indices by finding the first step with a matching `command` name that
 * appears before the current step in the array. Forward references and missing
 * references throw an error. Duplicate command names are detected and reported.
 *
 * For steps without `dependsOn`, an implicit dependency on the previous non-skipped
 * step's index is added (backward-compatible sequential behavior).
 * For steps with `dependsOn: []`, no dependencies are added (start immediately).
 */
export function buildSchedule(
  steps: KernelPipelineStep[],
): ScheduledStep[];

export async function executeScheduledSteps(
  scheduled: ScheduledStep[],
  concurrency: number,
  executeStep: (step: ScheduledStep) => Promise<KernelExecutionReport>,
): Promise<KernelExecutionReport[]>;
```

### Pipeline validation

A new `pipeline.dependencies.validate` check (added to `build.check`) verifies:

1. All command names in `dependsOn` fields exist in the same pipeline.
2. No circular dependencies exist in the dependency graph.
3. A dependency always appears before the dependent step in the array (no forward references).
4. No duplicate command names within a single pipeline (would make `dependsOn` ambiguous).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | Modified: add `dependsOn` to `KernelPipelineStep` |
| `packages/os/site-kernel/src/runtime/pipeline-scheduler.ts` | New: dependency-aware scheduler |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | Modified: use scheduler instead of sequential for-loop |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Modified: add `dependsOn` to independent steps |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Modified: add `dependsOn` to independent validators |
| `packages/os/site-kernel-checks/src/pipelines/build-post.ts` | Modified: add `dependsOn` to independent post-build steps |
| `packages/os/site-kernel-checks/src/pipeline-dependencies-validate.ts` | New: dependency graph validation command |

### Failure modes

- **Dependency failure**: if a step fails, all steps that transitively depend on it are skipped with a `skipReason` indicating the failed dependency. The pipeline report shows the failure and all skipped dependents. **This is a behavior change from the current executor**, which aborts all remaining steps on the first failure (the `for` loop returns immediately on `!report.ok`). The new scheduler skips only dependents and lets independent steps continue. Pipelines that require abort-on-first-failure semantics must use `--concurrency 1`.
- **Circular dependency**: detected at schedule build time. The pipeline fails with a clear error listing the cycle. This is a pipeline definition bug, not a runtime error.
- **Missing dependency**: if `dependsOn` references a command name not in the pipeline, the pipeline fails with a clear error. This is caught by `pipeline.dependencies.validate`.
- **Concurrency exhaustion**: if all parallel steps are waiting on dependencies, the scheduler idles. This is expected and not a failure — it means the critical path is being followed.

## Rollout

- **Default behavior**: the scheduler defaults to concurrency = `Math.min(os.availableParallelism(), 8)`. Existing pipelines without `dependsOn` fields retain sequential behavior because implicit dependency on the previous step is the default.
- **Opt-in parallelism**: pipeline definitions in `build-prepare.ts`, `build-check.ts`, and `build-post.ts` are updated to add `dependsOn: []` to known-independent steps. This is a gradual process — steps can be annotated incrementally.
- **Concurrency override**: `--concurrency 1` forces sequential execution for debugging or resource-constrained environments.
- **Pipeline validation**: `pipeline.dependencies.validate` is added to `build.check` to catch dependency graph errors early.
- **No migration for step definitions**: existing pipeline step definitions work unchanged. The `dependsOn` field is optional. Pipelines that add `dependsOn` gain parallelism; those that don't stay sequential.
- **Failure semantics change**: the transition from abort-on-first-failure to skip-dependents-only is a behavior change. Pipelines that depend on abort semantics must use `--concurrency 1`. This is documented in the Failure modes section and the Risks section.

## Alternatives considered

- **Manual parallelization in pipeline definitions**: instead of a dependency graph, split pipelines into "parallel groups" manually. Rejected because it requires pipeline authors to reason about execution order rather than dependencies, and it's fragile — adding a step requires re-evaluating the entire parallel group structure.
- **Pipeline-level `parallel: true` flag**: mark entire pipelines as parallel. Rejected because it's too coarse — some steps in a pipeline are genuinely sequential (e.g. `config.regenerate` must run before `surface.generate`).
- **External task runner (e.g. Turborepo)**: delegate parallelism to Turborepo. Rejected because pipeline steps are kernel commands, not Turborepo tasks. Turborepo operates at the workspace level, not within a single site's pipeline.
- **Worker threads**: run steps in worker threads instead of concurrent async tasks. Rejected because kernel commands use shared filesystem state and `tsImport` module loading — worker threads would duplicate module loading and complicate the cache layer. Async concurrency is sufficient since most steps are I/O-bound.

## Risks

- **Shared state conflicts**: parallel steps share the `moduleHashCache` Map and the `WorkspaceTreeIndex` (from RFC-0685). Both are read-heavy with rare writes. `moduleHashCache` writes to different keys are safe. If a future command writes to the cache layer during execution (not just after), concurrent writes to the same SQLite database could conflict. Mitigation: `better-sqlite3` is synchronous — all SQLite operations are blocking calls within async tasks, so there are no true concurrent SQLite writes from the Node event loop. The `SqliteCacheLayer` uses WAL mode with a busy timeout, making concurrent reads safe.
- **Filesystem race conditions**: two parallel steps writing to the same file would corrupt output. This is a pipeline definition bug — `dependsOn` must be set correctly. The `pipeline.dependencies.validate` check does NOT verify filesystem-level isolation (it only checks declared dependencies). Pipeline authors must ensure parallel steps do not write to overlapping paths.
- **Telemetry concurrency**: `appendStepTelemetry` (`pipeline-budgets.ts:85–117`) does a read-modify-write cycle (`readFile` → append → `writeFile`) which is NOT atomic. Concurrent calls from parallel steps could read the same existing content, append their respective lines, and the second write would overwrite the first, losing telemetry entries. Mitigation: the scheduler MUST serialize telemetry writes through a mutex/queue — each step's `appendStepTelemetry` call is awaited before the next step's telemetry is written. This does not block step execution (telemetry is written after the step completes and does not gate the next step's start), but it prevents concurrent read-modify-write cycles.
- **Telemetry ordering**: step telemetry is appended as steps complete, not in array order. The telemetry consumer must handle out-of-order entries. The `stepTimings` array in the pipeline report is sorted by step index (declaration order), not by completion time. A `stepIndex` field is added to each timing entry for correlation.
- **Progress reporting**: the current `[N/M] cmd …` format is sequential. With parallel execution, progress lines would interleave and appear out of order. The progress format is changed to include the step index: `[step N/M] cmd …` and `[step N/M] cmd — done <duration>`. Multiple steps may show `…` simultaneously. This is acceptable — the operator sees which steps are running concurrently. The final pipeline summary line remains sequential.
- **Timing summary correctness**: the current `pipelineTimingSummary` sums per-step `durationMs` to compute total duration. With parallel execution, this overestimates wall time (summed durations > wall time when steps overlap). The timing summary is updated to compute wall-clock time from `min(startedAtMonotonicMs)` to `max(endedAtMonotonicMs)` in addition to the summed total. Both values are reported: `totalDurationMs` (wall clock) and `summedDurationMs` (sum of per-step).
- **`--json` output order**: the `steps[]` array in the `KernelPipelineReport` is in declaration order (sorted by `stepIndex`), not completion order. This ensures downstream consumers (RFC-0269 behavior snapshots, telemetry) see steps in a stable, deterministic order regardless of execution timing.
- **Agent misinterpretation**: agents might assume all steps without `dependsOn` run in parallel. They do not — steps without `dependsOn` are sequential (implicit dependency on previous step). Only `dependsOn: []` means "start immediately."
- **Concurrency limit too high**: running 8 concurrent commands on a machine with limited memory or I/O bandwidth could cause resource contention. The default cap of 8 and the `--concurrency` flag mitigate this.

## Acceptance criteria

- [ ] `dependsOn?: string[]` field added to `KernelPipelineStep` in `packages/os/site-kernel/src/types.ts`
- [ ] `pipeline-scheduler.ts` module created in `packages/os/site-kernel/src/runtime/` with `buildSchedule` and `executeScheduledSteps` functions
- [ ] `executePipelineForSite` and `executePipelineForWorkspace` in `execute-pipeline.ts` use the scheduler instead of a sequential for-loop
- [ ] Steps without `dependsOn` retain sequential behavior (implicit dependency on previous non-skipped step)
- [ ] Steps with `dependsOn: []` start immediately at pipeline start
- [ ] Steps with `dependsOn: ["cmd.a", "cmd.b"]` wait for both named steps to complete before starting
- [ ] Failed step causes all transitive dependents to be skipped with clear `skipReason`
- [ ] `--concurrency` flag controls the parallel execution limit; default is `Math.min(os.availableParallelism(), 8)`
- [ ] `pipeline.dependencies.validate` command added to `build.check` pipeline, detecting cycles, missing dependencies, forward references, and duplicate command names
- [ ] At least 5 steps in `build-prepare.ts` annotated with `dependsOn: []` and verified to run in parallel
- [ ] Unit tests verify: (a) backward-compatible sequential behavior, (b) parallel execution of independent steps, (c) dependency waiting, (d) failure propagation to dependents, (e) cycle detection, (f) telemetry writes are not corrupted or lost under parallel execution, (g) `steps[]` array in pipeline report is in declaration order not completion order, (h) explicit skip (`step.skip === true`) does not block dependents, (i) dependency-failure skip DOES block dependents transitively
- [ ] `--concurrency` flag added to `ExecuteKernelPipelineOptions` and parsed from CLI
- [ ] Timing summary reports both `totalDurationMs` (wall clock) and `summedDurationMs` (sum of per-step)
- [ ] `build:check` passes on `@warpgogol/site-kernel` and `@warpgogol/site-kernel-checks`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When annotating pipeline steps with `dependsOn`, agents MUST verify that the step does not write to files that another parallel step reads or writes. The `pipeline.dependencies.validate` check only validates declared dependencies, not filesystem-level isolation.
- Agents MUST NOT set `dependsOn: []` on a step that reads output from another step without declaring that dependency. This would cause a race condition.
- The concurrency limit MUST NOT be set to 0 or negative. `--concurrency 1` is the minimum and forces sequential execution.
- When adding new pipeline steps, agents SHOULD declare `dependsOn` explicitly rather than relying on implicit sequential ordering. This makes the dependency graph self-documenting and enables parallelism.
