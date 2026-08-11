---
reviewId: REVIEW-CODE-2026-08-11-01
date: 2026-08-11
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 1e5d435f...HEAD
filesReviewed:
  - packages/forge/os/mission/handlers/archive.ts
  - packages/forge/os/mission/handlers/archive.test.ts
---

# Code Review: 1e5d435f...HEAD (RFC-0804 implementation)

### Verdict: Needs revision

The implementation is clean, minimal, and follows existing patterns (`mission-materialize.ts` uses the same `execSync("pnpm install")` pattern). One finding: the catch block is too broad and the error message is misleading.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` and `pnpm --filter @warpgogol/forge run test` (784 tests) both pass.

### Axis A — Structural correctness

No issues. Code is minimal, properly typed, no magic numbers, no dead code. Error handling uses try/catch with context. The `JSON.stringify` for shell arguments is consistent with `mission-materialize.ts`.

### Axis B — DNA alignment

No issues. No DNA invariants touched. `node:child_process` is a Node built-in — no `@warpgogol/*` import, no autonomy guard violation.

### Axis C — Ecosystem fit

No issues. MODULE_CONTRACT and CHANGE_SUMMARY updated. No CLI surface change. No AGENTS.md update needed — the change is internal to `mission.archive`.

### Axis D — Forward-only compliance

No issues. No shims, no dual paths, no legacy code maintained.

### Axis E — Agent-facing clarity

No issues. Compass scaffolding updated. Variable names are clear. Logging uses `logger.info`/`logger.warn` consistently.

### Axis F — Pragmatism

- **Misleading error message** (`archive.ts:423-426`): The catch block wraps the entire lockfile refresh (pnpm install + git status + git add + git commit), but the warning message says "pnpm install failed after archive — lockfile may be stale." If `git commit` fails (e.g., pre-commit hook rejection, git lock), the warning incorrectly attributes the failure to `pnpm install`. The catch block should either (a) be split into separate try/catch blocks for `pnpm install` vs git operations, or (b) use a more generic error message that doesn't assume which step failed.

### Axis G — Blind spots

No issues. Performance, concurrent execution, and side effects are documented in the RFC's Risks section. Edge cases (dry-run, no-moves) are handled with guards.

### Spec compliance

| Requirement from RFC-0804 | Status | Evidence |
| --- | --- | --- |
| Run pnpm install after moves | Done | archive.ts:394-400 |
| Non-fatal on pnpm install failure | Done | archive.ts:423-427 |
| Commit lockfile + moved dirs if dirty | Done | archive.ts:406-422 |
| Dry-run skips refresh | Done | archive.ts:394 |
| No-moves skips refresh | Done | archive.ts:394 |
| Unit tests for all paths | Done | archive.test.ts:319-390 (5 tests) |
| MODULE_CONTRACT updated | Done | archive.ts:12 |
| CHANGE_SUMMARY updated | Done | archive.ts:20 |

### Questions for the author

1. Should the catch block be split to distinguish `pnpm install` failures from `git commit` failures, or should the error message be generalized to "Lockfile refresh failed after archive"?
