---
reviewId: REVIEW-CODE-2026-07-29-01
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 6590070...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts
  - packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts
  - packages/os/site-kernel-handoff/src/werkstatt/index.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts
  - packages/os/site-kernel-handoff/src/mission/mission-open.ts
  - packages/os/site-kernel-handoff/src/mission/mission-close.ts
  - packages/os/site-kernel-handoff/src/mission/mission-abort.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - packages/os/site-kernel-handoff/src/mission/mission-migrate.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/tests/werkstatt-commit.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-open-clean-tree.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: 6590070...HEAD (RFC-0580 implementation)

### Verdict: Approved

The implementation is clean, well-tested, and follows existing patterns (`commitAndPushBordbuch`). All design decisions were grilled and documented in the plan. The helper stages only specific file paths, is idempotent, and throws on commit failure — exactly as the RFC specifies.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-handoff test` (332 tests, 80 files) both pass. `rfc.validate` reports no violations for RFC-0580.

### Axis A — Structural correctness

No issues. `gitExec` is properly typed with optional `options` parameter. `CommitWerkstattResult` interface is minimal. The `execSync` for `git diff --cached --quiet` is used directly (not via `gitExec`) to distinguish exit 0 (no changes) from exit 1 (has changes) — this is a documented design decision from the grilling session, not a code smell. The `async` keyword on `commitWerkstattSideEffects` matches the existing `commitAndPushBordbuch` pattern (both use synchronous `gitExec` internally but are `async` for caller consistency).

### Axis B — DNA alignment

No issues. DNA-45 (fleet registry): helper stages `registry.yaml` specifically, never `git add -A`. DNA-46 (mission lifecycle): all 6 lifecycle commands now auto-commit. DNA-51 (werkstatt consistency): locks are acquired by the lifecycle commands before the helper runs.

### Axis C — Ecosystem fit

No issues. `gitExec` moved from `bordbuch-io.ts` to `werkstatt/git-exec.ts` — correct shared location. `werkstatt/index.ts` re-exports both `gitExec` and `commitWerkstattSideEffects`. AGENTS.md updated with RFC-0580 section. No new commands added — the helper is internal.

### Axis D — Forward-only compliance

No issues. The private `gitExec` in `bordbuch-io.ts` is removed and replaced with import from `werkstatt/git-exec.ts`. No compatibility shims, no dual paths, no legacy code maintained behind a flag.

### Axis E — Agent-facing clarity

No issues. Both new files (`git-exec.ts`, `werkstatt-commit.ts`) carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. All 6 modified mission handlers have `CHANGE_SUMMARY` entries referencing RFC-0580. Variable names are clear (`workspaceRoot`, `files`, `message`, `commitSha`).

### Axis F — Pragmatism

No issues. `commitWerkstattSideEffects` is a minimal 3-parameter helper with a clear return type. No speculative generality. Uses the existing `gitExec` pattern rather than introducing a new git library. The `allowNonZero` option is a minimal extension (1 optional field) that solves the `git add` on non-existent paths case.

### Axis G — Blind spots

No issues. Performance: ~50-100ms per lifecycle command (documented in RFC risks). Edge cases: idempotent skip handles no-changes; `allowNonZero` handles non-existent files. Concurrent execution: DNA-51 locks serialize access. The `execSync` for `git diff --cached --quiet` has the same 30s timeout as `gitExec`.

### Spec compliance

| Requirement from RFC-0580 | Status | Evidence |
| --- | --- | --- |
| Helper defined in `werkstatt-commit.ts` with TypeScript types | Done | `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts:7-40` |
| Stages only specific file paths (never `git add -A`) | Done | `werkstatt-commit.ts:22`, test `werkstatt-commit.test.ts:56` |
| Idempotent — skips when no staged changes | Done | `werkstatt-commit.ts:25-34`, test `werkstatt-commit.test.ts:41` |
| Throws on `git commit` failure | Done | `werkstatt-commit.ts:36`, test `werkstatt-commit.test.ts:74` |
| `mission.open` calls with `registry.yaml` + `mission.yaml` | Done | `mission-open.ts:158-166` |
| `mission.materialize` calls with `mission.yaml` + `pnpm-lock.yaml` | Done | `mission-materialize.ts:911-919` |
| `mission.migrate` calls with `mission.yaml` | Done | `mission-migrate.ts:220-225` |
| `mission.reconcile` calls with `mission.yaml` | Done | `mission-materialization-commands.ts:810-815` |
| `mission.close` calls with `registry.yaml` + `mission.yaml` | Done | `mission-close.ts:291-299` |
| `mission.abort` calls with `registry.yaml` + `mission.yaml` | Done | `mission-abort.ts:154-162` |
| Commit message format: `werkstatt: <command> <missionId>` | Done | test `werkstatt-commit.test.ts:112` |
| Unit tests (idempotent skip, specific-file staging, throw on failure) | Done | `werkstatt-commit.test.ts`, 5 tests passing |
| Integration test: clean `git status` after `mission.open` | Done | `mission-open-clean-tree.test.ts`, 1 test passing |
| `rfc.validate` passes | Done | No violations for RFC-0580 |

### Questions for the author

1. The `execSync` for `git diff --cached --quiet` in `werkstatt-commit.ts:26-33` duplicates the timeout/stdio config from `gitExec`. Was extending `gitExec` to return exit code information considered and rejected? (Answer: yes — documented in the plan's grilling session; `allowNonZero` returns "" for both exit 0 and non-zero, so direct `execSync` is the correct approach.)
