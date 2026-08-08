---
id: RFC-0763
title: "Auto-commit stale bordbuch projections in cache clone during mission.validate"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - RFC-0355
  - RFC-0356
  - RFC-0702
  - RFC-0724
  - RFC-0749
satisfies:
  - DNA-46
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "mission.validate cleans bordbuch projections from cache clone on all exit paths, including validation failure"
  - "Operator never sees stale bordbuch dirty state in cache clone after mission.validate, regardless of pass/fail outcome"
nonGoals:
  - "Does not change bordbuch commit behavior in mission.open or mission.close"
  - "Does not auto-commit non-bordbuch files in the cache clone"
  - "Does not add a dirty cache clone warning on failure paths — the cleanup eliminates the bordbuch dirty state; non-bordbuch dirty state is out of scope"
---

# RFC-0763: Auto-commit stale bordbuch projections in cache clone during mission.validate

## Context

`mission.validate` runs `build.prepare` which includes `bordbuch.generate` (step 133) and `bordbuch.commit` (step 137, RFC-0626). `bordbuch.generate` writes projection files (`bordbuch/status.generated.yaml`, `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html`) to the cache clone. `bordbuch.commit` commits them via `commitBordbuchProjections` (non-throwing per RFC-0702).

Three existing cleanup calls cover most scenarios:

1. **RFC-0724 pre-validate cleanup** (`mission-materialization-commands.ts:222-233`): runs at the top of `mission.validate` on ALL paths. Commits stale bordbuch files from a PREVIOUS run.
2. **RFC-0702 reuse-path cleanup**: originally added to the distribution reuse path, now superseded by the RFC-0724 pre-validate call which covers all paths (line 313 comment: "bordbuch auto-commit is now done at the top of mission.validate").
3. **RFC-0749 post-validation cleanup** (`mission-materialization-commands.ts:602-613`): runs AFTER the `passed === true` check. Commits bordbuch projections that were regenerated during `build.prepare` but not committed due to transient `bordbuch.commit` failure.

### The gap: validation failure paths skip cleanup

RFC-0749's cleanup at line 602 is only reached when `passed === true`. There are two early-return failure paths that skip it:

1. **`build.prepare` failure** (line 340-376): if `build.prepare` fails at any step AFTER `bordbuch.generate` ran (e.g., `bordbuch.validate` fails, or a later step fails), the function returns at line 371 with `exitCode: 1`. The RFC-0749 cleanup at line 602 is never reached.
2. **Validation failure** (line 573-588): if `build.check` or `build.post` fails (`!passed`), the function returns at line 583 with `exitCode: 1`. The RFC-0749 cleanup at line 602 is never reached.

In both cases, `bordbuch.generate` has already written projection files to the cache clone. If `bordbuch.commit` failed silently (non-throwing per RFC-0702), the cache clone stays dirty. The RFC-0522 dirty cache clone warning at line 615-624 is also after the early returns — so no warning is emitted either.

The operator sees "validation FAILED" with no signal about dirty bordbuch files. On the next `mission.validate` run, the RFC-0724 pre-validate cleanup at line 222 will commit the stale files — but the operator has no visibility into the problem until then.

This was observed during mission `warpgogol-com-m000039`: a `build.check` validator failed, and the operator later discovered dirty `bordbuch/status.generated.yaml` in the cache clone with no warning from the failed `mission.validate` run.

## Problem

When `mission.validate` fails (either `build.prepare` fails or `!passed`), bordbuch projections that were generated during `build.prepare` are left uncommitted in the cache clone if `bordbuch.commit` failed silently. The RFC-0749 post-validation cleanup only runs on the success path — the two failure early-return paths skip it entirely.

The RFC-0724 pre-validate cleanup on the NEXT run will fix it, but:

1. The operator has no warning about the dirty state from the failed run.
2. If the operator inspects the cache clone manually between runs, they see dirty bordbuch files with no explanation.
3. The dirty state is transient (cleaned on next run), but it violates the principle that `mission.validate` should leave the cache clone in a clean state regardless of outcome.

## Decision

Extend the `commitBordbuchProjections` cleanup to the two validation failure early-return paths in `mission.validate`. The cleanup is non-fatal (try/catch with `logger.warn`) — it must not change the exit code or block the failure return.

Specifically, add a `commitBordbuchProjections` call:

1. **Before the `build.prepare` failure return** (line 371): after writing `validation-report.json`, before the `return` statement.
2. **Before the `!passed` failure return** (line 583): after writing `validation-report.json`, before the `return` statement.

Both calls use the existing `commitBordbuchProjections(workspaceRoot, manifest.systemId)` signature. The cleanup commits any dirty bordbuch projection files in the cache clone. If the cleanup itself fails, `logger.warn` is emitted and the failure return proceeds unchanged.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Ensures the cache clone is in a clean state for `mission.reconcile` regardless of whether validation passed or failed.
- **RFC-0702**: `commitBordbuchProjections` is already non-throwing — the cleanup calls on failure paths inherit this resilience.
- **RFC-0724**: The pre-validate cleanup handles stale files from a PREVIOUS run. This RFC ensures the CURRENT run does not leave stale files when it fails.
- **RFC-0749**: The post-validation cleanup handles the success path. This RFC extends the same pattern to failure paths — amending RFC-0749 to cover all exit paths, not just the success path.
- **Site OS operator model**: `mission.validate` is a workspace-scoped command. The cleanup is internal — no new flags or user-visible changes.

## Design

### CLI surface

No CLI surface change. The auto-commit is internal to `mission.validate`.

### TypeScript contracts

```ts
// In mission-materialization-commands.ts, before each failure early-return:

// RFC-0763: clean bordbuch projections on failure paths too
try {
  const failBordbuch = await commitBordbuchProjections(workspaceRoot, manifest.systemId);
  if (failBordbuch.committed) {
    logger.info(
      `  Bordbuch cleanup on failure: committed ${failBordbuch.filesCommitted.length} file(s)`,
    );
  }
} catch (err) {
  logger.warn(
    `  Bordbuch cleanup on failure failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
  );
}
```

The call is placed after `atomicWriteFile(validation-report.json)` and before the `return` statement in both failure paths.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Add `commitBordbuchProjections` cleanup before both failure early-returns (build.prepare failure at ~line 371, validation failure at ~line 583) |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` | Existing `commitBordbuchProjections` function (no changes — already non-throwing per RFC-0702) |

### Output format

No output format change. The warning about uncommitted cache clone files is replaced by an info log when auto-commit succeeds, or a warning when it fails.

### Failure modes

- **`commitBordbuchProjections` fails on a failure path**: Non-fatal. `logger.warn` emitted. The failure return proceeds unchanged — exit code is still 1. The validation failure is the primary signal; the cleanup failure is secondary.
- **No stale bordbuch files**: `commitBordbuchProjections` is a no-op (returns `{ committed: false }` with no `error`). No log output.
- **`build.prepare` fails before `bordbuch.generate` runs**: No bordbuch projections were written. `commitBordbuchProjections` finds nothing dirty. No-op.
- **`build.prepare` fails at `bordbuch.commit` itself**: `commitBordbuchProjections` has already run inside `bordbuch.commit` and returned an error result (non-throwing per RFC-0702). The failure-path cleanup calls `commitBordbuchProjections` again — it finds the same dirty files and fails again. This is harmless: the call is non-fatal, `logger.warn` is emitted, and the failure return proceeds with `exitCode: 1`. The bordbuch dirty state will be cleaned by the RFC-0724 pre-validate cleanup on the next run.
- **Cache clone does not exist**: `commitBordbuchProjections` catches `resolveCachePath` failure and returns `{ committed: false }` (existing behavior, RFC-0702).

## Rollout

- **Default behavior**: Auto-commit on first release. No flag day.
- **Existing missions**: No migration needed — the cleanup is additive.
- **New missions**: Automatically benefit.
- **Pipeline integration**: No pipeline changes. `mission.validate` is a standalone command.

## Alternatives considered

- **Move the RFC-0749 cleanup before the `passed` check**: Rejected. The cleanup at line 602 runs after the `passed` check. Moving it before would mean the cleanup runs on both success and failure paths — but it would also run before the `validation-report.json` write, making the report timing inconsistent. Adding separate cleanup calls on failure paths is cleaner.
- **Refactor all exit paths to use a single `finally` block**: Rejected. The function has complex control flow with multiple returns. A `finally` block would run on all paths including the reuse path (which already has RFC-0724 coverage) and the success path (which already has RFC-0749 coverage). It would also run on thrown exceptions, which is a different error-handling concern. Targeted cleanup calls on the two failure paths are simpler and more predictable.
- **Add the RFC-0522 dirty cache clone warning to failure paths instead of cleanup**: Rejected. The warning would tell the operator about the problem but not fix it. The operator would still need to manually commit bordbuch files or re-run `mission.validate` to trigger the RFC-0724 pre-validate cleanup. Auto-committing on failure paths is strictly better — the operator never sees the dirty state.
- **Block `mission.validate` failure return until bordbuch is clean**: Rejected. The cleanup is non-fatal — if it fails, the failure return must still proceed. Blocking would turn a bordbuch commit issue into a validation blocker, which is the wrong priority.

## Risks

- **Committing on a failure path changes cache clone HEAD**: The cleanup commit changes the cache clone HEAD. This is already the case with RFC-0724 (pre-validate) and RFC-0749 (post-validate on success). The cache key depends on `cacheCloneHead`, so the next materialization will detect the change and re-materialize if needed. This is expected behavior.
- **Non-bordbuch dirty files on failure paths**: The cleanup only stages bordbuch projection paths (`bordbuch/status.generated.yaml`, `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html`). Other dirty files in the cache clone are not touched. The RFC-0522 dirty cache clone warning does NOT fire on failure paths (it is after the early returns), so non-bordbuch dirty state remains invisible to the operator. This is out of scope for this RFC — the warning placement is a separate concern.
- **Race condition**: If another process is writing to the cache clone simultaneously, the commit may fail. `commitBordbuchProjections` is non-throwing (RFC-0702) and returns `{ committed: false, error: "..." }`. The `logger.warn` is emitted but does not block the failure return.

## Acceptance criteria

- [x] `mission.validate` calls `commitBordbuchProjections` before the `build.prepare` failure early-return (line ~371) (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:372-384, rfc-0763-failure-path-bordbuch-cleanup.test.ts:test "build.prepare failure")
- [x] `mission.validate` calls `commitBordbuchProjections` before the `!passed` failure early-return (line ~583) (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:601-613, rfc-0763-failure-path-bordbuch-cleanup.test.ts:test "validation failure")
- [x] Cleanup on failure paths is non-fatal (try/catch with `logger.warn`) — exit code remains 1 (evidence: rfc-0763-failure-path-bordbuch-cleanup.test.ts:test "cleanup failure does not change exit code")
- [x] Non-bordbuch dirty files in cache clone are not touched (evidence: rfc-0763-failure-path-bordbuch-cleanup.test.ts:test "non-bordbuch files not touched", commitBordbuchProjections implementation in bordbuch-commit.ts only stages bordbuch paths)
- [x] Unit test: build.prepare failure path commits stale bordbuch projections (evidence: rfc-0763-failure-path-bordbuch-cleanup.test.ts, all 793 tests pass)
- [x] Unit test: validation failure path commits stale bordbuch projections (evidence: rfc-0763-failure-path-bordbuch-cleanup.test.ts, all 793 tests pass)
- [x] Unit test: cleanup failure does not change exit code or block the failure return (evidence: rfc-0763-failure-path-bordbuch-cleanup.test.ts, all 793 tests pass)
- [x] Unit test: non-bordbuch files not touched on failure paths (evidence: rfc-0763-failure-path-bordbuch-cleanup.test.ts, all 793 tests pass)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0763 --json, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the cleanup-on-failure guarantee established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT make the failure-path cleanup throwing — it must be non-fatal, same as RFC-0749's success-path cleanup.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it (RFC-0334).
