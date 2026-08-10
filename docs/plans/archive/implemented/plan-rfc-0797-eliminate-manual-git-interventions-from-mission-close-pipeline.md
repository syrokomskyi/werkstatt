---
rfcId: RFC-0797
planId: PLAN-RFC-0797-01
status: draft
owner: architecture
createdAt: 2026-08-10
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - AGENTS.md
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0797

## 1. Objectives

- [ ] O1 — `mission.close` auto-commits dirty workpiece via `commitWorkpieceIfDirty` instead of throwing (maps to AC-1)
- [ ] O2 — `mission.close` calls `sternsystem.sync` inside lock, after pre-check push, before mirror sync check, when external mirrors configured and `--skip-auto-sync` not set (maps to AC-2, AC-3)
- [ ] O3 — `mission.close` no longer throws false "external mirrors are out of sync" from inline validate's bordbuch commits (maps to AC-4)
- [ ] O4 — `mission.reconcile` auto-commits known generated files in cache clone via `commitCacheCloneIfDirty` before dirty guard (maps to AC-5, AC-6)
- [ ] O5 — `mission.validate` post-validate cleanup uses `commitCacheCloneIfDirty` instead of `commitBordbuchProjections` (maps to AC-7)
- [ ] O6 — `commitCacheCloneIfDirty` helper added to `mission-git-commit.ts` (maps to AC-8)
- [ ] O7 — Root `AGENTS.md` and `packages/werkstatt/AGENTS.md` updated (maps to AC-9, AC-10)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/mission/mission-git-commit.ts` — add `commitCacheCloneIfDirty` helper alongside existing `commitWorkpieceIfDirty`
- `packages/werkstatt/src/mission/mission-close.ts` — replace dirty workpiece guard with auto-commit (1a); add pre-mirror-check `sternsystem.sync` inside lock (2a); add `--skip-auto-sync` flag
- `packages/werkstatt/src/mission/mission-materialization-commands.ts` — add `commitCacheCloneIfDirty` call before dirty guard in `runMissionReconcile` (3a); replace `commitBordbuchProjections` with `commitCacheCloneIfDirty` in post-validate cleanup (4a)
- `packages/werkstatt/src/tests-handoff/rfc-0797-eliminate-manual-git-interventions.test.ts` — new test file

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — External mirror sync section: document pre-mirror-check sync (new) alongside post-close sync (existing)
- `packages/werkstatt/AGENTS.md` — Document `commitCacheCloneIfDirty` helper
- No `docs/*.xml` Compass files require synchronization
- No `docs/architecture-dna.md` changes (no new DNA invariant)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests (including new RFC-0797 tests)
- `pnpm exec werkstatt run rfc.validate --id RFC-0797` — RFC validation

## 3. Step sequence

### Step 1. Add `commitCacheCloneIfDirty` helper to `mission-git-commit.ts`

**Goal:** Create the reusable helper that auto-commits all dirty files in a cache clone using `git add -A`.

**Agent actions:**

- Add `commitCacheCloneIfDirty(systemDir: string, systemId: string): WorkpieceCommitResult` to `packages/werkstatt/src/mission/mission-git-commit.ts`
- Implementation: call `isWorkpieceDirty(systemDir)`, if dirty run `git add -A` + `git commit --no-verify -m "cache-clone: auto-commit generated files before reconcile ${systemId}"`, return `{ committed: true, commitSha }` or `{ committed: false, commitSha: null }`
- Reuse the existing `WorkpieceCommitResult` type
- Add `RFC-0797` entry to `CHANGE_SUMMARY` in the file header

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `commitCacheCloneIfDirty` function exists, is exported, and typecheck passes.

**Human review:** no

---

### Step 2. Fix 1a: Auto-commit dirty workpiece in `mission.close`

**Goal:** Replace the dirty workpiece guard with `commitWorkpieceIfDirty` call.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-close.ts`:
  - Add `commitWorkpieceIfDirty` to the import from `./mission-git-commit.ts` (line 49, already imports `isWorkpieceDirty`)
  - Replace lines 254-259 (dirty check + throw) with:
    ```ts
    const workpieceCommit = commitWorkpieceIfDirty(workpieceDir, missionId);
    if (workpieceCommit.committed) {
      logger.info(`  Auto-committed dirty workpiece (${workpieceCommit.commitSha?.slice(0, 8)}) before close`);
    }
    ```
- Add `RFC-0797` entry to `CHANGE_SUMMARY` in the file header

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes
- `isWorkpieceDirty` import is still used by other code in the file (mirror sync check) — verify no unused import warning

**Completion criterion:** `mission.close` no longer throws on dirty workpiece; `commitWorkpieceIfDirty` is called instead; typecheck passes.

**Human review:** no

---

### Step 3. Fix 2a: Add pre-mirror-check `sternsystem.sync` and `--skip-auto-sync` flag in `mission.close`

**Goal:** Add `sternsystem.sync` call inside the lock, after the pre-check push (line 293), before the mirror sync check (line 332). Add `--skip-auto-sync` flag.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-close.ts`:
  - Add `const skipAutoSync = flagBoolean(input, "skip-auto-sync");` alongside `skipEvidenceSync` and `skipAutoArchive` (line 177-178)
  - After the pre-check push block (line 301) and before the mirror status gathering (line 303), add:
    ```ts
    // RFC-0797: Pre-mirror-check sync — update refs/mirror to match origin HEAD
    // after inline validate's bordbuch commits. Prevents false "out of sync" errors.
    if (!skipAutoSync && config && config.mirrors.length > 2) {
      try {
        const { executeKernelCommand } = await import("@warpgogol/werkstatt/kernel");
        logger.info(`  Syncing mirrors before mirror sync check…`);
        await executeKernelCommand({
          workspaceRoot,
          commandName: "sternsystem.sync",
          argv: [`--id=${manifest.systemId}`],
        });
      } catch (syncErr) {
        logger.warn(`  Pre-check mirror sync failed (non-fatal): ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`);
      }
    }
    ```
  - Update `CHANGE_SUMMARY` with `RFC-0797` entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes
- Verify `flagBoolean` is already imported (it should be, since `skipEvidenceSync` and `skipAutoArchive` use it)

**Completion criterion:** `sternsystem.sync` is called inside the lock, after pre-check push, before mirror sync check, when `--skip-auto-sync` is not set and external mirrors are configured; typecheck passes.

**Human review:** no

---

### Step 4. Fix 3a: Auto-commit cache clone in `mission.reconcile`

**Goal:** Add `commitCacheCloneIfDirty` call before the dirty cache clone guard in `runMissionReconcile`.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-materialization-commands.ts`:
  - Add `commitCacheCloneIfDirty` to imports from `./mission-git-commit.ts`
  - Before the dirty cache clone guard (line 1108), add:
    ```ts
    // RFC-0797: Auto-commit known generated files in cache clone before dirty guard.
    const cacheCommit = commitCacheCloneIfDirty(systemDir, manifest.systemId);
    if (cacheCommit.committed) {
      logger.info(`  Auto-committed cache clone (${cacheCommit.commitSha?.slice(0, 8)}) before reconcile`);
    }
    ```
  - The existing dirty guard (lines 1108-1131) remains as-is — it re-checks after auto-commit and throws on truly unknown files
  - Update `CHANGE_SUMMARY` with `RFC-0797` entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `commitCacheCloneIfDirty` is called before the dirty guard in `runMissionReconcile`; typecheck passes.

**Human review:** no

---

### Step 5. Fix 4a: Replace `commitBordbuchProjections` with `commitCacheCloneIfDirty` in `mission.validate` post-validate cleanup

**Goal:** Use `commitCacheCloneIfDirty` (superset) instead of `commitBordbuchProjections` in the post-validate cleanup.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-materialization-commands.ts`:
  - At the post-validate cleanup (around line 713-720), replace `commitBordbuchProjections` call with `commitCacheCloneIfDirty`:
    ```ts
    // RFC-0797: Post-validate cleanup — commit ALL generated files, not just bordbuch.
    try {
      const cacheClonePath = await resolveCacheClonePath(workspaceRoot, manifest.systemId);
      const cacheCommit = commitCacheCloneIfDirty(cacheClonePath, manifest.systemId);
      if (cacheCommit.committed) {
        logger.info(`  Cache clone post-validate cleanup: committed generated file(s)`);
      }
    } catch (err) {
      logger.warn(`  Cache clone post-validate cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    ```
  - Keep the pre-validate `commitBordbuchProjections` call at line 313 as-is — it runs before the pipeline and should only commit bordbuch files
  - Add `resolveCacheClonePath` to imports if not already present (check — it may already be imported)
  - Update `CHANGE_SUMMARY` with `RFC-0797` entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes
- Verify `commitBordbuchProjections` import is still used (pre-validate call at line 313) — should not be removed

**Completion criterion:** Post-validate cleanup uses `commitCacheCloneIfDirty`; pre-validate `commitBordbuchProjections` is preserved; typecheck passes.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Create `rfc-0797-eliminate-manual-git-interventions.test.ts` covering all four fixes.

**Agent actions:**

- Create `packages/werkstatt/src/tests-handoff/rfc-0797-eliminate-manual-git-interventions.test.ts`
- Follow the test pattern from `rfc-0762-close-mirror-sync.test.ts`:
  - Mock `@warpgogol/werkstatt/kernel` with `executeKernelCommand` spy
  - Mock `../mission/mission-materialization-commands.ts` with `runMissionValidate` returning success
  - Create temp git repos for workpiece and cache clone
  - Set up system config with `mirrors.length > 2` for mirror sync tests
- Test cases:
  1. **1a**: dirty workpiece → `mission.close` auto-commits and proceeds (no throw)
  2. **2a**: external mirrors configured, `--skip-auto-sync` not set → `executeKernelCommand` called with `sternsystem.sync` before mirror check
  3. **2a**: `--skip-auto-sync` set → `executeKernelCommand` not called for pre-check sync
  4. **2a**: external mirrors not configured (`mirrors.length <= 2`) → pre-check sync not called
  5. **3a**: dirty cache clone with generated files → `mission.reconcile` auto-commits and proceeds
  6. **3a**: `git commit` fails → dirty guard still throws with investigation report
  7. **4a**: post-validate cleanup calls `commitCacheCloneIfDirty` (verify via spy or git log)
  8. **6a**: `commitCacheCloneIfDirty` commits all dirty files with `git add -A` and returns commit SHA

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass

**Completion criterion:** All 8 test cases pass; test file follows existing handoff test conventions.

**Human review:** no

---

### Step 7. Update AGENTS.md files

**Goal:** Document the new behavior in root `AGENTS.md` and `packages/werkstatt/AGENTS.md`.

**Agent actions:**

- In root `AGENTS.md` (External mirror sync section):
  - Add note that `mission.close` now calls `sternsystem.sync` *twice*: once inside the lock before the mirror sync check (new, RFC-0797), and once after close as post-close sync (existing, RFC-0762). Both are non-fatal.
- In `packages/werkstatt/AGENTS.md`:
  - Document `commitCacheCloneIfDirty` helper in the mission git-commit section, alongside `commitWorkpieceIfDirty` (RFC-0644)

**Validation:**

- Visual review — changes are documentation only

**Completion criterion:** Both AGENTS.md files updated with RFC-0797 behavior.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (no new commands — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0797 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0797`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0797`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0797.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0797` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Auto-committing unknown files in cache clone | Step 4: dirty guard re-checks after auto-commit and throws on truly unknown files |
| Post-validate mirror sync pushes incomplete state | Step 3: sync is non-fatal; post-close sync (RFC-0762) pushes remaining commits |
| Concurrent execution race condition | Step 3: sync runs inside the lock, preventing race conditions |
| `commitCacheCloneIfDirty` git commit failure | Step 1: returns `{ committed: false }`; Step 4: falls through to existing dirty guard |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0797 --reason "..." --invariant "DNA-46"` instead of working around it.
- If `commitCacheCloneIfDirty` with `git add -A` is found to stage files that should not be committed (e.g., operator-placed files), do not narrow the `git add` — instead, investigate whether the cache clone's `.gitignore` needs updating.
