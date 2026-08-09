---
rfcId: RFC-0697
planId: PLAN-RFC-0697-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - docs/rfcs/rfc-0697-log-cache-dir-size-before-clearing-and-extract-shared-snap-01-helper.md
---

# Implementation Plan: RFC-0697

## 1. Objectives

- [ ] O1 — `leitstand.dev-deploy` logs cache file count and total size before clearing (maps to acceptance criterion: "leitstand.dev-deploy logs cache file count and total size before clearing")
- [ ] O2 — `orchestrateSnap01Recovery` shared helper exists in `snapshot-auto-regen.ts` (maps to: "orchestrateSnap01Recovery shared helper exists in snapshot-auto-regen.ts")
- [ ] O3 — `leitstand.dev-deploy` uses `orchestrateSnap01Recovery` for all 3 SNAP-01 paths (maps to: "leitstand.dev-deploy uses orchestrateSnap01Recovery instead of inline SNAP-01 logic")
- [ ] O4 — `mission.validate` uses `orchestrateSnap01Recovery` with caller-side `dirtyBeforeBuildPost` check (maps to: "mission.validate uses orchestrateSnap01Recovery instead of inline SNAP-01 logic")
- [ ] O5 — No duplicated SNAP-01 detection + re-build code between the two callers (maps to: "No duplicated SNAP-01 detection + re-build code between the two callers")
- [ ] O6 — Existing tests pass + new test for cache size logging (maps to: "Existing tests pass" + "New test case for cache size logging")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/snapshot-auto-regen.ts` — add `Snap01OrchestrationOptions`, `Snap01OrchestrationResult`, `orchestrateSnap01Recovery`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — add `logCacheDirSize`, refactor 3 SNAP-01 paths to use `orchestrateSnap01Recovery`
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — refactor `runMissionValidate` SNAP-01 path to use `orchestrateSnap01Recovery`
- `packages/os/site-kernel-handoff/src/tests/leitstand-0689-cache-snapshot.test.ts` — add cache size logging test, update existing tests for helper usage
- `packages/os/site-kernel-handoff/src/tests/mission-validate-snapshot-auto-regen.test.ts` — update existing tests for helper usage

### 2.2 Configuration and data

None — no config or schema changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0697-*.md` — read-only reference (acceptance criteria source of truth)
- No AGENTS.md updates needed — no new modules, commands, or ownership changes
- No `docs/*.xml` Compass sync needed — no repository-wide semantics changed
- No `docs/architecture-dna.md` changes — no DNA invariants introduced

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0697` — RFC validation

## 3. Step sequence

### Step 1. Add `orchestrateSnap01Recovery` shared helper

**Goal:** Create the shared helper in `snapshot-auto-regen.ts` that encapsulates detect → regenerate → (optional) rebuild orchestration.

**Agent actions:**

- Add `Snap01OrchestrationOptions` interface with `validateFn: () => Promise<unknown>` (required) and `rebuildFn?: () => Promise<void>` (optional)
- Add `Snap01OrchestrationResult` interface with `regenerated: boolean`, `rebuildSucceeded?: boolean`, `error?: string`
- Implement `orchestrateSnap01Recovery`: call `validateFn()`, run `detectSnap01()` on result, if SNAP-01 detected call `autoRegenerateSnapshotOnSnap01()`, if regenerated and `rebuildFn` provided call it and set `rebuildSucceeded`, return result
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` in file header

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `orchestrateSnap01Recovery` function exists and typechecks with the interfaces defined in the RFC.

**Human review:** no

---

### Step 2. Add `logCacheDirSize` and refactor `leitstand.dev-deploy` SNAP-01 paths

**Goal:** Add cache size logging before clearing and replace all 3 inline SNAP-01 paths in `leitstand-commands.ts` with calls to `orchestrateSnap01Recovery`.

**Agent actions:**

- Add `logCacheDirSize(cacheDir: string, logger)` function using `readdirSync` + `statSync` with try/catch (non-fatal)
- Call `logCacheDirSize` before `fs.rm(axiomCacheDir, ...)` at the cache clearing block (~line 1115)
- Refactor build-failure SNAP-01 path (~lines 805-857): replace inline `detectSnap01` + `autoRegenerateSnapshotOnSnap01` + `execSync("pnpm build")` with `orchestrateSnap01Recovery({ validateFn, rebuildFn })`
- Refactor build-skip SNAP-01 path (~lines 747-781): replace inline `detectSnap01` + `autoRegenerateSnapshotOnSnap01` with `orchestrateSnap01Recovery({ validateFn })` (no `rebuildFn`)
- Update `CHANGE_SUMMARY` in file header with RFC-0697 entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — existing leitstand-0689 tests pass

**Completion criterion:** All 3 SNAP-01 paths in `leitstand-commands.ts` call `orchestrateSnap01Recovery`; cache size is logged before clearing; typecheck and existing tests pass.

**Human review:** no

---

### Step 3. Refactor `mission.validate` SNAP-01 path

**Goal:** Replace inline SNAP-01 logic in `runMissionValidate` with `orchestrateSnap01Recovery`, keeping `dirtyBeforeBuildPost` check caller-side.

**Agent actions:**

- In `mission-materialization-commands.ts`, refactor the SNAP-01 block (~lines 447-495): keep the `dirtyBeforeBuildPost` check before the helper call, then call `orchestrateSnap01Recovery({ validateFn, rebuildFn })` where `validateFn` returns the pipeline step data and `rebuildFn` re-runs `executeKernelPipeline({ pipelineName: "build.post" })`
- Update `CHANGE_SUMMARY` in file header with RFC-0697 entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — existing mission-validate-snapshot-auto-regen tests pass

**Completion criterion:** `runMissionValidate` calls `orchestrateSnap01Recovery` instead of inline SNAP-01 logic; `dirtyBeforeBuildPost` check remains caller-side; typecheck and existing tests pass.

**Human review:** no

---

### Step 4. Add cache size logging test and update existing tests

**Goal:** Add a test case verifying cache size logging and update existing tests to verify helper usage.

**Agent actions:**

- In `leitstand-0689-cache-snapshot.test.ts`, add a test that creates cache files of known sizes, runs `leitstand.dev-deploy`, and verifies `logCacheDirSize` was called (via mock or spy on `logger.info`)
- Update existing SNAP-01 tests to verify `orchestrateSnap01Recovery` is called instead of inline `detectSnap01` + `autoRegenerateSnapshotOnSnap01`
- In `mission-validate-snapshot-auto-regen.test.ts`, update tests to verify `orchestrateSnap01Recovery` is called instead of inline logic

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass including new test

**Completion criterion:** New cache size logging test passes; all existing tests pass with helper usage verified.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify no `AGENTS.md` or `docs/*.xml` updates are needed (no new commands, no DNA changes, no ownership changes)
- Run `pnpm exec werkstatt run command.manifest.generate` if command surfaces changed (they did not — `commands.changed` only, no new commands)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0697 --implementation-commit <sha>` (use the first implementation commit SHA).

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0697` — passes with zero errors
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — passes
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; code review passed.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0697`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0697` in the subject line (RFC-0265 commit hygiene)
- No `rfc.verification.emit` needed — acceptance probes are commented out in RFC frontmatter

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `readdirSync` performance on large caches | Step 2: cache is cleared every deploy, should not accumulate thousands of files; non-fatal try/catch |
| Shared helper API stability | Step 1: interface uses dependency injection (`validateFn`, optional `rebuildFn`), flexible for different callers |
| Refactoring breaks existing tests | Steps 2-3: run existing tests after each refactoring step; fix before proceeding |
| `dirtyBeforeBuildPost` check lost during refactoring | Step 3: explicitly keep the check caller-side in `mission.validate` before calling the helper |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0697 --reason "..." --invariant "DNA-N"` instead of working around it.
