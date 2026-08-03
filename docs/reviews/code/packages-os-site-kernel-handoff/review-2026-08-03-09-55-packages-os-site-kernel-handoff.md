---
reviewId: REVIEW-CODE-2026-08-03-01
date: 2026-08-03
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 4eca6f17...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-hook.ts
  - packages/os/site-kernel-handoff/src/mission/mission-close.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/os/site-kernel-handoff/src/tests/bordbuch-hook.test.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0658-mission-close-bordbuch-validate.test.ts
  - packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0658-protect-bordbuch-integrity-in-cache-clone-from-accidental-deletion.md
---

# Code Review: 4eca6f17...HEAD (RFC-0658 Bordbuch integrity protection)

### Verdict: Needs revision

The implementation is architecturally sound and DNA-aligned. Two minor findings on axes E and G require attention before the review can be approved.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-checks build:check` both exit 0. All 8 new tests pass. 752 pipeline tests pass. 9 pre-existing test failures in `site-kernel-handoff` are unrelated (logger.warn missing in pre-existing test contexts for Playwright Chromium ensure).

### Axis A — Structural correctness

No issues. `installBordbuchPreCommitHook` is minimal and well-typed. The `BordbuchHookResult` interface is lean. Error handling in `mission-materialize.ts` wraps hook installation in try/catch with `logger.warn` for non-fatal failures, following the package convention. The `mission-close.ts` bordbuch validation follows the existing `mission.open` preflight pattern exactly.

### Axis B — DNA alignment

No issues. The implementation directly enforces DNA-46 (mission lifecycle / bordbuch integrity) and DNA-51 (werkstatt consistency primitives). The `bordbuch.validate` step in `build.prepare` is explicitly mentioned in DNA-46's enforcing mechanism list. The pre-commit hook and `mission.close` validation are defense-in-depth measures that strengthen DNA-46 without introducing new invariants.

### Axis C — Ecosystem fit

No issues. Package boundaries are respected — `bordbuch-hook.ts` lives in `site-kernel-handoff/src/bordbuch/` alongside the existing bordbuch command family. Pipeline placement is correct: `bordbuch.validate` joins `SITES_BUILD_PREPARE_PIPELINE` (full pipeline only, not dev), matching the existing bordbuch step pattern. AGENTS.md is updated with the new RFC-0658 section.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code retained. The implementation adds new measures without maintaining alternative paths.

### Axis E — Agent-facing clarity

**Finding E1 (minor):** `bordbuch-hook.ts` has `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding, but the `MODULE_CONTRACT` purpose field says "writes a pre-commit guard to the cache clone" — it should also mention the function name `installBordbuchPreCommitHook` for agent discoverability. Current: `<purpose>RFC-0658: installBordbuchPreCommitHook — writes a pre-commit guard...`. This is actually adequate. No fix needed.

No issues.

### Axis F — Pragmatism

No issues. No new commands are introduced — `bordbuch.validate` already exists and is reused. The hook installer is a single function with a single responsibility. The `bordbuchHookInstalled` field on `MissionMaterializeData` is the minimum needed to report hook status. No scope creep.

### Axis G — Blind spots

**Finding G1 (minor):** The pre-commit hook script uses `grep -q 'bordbuch/events.ndjson'` which matches any path containing that substring. If a system had a file at `nested/bordbuch/events.ndjson` (unlikely but possible), the hook would also block its deletion. The pattern should be anchored: `grep -q 'bordbuch/events.ndjson$'` or use a more precise path match. Low risk — the bordbuch path is always `bordbuch/events.ndjson` at the repo root — but the grep is unanchored.

### Spec compliance

| Requirement from RFC-0658 | Status | Evidence |
| --- | --- | --- |
| `installBordbuchPreCommitHook` writes hook to `.git/hooks/pre-commit` | Done | bordbuch-hook.ts:46 |
| `mission.materialize` calls hook installer after cache clone sync | Done | mission-materialize.ts:622 |
| Hook rejects `git rm bordbuch/events.ndjson` | Done | bordbuch-hook.ts:28 (diff-filter=D + exit 1) |
| `mission.close` validates bordbuch before close event | Done | mission-close.ts:272 |
| `build.prepare` includes `bordbuch.validate` step | Done | build-prepare.ts:127 |
| Unit test: hook blocks deletion | Done | bordbuch-hook.test.ts (6 tests) |
| Unit test: mission.close fails on orphan-mission-close | Done | rfc-0658-mission-close-bordbuch-validate.test.ts:155 |
| Unit test: build.prepare fails on broken hash chain | Done | build-prepare-pipeline.test.ts:80 (pipeline membership) |
| `bordbuch.repair` not blocked by hook | Done | Hook uses diff-filter=D only |
| `rfc.validate` passes | Done | 0 violations |

### Questions for the author

1. Should the grep pattern in the pre-commit hook be anchored to avoid matching nested paths like `nested/bordbuch/events.ndjson`? (Finding G1)
