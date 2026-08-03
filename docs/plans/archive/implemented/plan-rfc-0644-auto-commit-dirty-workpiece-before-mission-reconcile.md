---
rfcId: RFC-0644
planId: PLAN-RFC-0644-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0644

## 1. Objectives

- [ ] Objective 1 — Implement `commitWorkpieceIfDirty` helper that auto-commits all uncommitted changes in the workpiece git repository (maps to acceptance criterion: helper implemented)
- [ ] Objective 2 — Replace the existing `isWorkpieceDirty` block-and-throw guard in `runMissionReconcile` with the auto-commit call (maps to acceptance criterion: `runMissionReconcile` calls helper before fetch)
- [ ] Objective 3 — Extend `MissionReconcileData` interface with `workpieceAutoCommitted` and `workpieceCommitSha` fields (maps to acceptance criterion: output includes new fields)
- [ ] Objective 4 — Ensure idempotent behavior: clean workpiece produces no commit (maps to acceptance criterion: idempotent skip)
- [ ] Objective 5 — Write unit tests for dirty and clean workpiece scenarios (maps to acceptance criteria: unit tests)
- [ ] Objective 6 — Update `AGENTS.md` documentation for the new auto-commit behavior (maps to acceptance criterion: `mission.validate` passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` — add `commitWorkpieceIfDirty` helper (colocated with `isWorkpieceDirty`)
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — replace guard at lines 893-898 with `commitWorkpieceIfDirty` call, extend `MissionReconcileData` interface, import helper from `mission-git-commit.ts`, update `mission.validate` warnings
- No new CLI commands. `mission.reconcile` is the only changed command.

### 2.2 Configuration and data

- No YAML/JSON/NDJSON changes.
- No ontology catalog changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update "Reconcile dirty cache clone guard" section (lines 174-188) to document workpiece auto-commit behavior replacing the blocking guard.
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — update `mission.validate` dirty workpiece warnings (lines 274-279, 548-553) to mention that reconcile will auto-commit.

### 2.4 Validation and pipelines

- No pipeline changes. `mission.reconcile` is a standalone lifecycle command.
- No CI workflow changes.

## 3. Step sequence

### Step 1. Implement `commitWorkpieceIfDirty` helper

**Goal:** Add the helper function that auto-commits all uncommitted changes in the workpiece git repository.

**Agent actions:**

- Add `commitWorkpieceIfDirty` function to `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` (colocated with `isWorkpieceDirty` and other workpiece git helpers).
- The helper signature:
  ```ts
  async function commitWorkpieceIfDirty(
    workpieceDir: string,
    missionId: string,
  ): Promise<{ committed: boolean; commitSha: string | null }>;
  ```
- Implementation: use `isWorkpieceDirty` (in the same file) to check if dirty. If clean, return `{ committed: false, commitSha: null }`. If dirty, run `git add -A` then `git commit --no-verify -m "workpiece: auto-commit before reconcile <missionId>"` via `execSync`. Return `{ committed: true, commitSha: <rev-parse HEAD> }`.
- Use `execSync` directly (consistent with existing git operations in the file) with `cwd: workpieceDir`, `stdio: "pipe"`, `encoding: "utf-8"`.
- Add RFC-0644 entry to `<CHANGE_SUMMARY>` block at top of file.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes.

**Completion criterion:** Helper function exists in `mission-git-commit.ts`, typechecks, and follows the RFC contract signature. Exported from the module.

**Human review:** no

---

### Step 2. Extend `MissionReconcileData` interface

**Goal:** Add `workpieceAutoCommitted` and `workpieceCommitSha` fields to the reconcile output data.

**Agent actions:**

- Add two fields to `MissionReconcileData` interface (line 799-806):
  ```ts
  workpieceAutoCommitted: boolean;
  workpieceCommitSha: string | null;
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes.

**Completion criterion:** Interface extended with both fields, typechecks.

**Human review:** no

---

### Step 3. Replace blocking guard with auto-commit call in `runMissionReconcile`

**Goal:** Replace the existing `isWorkpieceDirty` block-and-throw guard (lines 893-898) with the `commitWorkpieceIfDirty` call.

**Agent actions:**

- Add `commitWorkpieceIfDirty` to the import from `./mission-git-commit.ts` (line 44).
- Remove the existing guard:
  ```ts
  const dirtyCheck = isWorkpieceDirty(workpieceDir);
  if (dirtyCheck.dirty) {
    throw new Error(
      `[mission.reconcile] workpiece has ${dirtyCheck.fileCount} uncommitted file(s). Run \`pnpm exec site-kernel run mission.git.commit --mission ${missionId} --message "<msg>"\` first, then re-run reconcile.`,
    );
  }
  ```
- Replace with:
  ```ts
  const workpieceCommit = await commitWorkpieceIfDirty(workpieceDir, missionId);
  if (workpieceCommit.committed) {
    logger.info(
      `  Auto-committed dirty workpiece (${workpieceCommit.commitSha?.slice(0, 8)}) before reconcile`,
    );
  }
  ```
- The call goes **after lock acquisition** (lines 843-856) and **after the validation evidence check** (lines 834-870), replacing the guard at line 893. This is the same position as the existing guard — inside the `try` block, before `git fetch`.
- Store `workpieceCommit` in a variable accessible to the return statement at the end of the handler.
- Add `workpieceAutoCommitted: workpieceCommit.committed` and `workpieceCommitSha: workpieceCommit.commitSha` to the `data` field of the return object (around line 1170-1177).
- Add the auto-commit suffix to the `summary` string when `workpieceCommit.committed` is true.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes.
- Verify `isWorkpieceDirty` import is still needed in `mission-materialization-commands.ts` (it's still used in `mission.validate` at lines 274, 406, 548, 558).

**Completion criterion:** The blocking guard is removed; `commitWorkpieceIfDirty` is called in its place; output includes the new fields.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Create unit tests for the auto-commit behavior covering dirty and clean workpiece scenarios.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/rfc-0644-workpiece-auto-commit.test.ts`.
- Follow the test pattern from `rfc-0568-clone-reconcile.test.ts` and `rfc-0584-bordbuch-conflict-autoresolve.test.ts`: create temp dirs, cache clone, workpiece via `git clone`, set up git config, simulate scenarios.
- Test cases (helper-level, following `rfc-0568` and `rfc-0584` pattern):
  1. **Dirty workpiece → auto-commit created**: create a workpiece repo, modify a file (simulating `build.prepare` output), call `commitWorkpieceIfDirty` directly, verify `committed: true` and `commitSha` is non-null, verify `git log` shows the commit with the expected message prefix.
  2. **Clean workpiece → no auto-commit**: create a workpiece repo, make no changes, call `commitWorkpieceIfDirty`, verify `committed: false` and `commitSha: null`, verify no new commit in `git log`.
  3. **Idempotent re-run**: call `commitWorkpieceIfDirty` twice on a clean workpiece, verify second call returns `committed: false`.
- Use `execSync` for git operations in test setup (following the existing test pattern).
- Use `beforeEach`/`afterEach` for temp dir creation and cleanup.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass.

**Completion criterion:** All 3 test cases pass; test file follows existing naming convention (`rfc-NNNN-*.test.ts`).

**Human review:** no

---

### Step 5. Update AGENTS.md documentation

**Goal:** Update the `packages/os/site-kernel-handoff/AGENTS.md` to document the new workpiece auto-commit behavior.

**Agent actions:**

- In the "Reconcile dirty cache clone guard, untracked file investigation, and releaseId tracking (RFC-0522, RFC-0568)" section (lines 174-188):
  - Update the first bullet point to document that `mission.reconcile` now **auto-commits** the workpiece before fetch (replacing the previous blocking guard), citing RFC-0644.
  - Add a note that the auto-commit uses `git add -A` + `git commit --no-verify` with message prefix `workpiece: auto-commit before reconcile`.
  - Add a note that the output includes `workpieceAutoCommitted` and `workpieceCommitSha` fields.
- Update the `mission.validate` dirty workpiece warnings (lines 274-279, 548-553 in `mission-materialization-commands.ts`) to mention that reconcile will auto-commit. E.g. `workpiece has N uncommitted file(s) — reconcile will auto-commit these before merge.`
- Add RFC-0644 to the `<CHANGE_SUMMARY>` block in `mission-materialization-commands.ts` (done in Step 1, verify here).

**Validation:**

- Visual inspection — AGENTS.md section updated with RFC-0644 reference.

**Completion criterion:** AGENTS.md documents the auto-commit behavior and references RFC-0644.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files — `packages/os/site-kernel-handoff/AGENTS.md` (done in Step 5, verify).
- No `docs/*.xml` Compass files need synchronization — no repository-wide semantics changed.
- No `docs/architecture-dna.md` changes — no new DNA invariant.
- Run `pnpm exec site-kernel run command.manifest.generate` if command surfaces changed — no new commands, no manifest regeneration needed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0644 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0644`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0644`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0644` in the subject line (RFC-0265 commit hygiene)
- Test file `packages/os/site-kernel-handoff/src/mission/rfc-0644-workpiece-auto-commit.test.ts` with 3 passing test cases

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Capturing unfinished manual edits via `git add -A` | Step 3: commit message prefix `workpiece: auto-commit before reconcile` is self-documenting; operator can `git reset --soft HEAD~1` |
| Pre-commit hook bypass (`--no-verify`) | Step 1: `--no-verify` is intentional — workpieces are clones where hooks are not copied by `git clone`; validation gate at lines 834-870 ensures content was already validated |
| Agent confusion from unexpected commits | Step 3: `logger.info` logs the auto-commit; commit message prefix is self-documenting |
| Bypass of RFC-0594 pre-commit content validators | Step 3: `mission.validate` runs all content validators before reconcile is allowed — the validation gate ensures the workpiece has already passed `app.contract.full` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-51, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0644 --reason "..." --invariant "DNA-N"` instead of working around it.
