---
rfcId: RFC-0796
planId: PLAN-RFC-0796-01
status: draft
owner: architecture
createdAt: 2026-08-10
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/forge"
  services: []
  docs:
    - AGENTS.md
---

# Implementation Plan: RFC-0796

## 1. Objectives

- [ ] Objective 1 — `mission.close` auto-archives terminal missions via `mission.archive --status=closed` (non-fatal, `--skip-auto-archive` escape hatch). Maps to acceptance criteria 1-2.
- [ ] Objective 2 — `mission.open` cleans stale symlinks and empty directories before creating mission directories; skips non-empty real dirs with warning. Maps to acceptance criteria 3-4.
- [ ] Objective 3 — `mission.validate` warns about stale symlinks or terminal-state dirs in `missions/` root (non-blocking). Maps to acceptance criterion 5.
- [ ] Objective 4 — `mission.materialize` pre-flight checks workspace globs for stale `package.json` files; aborts before `pnpm install` with clear error. Maps to acceptance criteria 6-7.
- [ ] Objective 5 — Unit tests for all four new changes (2a, 2b, 3a, 3b). Maps to acceptance criterion 9.
- [ ] Objective 6 — `AGENTS.md` updated with auto-archive behavior note. Maps to acceptance criterion 10.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/mission/mission-close.ts` — add `CloseReportArchive` interface, `autoArchiveClosedMissions()` function, `--skip-auto-archive` flag parsing, auto-archive call after `.materialization-state.json` write (line 757), `archive` field in `CloseReport`.
- `packages/werkstatt/src/mission/mission-open.ts` — add `cleanupStaleMissionEntries()` function, call before `createMissionDirectories` (line 196), `staleEntries` in response data.
- `packages/werkstatt/src/mission/mission-materialization-commands.ts` — add `validateNoStaleMissionEntries()` function, wire into `runMissionValidate` validators, return warnings.
- `packages/werkstatt/src/mission/mission-materialize.ts` — add `checkWorkspaceGlobsForStalePackages()` function, call before `pnpm install` (line 1137), `workspaceGlobCheck` in response data.
- `packages/forge/os/mission/handlers/archive.ts` — already implements 1c (stale symlink trashing). No changes needed.
- `packages/werkstatt/src/bordbuch/bordbuch-io.ts` — already implements 1a (skip archive/ and symlinks in `deriveNextMissionNumberSafe`). No changes needed.
- `packages/werkstatt/src/mission/mission-cleanup.ts` — already implements 1b (skip archive/ and symlinks). No changes needed.

### 2.2 Configuration and data

- `pnpm-workspace.yaml` — read-only by `checkWorkspaceGlobsForStalePackages`. No changes to the file itself.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add note about auto-archive behavior in mission lifecycle section.
- No `docs/*.xml` Compass files require synchronization (RFC-0796 does not change lifecycle states).
- No `docs/architecture-dna.md` changes (no new DNA invariant).

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation.
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests.
- `pnpm --filter @warpgogol/forge run build:check` — verify archive.ts still compiles (no changes expected).

## 3. Step sequence

### Step 1. Add `CloseReportArchive` interface and `autoArchiveClosedMissions` to `mission-close.ts`

**Goal:** Implement the auto-archive contract (2a) — types, function, and `CloseReport` extension.

**Agent actions:**

- Add `CloseReportArchive` interface (`{ archived: boolean; error: string | null }`) alongside `CloseReportMirror`.
- Add `archive: CloseReportArchive` field to `CloseReport` interface.
- Add `autoArchiveClosedMissions(workspaceRoot, logger)` function — calls `executeKernelCommand` with `commandName: "mission.archive"`, `argv: ["--status=closed"]`. Returns `{ archived: boolean; error: string | null }`. Non-fatal: catches errors, logs `logger.warn`, returns `{ archived: false, error }`.
- Add `--skip-auto-archive` flag parsing via `flagBoolean(input, "skip-auto-archive")`.
- Initialize `closeReport.archive = { archived: false, error: null }` alongside other `closeReport` fields.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compiles without errors.

**Completion criterion:** `CloseReportArchive` interface exists, `CloseReport` has `archive` field, `autoArchiveClosedMissions` function compiles.

**Human review:** no

---

### Step 2. Wire auto-archive call into `mission.close` return path

**Goal:** Call `autoArchiveClosedMissions` after `.materialization-state.json` write, before the return statement (line 757).

**Agent actions:**

- After the `.materialization-state.json` + `.cache/` copy try/catch block (line 756), add:
  ```ts
  // RFC-0796: Auto-archive terminal missions after close (non-fatal).
  if (!skipAutoArchive) {
    try {
      const archiveResult = await autoArchiveClosedMissions(workspaceRoot, logger);
      closeReport.archive = archiveResult;
      if (archiveResult.archived) {
        logger.info(`  Auto-archived terminal missions`);
      }
    } catch (err) {
      closeReport.archive = { archived: false, error: err instanceof Error ? err.message : String(err) };
      logger.warn(`  Auto-archive failed (non-fatal): ${closeReport.archive.error}`);
    }
  }
  ```
- Pass `skipAutoArchive` variable from `flagBoolean(input, "skip-auto-archive")` at the top of `runMissionClose`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `mission.close` calls `autoArchiveClosedMissions` when `--skip-auto-archive` is not set; result stored in `closeReport.archive`.

**Human review:** no

---

### Step 3. Add `cleanupStaleMissionEntries` to `mission-open.ts`

**Goal:** Implement pre-flight stale entry cleanup (2b) before `createMissionDirectories`.

**Agent actions:**

- Add `cleanupStaleMissionEntries(workspaceRoot, missionId)` function:
  - Resolve target path: `missions/<missionId>`.
  - If path doesn't exist: return `{ removedPaths: [], skipped: [] }`.
  - Use `fs.lstatSync(path)` to detect symlinks (not `statSync`, which follows symlinks).
  - If symlink: `trashPath(path)`, add to `removedPaths`.
  - If real directory and empty: `trashPath(path)`, add to `removedPaths`.
  - If real directory and non-empty: add to `skipped` with warning, do NOT delete.
- Call `cleanupStaleMissionEntries` before `createMissionDirectories` (line 196).
- Add `staleEntries` to `MissionOpenData` response.
- Import `trashPath` from `@warpgogol/forge/utils` (exempted from DNA-64 autonomy guard). `trashPath` moves to OS trash bin instead of permanent deletion — safer for operator if cleanup triggers falsely.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `cleanupStaleMissionEntries` compiles, is called before directory creation, returns `StaleEntryCheck`.

**Human review:** no

---

### Step 4. Add `validateNoStaleMissionEntries` validator to `mission-materialization-commands.ts`

**Goal:** Implement stale-entry warning validator (3a) in `mission.validate`.

**Agent actions:**

- Add `validateNoStaleMissionEntries(workspaceRoot)` function:
  - Scan `missions/` root entries.
  - For each entry (excluding `archive/`):
    - If `isSymbolicLink()`: add warning `{ path, kind: "symlink", message: "stale symlink in missions/ root" }`.
    - If `isDirectory()` and not symlink: read `mission.yaml` state. If state is `closed` or `aborted`: add warning `{ path, kind: "terminal-state-in-root", state, message: "terminal-state mission in missions/ root — run mission.archive" }`.
  - Return `{ warnings: StaleEntryViolation[] }`.
- Wire into `runMissionValidate` — add warnings to the existing warnings array. Do NOT add to errors.
- Add `staleEntryWarnings` to `MissionValidateData` response.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `validateNoStaleMissionEntries` compiles, is wired into `mission.validate`, returns warnings (not errors).

**Human review:** no

---

### Step 5. Add `checkWorkspaceGlobsForStalePackages` to `mission-materialize.ts`

**Goal:** Implement pre-flight workspace glob guard (3b) before `pnpm install`.

**Agent actions:**

- Add `checkWorkspaceGlobsForStalePackages(workspaceRoot)` function:
  - Read `pnpm-workspace.yaml`, parse `packages` array (glob patterns).
  - For each glob, resolve matching directories using native `fs.glob` from `node:fs/promises` (Node 22+, already used in `workspace-io.ts:37`). No new dependency.
  - For each match, read `package.json`. Check `dependencies` and `devDependencies` for `workspace:*` references.
  - For each `workspace:*` reference, verify the referenced package name exists in the workspace (has a directory with a `package.json` containing that name).
  - If any reference points to a missing package: add to `stalePackages` array.
  - Return `{ stalePackages, ok: stalePackages.length === 0 }`.
- Call `checkWorkspaceGlobsForStalePackages` before `pnpm install` (line 1137).
- If `!ok`: throw `Error` with clear message listing stale packages and suggesting `mission.archive`.
- Add `workspaceGlobCheck` to `MissionMaterializeData` response.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `checkWorkspaceGlobsForStalePackages` compiles, is called before `pnpm install`, aborts with error on stale packages.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Unit tests for all four new changes (2a, 2b, 3a, 3b).

**Agent actions:**

- Create `packages/werkstatt/src/tests-handoff/rfc-0796-auto-archive.test.ts`:
  - Test: `mission.close` calls `mission.archive --status=closed` (mock `executeKernelCommand`).
  - Test: `--skip-auto-archive` skips the call.
  - Test: archive failure is non-fatal (`closeReport.archive.archived === false`, `closeReport.archive.error` set).
  - Test: `closeReport.archive` present in `--json` output.
- Create `packages/werkstatt/src/tests-handoff/rfc-0796-stale-cleanup-open.test.ts`:
  - Test: stale symlink at target path → trashed, `removedPaths` populated.
  - Test: empty directory at target path → trashed.
  - Test: non-empty real directory → skipped with warning, NOT deleted.
  - Test: no stale entries → `removedPaths: [], skipped: []`.
- Create `packages/werkstatt/src/tests-handoff/rfc-0796-validate-stale-warning.test.ts`:
  - Test: stale symlink in `missions/` root → warning, validate still passes.
  - Test: terminal-state directory in `missions/` root → warning.
  - Test: open mission in `missions/` root → no warning.
  - Test: `archive/` directory → no warning (excluded).
- Create `packages/werkstatt/src/tests-handoff/rfc-0796-materialize-glob-guard.test.ts`:
  - Test: stale `package.json` with `workspace:*` ref to missing package → aborts with error.
  - Test: clean workspace globs → `ok: true`, proceeds to `pnpm install`.
  - Mock `pnpm install` via `execSync` mock to prevent real install.
- Existing tests in `rfc-0796-stale-symlink-guard.test.ts` and `archive.test.ts` already cover 1a, 1b, 1c.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test`

**Completion criterion:** All new test files pass. Existing tests still pass.

**Human review:** no

---

### Step 7. Update `AGENTS.md`

**Goal:** Document auto-archive behavior in root `AGENTS.md`.

**Agent actions:**

- In the mission lifecycle section of `AGENTS.md`, add a note:
  > `mission.close` auto-archives terminal-state missions via `mission.archive --status=closed` as a non-fatal post-close step (RFC-0796). Use `--skip-auto-archive` to keep the mission directory in `missions/` root after close.

**Validation:**

- Visual inspection — note is present and accurate.

**Completion criterion:** `AGENTS.md` contains the auto-archive behavior note.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `AGENTS.md` update from Step 7 is committed.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands expected — only internal behavior changes).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0796 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0796`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0796`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm --filter @warpgogol/forge run build:check` (verify no regression in archive.ts)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0796` in the subject line (RFC-0265 commit hygiene).
- No `rfc.verification.emit` needed — RFC-0796 has no acceptance probes in frontmatter.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Auto-archive timing — operator inspects workpiece before archive | Step 2: auto-archive runs as last step, after all evidence/state files written. `resolveMissionDir` follows into `missions/archive/`. |
| Stale cleanup false positive — operator's intentional dir removed | Step 3: only removes symlinks and empty dirs; non-empty real dirs skipped with warning. |
| Performance — auto-archive O(n) scan | Step 2: reuses `mission.archive` which already handles this efficiently. |
| Validator false positives (3a) | Step 4: warnings are advisory, do not block validation. Operators suppress via `mission.archive` or `--skip-auto-archive`. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0796 --reason "..." --invariant "DNA-46"` instead of working around it.
- If `checkWorkspaceGlobsForStalePackages` reveals that pnpm workspace glob resolution is more complex than expected (e.g., requires pnpm internals), escalate to a simpler check that reads only `missions/*/workpiece/package.json` instead of all workspace globs.
