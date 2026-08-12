---
rfcId: RFC-0809
planId: PLAN-RFC-0809-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0809

## 1. Objectives

- [ ] O1 — Add `collectErrors` to `ExecuteKernelPipelineOptions` and `failedSteps` to `KernelPipelineReport` (maps to acceptance criterion: `collectErrors` field added, `failedSteps` field added)
- [ ] O2 — Accept `--collect-errors` flag in CLI `pipeline` subcommand and `mission.validate` command (maps to acceptance criterion: `--collect-errors` flag accepted by pipeline-running commands and CLI subcommand)
- [ ] O3 — Aggregate all independent step failures in post-processing when `collectErrors` is true (maps to acceptance criterion: all independent step failures aggregated in final report)
- [ ] O4 — Dependent steps still skipped when dependency fails (maps to acceptance criterion: dependent steps still skipped)
- [ ] O5 — Default fail-fast behavior unchanged (maps to acceptance criterion: default fail-fast behavior unchanged)
- [ ] O6 — `--json` output includes `failedSteps` array (maps to acceptance criterion: `--json` output includes `failedSteps`)
- [ ] O7 — `--collect-errors` is a no-op when `concurrency=1` (maps to acceptance criterion: no-op when concurrency=1)
- [ ] O8 — Unit tests for collect-errors mode (maps to acceptance criterion: 3 unit tests)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/kernel/types.ts` — extend `ExecuteKernelPipelineOptions` with `collectErrors?: boolean`; extend `KernelPipelineReport` with `failedSteps?: string[]`
- `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` — modify `executePipelineForSite` and `executePipelineForWorkspace` post-processing to aggregate failures when `collectErrors` is true; add `collectErrors` to `EXECUTE_KERNEL_PIPELINE_OPTION_KEYS`; filter on `StepExecutionResult.dependencySkipped` (not `KernelExecutionReport`)
- `packages/werkstatt/src/kernel/cli/index.ts` — add `--collect-errors` parsing to `consumeCommonFlags`; pass `collectErrors` to `executeKernelPipeline` options in `pipeline` subcommand
- `packages/werkstatt/src/mission/mission.module.ts` — declare `collect-errors` flag on `mission.validate` command registration
- `packages/werkstatt/src/mission/mission-materialization-commands.ts` — read `--collect-errors` from `input.flags`, pass as `collectErrors: true` to all three `executeKernelPipeline` calls (build.prepare, build.check, build.post)

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — document `--collect-errors` flag in the kernel CLI section (if applicable)
- RFC-0809 file is read-only reference — do not modify

### 2.4 Validation and pipelines

- `packages/werkstatt/src/kernel/tests/pipeline-scheduler.test.ts` — existing tests must still pass (no scheduler changes)
- New test file: `packages/werkstatt/src/kernel/tests/execute-pipeline-collect-errors.test.ts` — unit tests for collect-errors mode
- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — vitest run

## 3. Step sequence

### Step 1. Extend TypeScript types

**Goal:** Add `collectErrors` to `ExecuteKernelPipelineOptions` and `failedSteps` to `KernelPipelineReport`.

**Agent actions:**

- Edit `packages/werkstatt/src/kernel/types.ts`:
  - Add `collectErrors?: boolean` field to `ExecuteKernelPipelineOptions` with JSDoc: `RFC-0809: when true, continue executing independent steps after a failure and aggregate all errors in the final report. Default: false (fail-fast). No effect when concurrency=1.`
  - Add `failedSteps?: string[]` field to `KernelPipelineReport` with JSDoc: `RFC-0809: command names of steps that failed (excluding dependency-skipped). Present only in collect-errors mode when failures occurred.`
- Add `CHANGE_SUMMARY` entry to `types.ts` module contract: `RFC-0809: add collectErrors to ExecuteKernelPipelineOptions and failedSteps to KernelPipelineReport.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles

**Completion criterion:** Both fields exist in types with correct JSDoc; TypeScript compiles.

**Human review:** no

---

### Step 2. Add `--collect-errors` to CLI parser

**Goal:** Accept `--collect-errors` flag in `consumeCommonFlags` and pass it to `executeKernelPipeline` in the `pipeline` subcommand.

**Agent actions:**

- Edit `packages/werkstatt/src/kernel/cli/index.ts`:
  - Add `let collectErrors = false;` to `consumeCommonFlags`
  - Add parsing block: `if (entry === "--collect-errors" || entry === "--collect-errors=true" || entry === "--collect-errors=1") { collectErrors = true; continue; }`
  - Return `collectErrors` from `consumeCommonFlags`
  - In `pipeline` subcommand: destructure `collectErrors` from `consumeCommonFlags` result
  - Pass `...(collectErrors ? { collectErrors: true } : {})` to `executeKernelPipeline` options

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `--collect-errors` flag parsed by CLI and passed to `executeKernelPipeline` options.

**Human review:** no

---

### Step 3. Implement collect-errors post-processing in `executePipelineForSite`

**Goal:** When `collectErrors` is true, aggregate all failed reports instead of stopping at the first failure.

**Agent actions:**

- Edit `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts`:
  - Add `collectErrors` to `EXECUTE_KERNEL_PIPELINE_OPTION_KEYS` array
  - Extract pure function `aggregateCollectErrors(sortedResults: StepExecutionResult[], collectErrors: boolean): { failedSteps?: string[]; exitCode: number; ok: boolean }` — filters `!r.report.ok && !r.dependencySkipped`, returns `{ failedSteps, exitCode, ok: false }` when failures exist and collectErrors is true; returns `undefined` (fallthrough to fail-fast) otherwise
  - In `executePipelineForSite`, after `const sortedResults = [...results].sort(...)`:
    - Call `aggregateCollectErrors(sortedResults, options.collectErrors ?? false)`
    - If result is non-null (failures found in collect-errors mode):
      - Print summary table: `progressLine` for each failed step
      - Return `KernelPipelineReport` with aggregated `exitCode`, `ok: false`, `failedSteps`
    - Else: keep existing fail-fast logic
  - Add `CHANGE_SUMMARY` entry: `RFC-0809: add collect-errors mode — aggregate all independent step failures instead of stopping at first failure. Extract aggregateCollectErrors pure function for testability.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `executePipelineForSite` aggregates failures when `collectErrors` is true; existing fail-fast behavior unchanged when false.

**Human review:** no

---

### Step 4. Implement collect-errors post-processing in `executePipelineForWorkspace`

**Goal:** Same aggregation logic for workspace-scoped pipelines.

**Agent actions:**

- Edit `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts`:
  - In `executePipelineForWorkspace`, call `aggregateCollectErrors(sortedResults, options.collectErrors ?? false)` (same pure function from Step 3)
  - If result is non-null: return `KernelPipelineReport` with aggregated `exitCode`, `ok: false`, `failedSteps`
  - Else: keep existing fail-fast logic

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `executePipelineForWorkspace` aggregates failures when `collectErrors` is true.

**Human review:** no

---

### Step 5. Wire `--collect-errors` flag to `mission.validate`

**Goal:** `mission.validate` accepts `--collect-errors` and propagates it to all `executeKernelPipeline` calls.

**Agent actions:**

- Edit `packages/werkstatt/src/mission/mission.module.ts`:
  - Add `"collect-errors"` flag spec to `mission.validate` command registration: `{ kind: "boolean", description: "RFC-0809: Continue executing independent steps after a failure and aggregate all errors." }`
- Edit `packages/werkstatt/src/mission/mission-materialization-commands.ts`:
  - In `runMissionValidate`, read `const collectErrors = input.flags["collect-errors"] === true;`
  - Pass `...(collectErrors ? { collectErrors: true } : {})` to all three `executeKernelPipeline` calls (build.prepare at line ~433, build.check at line ~491, build.post at line ~580)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `mission.validate --collect-errors` propagates flag to all pipeline calls.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Three unit tests covering collect-errors mode behavior.

**Agent actions:**

- Create `packages/werkstatt/src/kernel/tests/execute-pipeline-collect-errors.test.ts`:
  - **Test 1: multiple independent failures reported in one run** — call `aggregateCollectErrors` with 4 `StepExecutionResult` (a failed, b dependencySkipped, c failed, d ok). Assert `failedSteps` includes `a` and `c` command names; `ok` is false; `exitCode` is non-zero.
  - **Test 2: dependent steps excluded from failedSteps** — same input, assert `b` (dependencySkipped) is NOT in `failedSteps`.
  - **Test 3: collectErrors=false returns null (fail-fast fallthrough)** — call with same input but `collectErrors=false`. Assert result is `undefined` (caller falls through to existing fail-fast logic).
  - **Test 4: no failures returns null** — all steps ok, `collectErrors=true`. Assert result is `undefined`.
  - Tests import `aggregateCollectErrors` directly from `execute-pipeline.ts` (or a re-export). No mocking needed — pure function.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test`

**Completion criterion:** All 3 tests pass; existing `pipeline-scheduler.test.ts` tests still pass.

**Human review:** no

---

### Step 7. Update AGENTS.md and CHANGE_SUMMARY

**Goal:** Document the new flag in package AGENTS.md if applicable.

**Agent actions:**

- Check `packages/werkstatt/AGENTS.md` — if there is a CLI flags section, add `--collect-errors` documentation
- Update `CHANGE_SUMMARY` in `execute-pipeline.ts` module contract (already done in Step 3)
- Update `CHANGE_SUMMARY` in `types.ts` module contract (already done in Step 1)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Documentation updated; no stale references.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files with new flag documentation.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (they did — `mission.validate` has a new flag).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0809 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0809`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0809`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0809` (if acceptance probes declared)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0809.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0809` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Longer pipeline runs in collect-errors mode | Step 3/4 — only activates when flag is explicitly passed; default unchanged |
| Confusion about root causes vs cascading errors | Step 3/4 — `failedSteps` excludes `dependencySkipped` steps; summary table distinguishes failed from skipped |
| Cache pollution | No mitigation needed — failed steps are not cached (RFC-0390); no change to cache logic |
| concurrency=1 no-op confusion | Step 6 — Test 3 explicitly verifies no-op behavior; RFC documents this limitation |

## 6. Escalation triggers

- If implementation reveals that `executeScheduledSteps` needs modification to support collect-errors in concurrency=1 mode, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0809 --reason "scheduler modification required for concurrency=1 collect-errors" --invariant "RFC-0686"` instead of modifying the scheduler.
