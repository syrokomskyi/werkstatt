---
reviewId: REVIEW-CODE-2026-07-16-01
date: 2026-07-16
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 157ae3cbb...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/env/env-contract.ts
  - packages/os/site-kernel-checks/src/env/env-example.ts
  - packages/os/site-kernel-handoff/package.json
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - packages/os/site-kernel-handoff/src/werkstatt/atomic.ts
  - packages/os/site-kernel-onboarding/src/templates/runtime/gitignore.template
  - pnpm-lock.yaml
---

# Code Review: 157ae3cbb...HEAD (3 commits)

### Verdict: Needs revision

The diff introduces correct .env file generation during materialization and fixes a real ENV-CONTRACT-06 parser bug, but the `atomicMoveDir` rename-to-trash workaround has a missing CHANGE_SUMMARY entry (DNA-42) and no regression tests for either the parser fix or the atomic move change. The `atomic.ts` CHANGE_SUMMARY was not updated despite a material behavioral change.

### Mechanical floor

Pass — `pnpm --filter @gogol/site-kernel-handoff run build:check`, `pnpm --filter @gogol/site-kernel-checks run build:check`, and `pnpm --filter @gogol/site-kernel-onboarding run build:check` all pass. `env.contract.validate --json` reports 0 errors, 0 warnings.

### Axis A — Structural correctness

- **`readFileSync` in `mission-materialize.ts:236`** — The env copy step uses synchronous `readFileSync` while the rest of `generateFullBoilerplate` consistently uses async `fs` operations (`fs.mkdir`, `fs.writeFile` via `atomicWriteFile`). This is a minor inconsistency, not a bug, but mixing sync and async I/O in the same function is a Fowler Divergent Change signal.

- **Trash dir collision risk in `atomic.ts:76`** — `trashDir` uses `${process.pid}-${Date.now()}` which is the same pattern as `atomicWriteFile:19`. If two materialize operations run in the same process within the same millisecond (unlikely but possible in tests), the trash dir names collide. The guard at line 77-79 mitigates this by attempting `fs.rm` first, but the `catch(() => {})` silently swallows all errors including permission failures.

- **No regression tests** — Neither `env-contract.ts` (parser fix for ENV-CONTRACT-06) nor `atomic.ts` (rename-to-trash) have unit tests. The parser fix is a behavioral change to a workspace-scoped validator — a test with a sample `.env.example` fixture would prevent future regressions.

### Axis B — DNA alignment

- **DNA-40 (env-example) — Pass.** The diff correctly generates `.env.example` via `env.example.generate` and copies to `.env.main`/`.env.alt`. The `.gitignore` template correctly ignores `.env.main` and `.env.alt` while keeping `.env.example` tracked.

- **DNA-42 (Compass markup) — Fail.** `atomic.ts` has a material behavioral change (rename-to-trash strategy) but its `CHANGE_SUMMARY` at line 9 still lists only the original RFC-0362 entry. The new behavior should be documented as a `<item>` entry. `mission-materialize.ts` correctly added its RFC-0388 entry.

- **DNA-47 (Materialization) — Pass.** The `env.example.generate` generator is correctly added to the codegen sequence. The staging → workpiece commit via `atomicMoveDir(..., { replace: true })` is cleaner than the previous manual `fs.rm` + `atomicMoveDir` pattern.

- **DNA-51 (Werkstatt primitives) — Pass.** The `atomicMoveDir` change stays within the shared atomic helper. The `replace: true` option is used correctly, and the rename-to-trash strategy is a valid atomic primitive improvement.

### Axis C — Ecosystem fit

- **Package boundaries — Pass.** `@gogol/site-kernel-handoff` imports `runEnvExampleGenerate` from `@gogol/site-kernel-checks`, which is a valid `packages/os/* → packages/os/*` dependency. The workspace dependency was correctly added to `package.json`.

- **Pipeline placement — Pass.** `env.example.generate` is placed last in the generator sequence, after `i18n.middleware.generate`. This is correct because `env.example.generate` reads `env.schema.generated.mjs` which is produced by `api.routes.generate` earlier in the sequence.

- **Compass sync — Not checked.** No `docs/*.xml` files were modified. The diff is scoped to package internals and does not change repository-wide requirements or shared package contracts.

- **AGENTS.md updates — Not needed.** The diff does not introduce new rules or patterns; it implements existing RFC-0388/DNA-40 requirements.

### Axis D — Forward-only compliance

- **Pass.** The `atomicMoveDir` change replaces `fs.rm` with rename-to-trash directly — no dual-path or compatibility shim. The old `fs.rm(workpieceDir, ...)` call in `mission-materialize.ts` was removed and replaced with `atomicMoveDir(..., { replace: true })`.

### Axis E — Agent-facing clarity

- **`atomic.ts` CHANGE_SUMMARY — Fail.** As noted in Axis B, the CHANGE_SUMMARY does not mention the rename-to-trash change. An agent reading the file would not know the Windows EBUSY workaround exists or why it was added.

- **Comment quality — Pass.** The comments in `mission-materialize.ts:231-233` and `atomic.ts:72-75` clearly explain the rationale (RFC-0388/DNA-40 and Windows EBUSY respectively).

- **`env-contract.ts` parser change — Pass.** The `commentBlockStartLine` tracking is self-documenting through the variable name and the comment at line 141.

### Axis F — Pragmatism

- **Pass.** The `env.example.generate` addition reuses an existing command rather than creating a new one. The `.env.main`/`.env.alt` copy is a 4-line block, not an over-engineered abstraction. The `atomicMoveDir` fix is minimal and targeted.

- **Scope discipline — Pass.** The diff touches only what's necessary: env generation, gitignore, atomic move fix, and the parser fix. No scope creep.

### Axis G — Blind spots

- **Trash accumulation on Windows — Possible issue.** If `fs.rm(trashDir, ...)` at line 92 fails (EBUSY again on the trash dir itself), the trash directory accumulates. The comment says "trash will be cleaned up on next run or manually" but there is no mechanism to clean up stale trash dirs from previous failed runs. Consider adding a startup sweep for `*.trash-*` patterns in the parent directory.

- **Concurrent materialization — Not addressed.** If two `mission.materialize` commands run simultaneously for the same mission, they would race on the same `workpieceDir`. The lock acquisition in `runMissionMaterialize` should prevent this, but the `atomicMoveDir` change does not introduce additional guards. This is a pre-existing concern, not introduced by this diff.

- **`env.example.generate` skip behavior — Edge case.** `runEnvExampleGenerate` skips writing if a hand-edited `.env.example` exists without the GENERATED marker (RFC-0087 protocol). During materialization, the staging dir is always fresh, so this skip path is unlikely to trigger. However, if it does skip, the `.env.main` and `.env.alt` copy at line 235-238 would still proceed using the existing (possibly stale) `.env.example`. This is acceptable but worth noting.

### Spec compliance

No formal spec available beyond the user's session request. The user requested:

1. Generate `.env.example` with correct comments and "How to obtain" instructions — **Done** (22 keys generated, `env.contract.validate` passes with 0 errors).
2. Copy `.env.example` to `.env.alt` and `.env.main` — **Done** (lines 237-238 in `mission-materialize.ts`).
3. Fix `env.contract.validate` to green — **Done** (parser fix + env-example.ts fixes).

### Questions for the author

1. Why does `atomic.ts` CHANGE_SUMMARY not mention the rename-to-trash change? DNA-42 requires CHANGE_SUMMARY to stay current with code.
2. Are there regression tests planned for the `parseEnvExample` `commentBlockStartLine` fix? The parser is a workspace-scoped validator — a single fixture-based test would lock in the behavior.
3. What happens if `renameWithRetry(targetDir, trashDir)` at line 80 also fails with EBUSY after all 5 retries? The error propagates, but the staging dir is left in place — is that the intended recovery state?
