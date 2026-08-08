---
reviewId: REVIEW-CODE-2026-08-08-02
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 1abd7641^...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - packages/os/site-kernel-handoff/src/tests/rfc-0763-failure-path-bordbuch-cleanup.test.ts
---

# Code Review: RFC-0763 failure-path bordbuch cleanup

### Verdict: Needs revision

The implementation correctly adds `commitBordbuchProjections` cleanup to both failure paths with proper non-fatal try/catch. However, Axis A finds a duplicated code pattern — the same try/catch/log block is copy-pasted at two insertion points. This should be extracted into a shared helper to follow DRY and reduce maintenance burden.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff run build:check` exits 0. All 793 tests pass (0 failures). `rfc.validate --id RFC-0763` passes with 0 violations.

### Axis A — Structural correctness

- **F-A1 (FINDING): Duplicated Code** — The same try/catch/log block is duplicated at `mission-materialization-commands.ts:372-384` (build.prepare failure) and `mission-materialization-commands.ts:601-613` (validation failure). The only difference is the log message string ("build.prepare failure" vs "validation failure"). This is a textbook Duplicated Code smell. Extract a shared helper function (e.g. `cleanupBordbuchOnFailure(workspaceRoot, systemId, label, logger)`) and call it from both sites. This reduces 12 lines of duplication to 2 one-line calls.

### Axis B — DNA alignment

No issues. The change supports DNA-46 (Mission lifecycle) by ensuring the cache clone is clean on all exit paths, not just the success path. No DNA invariant is violated.

### Axis C — Ecosystem fit

No issues. The change follows the existing pattern established by RFC-0724 (pre-validate cleanup at line 222) and RFC-0749 (post-validation cleanup at line 628). The AGENTS.md rule is updated with the RFC-0763 reference. Package boundaries are respected — no new imports, `commitBordbuchProjections` is already imported.

### Axis D — Forward-only compliance

No issues. The change is purely additive — two new cleanup calls on failure paths. No existing behavior is changed, no legacy paths maintained.

### Axis E — Agent-facing clarity

No issues. Compass scaffolding (CHANGE_SUMMARY) updated with RFC-0763 entry. RFC references in code comments are clear (`// RFC-0763: clean bordbuch projections on ...`). Log messages are descriptive and include file count. The test file has proper MODULE_CONTRACT and CHANGE_SUMMARY scaffolding.

### Axis F — Pragmatism

- **F-F1 (FINDING): Minimality ladder** — The duplicated code pattern (F-A1) also violates the minimality ladder. A shared helper would be a single function extracted to the module level, reducing total lines of code. The current approach of copy-pasting the block is the least minimal solution.

### Axis G — Blind spots

No issues. The RFC's Failure modes section explicitly addresses the `bordbuch.commit` self-failure scenario. Performance impact is negligible — `commitBordbuchProjections` runs `git status --porcelain` (fast) and only commits if bordbuch files are dirty. Edge cases (cache clone missing, no stale files) are handled by the existing non-throwing behavior of `commitBordbuchProjections` (RFC-0702).

### Spec compliance

| Requirement from RFC-0763 | Status | Evidence |
| --- | --- | --- |
| Cleanup before build.prepare failure return | Done | mission-materialization-commands.ts:372-384 |
| Cleanup before !passed failure return | Done | mission-materialization-commands.ts:601-613 |
| Non-fatal (try/catch, exit code 1) | Done | Both blocks use try/catch with logger.warn |
| Non-bordbuch files not touched | Done | commitBordbuchProjections only stages bordbuch paths |
| 4 unit tests | Done | rfc-0763-failure-path-bordbuch-cleanup.test.ts, all pass |
| AGENTS.md rule | Done | packages/os/site-kernel-handoff/AGENTS.md:35 |
| rfc.validate passes | Done | 0 violations |

### Questions for the author

1. **Should the duplicated try/catch/log block be extracted into a shared helper?** The same 12-line pattern appears at two sites with only the log label differing. A `cleanupBordbuchOnFailure(workspaceRoot, systemId, label, logger)` helper would eliminate the duplication.
