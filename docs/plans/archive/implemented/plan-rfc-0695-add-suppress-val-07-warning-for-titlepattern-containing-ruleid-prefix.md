---
rfcId: RFC-0695
planId: PLAN-RFC-0695-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0695

## 1. Objectives

- [ ] Objective 1 — add SUPPRESS-VAL-07 warning to `suppressions.validate` when `titlePattern` contains `ruleId` (maps to acceptance criterion 1, 2, 3)
- [ ] Objective 2 — update command table description in `infra-contracts.ts` to include SUPPRESS-VAL-07 (maps to acceptance criterion 6)
- [ ] Objective 3 — document SUPPRESS-VAL-07 in `AGENTS.md` (maps to acceptance criterion 5)
- [ ] Objective 4 — add unit test for SUPPRESS-VAL-07 (maps to acceptance criterion 7)
- [ ] Objective 5 — verify no default rule in `systems/axiom-suppressions.yaml` triggers SUPPRESS-VAL-07 (maps to acceptance criterion 4)
- [ ] Objective 6 — `rfc.validate` passes on RFC-0695 (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/suppressions-validate.ts` — add `titlePatternContainsRuleId` helper + SUPPRESS-VAL-07 diagnostic loop after SUPPRESS-VAL-06
- `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` — update string enumeration of diagnostics to include SUPPRESS-VAL-07
- `packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts` — add unit test for SUPPRESS-VAL-07

### 2.2 Configuration and data

- No changes to `systems/axiom-suppressions.yaml` — no default rule uses `titlePattern` with ruleId prefix

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — document SUPPRESS-VAL-07 in `suppressions-validate.ts` entry

### 2.4 Validation and pipelines

- `suppressions.validate` is part of `mission.validate` pipeline — no pipeline wiring change needed
- No new commands, no registry changes

## 3. Step sequence

### Step 1. Add SUPPRESS-VAL-07 check to suppressions-validate.ts

**Goal:** Implement the `titlePatternContainsRuleId` helper and add the SUPPRESS-VAL-07 diagnostic loop.

**Agent actions:**

- Add `titlePatternContainsRuleId(rule: SuppressionRule): boolean` helper function after `isBroadPattern`
- Add SUPPRESS-VAL-07 loop after the SUPPRESS-VAL-06 loop (after line 192), iterating over `config.suppressions` and pushing a warning diagnostic when `titlePatternContainsRuleId(rule)` returns true
- Use `ruleId: "SUPPRESS-VAL-07"`, `severity: "warning"`, `file: WORKSHOP_SUPPRESSIONS_PATH`
- Include `fixHint` in the diagnostic: `Remove "${rule.ruleId}" from titlePattern and keep only the descriptive text.`
- Update the `CHANGE_SUMMARY` comment block at the top of the file with `RFC-0695: add SUPPRESS-VAL-07 warning for titlePattern containing ruleId prefix.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `titlePatternContainsRuleId` function exists and SUPPRESS-VAL-07 loop is present after SUPPRESS-VAL-06 loop; typecheck passes.

**Human review:** no

---

### Step 2. Update infra-contracts.ts command table description

**Goal:** Add SUPPRESS-VAL-07 to the string enumeration of diagnostics in the `suppressions.validate` command table entry.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`, find the `suppressions.validate` entry (line ~437-439)
- Append `SUPPRESS-VAL-07 (titlePattern containing ruleId prefix, warning)` to the diagnostics description string

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Command table description for `suppressions.validate` includes SUPPRESS-VAL-07.

**Human review:** no

---

### Step 3. Add unit test for SUPPRESS-VAL-07

**Goal:** Add test coverage for the new SUPPRESS-VAL-07 warning.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts`, add two test cases:
  1. "warns SUPPRESS-VAL-07 when titlePattern contains ruleId" — create a rule with `titlePattern` containing the `ruleId` string, assert `SUPPRESS-VAL-07` is in diagnostics
  2. "does not warn SUPPRESS-VAL-07 when titlePattern does not contain ruleId" — create a rule with `titlePattern` that does not contain `ruleId`, assert `SUPPRESS-VAL-07` is not in diagnostics

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks exec vitest run src/tests/suppressions-validate.test.ts` — all tests pass

**Completion criterion:** Both test cases pass; existing tests still pass.

**Human review:** no

---

### Step 4. Update AGENTS.md documentation

**Goal:** Document SUPPRESS-VAL-07 in the `suppressions-validate.ts` entry in `packages/os/site-kernel-checks/AGENTS.md`.

**Agent actions:**

- Find the `src/suppressions-validate.ts` row in the AGENTS.md table
- Append `SUPPRESS-VAL-07 (titlePattern containing ruleId, warning, RFC-0695)` to the diagnostics list

**Validation:**

- Visual inspection — the AGENTS.md entry includes SUPPRESS-VAL-07

**Completion criterion:** AGENTS.md `suppressions-validate.ts` entry mentions SUPPRESS-VAL-07.

**Human review:** no

---

### Step 5. Verify no default rule triggers SUPPRESS-VAL-07

**Goal:** Confirm that `systems/axiom-suppressions.yaml` does not trigger SUPPRESS-VAL-07.

**Agent actions:**

- Run `pnpm exec werkstatt run suppressions.validate --json` — verify zero SUPPRESS-VAL-07 warnings in output

**Validation:**

- `suppressions.validate --json` output has `status: pass` or `status: warn` with zero SUPPRESS-VAL-07 diagnostics

**Completion criterion:** No default rule triggers SUPPRESS-VAL-07.

**Human review:** no

---

### Step 6. Run command.manifest.generate and validate

**Goal:** Regenerate command manifest if needed and run full validation.

**Agent actions:**

- Run `pnpm exec werkstatt run command.manifest.generate` — update `docs/command-manifest.generated.yaml` if the command table description changed
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0695` — zero violations
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes
- Run `pnpm --filter @warpgogol/site-kernel-checks exec vitest run src/tests/suppressions-validate.test.ts` — all tests pass

**Validation:**

- `rfc.validate` passes
- `build:check` passes
- All tests pass

**Completion criterion:** All validation passes with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files with new diagnostic (done in Step 4).
- Run `pnpm exec werkstatt run command.manifest.generate` if command surfaces changed (done in Step 6).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0695 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0695`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0695`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks exec vitest run src/tests/suppressions-validate.test.ts`
- `pnpm exec werkstatt run suppressions.validate --json` — verify no SUPPRESS-VAL-07 on default rules

### 4.2 Evidence artifacts

- No acceptance probes declared (commented out) — `rfc.verification.emit` will skip silently, which is correct behavior
- Commit messages referencing `RFC-0695` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives for short ruleIds | Step 1 uses `includes` per RFC decision; ruleIds use dotted names making accidental matches unlikely |
| Agent confusion | Step 1 includes `fixHint` in the diagnostic message explaining the issue |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0695 --reason "..." --invariant "DNA-N"` instead of working around it.
