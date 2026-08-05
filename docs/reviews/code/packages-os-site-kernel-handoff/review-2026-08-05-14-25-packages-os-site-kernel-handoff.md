---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: bf7da41c...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0698-dev-deploy-auto-commit.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0698-auto-commit-generated-artifacts-after-leitstand-dev-deploy-build.md
---

# Code Review: bf7da41c...HEAD (RFC-0698 implementation)

## Verdict: Needs revision

The implementation is architecturally sound — DNA-aligned, forward-only, well-tested. Two minor findings: duplicated error return blocks (Axis A) and a misleading mock summary in the failure test (Axis E). Neither blocks functionality, but both should be cleaned up before merging.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-handoff test` (603 tests, 0 failures) both pass. `rfc.validate --id RFC-0698` passes with 0 errors and 0 warnings.

## Axis A — Structural correctness

**Finding A1 — Duplicated error return blocks.** The two error return blocks at `leitstand-commands.ts:943-972` (non-zero exit) and `leitstand-commands.ts:993-1022` (crash) are structurally identical except for the `error` field text (`"auto-commit failed"` vs `"auto-commit crashed"`) and the `summary` string. This is a Duplicated Code smell. Consider extracting a helper like `makeAutoCommitDeployError(systemId, missionId, commitSha, buildState, buildSkipped, channelConfig, errorType, summary)` to reduce the 60 duplicated lines to two call sites. Note: the existing function already has similar duplication for build-failure and dist-not-found returns, so this follows the existing pattern — but the pattern itself is a smell.

## Axis B — DNA alignment

No issues. DNA-46 (Mission lifecycle): auto-commit ensures clean workpiece state after dev-deploy, supporting reliable state transitions. DNA-51 (Werkstatt consistency primitives): uses `mission.git.commit` via `executeKernelCommand`, which uses shared lock/idempotency primitives.

## Axis C — Ecosystem fit

No issues. Uses dynamic `import("@warpgogol/site-kernel")` — same pattern as existing `methodologies.validate`, `axiom.report`, `evidence.sync` calls in the same function. Package boundaries respected. AGENTS.md updated. No new commands — `leitstand.dev-deploy` is in `commands.changed`.

## Axis D — Forward-only compliance

No issues. Old cache write locations (lines 804-811 and 853-860) were removed and replaced with a single post-commit write. No dual paths, no compatibility shims.

## Axis E — Agent-facing clarity

**Finding E1 — Misleading mock summary in failure test.** In `rfc-0698-dev-deploy-auto-commit.test.ts:168`, the failure test sets `commitMockSummary = "mission.git.commit: nothing to commit"`. "Nothing to commit" implies a successful no-op (exit code 0), not a failure (exit code 1). A reader might confuse this with the idempotent skip path. The summary should describe an actual failure, e.g. `"mission.git.commit: pre-commit validation failed"` or `"mission.git.commit: git lock contention"`.

New test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Log messages are descriptive. Variable names are clear.

## Axis F — Pragmatism

No issues. Uses existing `mission.git.commit` command — no new command. Change is minimal: auto-commit block + cache write relocation. Follows existing `executeKernelCommand` pattern in the same function.

## Axis G — Blind spots

No issues. Performance: auto-commit adds one `executeKernelCommand` call (fast — generated files don't match validator prefixes) and one `git rev-parse HEAD`. Edge cases: clean workpiece (idempotent skip), commit failure (fatal abort), build-skip path (auto-commit still runs) — all covered by tests. Concurrent execution: `mission.git.commit` uses its own lock primitives. Interrupted operations: if auto-commit succeeds but deploy fails after, the workpiece has a new commit — correct behavior.

## Spec compliance

| Requirement from RFC-0698 | Status | Evidence |
| --- | --- | --- |
| Auto-commit after build, before distTreeHash | Done | leitstand-commands.ts:927-939 |
| Re-read commitSha after auto-commit | Done | leitstand-commands.ts:974-984 |
| Fatal error on commit failure | Done | leitstand-commands.ts:940-972 |
| Idempotent skip when clean | Done | leitstand-commands.ts:985-989 |
| Cache written after auto-commit with post-commit sha | Done | leitstand-commands.ts:1025-1035 |
| Build-skip path also auto-commits | Done | leitstand-commands.ts:927 (after both build paths) |
| AGENTS.md updated | Done | packages/os/site-kernel-handoff/AGENTS.md:41 |
| Unit tests (dirty, clean, failure, build-skip) | Done | rfc-0698-dev-deploy-auto-commit.test.ts (4 tests) |

## Questions for the author

1. Should the duplicated error return blocks (A1) be extracted into a helper, or is the duplication acceptable because it matches the existing pattern in `runLeitstandDevDeploy`?
2. Should the failure test mock summary (E1) be changed to a more realistic failure message?
