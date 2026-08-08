---
rfcId: RFC-0762
planId: PLAN-RFC-0762-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - AGENTS.md
---

# Implementation Plan: RFC-0762

## 1. Objectives

- [ ] Objective 1 — Extend `CloseReportMirror` with `synced` and `syncError` fields (maps to acceptance criterion: "CloseReport.mirror includes synced and syncError fields")
- [ ] Objective 2 — Add `sternsystem.sync` call after cache clone commits when `mirrors.length > 2` (maps to acceptance criterion: "mission.close calls sternsystem.sync after cache clone commits when mirrors.length > 2")
- [ ] Objective 3 — Sync failure is non-fatal (maps to acceptance criterion: "Sync failure is non-fatal — mission.close still succeeds with a warning")
- [ ] Objective 4 — Skip sync when no external mirrors (maps to acceptance criterion: "No external mirrors (mirrors.length <= 2) — sync skipped, no warning")
- [ ] Objective 5 — Unit tests cover all three paths (maps to acceptance criteria: "Unit test: sync called when mirrors > 2", "Unit test: sync failure does not block close", "Unit test: sync skipped when mirrors <= 2")
- [ ] Objective 6 — AGENTS.md updated to document automatic sync in `mission.close`

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — extend `CloseReportMirror` interface, add `sternsystem.sync` call after `.materialization-state.json` commit, before success return
- `packages/os/site-kernel-handoff/src/mission/index.ts` — no changes (exports unchanged)
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` — no changes (existing sync implementation)

### 2.2 Configuration and data

No configuration or data changes. The sync is internal to `mission.close`.

### 2.3 Documentation and specs

- `AGENTS.md` — update § External mirror sync to note `mission.close` also syncs automatically after close commits
- `packages/os/site-kernel-handoff/AGENTS.md` — add rule about `mission.close` post-close sync
- `docs/rfcs/rfc-0762-*.md` — read-only reference (accepted status)
- No `docs/*.xml` Compass sync needed (confirmed in RFC: development-plan.xml and verification-plan.xml reference mission.close only for content regression, not mirror sync)
- No `docs/architecture-dna.md` changes (DNA-46 already satisfied)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — vitest unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0762` — RFC validation

## 3. Step sequence

### Step 1. Extend CloseReportMirror interface

**Goal:** Add `synced` and `syncError` fields to the existing `CloseReportMirror` interface.

**Agent actions:**

- Add `synced: boolean` and `syncError: string | null` to `CloseReportMirror` in `mission-close.ts`
- Initialize both fields in the `closeReport` object construction (default `synced: false`, `syncError: null` — updated after sync runs)
- Add CHANGE_SUMMARY entry: `RFC-0762: extend CloseReportMirror with synced/syncError; add post-close sternsystem.sync call.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `CloseReportMirror` interface has 6 fields: `originSha`, `mirrorSha`, `inSync`, `recommendation`, `synced`, `syncError`. The `closeReport` object initializes all 6.

**Human review:** no

---

### Step 2. Add sternsystem.sync call before state file write

**Goal:** Insert the post-close `sternsystem.sync` call after the werkstatt commit and auto-pin (the last cache clone commits before the state file), but before the `.materialization-state.json` write, so the state file captures the final HEAD.

**Agent actions:**

- Place the sync call BEFORE the `.materialization-state.json` try block (line ~533), in its own try/catch, so the state file captures the final HEAD including the sync's bordbuch commit:
  - Check `entry && entry.mirrors.length > 2`
  - If true, dynamic import `executeKernelCommand` from `@warpgogol/site-kernel`
  - Call `executeKernelCommand({ workspaceRoot, commandName: "sternsystem.sync", argv: [\`--id=${manifest.systemId}\`] })`
  - Check `syncResult.exitCode ?? 0`
  - On non-zero: `logger.warn` with manual sync recommendation, set `closeReport.mirror.synced = false`, `closeReport.mirror.syncError = syncResult.summary ?? ...`
  - On zero: set `closeReport.mirror.synced = true`, `closeReport.mirror.syncError = null`
  - Wrap in its own try/catch for unexpected throws — `logger.warn`, set `synced = false`, `syncError = err.message`. Sync failure does NOT prevent the state file write.
  - If `mirrors.length <= 2`: set `closeReport.mirror.synced = false` (not attempted), `syncError = null` — no warning, no sync call

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `mission.close` calls `sternsystem.sync` via `executeKernelCommand` when `mirrors.length > 2` after the werkstatt commit and auto-pin, before the `.materialization-state.json` write. Sync failure does not throw. No external mirrors → sync skipped silently.

**Human review:** no

---

### Step 3. Update AGENTS.md

**Goal:** Document that `mission.close` now syncs external mirrors automatically.

**Agent actions:**

- In root `AGENTS.md` § External mirror sync, update the bullet about `mission.close` to note it also calls `sternsystem.sync` after close commits (in addition to the RFC-0705 blocking check)
- In `packages/os/site-kernel-handoff/AGENTS.md`, add a rule: `RFC-0762: mission.close calls sternsystem.sync after cache clone commits when mirrors.length > 2. Sync failure is non-fatal (logger.warn).`

**Validation:**

- `git diff AGENTS.md` shows the updated text

**Completion criterion:** Both AGENTS.md files mention the automatic post-close sync.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Add three unit tests covering the sync call, sync failure, and sync skip paths.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/rfc-0762-close-mirror-sync.test.ts`
- Reuse the `setupCloseWorkspace` pattern from `rfc-0705-mirror-sync.test.ts` (external mirrors config, reconciled mission, mocked `mission.validate`)
- Mock `executeKernelCommand` from `@warpgogol/site-kernel` (same pattern as rfc-0705 tests)
- Test 1: "close with external mirrors calls sternsystem.sync and sets mirror.synced=true" — setup with `externalMirrors: true`, mock `executeKernelCommand` to return `exitCode: 0`, run `runMissionClose`, verify `closeReport.mirror.synced === true`
- Test 2: "close with sync failure does not block close and sets mirror.synced=false" — mock `executeKernelCommand` to return `exitCode: 1`, run `runMissionClose`, verify it does NOT throw, verify `closeReport.mirror.synced === false`, verify `closeReport.mirror.syncError` contains the error summary
- Test 3: "close without external mirrors does not call sternsystem.sync" — setup with `externalMirrors: false`, run `runMissionClose`, verify `executeKernelCommand` was NOT called with `sternsystem.sync`, verify `closeReport.mirror.synced === false`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --reporter=verbose rfc-0762` passes

**Completion criterion:** All three tests pass. Tests verify `synced`/`syncError` fields and `executeKernelCommand` call behavior.

**Human review:** no

---

### Step 5. Validation suite

**Goal:** Run all validation checks and fix any issues.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0762 --json`
- Fix any TypeScript compilation errors or test failures

**Validation:**

- All three commands exit 0

**Completion criterion:** `build:check` passes, all tests pass, `rfc.validate` passes with 0 violations.

**Human review:** no

---

### Step 6. Evidence emission

**Goal:** Emit verification evidence for RFC-0762.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0762`
- If evidence file is generated, commit it alongside the implementation

**Validation:**

- Evidence file exists at `docs/rfcs/verification/rfc-0762.generated.json` (or skip is reported for policy RFCs — RFC-0762 is `kind: architecture` so evidence should be emitted)

**Completion criterion:** Evidence file committed or skip documented.

**Human review:** no

---

### Step 7. Review, fix, and stamp implemented

**Goal:** Run code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0762 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0762` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence annotations. RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0762`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0762` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0762.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0762` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance: sync adds 5-30s to close | Step 2: sync is only called when `mirrors.length > 2` — systems without external mirrors are unaffected |
| Non-fatal vs evidence sync asymmetry | Step 2: sync failure logs `logger.warn` and continues — the mission is already closed (irreversible), blocking would leave inconsistent state |
| Duplicate sync after reconcile | Step 2: git push is idempotent — no harm |
| sternsystem.sync produces bordbuch entry | Step 2: sync is placed before `.materialization-state.json` write in its own try/catch — state file captures the final HEAD including sync's bordbuch commit. Sync failure doesn't block state file write. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0762 --reason "..." --invariant "DNA-46"` instead of working around it.
