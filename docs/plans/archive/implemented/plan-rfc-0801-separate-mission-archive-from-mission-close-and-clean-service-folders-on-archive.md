---
rfcId: RFC-0801
planId: PLAN-RFC-0801-01
status: draft
owner: architecture
createdAt: 2026-08-11
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/forge"
  services: []
  docs:
    - AGENTS.md
    - .devin/workflows/deploy.md
---

# Implementation Plan: RFC-0801

## 1. Objectives

- [ ] Remove auto-archive call from `mission.close` — maps to acceptance criterion "mission.close no longer calls mission.archive"
- [ ] Remove `--skip-auto-archive` flag and `CloseReportArchive` interface — maps to acceptance criteria "flag removed" and "CloseReport.archive field removed"
- [ ] Add service-folder cleanup to `mission.archive` — maps to acceptance criterion "mission.archive deletes node_modules/, dist/, .astro/, .wrangler/, .cache/, .turbo/"
- [ ] Update AGENTS.md auto-archive note — maps to acceptance criterion "AGENTS.md auto-archive note updated"
- [ ] Update existing RFC-0796 tests to reflect removed auto-archive — maps to acceptance criterion "Unit test: mission.close does not call mission.archive"
- [ ] Add service-folder cleanup test — maps to acceptance criterion "Unit test: mission.archive removes service folders before move"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/mission/mission-close.ts` — remove `skipAutoArchive` flag read (line 185), auto-archive block (lines 837-872), `CloseReportArchive` interface (lines 99-102), `archive` field from `CloseReport` (line 114)
- `packages/werkstatt/src/mission/mission.module.ts` — remove `skip-auto-archive` flag registration (lines 104-107)
- `packages/forge/os/mission/handlers/archive.ts` — add `SERVICE_FOLDERS` constant, `cleanServiceFolders()` function, call before `fs.rename` in `moveMissionDir`
- `packages/werkstatt/src/tests-handoff/rfc-0796-auto-archive.test.ts` — rewrite tests: assert `mission.archive` is NOT called; remove `--skip-auto-archive` test; remove `closeReport.archive` assertions

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — update line 136: replace auto-archive note with explicit archive step note
- `.devin/workflows/deploy.md` — already updated (no changes needed)
- `docs/rfcs/archive/implemented/rfc-0796-*.md` — already updated (`amendedBy: [RFC-0801]`)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests including rewritten RFC-0796 tests
- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation for archive.ts changes

## 3. Step sequence

### Step 1. Remove auto-archive from `mission.close`

**Goal:** Remove the auto-archive call, `CloseReportArchive` interface, `archive` field from `CloseReport`, and `skipAutoArchive` flag read.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-close.ts`:
  - Remove `const skipAutoArchive = flagBoolean(input, "skip-auto-archive");` (line 185)
  - Remove the entire auto-archive block (lines 837-872) — the `if (!skipAutoArchive) { ... }` block
  - Remove `export interface CloseReportArchive { archived: boolean; error: string | null; }` (lines 99-102)
  - Remove `archive: CloseReportArchive;` from `CloseReport` interface (line 114)
  - Remove the `archive` field initialization in `closeReport` object (around line 473-480 area, wherever `closeReport` is built)
  - Update `CHANGE_SUMMARY` block: add `<item>RFC-0801: remove auto-archive from mission.close; remove CloseReportArchive interface and --skip-auto-archive flag.</item>`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — must compile without errors

**Completion criterion:** `mission-close.ts` contains no reference to `skipAutoArchive`, `CloseReportArchive`, or `mission.archive`. TypeScript compiles clean.

**Human review:** no

---

### Step 2. Remove `--skip-auto-archive` flag from `mission.module.ts`

**Goal:** Remove the flag registration so passing `--skip-auto-archive` produces an unknown-flag warning.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission.module.ts`:
  - Remove the `"skip-auto-archive"` flag entry (lines 104-107)
  - Update description comment if needed

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — must compile clean

**Completion criterion:** `mission.module.ts` has no `skip-auto-archive` entry. `grep -r "skip-auto-archive" packages/werkstatt/src/mission/` returns zero results.

**Human review:** no

---

### Step 3. Add service-folder cleanup to `mission.archive`

**Goal:** Before moving a mission directory to archive, delete `node_modules/`, `dist/`, `.astro/`, `.wrangler/`, `.cache/`, `.turbo/` from the workpiece.

**Agent actions:**

- In `packages/forge/os/mission/handlers/archive.ts`:
  - Add `SERVICE_FOLDERS` constant array at module level
  - Add `cleanServiceFolders(workpieceDir: string): Promise<string[]>` function that checks `existsSync` for each folder and uses `fs.rm(target, { recursive: true, force: true })` to delete
  - In `moveMissionDir`, before the `fs.rename` call (inside the `!dryRun` block, after `mkdir` but before `rename`):
    - Compute `workpieceDir = path.join(sourcePath, "workpiece")`
    - If `existsSync(workpieceDir)`, call `cleanServiceFolders(workpieceDir)`
    - Log removed folders if `outputFormat === "pretty"`
  - Handle missing `workpiece/` gracefully (aborted missions may not have one) — skip cleanup if workpiece doesn't exist
  - Update `CHANGE_SUMMARY` block: add `<item>RFC-0801: add service-folder cleanup before archive move.</item>`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — must compile clean

**Completion criterion:** `archive.ts` contains `SERVICE_FOLDERS` constant and `cleanServiceFolders` function. `moveMissionDir` calls cleanup before `fs.rename`. TypeScript compiles clean.

**Human review:** no

---

### Step 4. Update existing RFC-0796 tests

**Goal:** Rewrite `rfc-0796-auto-archive.test.ts` to assert auto-archive is NOT called. Remove tests for `--skip-auto-archive` and `closeReport.archive`.

**Agent actions:**

- In `packages/werkstatt/src/tests-handoff/rfc-0796-auto-archive.test.ts`:
  - Rename test file to `rfc-0801-no-auto-archive.test.ts` (or keep filename, update content)
  - Keep the mock infrastructure (mockState, vi.mock calls)
  - Remove `archiveResult`, `archiveCalled`, `archiveArgs` from mockState (no longer needed)
  - Remove the `executeKernelCommand` mock for `mission.archive` (or keep it to assert it's NOT called)
  - Rewrite test 1: "RFC-0801: mission.close does NOT call mission.archive" — assert `mockState.archiveCalled` is `false`
  - Remove test 2 (--skip-auto-archive) — flag is removed
  - Remove test 3 (archive failure non-fatal) — auto-archive is removed
  - Remove all `closeReport.archive` assertions
  - Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` to reference RFC-0801

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --run rfc-0801-no-auto-archive` — tests pass

**Completion criterion:** Tests assert `mission.archive` is NOT called from `mission.close`. No references to `--skip-auto-archive` or `closeReport.archive` in test file. All tests pass.

**Human review:** no

---

### Step 5. Add service-folder cleanup test

**Goal:** Add unit test verifying `mission.archive` deletes service folders before moving.

**Agent actions:**

- In `packages/forge/os/mission/handlers/archive.test.ts`:
  - Add test: "RFC-0801: service folders deleted before move" — create a closed mission with `workpiece/node_modules/`, `workpiece/dist/`, `workpiece/.astro/`, etc. (with dummy files inside), run `runMissionArchive`, assert:
    - Folders do NOT exist in `missions/archive/closed/<id>/workpiece/`
    - Mission is moved successfully
  - Add test: "RFC-0801: mission without workpiece — cleanup skipped gracefully" — create a closed mission with no `workpiece/` directory, run `runMissionArchive`, assert mission is moved successfully (no crash)
  - Add test: "RFC-0801: --dry-run does not delete service folders" — create closed mission with service folders, run with `--dry-run`, assert folders still exist at source

**Validation:**

- `pnpm --filter @warpgogol/forge run test -- --run archive` — tests pass

**Completion criterion:** Three new tests pass. Service folders are verified deleted on real archive, preserved on dry-run, and missing workpiece is handled gracefully.

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Replace the auto-archive note with an explicit archive step note.

**Agent actions:**

- In `AGENTS.md` (root), line 136:
  - Replace: `mission.close` auto-archives terminal-state missions by calling `mission.archive --status=closed`...` (the entire line)
  - With: `mission.close` does NOT auto-archive. The operator runs `mission.archive --status=closed` explicitly after the full deployment pipeline completes (RFC-0801). The workpiece stays at `missions/<id>/workpiece/` with working `node_modules` until `mission.archive` is called. `mission.archive` cleans service folders (`node_modules/`, `dist/`, `.astro/`, `.wrangler/`, `.cache/`, `.turbo/`) before moving to `missions/archive/<state>/`.`

**Validation:**

- Visual inspection — line 136 reflects the new behavior

**Completion criterion:** AGENTS.md line 136 describes explicit archive step, not auto-archive. No mention of `--skip-auto-archive` or `closeReport.archive`.

**Human review:** no

---

### Step 7. Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `.devin/workflows/deploy.md` already references `mission.archive --status=closed` as explicit step (already applied — no changes needed)
- Verify `docs/rfcs/archive/implemented/rfc-0796-*.md` has `amendedBy: [RFC-0801]` (already applied)
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0801` — must pass
- Run `pnpm --filter @warpgogol/werkstatt run build:check` — must pass
- Run `pnpm --filter @warpgogol/forge run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt run test` — all tests pass
- Run `pnpm --filter @warpgogol/forge run test` — all tests pass
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against implemented code. Mark `[x]` with `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0801 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0801` — passes
- All acceptance criteria checked off with evidence
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0801`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0801` in the subject line
- `rfc.implement.stamp` output confirming `accepted → implemented` transition

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Stale mission directories accumulate | Step 6 updates AGENTS.md; deploy.md already documents explicit archive step; RFC-0796 stale-entry validator warning remains active |
| Service folder deletion loses cached state | Step 3 cleanup runs only at archive time (post-deploy); `mission.materialize` regenerates all folders |
| Behavioral change for existing scripts | Step 2 removes `--skip-auto-archive` flag entirely (forward-only); unknown-flag warning is the correct signal |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-48, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0801 --reason "..." --invariant "DNA-N"` instead of working around it.
