---
reviewId: REVIEW-CODE-2026-08-02-01
date: 2026-08-02
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 445f920...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts
  - packages/os/site-kernel-handoff/src/tests/git-exec-retry.test.ts
  - packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: 445f920...HEAD (RFC-0646)

### Verdict: Needs revision

One minor finding: the `gitExec` mock in `bordbuch-commit.test.ts` is now dead code since `bordbuch-commit.ts` no longer imports `gitExec`. The implementation itself is sound — retry logic, error classification, and test coverage are all correct.

### Mechanical floor

Pass — `tsc --noEmit` clean, 499 tests pass, `rfc.validate` clean.

### Axis A — Structural correctness

**Finding A1.** The `gitExec` mock in `packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts:40-45` is dead code. `bordbuch-commit.ts` no longer imports `gitExec` (only `gitExecWithRetry`), so the mock factory entry for `gitExec` is unused. Remove it to keep the mock focused on the actual dependency.

### Axis B — DNA alignment

No issues. DNA-51 (Werkstatt consistency primitives) is satisfied — retry complements the existing lock/idempotency/atomic-staging primitives without weakening them.

### Axis C — Ecosystem fit

No issues. `gitExecWithRetry` is exported from `werkstatt/git-exec.ts` and imported by `bordbuch/bordbuch-commit.ts` — same package, no boundary violation. AGENTS.md updated with retry note. No pipeline changes, no new commands.

### Axis D — Forward-only compliance

No issues. `gitExec` is still exported for other consumers (e.g. `commitWerkstattSideEffects`, `commitAndPushBordbuch`). `bordbuch-commit.ts` switched directly to `gitExecWithRetry` — no dual path, no shim, no backward compatibility layer.

### Axis E — Agent-facing clarity

No issues. New file `git-exec-retry.test.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Updated files have `CHANGE_SUMMARY` entries referencing RFC-0646. Variable names are clear — `isTransientError`, `gitExecWithRetry`, `BORDBUCH_RETRY_OPTIONS` all reveal their purpose.

### Axis F — Pragmatism

No issues. `RetryOptions` has only `backoffMs` — minimal, no speculative generality. `gitExecWithRetry` extends the existing `gitExec` pattern. Scope is tight — only `bordbuch.commit` adopts the new helper.

### Axis G — Blind spots

No issues. Worst-case 72s latency is documented in RFC Risks. Edge case `backoffMs: []` (no retries) is tested. `allowNonZero` passthrough is tested. The `isTransientError` classifier is conservative — only timeout, lock-file, and "Another git process" messages are retried.

### Spec compliance

No spec available — skipped. RFC-0646 acceptance criteria are the de facto spec; all 7 criteria are met with evidence.

### Questions for the author

1. The `gitExec` mock in `bordbuch-commit.test.ts` is unused — should it be removed to keep the mock focused on `gitExecWithRetry` only?
