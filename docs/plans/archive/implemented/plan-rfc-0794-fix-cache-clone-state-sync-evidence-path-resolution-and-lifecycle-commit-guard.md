---
rfcId: RFC-0794
planId: PLAN-RFC-0794-01
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
    - docs/rfcs/rfc-0794-fix-cache-clone-state-sync-evidence-path-resolution-and-lifecycle-commit-guard.md
---

# Implementation Plan: RFC-0794

## 1. Objectives

- [x] Objective 1 — `writeSystemState` pushes to bare repo after commit (maps to acceptance criterion 1)
- [x] Objective 2 — `leitstand.propagate` falls back to archive evidence path (maps to acceptance criterion 2)
- [x] Objective 3 — `commitWerkstattSideEffects` sets `ECOSYSTEM_COMMIT=1` (maps to acceptance criterion 3)
- [x] Objective 4 — `gitExec` supports optional `env` parameter (maps to acceptance criterion 4)
- [x] Objective 5 — `computeInputsHash` skips missing files (maps to acceptance criterion 5)
- [ ] Objective 6 — Unit tests covering all four fixes (maps to acceptance criterion 6)
- [ ] Objective 7 — Code review passed, RFC stamped implemented (maps to acceptance criterion 6)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/sternsystem/registry-io.ts` — `writeSystemState` push step (already implemented, commit `5.18.16`)
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — `runLeitstandPropagate` archive fallback (already implemented, commit `5.18.16`)
- `packages/werkstatt/src/werkstatt/werkstatt-commit.ts` — `commitWerkstattSideEffects` `ECOSYSTEM_COMMIT=1` (already implemented, commit `5.18.16`)
- `packages/werkstatt/src/werkstatt/git-exec.ts` — `gitExec` optional `env` parameter (already implemented, commit `5.18.16`)
- `packages/werkstatt/src/kernel/cache/command-result-cache.ts` — `computeInputsHash` try/catch (already implemented, commit `5.18.15`)

### 2.2 Configuration and data

None — no configuration files or data schemas changed.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0794-fix-cache-clone-state-sync-evidence-path-resolution-and-lifecycle-commit-guard.md` — RFC file (read-only reference)
- No AGENTS.md updates needed — internal behavior fixes, no governance rule changes
- No Compass XML updates needed — no repository-wide semantics changed
- No `docs/architecture-dna.md` updates needed — no new DNA invariant

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0794` — RFC validation

## 3. Step sequence

### Step 1. Verify existing implementation

**Goal:** Confirm all four code fixes are present and compile cleanly.

**Agent actions:**

- Read `packages/werkstatt/src/sternsystem/registry-io.ts:150-167` — verify push step exists
- Read `packages/werkstatt/src/leitstand/leitstand-commands.ts:1647-1674` — verify archive fallback exists
- Read `packages/werkstatt/src/werkstatt/werkstatt-commit.ts:47-49` — verify `ECOSYSTEM_COMMIT=1` env var
- Read `packages/werkstatt/src/werkstatt/git-exec.ts:17-36` — verify `env` parameter
- Read `packages/werkstatt/src/kernel/cache/command-result-cache.ts:160-168` — verify try/catch
- Run `pnpm --filter @warpgogol/werkstatt run build:check`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` exits 0

**Completion criterion:** All five code fixes verified present in source; TypeScript compilation passes.

**Human review:** no

---

### Step 2. Write unit tests

**Goal:** Add unit tests covering each fix to prevent regression.

**Agent actions:**

- Write test for `writeSystemState` push: mock `execSync`, verify `git push origin <branch>` is called after `git commit`
- Write test for `leitstand.propagate` archive fallback: create temp mission dir with evidence in `missions/archive/closed/<id>/`, verify propagate resolves it
- Write test for `commitWerkstattSideEffects` env var: verify `ECOSYSTEM_COMMIT=1` is passed to `gitExec`
- Write test for `computeInputsHash` missing files: delete a lock file between fingerprint calls, verify no crash
- Run `pnpm --filter @warpgogol/werkstatt run test`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` exits 0
- All new tests pass

**Completion criterion:** All four fixes have dedicated unit tests; test suite passes.

**Human review:** no

---

### Step 3. Code review and fix

**Goal:** Run `fo-review` on all session code changes and fix any findings.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all code changes since session start
- If findings, invoke `fo-fix` via the `skill` tool
- Re-run `fo-review` to confirm all findings resolved (max 3 iterations)

**Validation:**

- Review report exists in `docs/reviews/code/` for this session
- All findings resolved or documented as not-applicable

**Completion criterion:** Code review passed; all findings fixed.

**Human review:** no — automated via `fo-review`

---

### Step 4. Verify acceptance criteria and stamp implemented

**Goal:** Verify all acceptance criteria are met and stamp the RFC as implemented.

**Agent actions:**

- Verify each acceptance criterion in the RFC against the implemented code
- Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0794`
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0794` (if acceptance probes declared — none in this RFC)
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0794 --implementation-commit <sha>`

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0794` exits 0
- `git status` — no uncommitted changes
- RFC status transitions `accepted → implemented`

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0794`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0794` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared — `rfc.verification.emit` is optional

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Push to bare repo on every `writeSystemState` call | Step 2 — unit test verifies push is called and non-fatal on failure |
| Archive evidence path drift | Step 2 — unit test verifies fallback path resolution |
| `ECOSYSTEM_COMMIT=1` bypass scope | Step 2 — unit test verifies env var is scoped to `commitWerkstattSideEffects` |
| Agent misinterpretation of `ECOSYSTEM_COMMIT=1` | Step 4 — implementation notes in RFC explicitly scope the env var |
| Concurrent execution | Out of scope — DNA-46 single-open-mission constraint mitigates |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 or DNA-45, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0794 --reason "..." --invariant "DNA-N"` instead of working around it.
