---
rfcId: RFC-0593
planId: PLAN-RFC-0593-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0593

## 1. Objectives

- [ ] Objective 1 — `mission.open` runs `bordbuch.validate` before lock acquisition and refuses to open if violations exist (maps to acceptance criteria 1–3)
- [ ] Objective 2 — `mission.close` runs `mission.validate` after `reconciledAt` check, before `acquireLock`, and refuses to close on validation failure (maps to acceptance criteria 4–7)
- [ ] Objective 3 — `mission.close` re-checks `manifest.state === "open"` inside the lock after out-of-lock validation passes (maps to acceptance criterion: lock re-check test)
- [ ] Objective 4 — `packages/os/site-kernel-handoff/AGENTS.md` documents the new gates and the `reconciledAt → materializedAt` invariant chain (maps to acceptance criteria 8–9)
- [ ] Objective 5 — Unit tests cover both gates and the lock re-check (maps to acceptance criteria 10–11)
- [ ] Objective 6 — `rfc.validate` passes on RFC-0593 (maps to acceptance criterion 12)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-open.ts` — add `preflightBordbuch` call before `acquireLock` (line 74). Import `validateBordbuch` from `../bordbuch/bordbuch-io.ts`. Call `validateBordbuch(workspaceRoot, systemId)` before lock acquisition. If violations exist, throw with descriptive error listing violation types and directing to `bordbuch.repair`.
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — add `runInlineValidate` call after `reconciledAt` check (line 117), before `acquireLock` (line 119). Import `runMissionValidate` from `./mission-materialization-commands.ts`. Call it with a synthetic `KernelCommandInput` containing `--mission <missionId>`. If validation fails (exitCode !== 0), throw with failure list. After `acquireLock`, re-read manifest and re-check `state === "open"` before proceeding.
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` — `validateBordbuch` already exported at line 164. No changes needed.
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — `runMissionValidate` already exported at line 145. No changes needed.

### 2.2 Configuration and data

No configuration or data file changes. No ontology catalog changes. No schema changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add a new section "Validation gates (RFC-0593)" documenting:
  - `mission.open` runs `bordbuch.validate` as pre-flight gate before lock acquisition
  - `mission.close` runs `mission.validate` after `reconciledAt` check, before `acquireLock`
  - Lock scope design: validation runs outside locks; state is re-checked inside locks
  - Invariant chain: `reconciledAt !== null` implies `materializedAt !== null` via the validate → reconcile → close flow
  - TOCTOU limitation for `preflightBordbuch` (low risk, operator-only `bordbuch.repair` concurrency)

### 2.4 Validation and pipelines

- No pipeline changes. Gates run inside `mission.open` and `mission.close` command handlers, not in `build.check` or `build.prepare`.
- No CI workflow changes.
- `rfc.validate --id RFC-0593` must pass after implementation.

## 3. Step sequence

### Step 1. Add `preflightBordbuch` gate to `mission.open`

**Goal:** `mission.open` validates bordbuch integrity before acquiring locks or creating any side effects.

**Agent actions:**

- Import `validateBordbuch` from `../bordbuch/bordbuch-io.ts` in `mission-open.ts`
- Add `preflightBordbuch` function: calls `validateBordbuch(workspaceRoot, systemId)`, returns `{ passed: boolean; violations: BordbuchViolation[] }`
- Call `preflightBordbuch` after `--system` and `--brief` validation (line 70), before `acquireLock` (line 74)
- If violations exist, throw `Error` with message: `[mission.open] bordbuch for system '${systemId}' has ${violations.length} violation(s) — run bordbuch.repair first\n` + list of violations (rule + message per line)
- Update `CHANGE_SUMMARY` block: add `<item>RFC-0593: add bordbuch.validate pre-flight gate before lock acquisition.</item>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- Unit test: `mission.open` with a bordbuch containing `orphan-mission-close` violation throws before creating directories

**Completion criterion:** `mission.open` throws with descriptive error when bordbuch has violations; no directories or manifests created; `build:check` passes.

**Human review:** no

---

### Step 2. Add `runInlineValidate` gate to `mission.close`

**Goal:** `mission.close` validates content before acquiring locks and re-checks state inside locks.

**Agent actions:**

- Import `runMissionValidate` from `./mission-materialization-commands.ts` in `mission-close.ts`
- Add `runInlineValidate` function: constructs a synthetic `KernelCommandInput` with `flags: { mission: missionId }`, calls `runMissionValidate(input, context)`, returns `{ passed: boolean; failures: string[]; report: MissionValidateData }`
- Call `runInlineValidate` after `reconciledAt` check (line 117), before `acquireLock` (line 119)
- If validation fails (`exitCode !== 0`), throw `Error` with message: `[mission.close] validation failed for mission '${missionId}' — fix issues and re-run mission.validate\n` + failure list from the validation report
- After `acquireLock` calls (line 133), re-read manifest via `readMissionManifest(workspaceRoot, missionId)` and re-check `manifest.state === "open"`. If state changed, throw: `[mission.close] mission '${missionId}' state changed to '${manifest.state}' during validation — aborting close`
- Update `CHANGE_SUMMARY` block: add `<item>RFC-0593: add mission.validate inline gate before lock acquisition; re-check state inside locks.</item>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- Unit test: `mission.close` with a mission that has validation failures throws before transitioning state
- Unit test: `mission.close` re-checks state inside lock after out-of-lock validation

**Completion criterion:** `mission.close` throws with failure list when validation fails; mission remains `open`; state re-check prevents TOCTOU; `build:check` passes.

**Human review:** no

---

### Step 3. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Document the new validation gates and the invariant chain.

**Agent actions:**

- Add a new section "Validation gates (RFC-0593)" after the "Werkstatt side-effect auto-commit (RFC-0580)" section
- Document:
  - `mission.open` runs `bordbuch.validate` as pre-flight gate before lock acquisition. If violations exist, `mission.open` refuses and directs to `bordbuch.repair`.
  - `mission.close` runs `mission.validate` after `reconciledAt` check, before `acquireLock`. Validation runs outside lock scope to avoid holding registry/system/mission locks for 2+ minutes. State is re-checked inside locks before transition.
  - Invariant chain: `reconciledAt !== null` implies `materializedAt !== null` via the validate → reconcile → close flow. No exception path needed for non-materialized missions.
  - TOCTOU limitation: `preflightBordbuch` runs without locks. `bordbuch.repair` (operator-only) could change bordbuch concurrently. Low risk — failed attempt exits with code 1 before side effects.
  - `--force` bypass flag is NOT provided. Validation gates are hard gates.

**Validation:**

- `packages/os/site-kernel-handoff/AGENTS.md` contains "RFC-0593" and "Validation gates" and "reconciledAt implies materializedAt"

**Completion criterion:** AGENTS.md section exists with all five bullet points above.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Cover both gates and the lock re-check with unit tests.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/mission-open-bordbuch-gate.test.ts`:
  - Test: `mission.open` with a bordbuch containing `orphan-mission-close` violation throws before creating directories. Assert no mission directory exists after the throw.
  - Test: `mission.open` with a clean bordbuch (0 violations) proceeds normally.
- Create `packages/os/site-kernel-handoff/src/tests/mission-close-validate-gate.test.ts`:
  - Test: `mission.close` on a mission with validation failures (mock `runMissionValidate` to return `exitCode: 1`) throws before transitioning state. Assert mission remains `open`.
  - Test: `mission.close` re-checks state inside lock — if manifest state changes to `aborted` between validation and lock acquisition, `mission.close` throws state error.
  - Test: `mission.close` on a mission with passing validation proceeds to `closed` state.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- All new test files discovered by vitest (must be under `src/tests/`)

**Completion criterion:** All tests pass; both gates and lock re-check covered.

**Human review:** no

---

### Step 5. Validation suite

**Goal:** Run all validation commands and verify acceptance criteria.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0593` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-handoff test` — must pass
- Check off each acceptance criterion in the RFC against the implemented code

**Validation:**

- All three commands pass with exit code 0

**Completion criterion:** `rfc.validate` passes; `build:check` passes; all tests pass; all acceptance criteria verified.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 3).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `mission.open` and `mission.close` behavior changed — check if manifest needs refresh).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0593 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0593`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0593`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0593` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance: `mission.close` runs 2+ minute build | Step 2: validation runs before `acquireLock`, so locks are not held during build |
| False positives: validator bug blocks close | Step 4: tests verify gate behavior; validator bugs would also block standalone `mission.validate` |
| Agent confusion: direct `mission.yaml` edits | Step 3: AGENTS.md documents gates; `mission.yaml` is auto-committed (RFC-0580) |
| Double build: validate + close both build | Step 2: acceptable for rare close operation; documented in RFC Risks section |
| TOCTOU: bordbuch changes between validation and lock | Step 3: AGENTS.md documents as known limitation; failed attempt exits before side effects |
| State change between validation and lock | Step 2: state re-check inside locks prevents closing an aborted mission |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0593 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `runMissionValidate` cannot be called from `mission.close` due to circular import or type incompatibility, investigate the root cause before adding a wrapper or shim — the RFC specifies direct reuse of the existing command.
