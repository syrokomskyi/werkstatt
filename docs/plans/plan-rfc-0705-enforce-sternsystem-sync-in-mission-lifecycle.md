---
rfcId: RFC-0705
planId: PLAN-RFC-0705-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0705

## 1. Objectives

- [ ] Objective 1 — Add `mirrorSync` field to `MissionReconcileData` and call `sternsystem.sync` from reconcile — maps to acceptance criteria [1-4]
- [ ] Objective 2 — Add blocking mirror sync check to `mission.close` before state transition — maps to acceptance criteria [5-7]
- [ ] Objective 3 — Write unit tests for both reconcile and close mirror sync behavior — maps to acceptance criteria [8-11]
- [ ] Objective 4 — Update `AGENTS.md` and `packages/os/site-kernel-handoff/AGENTS.md` with enforced sync rules — maps to acceptance criterion [12]
- [ ] Objective 5 — Validate, review, fix, and stamp implemented — maps to acceptance criterion [13]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — `runMissionReconcile`: add `mirrorSync` to `MissionReconcileData`, call `sternsystem.sync` via `executeKernelCommand` after `git push origin` retry loop (inside `existsSync(gitDir)` branch, only when `entry.mirrors.length > 2`), include `mirrorSync` in `reconciliation-report.json`
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — `runMissionClose`: move mirror status gathering (lines 316–364) before state transition (line 263), add blocking check after mirror status gathering and before state transition
- `packages/os/site-kernel-handoff/src/tests/` — new test file for RFC-0705 behavior

### 2.2 Configuration and data

- None — no schema changes, no registry changes, no pipeline config changes.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — update the External mirror sync rule from "MUST invoke" to "automatically enforced"
- `packages/os/site-kernel-handoff/AGENTS.md` — add RFC-0705 notes to the reconcile and close sections

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0705`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

## 3. Step sequence

### Step 1. Add `mirrorSync` to `MissionReconcileData` and call `sternsystem.sync` from reconcile

**Goal:** Add the `mirrorSync` field to the reconcile data interface and invoke `sternsystem.sync` after the bare repo push.

**Agent actions:**

- Add `mirrorSync?: { attempted: boolean; succeeded: boolean; error: string | null }` to `MissionReconcileData` interface
- After the `git push origin` retry loop (after line 1161, inside the `existsSync(gitDir)` branch), read the registry to check `entry.mirrors.length > 2`
- If external mirrors exist, call `sternsystem.sync` via `executeKernelCommand` with `commandName: "sternsystem.sync"` and `argv: [`--id=${manifest.systemId}`]`
- Wrap the call in try/catch — on success set `mirrorSync: { attempted: true, succeeded: true, error: null }`, on failure set `mirrorSync: { attempted: true, succeeded: false, error: <message> }` and log `logger.warn`
- If no external mirrors (`mirrors.length <= 2`), set `mirrorSync: { attempted: false, succeeded: false, error: null }`
- Add `mirrorSync` to the `reconciliation-report.json` report object
- Add `mirrorSync` to the returned `data` object
- Update the `summary` string to include mirror sync status when attempted

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles

**Completion criterion:** `MissionReconcileData` has `mirrorSync` field; reconcile calls `sternsystem.sync` via `executeKernelCommand` when external mirrors exist; sync failure is non-fatal; `reconciliation-report.json` includes `mirrorSync`.

**Human review:** no

---

### Step 2. Add blocking mirror sync check to `mission.close`

**Goal:** Move mirror status gathering before the state transition and add a blocking check when external mirrors are desynced.

**Agent actions:**

- In `runMissionClose`, move the mirror status gathering block (currently lines 316–364: reading registry, checking bare repo, computing `originSha`/`mirrorSha`/`mirrorInSync`/`recommendation`) to BEFORE the state transition (`manifest.state = "closed"` at line 263)
- After mirror status gathering, add blocking check:
  ```ts
  if (entry && entry.mirrors.length > 2 && !mirrorInSync) {
    throw new Error(
      `[mission.close] external mirrors are out of sync for system '${manifest.systemId}'. ` +
      `${recommendation ?? "Run: sternsystem.sync --id " + manifest.systemId}`,
    );
  }
  ```
- The `closeReport` assembly (later in the flow) reuses the already-gathered `originSha`, `mirrorSha`, `mirrorInSync`, `recommendation` variables — no duplicate gathering
- Ensure the `CloseReport` shape is unchanged — the same variables populate the same fields

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles

**Completion criterion:** `mission.close` throws before state transition when `mirrors.length > 2` and `mirrorInSync === false`; close does NOT throw when `mirrors.length <= 2`; error message includes `sternsystem.sync` command.

**Human review:** no

---

### Step 3. Write unit tests

**Goal:** Create unit tests covering all four mirror sync behavior paths.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/rfc-0705-mirror-sync.test.ts`
- Test 1: reconcile with successful sync — mock `executeKernelCommand` to return success for `sternsystem.sync`, verify `mirrorSync.succeeded === true`
- Test 2: reconcile with sync failure — mock `executeKernelCommand` to throw, verify `mirrorSync.succeeded === false`, reconcile completes (no throw)
- Test 3: close with desynced mirrors — set up registry with `mirrors.length > 2` and bare repo with mismatched SHAs, verify `mission.close` throws with actionable error
- Test 4: close with no external mirrors — set up registry with `mirrors.length <= 2`, verify close does NOT throw
- Use existing test patterns from `mission-close-release-id.test.ts` and bordbuch conflict tests for setup helpers

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass

**Completion criterion:** All 4 test cases pass; tests cover success/failure for reconcile sync and blocking/non-blocking for close.

**Human review:** no

---

### Step 4. Update documentation

**Goal:** Update AGENTS.md files to reflect the enforced sync behavior.

**Agent actions:**

- In root `AGENTS.md`, update the "External mirror sync (RFC-0472, RFC-0574)" section: change the rule from "Agents MUST invoke `sternsystem.sync --id <id>` automatically after a successful `mission.reconcile`" to "Automatically enforced by `mission.reconcile` (best-effort) and `mission.close` (blocking check). `mission.reconcile` calls `sternsystem.sync` after pushing to the bare repo; `mission.close` blocks if external mirrors are out of sync."
- In `packages/os/site-kernel-handoff/AGENTS.md`, add a note in the reconcile section: "RFC-0705: `mission.reconcile` calls `sternsystem.sync` via `executeKernelCommand` after `git push origin` when `mirrors.length > 2`. Sync failure is non-fatal (`logger.warn`). The `mirrorSync` field in `MissionReconcileData` and `reconciliation-report.json` records the sync status."
- In `packages/os/site-kernel-handoff/AGENTS.md`, add a note in the close section: "RFC-0705: `mission.close` blocks before state transition if `mirrors.length > 2` and `mirrorInSync === false`. The operator must run `sternsystem.sync --id <id>` and re-run close."

**Validation:**

- Visual inspection of AGENTS.md files

**Completion criterion:** Both AGENTS.md files updated with RFC-0705 enforcement notes.

**Human review:** no

---

### Step 5. Validation, review, fix, stamp implemented

**Goal:** Run all validation, code review, fix findings, check acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0705`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0705` (RFC-0330 — acceptance probes are commented out, so this will skip silently, which is expected)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0705 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0705`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All validation passes; code review passed (findings fixed if any); all acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0705`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0705` (will skip — acceptance probes commented out)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0705` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0705.generated.json` — verification evidence (may not be created if probes are commented out — expected)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Close blocking on transient GitHub outage | Step 2: error message includes exact `sternsystem.sync` command to run |
| Reconcile latency increase | Step 1: sync runs only when `mirrors.length > 2`; non-fatal warning ensures latency doesn't block |
| False positive mirror desync | Step 2: check only applies when `mirrors.length > 2`; first sync after mirror config requires manual `sternsystem.sync` |
| Agent confusion | Step 4: AGENTS.md updated to document automatic enforcement |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-44, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0705 --reason "..." --invariant "DNA-N"` instead of working around it.
