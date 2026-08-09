---
rfcId: RFC-0686
planId: PLAN-RFC-0686-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel"
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel/AGENTS.md
---

# Implementation Plan: RFC-0686

## 1. Objectives

- [ ] O1 — Add `dependsOn?: string[]` to `KernelPipelineStep` and `concurrency?: number` to `ExecuteKernelPipelineOptions` — maps to acceptance criteria 1, 9
- [ ] O2 — Create `pipeline-scheduler.ts` with `buildSchedule` and `executeScheduledSteps` — maps to acceptance criterion 2
- [ ] O3 — Refactor `executePipelineForSite` and `executePipelineForWorkspace` to use the scheduler — maps to acceptance criterion 3
- [ ] O4 — Preserve backward-compatible sequential behavior for steps without `dependsOn` — maps to acceptance criterion 4
- [ ] O5 — Implement failure propagation (skip dependents, not abort all) — maps to acceptance criteria 7, 8
- [ ] O6 — Add `--concurrency` CLI flag — maps to acceptance criterion 9
- [ ] O7 — Create `pipeline.dependencies.validate` command — maps to acceptance criterion 10
- [ ] O8 — Annotate at least 5 independent steps in `build-prepare.ts` with `dependsOn: []` — maps to acceptance criterion 11
- [ ] O9 — Unit tests covering all behavioral cases — maps to acceptance criterion 12
- [ ] O10 — Timing summary reports wall-clock and summed durations — maps to acceptance criterion 13

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/types.ts` — add `dependsOn` to `KernelPipelineStep`, add `concurrency` to `ExecuteKernelPipelineOptions`
- `packages/os/site-kernel/src/runtime/pipeline-scheduler.ts` — new module: `buildSchedule`, `executeScheduledSteps`, `ScheduledStep` interface
- `packages/os/site-kernel/src/runtime/execute-pipeline.ts` — refactor `executePipelineForSite` and `executePipelineForWorkspace` to use scheduler; add telemetry mutex; update timing summary
- `packages/os/site-kernel/src/cli/index.ts` — add `--concurrency <N>` to `consumeCommonFlags`, pass through to `executeKernelPipeline`
- `packages/os/site-kernel-checks/src/pipeline-dependencies-validate.ts` — new command: `pipeline.dependencies.validate`
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — annotate ≥5 independent steps with `dependsOn: []`
- `packages/os/site-kernel-checks/src/pipelines/build-check.ts` — add `pipeline.dependencies.validate` as first step
- `packages/os/site-kernel-checks/src/module.ts` (or equivalent) — register `pipeline.dependencies.validate` command

### 2.2 Configuration and data

- No YAML/JSON/manifest changes. The `dependsOn` field is on pipeline step definitions (TypeScript arrays), not configuration files.

### 2.3 Documentation and specs

- `packages/os/site-kernel/AGENTS.md` — document the new `dependsOn` field, `--concurrency` flag, scheduler module, and `pipeline.dependencies.validate` command in the appropriate sections.

### 2.4 Validation and pipelines

- `build.check` pipeline — `pipeline.dependencies.validate` added as first step
- `build.prepare` pipeline — ≥5 steps annotated with `dependsOn: []`
- Unit tests in `packages/os/site-kernel/src/tests/pipeline-scheduler.test.ts`
- Unit tests in `packages/os/site-kernel/src/tests/execute-pipeline-parallel.test.ts`

## 3. Step sequence

### Step 1. Add `dependsOn` and `concurrency` to types

**Goal:** Add the `dependsOn?: string[]` field to `KernelPipelineStep` and `concurrency?: number` to `ExecuteKernelPipelineOptions` in `types.ts`.

**Agent actions:**

- Add `dependsOn?: string[]` field with JSDoc to `KernelPipelineStep` interface at `packages/os/site-kernel/src/types.ts:279–286`
- Add `concurrency?: number` field with JSDoc to `ExecuteKernelPipelineOptions` interface at `packages/os/site-kernel/src/types.ts:395–406`
- Add `CHANGE_SUMMARY` entry for RFC-0686 in the `types.ts` header block

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` — typecheck passes

**Completion criterion:** `dependsOn` and `concurrency` fields are in the type definitions and `build:check` passes.

**Human review:** no

---

### Step 2. Create `pipeline-scheduler.ts` module

**Goal:** Create the new `packages/os/site-kernel/src/runtime/pipeline-scheduler.ts` module with `buildSchedule`, `executeScheduledSteps`, and `ScheduledStep`.

**Agent actions:**

- Create `packages/os/site-kernel/src/runtime/pipeline-scheduler.ts` with:
  - `ScheduledStep` interface: `{ step: KernelPipelineStep; stepIndex: number; dependencies: Set<number> }`
  - `buildSchedule(steps: KernelPipelineStep[]): ScheduledStep[]` — translates `dependsOn` command names to step indices, adds implicit dependencies for steps without `dependsOn`, detects cycles and duplicate command names
  - `executeScheduledSteps(scheduled, concurrency, executeStep)` — runs steps concurrently up to the concurrency limit, waiting for dependencies, propagating failures to dependents
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding
- Export from `packages/os/site-kernel/src/index.ts` if needed by `site-kernel-checks`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check`

**Completion criterion:** `pipeline-scheduler.ts` exists, exports `buildSchedule` and `executeScheduledSteps`, and `build:check` passes.

**Human review:** no

---

### Step 3. Refactor `execute-pipeline.ts` to use the scheduler

**Goal:** Replace the sequential `for` loops in `executePipelineForSite` and `executePipelineForWorkspace` with calls to `executeScheduledSteps`.

**Agent actions:**

- Import `buildSchedule` and `executeScheduledSteps` from `pipeline-scheduler.ts`
- In both `executePipelineForSite` and `executePipelineForWorkspace`:
  - Call `buildSchedule(steps)` to get the scheduled steps
  - Call `executeScheduledSteps(scheduled, concurrency, executeStep)` where `executeStep` is a callback that:
    - Creates the `KernelRuntimeContext` for the step
    - Handles `step.skip` (return skipped report)
    - Handles cache read/write (`tryCacheRead`/`tryCacheWrite`)
    - Injects `--site` for workspace-scoped commands (site variant only)
    - Appends telemetry via a serialized mutex/queue
    - Records `stepTimings` with `stepIndex`
  - Sort the `reports` and `stepTimings` arrays by `stepIndex` (declaration order) before returning
  - Update `pipelineTimingSummary` to compute both `totalDurationMs` (wall clock: `min(startedAt)` to `max(endedAt)`) and `summedDurationMs` (sum of per-step `durationMs`)
- Resolve `concurrency` from `options.concurrency ?? Math.min(os.availableParallelism?.() ?? 4, 8)`
- Handle `--concurrency 1` as full sequential mode: when concurrency=1, the scheduler ignores all `dependsOn` fields and treats every step as depending on the previous non-skipped step (implicit dependency chain). This gives true abort-on-failure semantics identical to the current executor — a failed step causes all subsequent steps to be skipped. Steps with `dependsOn: []` still run in declaration order, not immediately. This is the operator-confirmed design decision from plan grilling.
- Add telemetry mutex: a simple promise-chain that serializes `appendStepTelemetry` calls. The mutex does NOT block step execution — it only prevents concurrent read-modify-write cycles on the telemetry file.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check`

**Completion criterion:** Both executor functions use the scheduler instead of `for` loops; `build:check` passes.

**Human review:** no

---

### Step 4. Add `--concurrency` CLI flag

**Goal:** Add `--concurrency <N>` to `consumeCommonFlags` in `cli/index.ts` and pass it through to `executeKernelPipeline`.

**Agent actions:**

- In `consumeCommonFlags` (`packages/os/site-kernel/src/cli/index.ts:56–108`):
  - Add `concurrency: number | undefined` to the return type
  - Parse `--concurrency <N>` and `--concurrency=<N>` forms
  - Add to the returned object
- In the `pipeline` subcommand handler (`cli/index.ts:236–259`):
  - Destructure `concurrency` from `consumeCommonFlags`
  - Pass `concurrency` to `executeKernelPipeline` options
- Update `printUsage` to include `[--concurrency <N>]` in the pipeline usage line
- Add `CHANGE_SUMMARY` entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check`

**Completion criterion:** `--concurrency` flag is parsed and passed to `executeKernelPipeline`; `build:check` passes.

**Human review:** no

---

### Step 5. Create `pipeline.dependencies.validate` command

**Goal:** Create a new workspace-scoped command that validates pipeline dependency graphs.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/pipeline-dependencies-validate.ts`:
  - Command name: `pipeline.dependencies.validate`
  - Scope: `workspace`
  - `cacheable: true` (reads pipeline definitions from source, not runtime state)
  - `reads`: pipeline definition files (`packages/os/site-kernel-checks/src/pipelines/*.ts`)
  - `mutatesState: false`
  - Validation checks:
    1. All command names in `dependsOn` fields exist in the same pipeline
    2. No circular dependencies in the dependency graph
    3. Dependencies appear before the dependent step (no forward references)
    4. No duplicate command names within a single pipeline
  - Return `CheckResult` with diagnostics for each violation
  - Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding
- Register the command in the appropriate module file (e.g. `packages/os/site-kernel-checks/src/module.ts`)
- Add `pipeline.dependencies.validate` as the first step in `SITES_BUILD_CHECK_PIPELINE` in `build-check.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`

**Completion criterion:** `pipeline.dependencies.validate` command is registered, passes on current pipeline definitions (which have no `dependsOn` yet), and runs as the first step in `build.check`.

**Human review:** no

---

### Step 6. Annotate independent steps in `build-prepare.ts`

**Goal:** Add `dependsOn: []` to at least 5 genuinely independent steps in `SITES_BUILD_PREPARE_PIPELINE`.

**Agent actions:**

- Identify steps that produce independent output files with no cross-dependencies. Candidates from `build-prepare.ts`:
  - `security.txt.generate` — writes `public/security.txt`
  - `humans.generate` — writes `public/humans.txt`
  - `indexnow.key.generate` — writes `public/indexnow-key.txt`
  - `robots.generate` — writes `public/robots.txt`
  - `ai.generate` — writes `public/ai.txt`
  - `ai.policy.generate` — writes `public/ai-policy.txt`
  - `public.artifact.generate` — writes `public/artifact.*`
- Verify each candidate does NOT read output from another step (check `reads[]` declarations)
- Add `dependsOn: []` to ≥5 verified independent steps
- Run `pipeline.dependencies.validate` to confirm no violations

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`

**Completion criterion:** ≥5 steps in `build-prepare.ts` have `dependsOn: []`; `pipeline.dependencies.validate` passes; `build:check` passes.

**Human review:** no — but agent MUST verify filesystem-level isolation (no two parallel steps write to the same path)

---

### Step 7. Unit tests for scheduler and executor

**Goal:** Create comprehensive unit tests covering all behavioral cases from the acceptance criteria.

**Agent actions:**

- Create `packages/os/site-kernel/src/tests/pipeline-scheduler.test.ts`:
  - (a) backward-compatible sequential behavior: steps without `dependsOn` run in order
  - (b) parallel execution of independent steps: steps with `dependsOn: []` run concurrently
  - (c) dependency waiting: step with `dependsOn: ["cmd.a"]` waits for `cmd.a`
  - (d) failure propagation: failed step causes transitive dependents to be skipped
  - (e) cycle detection: `buildSchedule` throws on circular dependencies
  - (h) explicit skip (`step.skip === true`) does not block dependents
  - (i) dependency-failure skip DOES block dependents transitively
- Create `packages/os/site-kernel/src/tests/execute-pipeline-parallel.test.ts`:
  - (f) telemetry writes are not corrupted or lost under parallel execution (mock `appendStepTelemetry`, verify all entries present)
  - (g) `steps[]` array in pipeline report is in declaration order, not completion order
  - `--concurrency 1` activates full sequential mode: ignores `dependsOn` fields, treats all steps as sequential (implicit dependency on previous step), abort-on-failure semantics identical to current executor
  - Timing summary reports both `totalDurationMs` (wall clock) and `summedDurationMs`
- Create `packages/os/site-kernel-checks/src/tests/pipeline-dependencies-validate.test.ts`:
  - Valid pipeline with `dependsOn` passes
  - Missing dependency fails
  - Circular dependency fails
  - Forward reference fails
  - Duplicate command names fail

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run test`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

**Completion criterion:** All tests pass; test coverage matches acceptance criteria items (a)–(i) plus timing and CLI flag tests.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update `packages/os/site-kernel/AGENTS.md` with the new scheduler module, `dependsOn` field, `--concurrency` flag, and `pipeline.dependencies.validate` command.

**Agent actions:**

- In `packages/os/site-kernel/AGENTS.md`:
  - Add a section about the pipeline scheduler and `dependsOn` field (under a new "Pipeline scheduler (RFC-0686)" heading or within the existing pipeline section)
  - Document the `--concurrency` CLI flag in the reserved CLI flags section
  - Document the behavior change (abort-on-failure → skip-dependents-only) and the `--concurrency 1` escape hatch
  - Document the telemetry mutex and timing summary changes
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (new `pipeline.dependencies.validate` command)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check`

**Completion criterion:** `AGENTS.md` documents the new features; `build:check` passes.

**Human review:** no

---

### Final Step. Review, fix, verify acceptance criteria, and stamp implemented

**Goal:** Run code review, fix findings, verify all acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run `fo-fix` if the review has findings. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off each acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0686`
- Run `pnpm --filter @warpgogol/site-kernel run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Run `pnpm --filter @warpgogol/site-kernel run test`
- Run `pnpm --filter @warpgogol/site-kernel-checks run test`
- Stamp the RFC: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0686 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `rfc.validate` passes
- `build:check` passes on both packages
- All tests pass
- Review report exists in `docs/reviews/code/` for this session
- RFC is stamped as `implemented`

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0686`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel run test`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0686` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Shared state conflicts (moduleHashCache, SQLite) | Step 3: `better-sqlite3` is synchronous; no concurrent SQLite writes from event loop. moduleHashCache writes to different keys. |
| Filesystem race conditions | Step 6: agent verifies no two parallel steps write to overlapping paths before annotating with `dependsOn: []` |
| Telemetry concurrency (read-modify-write not atomic) | Step 3: telemetry mutex serializes `appendStepTelemetry` calls via promise-chain |
| Progress reporting out of order | Step 3: progress format includes step index `[step N/M]`; interleaving is expected and acceptable |
| Timing summary overestimates with parallel execution | Step 3: timing summary reports both wall-clock and summed durations |
| Agent misinterpretation of `dependsOn` semantics | Step 8: AGENTS.md documents that absent `dependsOn` = sequential, `[]` = immediate |
| Concurrency limit too high | Step 4: default cap at 8, `--concurrency` flag for override |
| Behavior change (abort → skip dependents) | Step 3: `--concurrency 1` degrades to current sequential behavior including abort-on-failure; documented in RFC and AGENTS.md |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-35, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0686 --reason "..." --invariant "DNA-35"` instead of working around it.
- If the telemetry mutex approach proves insufficient (e.g. telemetry file corruption detected in tests), escalate to a dedicated `telemetry-write-queue` module rather than inlining the mutex in the executor.
