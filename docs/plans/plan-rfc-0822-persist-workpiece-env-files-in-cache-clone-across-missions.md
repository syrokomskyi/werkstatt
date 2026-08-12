---
rfcId: RFC-0822
planId: PLAN-RFC-0822-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - AGENTS.md
---

# Implementation Plan: RFC-0822

## 1. Objectives

- [ ] Objective 1 — Create `env-persist.ts` module with `persistEnvFilesToCacheClone` and `restoreEnvFilesFromCacheClone` (maps to acceptance criterion 1)
- [ ] Objective 2 — Wire `persistEnvFilesToCacheClone` into `mission.close` final artifact-copy block (maps to acceptance criterion 2)
- [ ] Objective 3 — Replace old-workpiece preservation code in `mission.materialize` with `restoreEnvFilesFromCacheClone` (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — Add `ENV-PERSIST-01` warning to `sternsystem.validate` (maps to acceptance criterion 5)
- [ ] Objective 5 — Unit tests for copy, restore, missing files, glob exclusion (maps to acceptance criterion 6)
- [ ] Objective 6 — Update `AGENTS.md` with env-persistence policy (maps to acceptance criterion 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/mission/env-persist.ts` — **new module**: `persistEnvFilesToCacheClone`, `restoreEnvFilesFromCacheClone`, glob logic, `EnvPersistResult` interface
- `packages/werkstatt/src/mission/mission-close.ts` — **modified**: add `persistEnvFilesToCacheClone` call in the final artifact-copy block (lines 687–846), before `.cache/` copy
- `packages/werkstatt/src/mission/mission-materialize.ts` — **modified**: replace lines 1154–1196 (old-workpiece `.env` preservation) with `restoreEnvFilesFromCacheClone` call after `atomicMoveDir`
- `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` — **modified**: add `ENV-PERSIST-01` warning when cache clone lacks `.env*` but workpiece has them
- `packages/werkstatt/src/mission/index.ts` — **modified**: re-export `persistEnvFilesToCacheClone`, `restoreEnvFilesFromCacheClone` from mission barrel

### 2.2 Configuration and data

- No YAML/JSON/config changes. `.env*` files are untracked file system artifacts, not configuration.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add env-persistence policy in the mission lifecycle section
- RFC file is read-only reference (already accepted)

### 2.4 Validation and pipelines

- No new pipeline steps. `sternsystem.validate` warning is advisory — not integrated into `build.check` or any blocking pipeline.
- Unit tests in `packages/werkstatt/src/tests/` or colocated with `env-persist.ts`.

## 3. Step sequence

### Step 1. Create `env-persist.ts` module

**Goal:** Implement the core env-persistence functions as a standalone module.

**Agent actions:**

- Create `packages/werkstatt/src/mission/env-persist.ts`
- Implement `EnvPersistResult` interface: `{ copied: string[]; skipped: string[] }`
- Implement `persistEnvFilesToCacheClone(workpieceDir, cacheCloneDir)`: glob `.env*` files in workpieceDir, exclude `.env.example` and `.env.*.example`, copy files to cacheCloneDir (overwrite existing), return result
- Implement `restoreEnvFilesFromCacheClone(cacheCloneDir, workpieceDir)`: glob `.env*` files in cacheCloneDir, exclude `.env.example` and `.env.*.example`, copy files to workpieceDir, apply `PUBLIC_IMAGE_PROVIDER=build-portable` replacement to each restored file, return result
- Add MODULE_CONTRACT and CHANGE_SUMMARY Compass headers
- Re-export from `packages/werkstatt/src/mission/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `env-persist.ts` exists with both functions, typecheck passes, exports are accessible from `@warpgogol/werkstatt/mission`

**Human review:** no

---

### Step 2. Wire `persistEnvFilesToCacheClone` into `mission.close`

**Goal:** Add env file persistence as a final step in `mission.close`.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-close.ts`, inside the final `try` block (lines 687–846), add `persistEnvFilesToCacheClone` call before the `.cache/` copy (line 725)
- Call: `const envResult = await persistEnvFilesToCacheClone(workpieceDir, systemDir)`
- Log: `logger.info(\`  Persisted ${envResult.copied.length} .env file(s) to cache clone: ${envResult.copied.join(", ")}\`)` when copied > 0
- Wrap in try/catch — non-fatal: `logger.warn(...)` on failure
- Add CHANGE_SUMMARY entry: `RFC-0822: persist .env* files to cache clone as final close step`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `mission.close` calls `persistEnvFilesToCacheClone` in the final artifact-copy block, logs copied file count, failure is non-fatal

**Human review:** no

---

### Step 3. Replace old-workpiece preservation in `mission.materialize`

**Goal:** Replace the current `.env` preservation code (lines 1154–1196) with `restoreEnvFilesFromCacheClone`.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-materialize.ts`, remove lines 1154–1196 (old preservation code: `envFilesToPreserve`, `preservedEnv`, the read-before-move loop, the restore-after-move loop, `PUBLIC_IMAGE_PROVIDER` replacement, `preservedCount` logging)
- After `atomicMoveDir` (line 1174), add: `const envResult = await restoreEnvFilesFromCacheClone(cacheCloneDir, workpieceDir)`
- Resolve `cacheCloneDir` via `resolveCacheClonePath(workspaceRoot, manifest.systemId)` (already imported)
- Log success: `logger.info(\`  Restored ${envResult.copied.length} .env file(s) from cache clone: ${envResult.copied.join(", ")}\`)` when copied > 0
- Log warning: `logger.warn(\`  Warning: no .env files found in cache clone — using .env.example template. Operator must fill secrets manually.\`)` when copied === 0
- Keep `process.env["PUBLIC_IMAGE_PROVIDER"] = "build-portable"` line (1201) — the restore function handles the file replacement, but the process.env line is still needed for the kernel command
- Wrap in try/catch — non-fatal: `logger.warn(...)` on failure, materialize proceeds with `.env.example`
- Add CHANGE_SUMMARY entry: `RFC-0822: replace old-workpiece .env preservation with restoreEnvFilesFromCacheClone`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `mission.materialize` calls `restoreEnvFilesFromCacheClone` after `atomicMoveDir`, old preservation code (lines 1154–1196) is removed, warning is logged when no env files in cache clone

**Human review:** no

---

### Step 4. Add `ENV-PERSIST-01` warning to `sternsystem.validate`

**Goal:** Emit a non-blocking warning when cache clone lacks `.env*` but an active workpiece has them.

**Agent actions:**

- In `packages/werkstatt/src/sternsystem/sternsystem-validate.ts`, inside the per-system loop (after line 434), add check:
  - Read cache clone dir for `.env*` files (excluding `.env.example`, `.env.*.example`)
  - If active mission exists, read workpiece dir for `.env*` files
  - If cache clone has 0 `.env*` files but workpiece has > 0, push warning: `{ systemId: entry.id, field: "ENV-PERSIST-01", message: \`Cache clone for system '${entry.id}' has no .env files but workpiece has ${count} — run mission.close to persist secrets\` }`
- Use the existing `warnings` array (shape: `{ systemId, field, message }`)
- Add CHANGE_SUMMARY entry: `RFC-0822: add ENV-PERSIST-01 warning for missing cache clone .env files`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `sternsystem.validate` emits `ENV-PERSIST-01` warning in the existing `warnings` array shape when cache clone lacks `.env*` but workpiece has them

**Human review:** no

---

### Step 5. Unit tests

**Goal:** Cover copy, restore, missing files, and glob exclusion.

**Agent actions:**

- Create `packages/werkstatt/src/tests/env-persist.test.ts`
- Test `persistEnvFilesToCacheClone`:
  - Copies `.env` and `.env.dev` from workpiece to cache clone
  - Excludes `.env.example` and `.env.dev.example`
  - Skips directories matching `.env*` glob
  - Overwrites existing files in cache clone
  - Returns correct `copied` and `skipped` arrays
- Test `restoreEnvFilesFromCacheClone`:
  - Restores `.env` and `.env.dev` from cache clone to workpiece
  - Applies `PUBLIC_IMAGE_PROVIDER=build-portable` replacement
  - Excludes `.env.example` and `.env.dev.example`
  - Returns correct `copied` and `skipped` arrays
- Test missing files:
  - `persistEnvFilesToCacheClone` with empty workpiece → `copied: []`, `skipped: [".env"]`
  - `restoreEnvFilesFromCacheClone` with empty cache clone → `copied: []`, `skipped: [".env"]`
- Test glob exclusion:
  - Workpiece with `.env`, `.env.example`, `.env.dev`, `.env.dev.example` → only `.env` and `.env.dev` are copied

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass

**Completion criterion:** All test cases pass, covering copy, restore, missing files, glob exclusion of `.env.example` and `.env.*.example`

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Document the env-persistence policy in the root AGENTS.md.

**Agent actions:**

- In `AGENTS.md` (root), add a subsection under the mission lifecycle area (near the "Site content editing rule" or "External mirror sync" section):
  - Title: "Env file persistence across missions (RFC-0822)"
  - Content: `mission.close` copies `.env*` files from workpiece to cache clone (untracked). `mission.materialize` restores them from cache clone. `.env.example` and `.env.*.example` are excluded — they are git-tracked templates. Agents MUST NOT `git add -f` `.env` files in cache clone. `PUBLIC_IMAGE_PROVIDER=build-portable` is enforced during restore.

**Validation:**

- Visual review of AGENTS.md section

**Completion criterion:** AGENTS.md contains env-persistence policy with RFC-0822 reference

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify all `scope.docs` files are updated (AGENTS.md).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `mission.close`, `mission.materialize`, `sternsystem.validate` are changed — check if manifest needs regeneration).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0822 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0822`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0822`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0822` (RFC-0330 — no acceptance probes declared, will skip)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0822` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Secret exposure via cache clone backup | Step 2: `.env*` files are untracked, `git push` does not transfer them. AGENTS.md policy (Step 6) documents the risk. |
| Stale secrets | Step 2: `mission.close` always overwrites cache clone `.env*` with workpiece version — last close wins. |
| Agent confusion (git add -f .env) | Step 6: AGENTS.md policy explicitly forbids `git add -f .env`. RFC implementation notes repeat the rule. |
| ENV-PERSIST-01 false positives | Step 4: warning is advisory and non-blocking — new systems without secrets are expected to trigger it. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0822 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `PUBLIC_IMAGE_PROVIDER=build-portable` replacement cannot be preserved in `restoreEnvFilesFromCacheClone` without breaking another invariant, escalate via `rfc.supersede.propose` rather than silently dropping the replacement.
