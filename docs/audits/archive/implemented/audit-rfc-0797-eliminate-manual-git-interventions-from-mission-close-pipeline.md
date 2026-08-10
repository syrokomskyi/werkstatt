---
rfcId: RFC-0797
auditId: AUDIT-RFC-0797-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0797

## Verdict: Needs revision

RFC-0797 correctly identifies four root causes of manual git interventions in the mission close pipeline and proposes minimal, well-scoped fixes. However, the RFC has a critical factual error in fix 2a (mirror sync placement), a missing `--skip-auto-sync` escape hatch, and lacks AGENTS.md update identification. These must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0797 --json` returned zero violations.

## Axis A — Structural completeness

- **A-1 (FAIL)**: The RFC says fix 2a should run "after the inline validate completes, before acquireLock (line 210)". But the mirror sync check is at lines 273-350, which is *inside* the lock. If `sternsystem.sync` runs before lock acquisition (line 210), another process could create new commits between the sync and the mirror check (lines 332-350), causing a false "out of sync" error again. The sync must run *after* lock acquisition and *after* the pre-check push (line 293), but *before* the mirror sync check (line 332). The RFC's placement is wrong and will not reliably prevent the false positive.

- **A-2 (PASS)**: Decision is present tense ("The mission close pipeline is made autonomous by four changes"). CLI surface, TypeScript contracts, file system responsibilities, failure modes, rollout, alternatives, risks, and acceptance criteria are all present and substantive.

- **A-3 (FAIL)**: Acceptance criteria item "Operator can run `mission.close` after `mission.validate` without any manual `git commit` or `sternsystem.sync` steps" is not checkable by a unit test. It should be reframed as a testable assertion (e.g., "Unit test verifies `mission.close` does not throw when workpiece is dirty and external mirrors are configured").

## Axis B — DNA alignment

- **B-1 (PASS)**: `satisfies: [DNA-46]` is correct — the RFC strengthens the mission lifecycle by making close autonomous. The body explains how in the Architectural fit section.

- **B-2 (PASS)**: No new DNA invariant is established. No existing DNA invariant is contradicted.

- **B-3 (PASS)**: `related[]` references are all relevant: DNA-46, RFC-0355, RFC-0480, RFC-0522, RFC-0568, RFC-0597, RFC-0626, RFC-0644, RFC-0705, RFC-0724, RFC-0749, RFC-0762, RFC-0796. Each is cited in the Architectural fit section with a specific relationship.

## Axis C — Ecosystem fit

- **C-1 (PASS)**: Package boundaries are correct — all changes are within `@warpgogol/werkstatt`, no cross-package imports proposed.

- **C-2 (PASS)**: No new pipeline steps proposed. The RFC correctly works within existing pipeline structure.

- **C-3 (FAIL)**: The RFC does not identify which `AGENTS.md` files need updates. The root `AGENTS.md` External mirror sync section (lines about `mission.close` calling `sternsystem.sync`) should be updated to document the new pre-mirror-check sync. The `packages/werkstatt/AGENTS.md` should document the new `commitCacheCloneIfDirty` helper.

- **C-4 (PASS)**: `commands.changed` lists `mission.close`, `mission.validate`, `mission.reconcile` — all are existing registered commands. No new commands proposed.

- **C-5 (PASS)**: Compass XML synchronization is addressed — the RFC correctly states no `docs/*.xml` files require synchronization.

## Axis D — Forward-only compliance

- **D-1 (PASS)**: No backward compatibility layers or shims. The dirty workpiece guard is replaced, not kept behind a flag.

- **D-2 (PASS)**: No deprecation grace period. The old throw-on-dirty behavior is removed, not maintained alongside the new auto-commit.

- **D-3 (PASS)**: No dual-paths. `commitCacheCloneIfDirty` replaces `commitBordbuchProjections` in the post-validate cleanup (4a), not alongside it.

## Axis E — Agent-facing policy

- **E-1 (PASS)**: No self-authorizing language. The RFC is in `draft` status and implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."

- **E-2 (PASS)**: Implementation notes reference the correct governance pattern (RFC-0224 for accepted→implemented transition).

- **E-3 (PASS)**: No content authoring in acceptance criteria — all criteria are code-level changes testable by unit tests.

- **E-4 (PASS)**: No cookies or client-side persistence introduced.

- **E-5 (PASS)**: No `NEEDS CLARIFICATION` markers found.

## Axis F — Pragmatism

- **F-1 (PASS)**: No new commands proposed. All fixes are internal behavior changes to existing commands.

- **F-2 (PASS)**: TypeScript contracts are minimal — `commitCacheCloneIfDirty` reuses the existing `WorkpieceCommitResult` type. No new interfaces except what's needed.

- **F-3 (PASS)**: The RFC reuses existing patterns: `commitWorkpieceIfDirty` (RFC-0644) for 1a, `executeKernelCommand` for 2a, `git add -A` pattern for 3a/4a. Alternatives section explains why extending `commitBordbuchProjections` was rejected (fragile whitelist).

- **F-4 (FAIL)**: The RFC proposes `--skip-auto-sync` is not mentioned, but `mission.close` already has `--skip-auto-archive` and `--skip-evidence-sync` escape hatches. For consistency and operator control, a `--skip-auto-sync` flag should be mentioned for the pre-mirror-check sync (2a), even if it defaults to active. The post-close sync (RFC-0762) is already non-fatal, but the pre-mirror-check sync is a new behavior that could benefit from an escape hatch.

- **F-5 (PASS)**: `packagesImpacted` lists only `@warpgogol/werkstatt` — correct. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

- **G-1 (FAIL)**: The RFC does not consider the case where `sternsystem.sync` itself creates a bordbuch entry (it does — `sternsystem-sync.ts:211-229` appends a bordbuch entry for mirror sync events). Running `sternsystem.sync` after the inline validate but before the mirror sync check means the sync's bordbuch entry creates *another* commit in the cache clone. This commit is pushed to origin by the sync itself, but if the sync's bordbuch commit happens *after* the sync updates `refs/mirror`, the mirror ref could still be behind origin. The RFC should verify that `sternsystem.sync` atomically updates `refs/mirror` *after* its own bordbuch commit, or explain why this is not a problem.

- **G-2 (PASS)**: Performance is addressed — `commitCacheCloneIfDirty` is O(n) where n = dirty files, negligible compared to the 2+ minute validate pipeline.

- **G-3 (FAIL)**: The RFC does not consider concurrent execution. If another agent or process creates commits in the cache clone between the pre-mirror-check sync (2a) and the mirror sync check (lines 332-350), the check could still fail. This is a narrow window (both are inside the lock), but the RFC should acknowledge it.

- **G-4 (PASS)**: Edge cases for empty states are implicitly covered — `commitCacheCloneIfDirty` returns `{ committed: false }` when nothing is dirty, same as `commitWorkpieceIfDirty`.

- **G-5 (PASS)**: No security/privacy implications — all changes are internal git operations on generated mirrors.

## Questions for the author

1. Fix 2a places `sternsystem.sync` before lock acquisition (line 210), but the mirror sync check is inside the lock (lines 332-350). Should the sync run *inside* the lock, after the pre-check push (line 293), to prevent race conditions? If so, the TypeScript contract in 2a needs to be updated.

2. `sternsystem.sync` itself appends a bordbuch entry (`sternsystem-sync.ts:211-229`) and commits it. Does the sync atomically update `refs/mirror` *after* its own bordbuch commit, or could the bordbuch commit create a new origin/mirror desync that triggers the check at lines 332-350?

3. Should a `--skip-auto-sync` flag be added to `mission.close` for consistency with `--skip-auto-archive` and `--skip-evidence-sync`, giving operators an escape hatch from the pre-mirror-check sync?
