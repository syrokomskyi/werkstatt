---
rfcId: RFC-0645
planId: PLAN-RFC-0645-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0645

## 1. Objectives

- [ ] Objective 1 — Remove `generated.timestamp.validate` command from all pipelines and command tables (maps to acceptance criteria 1, 2)
- [ ] Objective 2 — Delete `TIMESTAMP_ALLOWLIST` and all source-scanning logic from `generated-timestamp-validate.ts` (maps to acceptance criteria 3, 4)
- [ ] Objective 3 — Remove TS-TIME-01 rule descriptor and TS-TIME-02 constant (maps to acceptance criterion 5)
- [ ] Objective 4 — Promote DRIFT-02 severity from info to error (maps to acceptance criterion 6)
- [ ] Objective 5 — Delete obsolete test file (maps to acceptance criterion 7)
- [ ] Objective 6 — Verify all generators support dryRun (maps to acceptance criteria 8, 9)
- [ ] Objective 7 — Pass `rfc.validate` (maps to acceptance criterion 10)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts` — delete entirely; move `stripCommentsAndStrings` to `command-args-validate.ts` (sole consumer)
- `packages/os/site-kernel-checks/src/command-args-validate.ts` — inline `stripCommentsAndStrings` function, remove import from `generated-timestamp-validate.ts`
- `packages/os/site-kernel-checks/src/generated-drift-validate.ts` — change DRIFT-02 diagnostic severity from `"info"` to `"error"` (2 emission sites: lines 178 and 191)
- `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` — change DRIFT-02 rule descriptor severity from `"info"` to `"error"`; delete TS-TIME-01 rule descriptor; update CHANGE_SUMMARY
- `packages/os/site-kernel-checks/src/pipelines/build-check.ts` — remove `generated.timestamp.validate` step (line 41)
- `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` — remove `generated.timestamp.validate` command entry (lines 654-676) and import of `runGeneratedTimestampValidate` (line 55)
- `packages/os/site-kernel-checks/src/tests/generated-timestamp-validate.test.ts` — delete

### 2.2 Configuration and data

No configuration or data files affected. `TIMESTAMP_ALLOWLIST` entries are deleted, not migrated.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — remove the `generated.timestamp.validate` row from the module table (line 49)
- No `docs/*.xml` Compass files need synchronization — no repository-wide semantics change
- No `docs/architecture-dna.md` change — DNA-58 remains, enforcement mechanism changes but invariant text is unchanged

### 2.4 Validation and pipelines

- `build.check` pipeline loses `generated.timestamp.validate` step
- `generated.drift.validate` remains as sole determinism check in `build.check`
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Pre-implementation audit: verify all generators support dryRun

**Goal:** Confirm no generator will produce DRIFT-02 errors after promotion to error severity.

**Agent actions:**

- Run `pnpm exec werkstatt run generated.drift.validate --site warpgogol-com --json` and check for DRIFT-02 diagnostics
- If any DRIFT-02 diagnostics exist, add dryRun support to those generators BEFORE proceeding
- If a generator's dryRun output differs from its normal output, fix the dryRun implementation

**Validation:**

- `generated.drift.validate --site warpgogol-com --json` reports zero DRIFT-02 diagnostics

**Completion criterion:** Zero DRIFT-02 diagnostics from `generated.drift.validate` for all active sites

**Human review:** no

---

### Step 2. Move `stripCommentsAndStrings` to `command-args-validate.ts`

**Goal:** Eliminate the dependency on `generated-timestamp-validate.ts` so the file can be fully deleted.

**Agent actions:**

- Copy the `stripCommentsAndStrings` function from `generated-timestamp-validate.ts` into `command-args-validate.ts` (inline, not imported)
- Remove the `import { stripCommentsAndStrings } from "./generated-timestamp-validate.ts"` line from `command-args-validate.ts`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` to confirm typecheck passes

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `command-args-validate.ts` no longer imports from `generated-timestamp-validate.ts`; typecheck passes

**Human review:** no

---

### Step 3. Delete `generated-timestamp-validate.ts` and its test file

**Goal:** Remove the source-scanning validator module and all related tests.

**Agent actions:**

- Delete `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts`
- Delete `packages/os/site-kernel-checks/src/tests/generated-timestamp-validate.test.ts`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` to confirm no broken imports

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** Both files deleted; no broken imports; typecheck passes

**Human review:** no

---

### Step 4. Remove `generated.timestamp.validate` from command table and pipeline

**Goal:** Remove the command registration and pipeline wiring.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts`:
  - Remove the `import { runGeneratedTimestampValidate } from "../generated-timestamp-validate.ts"` line (line 55)
  - Remove the `generated.timestamp.validate` command entry (lines 654-676)
- In `packages/os/site-kernel-checks/src/pipelines/build-check.ts`:
  - Remove the `{ command: "generated.timestamp.validate", args: ["--mode", "fail"] }` step (line 41) and its comment (line 40)
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` to confirm typecheck passes

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `generated.timestamp.validate` is not registered in any command table and not present in any pipeline

**Human review:** no

---

### Step 5. Promote DRIFT-02 severity from info to error

**Goal:** Make dryRun support mandatory for all generators.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/generated-drift-validate.ts`:
  - Change `severity: "info"` to `severity: "error"` at both DRIFT-02 emission sites (lines 178 and 191)
- In `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`:
  - Change the DRIFT-02 rule descriptor from `rule(..., "info")` to `rule(..., "error")` (line 492-497)
  - Delete the TS-TIME-01 rule descriptor (lines 499-504)
  - Update CHANGE_SUMMARY: remove the `RFC-0602: register TS-TIME-01` line, add `RFC-0645: promote DRIFT-02 to error, remove TS-TIME-01`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` to confirm typecheck passes

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** DRIFT-02 is error-severity in both the emission code and the rule descriptor; TS-TIME-01 rule descriptor is deleted

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Remove the `generated.timestamp.validate` module table entry from the package AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-checks/AGENTS.md`, remove the row for `src/generated-timestamp-validate.ts` (line 49)
- Update the `src/generated-drift-validate.ts` row to note DRIFT-02 is now error-severity

**Validation:**

- `git diff packages/os/site-kernel-checks/AGENTS.md` shows only the expected row removal and update

**Completion criterion:** AGENTS.md no longer references `generated.timestamp.validate` or `TIMESTAMP_ALLOWLIST`

**Human review:** no

---

### Step 7. Run scoped test suite

**Goal:** Verify all existing tests still pass after the changes.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-checks run test` to confirm no test failures
- If `generated-drift-validate.test.ts` exists and tests DRIFT-02 as info severity, update it to expect error severity

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` passes

**Completion criterion:** All tests pass; no test references deleted module or deleted command

**Human review:** no

---

### Step 8. Run `generated.drift.validate` end-to-end

**Goal:** Confirm the promoted DRIFT-02 severity works correctly in the full pipeline.

**Agent actions:**

- Run `pnpm exec werkstatt run generated.drift.validate --site warpgogol-com --json`
- Verify zero DRIFT-02 errors (all generators support dryRun per Step 1)
- Run `pnpm exec werkstatt run mission.validate --site warpgogol-com --json` if a mission is active, or confirm `build.check` pipeline passes

**Validation:**

- `generated.drift.validate` reports zero errors
- `build.check` pipeline passes (no `generated.timestamp.validate` step, `generated.drift.validate` passes)

**Completion criterion:** `generated.drift.validate` passes with zero errors; `build.check` pipeline passes

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-checks/AGENTS.md` no longer references `generated.timestamp.validate` or `TIMESTAMP_ALLOWLIST`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (a command was removed)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0645 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0645`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0645`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec werkstatt run generated.drift.validate --site warpgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0645` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Generator without dryRun support blocks validation | Step 1 audits all generators before any code changes |
| Non-determinism in generators without dryRun goes undetected | Step 1 adds dryRun support to all generators, closing the gap |
| `stripCommentsAndStrings` consumer breaks | Step 2 moves the function to `command-args-validate.ts` before deleting the source file |
| Agent confusion about removed `TIMESTAMP_ALLOWLIST` | Step 6 updates AGENTS.md to remove all references |
| Broken dryRun implementation causes false DRIFT-01 | Step 1 verifies dryRun output matches normal output byte-for-byte |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0645 --reason "..." --invariant "DNA-58"` instead of working around it.
- If a generator cannot be made dryRun-compatible (e.g., it depends on external state), escalate via `rfc.supersede.propose` rather than exempting it from DRIFT-02.
