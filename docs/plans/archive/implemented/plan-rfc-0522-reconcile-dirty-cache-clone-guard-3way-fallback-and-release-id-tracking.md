---
rfcId: RFC-0522
planId: PLAN-RFC-0522-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0522

## 1. Objectives

- [ ] O1 — Dirty cache clone guard in `mission.reconcile` refuses with file list (maps to AC: "refuses with a clear error listing dirty files")
- [ ] O2 — 3-way fallback in `mission.reconcile` retries `git am --3way` on plain failure (maps to AC: "falls back to git am --3way" + "throws clear error when both fail")
- [ ] O3 — `release.prepare` writes `releaseId` to mission manifest (maps to AC: "writes releaseId into mission.yaml" + "overwrites on re-run")
- [ ] O4 — `mission.close` resolves `releaseId` with flag→manifest precedence and warns on null (maps to AC: "emits warning in close-report.json when releaseId is null")
- [ ] O5 — `mission.validate` warns on dirty cache clone (maps to AC: "emits a warning when cache clone has uncommitted changes")
- [ ] O6 — Unit tests for all guards (maps to AC: 6 unit test criteria)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` — extend `WorkpieceDirtyResult` with `files: string[]`; update `isWorkpieceDirty` implementation
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — dirty cache clone guard in `runMissionReconcile`; 3-way fallback in patch loop; dirty cache clone warning in `runMissionValidate`
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — write `releaseId` to mission manifest via `writeMissionManifest` after successful `release.prepare`
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — `releaseId` precedence resolution (`flag ?? manifest.releaseId ?? null`); `warnings[]` in `CloseReport`
- `packages/os/site-kernel-handoff/src/tests/` — new test files for each guard

### 2.2 Configuration and data

No configuration or data file changes. The `missionManifestSchema` in `@gogol/ontology/operations` already has `releaseId: z.string().nullable()` — no schema change needed.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — document new guard behaviors (cache clone guard, 3-way fallback, releaseId tracking, close warning, validate warning)
- `docs/verification-plan.xml` — no structural change needed (no mission-specific entries exist; the validate warning is advisory, not a verification rule)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-handoff build:check` — typecheck
- `pnpm --filter @gogol/site-kernel-handoff test` — unit tests
- `pnpm exec site-kernel run rfc.validate RFC-0522` — RFC validation

## 3. Step sequence

### Step 1. Extend `isWorkpieceDirty` return type

**Goal:** Add `files: string[]` to `WorkpieceDirtyResult` for error messages.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts`:
  - Add `files: string[]` to `WorkpieceDirtyResult` interface
  - Update `isWorkpieceDirty` to populate `files` from `git status --porcelain` output
  - Update non-git and error fallback returns to include `files: []`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** `WorkpieceDirtyResult` has `files: string[]` field; `build:check` passes.

**Human review:** no

---

### Step 2. Add dirty cache clone guard to `mission.reconcile`

**Goal:** Block reconcile with clear error when cache clone is dirty.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` (`runMissionReconcile`):
  - Inside the `if (existsSync(gitDir))` block (after line 488), before `preReconcileSha` recording, add:
    ```ts
    const cacheDirtyCheck = isWorkpieceDirty(systemDir);
    if (cacheDirtyCheck.dirty) {
      throw new Error(
        `[mission.reconcile] cache clone for system '${manifest.systemId}' has ${cacheDirtyCheck.fileCount} uncommitted file(s):\n` +
          cacheDirtyCheck.files.map((f) => `  ${f}`).join("\n") +
          `\nResolve uncommitted changes in the cache clone before re-running reconcile.`
      );
    }
    ```

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** `mission.reconcile` throws with file list when cache clone is dirty; guard is inside the `existsSync(gitDir)` block.

**Human review:** no

---

### Step 3. Add 3-way fallback to patch application loop

**Goal:** Retry failed `git am` with `git am --3way` before throwing.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` (`runMissionReconcile`):
  - Replace the single `git am` attempt in the patch loop (lines 567-586) with the two-step try:
    1. Try plain `git am <patch>`
    2. On failure: `git am --abort`, then `git am --3way <patch>`
    3. On 3-way failure: `git am --abort`, throw with conflict details
  - Log fallback: `logger.info(\` Applied ${patchFile} via 3-way merge fallback\`)`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** Patch loop attempts plain `git am` first, falls back to `--3way`, aborts on both failures.

**Human review:** no

---

### Step 4. Write `releaseId` to mission manifest in `release.prepare`

**Goal:** Persist release ID in `mission.yaml` after successful release preparation.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/release/release-commands.ts` (`runReleasePrepare`):
  - Import `readMissionManifest`, `writeMissionManifest` from `../mission/mission-io.ts` (already imported `readMissionManifest`)
  - After the release directory is finalized (after `writeReleaseYaml` at line 225), add:
    ```ts
    const missionManifest = await readMissionManifest(workspaceRoot, missionId);
    missionManifest.releaseId = releaseId;
    await writeMissionManifest(workspaceRoot, missionManifest);
    ```

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** `release.prepare` writes `releaseId` to `mission.yaml` using Zod-validated helpers.

**Human review:** no

---

### Step 5. Fix `releaseId` precedence and add warning in `mission.close`

**Goal:** Resolve `releaseId` as `flag ?? manifest.releaseId ?? null`; warn on null.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/mission/mission-close.ts`:
  - Change `releaseId` resolution (line 97) from `flagString(input, "release") ?? null` to `flagString(input, "release") ?? manifest.releaseId ?? null`
  - Add `warnings: Array<{ rule: string; message: string }>` to `CloseReport` interface
  - After resolving `releaseId`, build warnings array:
    ```ts
    const warnings: Array<{ rule: string; message: string }> = [];
    if (!releaseId) {
      warnings.push({
        rule: "missing-release-id",
        message: "Mission closed without release — releaseId is null. Run release.prepare before close to associate a release.",
      });
    }
    ```
  - Include `warnings` in `closeReport` object written to `evidence/close-report.json`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** `mission.close` resolves `releaseId` with correct precedence; `close-report.json` includes `warnings[]` when `releaseId` is null.

**Human review:** no

---

### Step 6. Add dirty cache clone warning to `mission.validate`

**Goal:** Warn when cache clone is dirty at validate time.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` (`runMissionValidate`):
  - After the existing workpiece dirty check (line 234), add:
    ```ts
    const systemDir = path.join(workspaceRoot, "systems", manifest.systemId);
    if (existsSync(path.join(systemDir, ".git"))) {
      const cacheDirtyCheck = isWorkpieceDirty(systemDir);
      if (cacheDirtyCheck.dirty) {
        logger.warn(
          `[mission.validate] cache clone for system '${manifest.systemId}' has ${cacheDirtyCheck.fileCount} uncommitted file(s) — reconcile will fail until resolved`,
        );
      }
    }
    ```

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`

**Completion criterion:** `mission.validate` warns when cache clone is dirty; check only runs for git-backed cache clones.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Cover all guards with unit tests.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/reconcile-cache-clone-guard.test.ts`:
  - Test: dirty cache clone → reconcile refuses with file list
  - Test: clean cache clone → reconcile proceeds
  - Test: non-git cache clone → guard skipped (no error)
- Create `packages/os/site-kernel-handoff/src/tests/reconcile-3way-fallback.test.ts`:
  - Test: plain `git am` conflict → 3-way fallback succeeds
  - Test: both plain and 3-way fail → clear error with patch name
- Create `packages/os/site-kernel-handoff/src/tests/release-prepare-release-id.test.ts`:
  - Test: `release.prepare` writes `releaseId` to `mission.yaml`
  - Test: re-run overwrites previous `releaseId`
- Create `packages/os/site-kernel-handoff/src/tests/mission-close-release-id-warning.test.ts`:
  - Test: `mission.close` with null `releaseId` → warning in `close-report.json`
  - Test: `mission.close` with `--release` flag → flag takes precedence over manifest
  - Test: `mission.close` without flag but manifest has `releaseId` → no warning
- Update `packages/os/site-kernel-handoff/src/tests/mission-dirty-guard.test.ts`:
  - Update existing tests to assert `files` field in `WorkpieceDirtyResult`
- Create `packages/os/site-kernel-handoff/src/tests/mission-validate-cache-clone-warning.test.ts`:
  - Test: `mission.validate` with dirty cache clone → warning emitted
  - Test: `mission.validate` with clean cache clone → no warning

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 8. Update AGENTS.md

**Goal:** Document new guard behaviors in the handoff package AGENTS.md.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/AGENTS.md`:
  - Under "Mission git workpiece and Layer C protection (RFC-0480)" section, add subsection for RFC-0522:
    - Dirty cache clone guard in `mission.reconcile` (refuses with file list)
    - 3-way fallback in patch application (`git am --3way` retry)
    - `release.prepare` writes `releaseId` to `mission.yaml`
    - `mission.close` `releaseId` precedence: `--release` flag → manifest → null (warning)
    - `mission.validate` warns on dirty cache clone

**Validation:**

- Visual review of AGENTS.md content

**Completion criterion:** AGENTS.md documents all 5 new behaviors with RFC-0522 reference.

**Human review:** no

---

### Step 9. Final validation and stamp

**Goal:** Verify all acceptance criteria and stamp RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @gogol/site-kernel-handoff build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff test`
- Run `pnpm exec site-kernel run rfc.validate RFC-0522`
- Check off all acceptance criteria in the RFC
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0522 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- All acceptance criteria verified

**Completion criterion:** All checks pass; RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0522`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0522` in the subject line
- `evidence/close-report.json` with `warnings[]` field (runtime evidence)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| 3-way merge conflict markers unnoticed | Step 3: mandatory `git am --abort` before throwing; wrapped in try/catch |
| `release.prepare` overwrites releaseId that should be preserved | Step 4: last successful `release.prepare` is the active release; previous releases in Bordbuch |
| Dirty cache clone guard blocks reconcile unexpectedly | Step 6: `mission.validate` warns early; Step 2: guard is inside git check only |
| In-flight missions have dirty cache clones | Guard is additive — only blocks reconcile, not validate. No migration needed. |

## 6. Escalation triggers

- If implementation reveals that `isWorkpieceDirty` cannot be reused for cache clone checks (e.g., different git behavior), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0522 --reason "isWorkpieceDirty not suitable for cache clone" --invariant "DNA-51"` instead of creating a parallel helper.
- If `mission.close` `releaseId` precedence change breaks existing missions, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0522 --reason "releaseId precedence conflicts with existing mission.close contract" --invariant "DNA-46"`.
