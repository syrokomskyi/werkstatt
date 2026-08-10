---
reviewId: REVIEW-CODE-2026-08-10-01
date: 2026-08-10
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 35a17a6d...HEAD
filesReviewed:
  - packages/werkstatt/src/mission/mission-close.ts
  - packages/werkstatt/src/mission/mission-git-commit.ts
  - packages/werkstatt/src/mission/mission-materialization-commands.ts
  - packages/werkstatt/src/tests-handoff/rfc-0797-eliminate-manual-git-interventions.test.ts
  - AGENTS.md
  - packages/werkstatt/AGENTS.md
---

# Code Review: 35a17a6d...HEAD (RFC-0797 implementation)

### Verdict: Needs revision

One finding: `commitCacheCloneIfDirty` is near-identical duplicated code of `commitWorkpieceIfDirty`. The mechanical floor passes, all tests pass, and the implementation is semantically correct. The duplication should be extracted before merging.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt build:check` (tsc --noEmit) passes. `pnpm --filter @warpgogol/werkstatt test` passes (1289 tests, 0 failures). `rfc.validate --id RFC-0797` passes (V-32 warning only).

### Axis A — Structural correctness

**Finding A-1: Duplicated Code (Fowler).** `commitCacheCloneIfDirty` (`mission-git-commit.ts:318-347`) is a near-verbatim copy of `commitWorkpieceIfDirty` (`mission-git-commit.ts:286-315`). The only difference is the commit message prefix (`cache-clone:` vs `workpiece:`) and the parameter name (`systemDir` vs `workpieceDir`). Both functions: check `isWorkpieceDirty`, run `git add -A`, `git commit --no-verify`, `git rev-parse HEAD`, and return `WorkpieceCommitResult`. Extract a shared `commitDirIfDirty(dir, commitMessage)` helper and have both functions delegate to it with their respective commit messages.

### Axis B — DNA alignment

No issues. DNA-46 (mission lifecycle) is satisfied — the changes automate manual git interventions within the existing mission lifecycle, no new states or transitions.

### Axis C — Ecosystem fit

No issues. Dynamic `import("@warpgogol/werkstatt/kernel")` for `executeKernelCommand` is consistent with the established pattern in `mission-close.ts` (used at lines 497, 545, 596, 800). Package boundaries respected — all changes are within `packages/werkstatt`. AGENTS.md files updated at root and package level.

### Axis D — Forward-only compliance

No issues. The old dirty workpiece guard (throw on dirty) is replaced, not kept behind a flag. `commitBordbuchProjections` in post-validate cleanup is replaced by `commitCacheCloneIfDirty` — no dual-path. The `--skip-auto-sync` flag is an operator escape hatch, not a legacy compatibility shim.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` entries added to all modified files. RFC-0797 change entries added to `CHANGE_SUMMARY` in all three source files. Comments reference RFC numbers and explain "why" not "what". Log messages include commit SHAs for traceability.

### Axis F — Pragmatism

No issues (aside from A-1). The `--skip-auto-sync` flag is minimal — one `flagBoolean` call and one `if` condition. `commitCacheCloneIfDirty` reuses the existing `isWorkpieceDirty` helper and `WorkpieceCommitResult` type. No new dependencies. No speculative generality.

### Axis G — Blind spots

No issues. Pre-mirror-check sync runs inside the lock (race condition prevented). `commitCacheCloneIfDirty` uses `git add -A` which is safe because the cache clone is entirely generated (AGENTS.md: "Agents MUST NEVER edit any Sternsystem mirror directly"). The dirty guard after auto-commit still catches git failures. Performance is negligible (O(n) git operations vs 2+ minute validate pipeline).

### Spec compliance

| Requirement from RFC-0797 | Status | Evidence |
| --- | --- | --- |
| Fix 1a: Auto-commit dirty workpiece in close | Done | `mission-close.ts:256-261` |
| Fix 2a: Pre-mirror-check sync inside lock | Done | `mission-close.ts:307-324` |
| Fix 3a: Auto-commit cache clone in reconcile | Done | `mission-materialization-commands.ts:1108-1116` |
| Fix 4a: Replace commitBordbuchProjections in post-validate | Done | `mission-materialization-commands.ts:711-726` |
| `--skip-auto-sync` flag | Done | `mission-close.ts:180,310` |
| `commitCacheCloneIfDirty` helper | Done | `mission-git-commit.ts:318-347` |
| Unit tests | Done | 8 tests, all passing |
| AGENTS.md updates | Done | Root + package level |

### Questions for the author

1. Should `commitCacheCloneIfDirty` and `commitWorkpieceIfDirty` be extracted into a shared `commitDirIfDirty(dir, commitMessage)` helper to eliminate the duplicated code (A-1)?
2. Should the `cleanupBordbuchOnFailure` helper (`mission-materialization-commands.ts:87-96`) also be replaced with `commitCacheCloneIfDirty`, or is the conservative bordbuch-only cleanup on failure paths intentional?
