---
rfcId: RFC-0636
planId: PLAN-RFC-0636-01
status: draft
owner: architecture
createdAt: 2026-08-01
updatedAt:
scope:
  apps: []
  packages:
    - '@warpgogol/site-kernel-checks'
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0636

## 1. Objectives

- [ ] Objective 1 — Add agent-facing rule to `packages/os/site-kernel-checks/AGENTS.md` prohibiting `if (entry.conditional) continue;` skips in validators that build expected-path sets (maps to acceptance criterion 7)
- [ ] Objective 2 — Verify `OwnershipEntry.conditional` docstring includes RFC-0636 contract reference (maps to acceptance criterion 7)
- [ ] Objective 3 — Verify code fix (no `if (entry.conditional) continue;` in `generated-stale-validate.ts`) and regression test are in place (maps to acceptance criteria 1, 3)
- [ ] Objective 4 — Verify `ownership.sync.validate` and `generated.files.validate` handle conditional entries correctly (maps to acceptance criteria 4, 5)
- [ ] Objective 5 — Run validation suite, stamp RFC as implemented, run doc-audit (maps to acceptance criteria 6, 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/generated-stale-validate.ts` — bug fix already applied (conditional entries contribute to expected-path set, no `continue` skip). No further code change needed.
- `packages/os/site-kernel-checks/src/generator-ownership.ts` — `OwnershipEntry.conditional` docstring already updated with RFC-0636 contract. `build-identity.json` conditional entry already present. No further code change needed.
- `packages/os/site-kernel-checks/src/ownership-sync-validate.ts` — already correct, no change.
- `packages/os/site-kernel-checks/src/generated-files-validate.ts` — already correct, no change.
- `packages/os/site-kernel-checks/src/tests/generated-stale-validate.test.ts` — regression test already present (lines 188-208). No further test change needed.

### 2.2 Configuration and data

No configuration or data changes. The `GENERATOR_OWNERSHIP_MAP` entry for `build-identity.json` is already present with `conditional: true`.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add agent-facing rule: "Agents MUST NOT add `if (entry.conditional) continue;` or equivalent skips to any validator that builds an expected-path set from `GENERATOR_OWNERSHIP_MAP`."
- RFC file (`docs/rfcs/rfc-0636-*.md`) — read-only reference; status transition only.

### 2.4 Validation and pipelines

- `generated.stale.validate` continues to run in `SITES_BUILD_PREPARE_PIPELINE` as step 62/62. No pipeline change.
- `ownership.sync.validate` continues to run in `SITES_BUILD_PREPARE_PIPELINE` and `SITES_CHECK_AUTHOR_PIPELINE`. No pipeline change.
- `generated.files.validate` continues to run in `SITES_BUILD_PREPARE_PIPELINE`. No pipeline change.

## 3. Step sequence

### Step 1. Add AGENTS.md rule for conditional flag semantics

**Goal:** Add the agent-facing rule from RFC-0636 implementation notes to `packages/os/site-kernel-checks/AGENTS.md`.

**Agent actions:**

- Add a new rule to the "Shared utilities" or a new "Conditional flag semantics" subsection in `packages/os/site-kernel-checks/AGENTS.md`:
  - "Agents MUST NOT add `if (entry.conditional) continue;` or equivalent skips to any validator that builds an expected-path set from `GENERATOR_OWNERSHIP_MAP`. The `conditional` flag only suppresses absence diagnostics (OWN-02, GEN-FILES-01), never coverage diagnostics (OWN-01, STALE-01). See RFC-0636 for the formal contract."

**Validation:**

- `grep -n "RFC-0636" packages/os/site-kernel-checks/AGENTS.md` returns at least one match.

**Completion criterion:** `packages/os/site-kernel-checks/AGENTS.md` contains the conditional flag rule referencing RFC-0636.

**Human review:** no

---

### Step 2. Verify code fix and regression test are in place

**Goal:** Confirm the bug fix and regression test referenced in acceptance criteria are present in the codebase.

**Agent actions:**

- Verify `generated-stale-validate.ts` does NOT contain `if (entry.conditional) continue;` — grep for `entry.conditional` in the file.
- Verify `generated-stale-validate.test.ts` contains the "green: conditional ownership entry covers file on disk" test case.
- Verify `generator-ownership.ts` contains the `build-identity.json` entry with `conditional: true`.
- Verify `generator-ownership.ts` `OwnershipEntry.conditional` docstring references RFC-0636.

**Validation:**

- `grep -n "entry.conditional" packages/os/site-kernel-checks/src/generated-stale-validate.ts` returns zero matches (no `continue` skip).
- `grep -n "conditional ownership entry covers" packages/os/site-kernel-checks/src/tests/generated-stale-validate.test.ts` returns one match.
- `grep -n "build-identity.json" packages/os/site-kernel-checks/src/generator-ownership.ts` returns one match.
- `grep -n "RFC-0636" packages/os/site-kernel-checks/src/generator-ownership.ts` returns at least one match (docstring).

**Completion criterion:** All four grep checks pass.

**Human review:** no

---

### Step 3. Run typecheck and tests

**Goal:** Verify the package passes typecheck and the regression test passes.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`.
- Run `pnpm --filter @warpgogol/site-kernel-checks exec vitest run src/tests/generated-stale-validate.test.ts`.

**Validation:**

- `build:check` exits 0.
- vitest exits 0 with all tests passing.

**Completion criterion:** Both commands exit 0.

**Human review:** no

---

### Step 4. Run rfc.validate

**Goal:** Verify the RFC passes mechanical validation.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0636 --json`.

**Validation:**

- `rfc.validate` exits 0 with `"ok": true`.

**Completion criterion:** `rfc.validate` passes with zero violations.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, stamp implemented, and doc-audit

**Goal:** Synchronize documentation artifacts, run code review and fix, verify acceptance criteria, stamp the RFC as implemented, and run doc-audit.

**Agent actions:**

- Verify `packages/os/site-kernel-checks/AGENTS.md` was updated in Step 1.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (no change expected — skip if not needed).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. All criteria should already be `[x]` from the enhance step. Confirm evidence citations are accurate.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0636 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). Use the first implementation commit that references RFC-0636 in its message.
- **Run `fo-doc-audit`** after stamping to sync documentation surfaces.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0636` passes.
- Review report exists in `docs/reviews/code/` for this session.
- RFC status is `implemented` via `rfc.implement.stamp` (not hand-edited).

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`; `fo-doc-audit` completed.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0636`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks exec vitest run src/tests/generated-stale-validate.test.ts`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0636` in the subject line (RFC-0265 commit hygiene)
- `rfc.implement.stamp` output confirming status transition

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent misinterpretation — agents adding new conditional entries may not realize conditional entries cover files on disk | Step 1 adds the rule to AGENTS.md; docstring on `OwnershipEntry.conditional` already references RFC-0636 |
| No automated cross-validator consistency check | Step 2 verifies the regression test is in place; the test prevents reintroduction of the skip in `generated.stale.validate` |
| False negatives in stale detection from overly broad conditional paths | Not introduced by this RFC — same risk exists for non-conditional entries. No mitigation needed. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0636 --reason "..." --invariant "DNA-58"` instead of working around it.
