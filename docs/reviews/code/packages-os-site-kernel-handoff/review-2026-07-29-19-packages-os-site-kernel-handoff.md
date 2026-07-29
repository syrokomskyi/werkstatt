---
reviewId: REVIEW-CODE-2026-07-29-19
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 36fdafb...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/mission/rfc-0584-bordbuch-conflict-autoresolve.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0584-auto-resolve-bordbuch-delete-modify-conflicts-in-mission-reconcile.md
---

# Code Review: 36fdafb...HEAD (RFC-0584 implementation)

### Verdict: Needs revision

The implementation correctly adds bordbuch delete-modify conflict auto-resolution to `mission.reconcile` with proper error handling, evidence reporting, and test coverage. However, there are two findings: a duplicated code pattern (merge --abort in two branches) and a test-only helper that could mask real git failures.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-handoff test` (341 tests, including 3 new) all pass.

### Axis A — Structural correctness

**Finding A1 — Duplicated Code (merge --abort pattern).** The `git merge --abort` call with its try/catch is duplicated in two branches of the catch block: once in the auto-resolution failure path (lines 757-760) and once in the non-bordbuch conflict path (lines 770-773). Both perform the same operation: attempt abort, silently catch failure, then throw. This is a Fowler Duplicated Code smell. Consider extracting a helper `abortMerge(systemDir: string)` that wraps the abort + try/catch, and calling it from both branches.

### Axis B — DNA alignment

No issues. DNA-46 (Mission lifecycle) is the relevant invariant — it states every change passes through a mission and is enforced by `mission.reconcile`. The auto-resolution preserves this invariant: it only resolves bordbuch (cache-clone-only) conflicts, not workpiece data conflicts. The bordbuch is the append-only hash-chained log, and keeping the cache clone version (`--ours`) preserves the canonical bordbuch state.

### Axis C — Ecosystem fit

No issues. The change is scoped to `packages/os/site-kernel-handoff` which owns `mission.reconcile`. AGENTS.md was updated with the new behavior. No package boundary violations. No new commands introduced.

### Axis D — Forward-only compliance

No issues. The old error path (throw on any merge failure) is replaced, not preserved alongside the new logic. No dual-paths or compatibility shims.

### Axis E — Agent-facing clarity

No issues. New test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding. The RFC-0584 reference in the code comment (`// RFC-0584: auto-resolve bordbuch/ delete-modify conflicts`) provides traceability. Variable names (`autoResolvedPaths`, `conflictedPaths`, `allBordbuch`) are self-documenting.

### Axis F — Pragmatism

No issues. The `autoResolvedPaths?: string[]` field is optional and only populated when auto-resolution occurs — no speculative generality. The change extends the existing merge try/catch block rather than introducing a new abstraction layer. Scope is minimal: one interface field, one logic block, one evidence field, one summary suffix.

### Axis G — Blind spots

**Finding G1 — `gitExpectFail` test helper masks real failures.** The `gitExpectFail` function (test file line 31-39) catches all git errors and returns an empty string. This is used for `git merge` which is expected to fail (exit code 1 on conflict). However, if the merge fails for a different reason (e.g., bad ref, missing FETCH_HEAD), the test would still pass silently because the helper swallows the error. Consider checking the error output or exit code to distinguish "expected conflict" from "unexpected git failure", or at minimum adding a comment that the helper is specifically for merge commands that fail with conflicts.

### Spec compliance

| Requirement from the spec (RFC-0584) | Status | Evidence |
| --- | --- | --- |
| Auto-resolve bordbuch/ delete-modify conflicts by keeping cache clone version | Done | mission-materialization-commands.ts:733-754 |
| Fail with existing error when non-bordbuch conflicts occur | Done | mission-materialization-commands.ts:768-780 |
| Abort merge and fail when mixed bordbuch + non-bordbuch conflicts occur | Done | mission-materialization-commands.ts:768-780 (same path as non-bordbuch) |
| Result includes autoResolvedPaths field | Done | mission-materialization-commands.ts:895-903 |
| Log message emitted | Done | mission-materialization-commands.ts:752-754 |
| Unit test covers auto-resolution scenario | Done | rfc-0584-bordbuch-conflict-autoresolve.test.ts test 1 |
| Unit test covers non-bordbuch hard-failure scenario | Done | rfc-0584-bordbuch-conflict-autoresolve.test.ts test 2 |

### Questions for the author

1. Should the `git merge --abort` duplication be extracted into a helper, or is the current inline form preferred for clarity of each error path?
2. Is the `gitExpectFail` test helper sufficient, or should it verify that the failure is specifically a conflict (exit code 1) rather than any git error?
