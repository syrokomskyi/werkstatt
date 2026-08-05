---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 3aafe90b...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/snapshot-auto-regen.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0689-cache-snapshot.test.ts
  - docs/rfcs/rfc-0697-log-cache-dir-size-before-clearing-and-extract-shared-snap-01-helper.md
---

# Code Review: RFC-0697 implementation (3aafe90b...HEAD)

## Verdict: Approved

The diff cleanly implements RFC-0697: it adds a shared `orchestrateSnap01Recovery` helper with dependency-injected `validateFn`/`rebuildFn`, replaces all inline SNAP-01 orchestration in both callers, and adds cache size logging before clearing. No findings across any axis.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff run build:check` (tsc --noEmit) exits 0. `pnpm --filter @warpgogol/site-kernel-handoff run test` — 599 passed, 2 skipped. `rfc.validate --id RFC-0697` — 0 errors, 1 expected warning (V-19 amending RFC backref).

## Axis A — Structural correctness

No issues.

- **Strict typing**: `Snap01OrchestrationOptions` and `Snap01OrchestrationResult` are properly typed interfaces. `validateFn: () => Promise<unknown>` is intentional — different callers return different data shapes, and `detectSnap01` handles `unknown` safely via `SnapshotDiagnostics` narrowing. No `any` introduced.
- **Minimalism**: The helper is minimal — detect → regenerate → optional rebuild. No speculative generality.
- **Dead code**: `detectSnap01` and `autoRegenerateSnapshotOnSnap01` remain exported and are used internally by `orchestrateSnap01Recovery`. No unused exports.
- **Error handling**: `logCacheDirSize` swallows errors silently per RFC spec (non-fatal). `orchestrateSnap01Recovery` wraps `validateFn` and `rebuildFn` in try/catch with descriptive error messages. The `rebuildFn` failure sets `rebuildSucceeded: false` and returns the error string — callers can distinguish regeneration success from rebuild failure.
- **Fowler code smells**: The duplicated SNAP-01 orchestration (the original smell) is now extracted. No new smells introduced.

## Axis B — DNA alignment

No issues.

- **DNA-42 (Compass markup)**: All modified source files have `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. `CHANGE_SUMMARY` updated with RFC-0697 entries in `snapshot-auto-regen.ts:10`, `leitstand-commands.ts:28`, `mission-materialization-commands.ts:27`. Test file has `CHANGE_SUMMARY` updated at line 8.
- **DNA-49 (Fleet propagation/Leitstand)**: `leitstand.dev-deploy` behavior unchanged — same cache clearing, same snapshot regeneration, same re-build logic. Only refactored to use shared helper.
- **DNA-47 (Materialization)**: `mission.validate` behavior unchanged — `dirtyBeforeBuildPost` check remains caller-side as specified.

## Axis C — Ecosystem fit

No issues.

- **Package boundaries**: No new cross-package imports. `leitstand-commands.ts` imports from `../mission/snapshot-auto-regen.ts` — same package, import already existed.
- **Pipeline placement**: No new pipeline steps or checks.
- **Compass sync**: No `docs/*.xml` changes needed — no repository-wide semantics changed.
- **AGENTS.md updates**: No new rules or patterns introduced.
- **Command lifecycle**: No new commands. `commands.changed` only (`leitstand.dev-deploy`, `mission.validate`) — behavior unchanged.

## Axis D — Forward-only compliance

No issues.

- Old inline `detectSnap01` + `autoRegenerateSnapshotOnSnap01` + rebuild logic is deleted from both callers, replaced with `orchestrateSnap01Recovery` calls. No dual-paths, no compatibility shims.
- Unused imports (`detectSnap01`, `autoRegenerateSnapshotOnSnap01`) removed from both `leitstand-commands.ts` and `mission-materialization-commands.ts`.

## Axis E — Agent-facing clarity

No issues.

- `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated in all modified files.
- Variable names are clear: `snapResult`, `validateFn`, `rebuildFn`, `logCacheDirSize`.
- Log messages carry context: `[leitstand.dev-deploy] Axiom cache: N file(s), X.X MiB — clearing…`.
- RFC comments updated from `RFC-0689:` to `RFC-0689/RFC-0697:` where the code was modified.

## Axis F — Pragmatism

No issues.

- **Lean contracts**: `Snap01OrchestrationOptions` has exactly 6 fields — all used. `rebuildFn` is optional as specified (build-skip path omits it).
- **Existing patterns**: Extends existing `snapshot-auto-regen.ts` module rather than creating a new one.
- **Scope discipline**: Only touches the 3 source files + 1 test file + RFC doc. No scope creep.

## Axis G — Blind spots

No issues.

- **Performance**: `logCacheDirSize` uses sync `readdirSync` + `statSync` — explicitly justified in RFC (cache dir is small, one-time read before `rm -rf`). Non-fatal try/catch.
- **Edge cases**: Empty cache dir → `readdirSync` returns `[]`, loop doesn't execute, logs `0 file(s), 0.0 MiB`. Missing cache dir → `existsSync` guard prevents call. `validateFn` returning `undefined` → `detectSnap01(undefined)` returns `false` safely.
- **Migration path**: N/A — pure refactoring, no behavior change.

## Spec compliance

| Requirement from RFC-0697 | Status | Evidence |
| --- | --- | --- |
| Log cache file count and total size before clearing | Done | `leitstand-commands.ts:88` `logCacheDirSize`, called at `:1129` before `fs.rm` |
| `orchestrateSnap01Recovery` shared helper in `snapshot-auto-regen.ts` | Done | `snapshot-auto-regen.ts:83` with interfaces at `:68`/`:77` |
| `leitstand.dev-deploy` uses helper for all SNAP-01 paths | Done | `leitstand-commands.ts:771` (build-skip), `:827` (build-failure) |
| `mission.validate` uses helper with caller-side `dirtyBeforeBuildPost` | Done | `mission-materialization-commands.ts:414` (dirty check), `:460` (helper call) |
| No duplicated SNAP-01 detection + re-build code | Done | Both callers import only `orchestrateSnap01Recovery`; `detectSnap01`/`autoRegenerateSnapshotOnSnap01` no longer imported directly |
| Existing tests pass | Done | 599 passed, 2 skipped |
| New test for cache size logging | Done | `leitstand-0689-cache-snapshot.test.ts:351` |
| `rfc.validate` passes | Done | 0 errors, 1 expected warning V-19 |

## Questions for the author

No questions — the implementation is clean and matches the RFC specification exactly.
