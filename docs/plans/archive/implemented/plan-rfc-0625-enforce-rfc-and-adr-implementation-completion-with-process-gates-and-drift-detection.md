---
rfcId: RFC-0625
planId: PLAN-RFC-0625-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
  services: []
  docs:
    - packages/forge/skills/fo/fo-idea-plan/SKILL.md
    - packages/forge/skills/fo/fo-idea-implement/SKILL.md
---

# Implementation Plan: RFC-0625

## 1. Objectives

- [ ] Objective 1 — Add V-32 drift detection to `rfc.validate` — maps to acceptance criterion "V-32 warning emitted by `rfc.validate`..."
- [ ] Objective 2 — Add AV-16 drift detection to `adr.validate` — maps to acceptance criterion "AV-16 warning emitted by `adr.validate`..."
- [ ] Objective 3 — Add step 8 "Stamp implemented" to `fo-idea-plan` skill — maps to acceptance criterion "fo-idea-plan step 4 includes step 8..."
- [ ] Objective 4 — Add gate steps 3.11b and 4.10b to `fo-idea-implement` skill — maps to acceptance criteria "fo-idea-implement step 3.11b..." and "4.10b..."
- [ ] Objective 5 — Sync skill copies to `.agents/skills/` — maps to acceptance criterion "Synced copies match..."
- [ ] Objective 6 — Unit tests for V-32 and AV-16 — maps to acceptance criterion "Unit tests cover..."

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/rfc/handlers/validate-rules.ts` — add `checkImplementationCommitDrift` function and V-32 check in `validateSingleRfc`
- `packages/forge/os/adr/handlers/validate.ts` — add `checkAdrImplementationCommitDrift` function and AV-16 check in `validateSingleAdr` (signature change: sync → async, add `workspaceRoot` parameter)
- `packages/forge/os/rfc/handlers/validate-rules.test.ts` — add V-32 test cases
- `packages/forge/os/adr/handlers/validate.test.ts` — add AV-16 test cases (new file if none exists)

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `packages/forge/skills/fo/fo-idea-plan/SKILL.md` — add step 8 "Stamp implemented" to step 4 plan template
- `packages/forge/skills/fo/fo-idea-implement/SKILL.md` — add step 3.11b (RFC gate) and step 4.10b (ADR gate)
- `.agents/skills/fo/fo-idea-plan/SKILL.md` — synced copy
- `.agents/skills/fo/fo-idea-implement/SKILL.md` — synced copy

### 2.4 Validation and pipelines

- `rfc.validate` — extended with V-32 (warning, non-blocking)
- `adr.validate` — extended with AV-16 (warning, non-blocking)
- No `build.check` or CI pipeline changes — V-32/AV-16 are advisory

## 3. Step sequence

### Step 1. Add V-32 to RFC validation rules

**Goal:** Implement `checkImplementationCommitDrift` and add V-32 warning to `rfc.validate`.

**Agent actions:**

- Add `checkImplementationCommitDrift(workspaceRoot, rfcId, createdAt, currentStatus)` to `packages/forge/os/rfc/handlers/validate-rules.ts`
- The function runs `git log --since="<createdAt>" --oneline` and checks for commits matching `^implement: RFC-\d{4}\b` on the subject line
- If `currentStatus` is not `implemented` and matching commits exist, return a V-32 warning violation
- Call this function at the end of `validateSingleRfc` (after V-31), passing `workspaceRoot` (already available as a parameter)
- Import `execGitCommand` or use `child_process.execSync` for git log — check existing patterns in the forge codebase

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm exec vitest run packages/forge/os/rfc/handlers/validate-rules.test.ts` passes

**Completion criterion:** V-32 warning is emitted for RFCs with `status: accepted` and `implement: RFC-XXXX` commits since `createdAt`; no warning when status is `implemented` or no matching commits exist.

**Human review:** no

---

### Step 2. Add AV-16 to ADR validation

**Goal:** Implement `checkAdrImplementationCommitDrift` and add AV-16 warning to `adr.validate`.

**Agent actions:**

- Change `validateSingleAdr` signature from sync to `async` and add `workspaceRoot: string` parameter
- Update the call site in `runAdrValidate` (line 103) to `await validateSingleAdr(...)` and pass `workspaceRoot`
- Add `checkAdrImplementationCommitDrift(workspaceRoot, adrId, createdAt, currentStatus)` to `packages/forge/os/adr/handlers/validate.ts`
- Same logic as V-32 but with `ADR-XXXX` id matching and `proposed`/`reviewing`/`accepted` as triggering statuses
- Call this function at the end of `validateSingleAdr` (after AV-15)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm exec vitest run packages/forge/os/adr/handlers/validate.test.ts` passes

**Completion criterion:** AV-16 warning is emitted for ADRs with non-`implemented` status and `implement: ADR-XXXX` commits since `createdAt`; no warning when status is `implemented` or no matching commits exist.

**Human review:** no

---

### Step 3. Add unit tests for V-32 and AV-16

**Goal:** Comprehensive test coverage for drift detection rules.

**Agent actions:**

- Add V-32 test cases to `packages/forge/os/rfc/handlers/validate-rules.test.ts`:
  - Drift detected: `status: accepted` + `implement: RFC-9999` commits → V-32 warning emitted
  - No drift: `status: implemented` + `implement: RFC-9999` commits → no V-32
  - No drift: `status: accepted` + no `implement:` commits → no V-32
  - No drift: `status: draft` + no commits → no V-32
- Add AV-16 test cases to `packages/forge/os/adr/handlers/validate.test.ts` (create if needed):
  - Drift detected: `status: accepted` + `implement: ADR-9999` commits → AV-16 warning
  - No drift: `status: implemented` + commits → no AV-16
  - No drift: `status: proposed` + no commits → no AV-16
- Mock `git log` using a test helper or `vi.mock` — do not depend on real git history

**Validation:**

- `pnpm exec vitest run packages/forge/os/rfc/handlers/validate-rules.test.ts` — all V-32 tests pass
- `pnpm exec vitest run packages/forge/os/adr/handlers/validate.test.ts` — all AV-16 tests pass

**Completion criterion:** All 4 V-32 test cases and 3 AV-16 test cases pass.

**Human review:** no

---

### Step 4. Add step 8 to fo-idea-plan skill

**Goal:** Add "Stamp implemented" as step 8 in the plan template (step 4 of the skill).

**Agent actions:**

- Edit `packages/forge/skills/fo/fo-idea-plan/SKILL.md` step 4 — add step 8 after step 7 (Review & Fix):
  ```
  8. **Stamp implemented** — run `rfc.implement.stamp --id RFC-XXXX --implementation-commit <sha>` to transition `accepted → implemented`. For ADRs, manually set `status: implemented` and `implementedAt` per `fo-idea-implement` step 4.10.
  ```
- Copy the edited skill to `.agents/skills/fo/fo-idea-plan/SKILL.md`

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate --json` passes
- `diff packages/forge/skills/fo/fo-idea-plan/SKILL.md .agents/skills/fo/fo-idea-plan/SKILL.md` shows no differences

**Completion criterion:** Step 8 exists in the plan template and synced copy matches.

**Human review:** no

---

### Step 5. Add gate steps 3.11b and 4.10b to fo-idea-implement skill

**Goal:** Add post-implementation verification gates before the report step.

**Agent actions:**

- Edit `packages/forge/skills/fo/fo-idea-implement/SKILL.md`:
  - Add step 3.11b after step 3.11 (Fix review findings) and before step 3.12 (RFC report):
    ```
    #### 3.11b. Implementation status gate (RFC)

    Before reporting completion, verify the RFC has been stamped as `implemented`:

    1. Read the RFC frontmatter — confirm `status: implemented` and `implementedAt` is set.
    2. Run `rfc.validate --id RFC-XXXX --json` — confirm zero errors.
    3. If status is not `implemented`, go back to step 3.8 (Stamp implemented) and run the stamp command.
    4. If `rfc.validate` reports errors, fix them before proceeding.

    This gate is MANDATORY. Do not proceed to step 3.12 (report) until the RFC is `implemented`.
    ```
  - Add step 4.10b after step 4.10 (Stamp implemented) and before step 4.11 (Report):
    ```
    #### 4.10b. Implementation status gate (ADR)

    Before reporting completion, verify the ADR has been transitioned to `implemented`:

    1. Read the ADR frontmatter — confirm `status: implemented` and `implementedAt` is set.
    2. Run `adr.validate --id ADR-XXXX --json` — confirm zero errors.
    3. If status is not `implemented`, go back to step 4.10 (Stamp implemented) and set `status: implemented`, `implementedAt`, `updatedAt`.
    4. If `adr.validate` reports errors, fix them before proceeding.

    This gate is MANDATORY. Do not proceed to step 4.11 (report) until the ADR is `implemented`.
    ```
- Copy the edited skill to `.agents/skills/fo/fo-idea-implement/SKILL.md`

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate --json` passes
- `diff packages/forge/skills/fo/fo-idea-implement/SKILL.md .agents/skills/fo/fo-idea-implement/SKILL.md` shows no differences

**Completion criterion:** Steps 3.11b and 4.10b exist in the implement skill and synced copy matches.

**Human review:** no

---

### Step 6. Documentation audit, review, fix, and stamp

**Goal:** Synchronize documentation, run code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `fo-doc-audit` via the `skill` tool to check all documentation surfaces
- Run `fo-review` via the `skill` tool on all session code changes
- Run `fo-fix` if review findings exist
- Check off all acceptance criteria with inline `(evidence: ...)` annotations
- Run `rfc.implement.stamp --id RFC-0625 --implementation-commit <sha>` to transition to `implemented`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0625` — passes with zero errors
- `pnpm --filter @warpgogol/forge run build:check` — passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All documentation updated; code review passed; all acceptance criteria checked with evidence; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0625`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm exec vitest run packages/forge/os/rfc/handlers/validate-rules.test.ts`
- `pnpm exec vitest run packages/forge/os/adr/handlers/validate.test.ts`
- `pnpm exec site-kernel run forge.skill.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0625` in the subject line
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| V-32/AV-16 false positive during in-progress implementation | Warning severity — does not block validation (Step 1, 2) |
| V-32/AV-16 false negative from squash merges | Accepted — safety net only; plan template and skill gates are primary defense (Step 4, 5) |
| ADR validate function signature change (sync → async) | Step 2 calls out the signature change explicitly; call site updated in same step |
| Skill gate bypass by manual workflow | V-32/AV-16 catch this case in CI (Step 1, 2) |
| Agent confusion from V-32 warnings | Warning message directs to `rfc.implement.stamp` — not an immediate action (Step 1) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0625 --reason "..." --invariant "DNA-N"` instead of working around it.
