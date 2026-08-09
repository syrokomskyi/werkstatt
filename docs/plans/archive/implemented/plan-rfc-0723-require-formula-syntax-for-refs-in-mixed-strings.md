---
rfcId: RFC-0723
planId: PLAN-RFC-0723-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/share"
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-codegen"
  services: []
  docs:
    - AGENTS.md
    - packages/share/AGENTS.md
---

# Implementation Plan: RFC-0723

## 1. Objectives

- [ ] O1 — Promote REF-04 from warning to error for known collections in mixed strings (maps to AC-3)
- [ ] O2 — Extend `content.formula.migrate` with mixed-string ref conversion pass (maps to AC-4)
- [ ] O3 — Add unit tests for `resolveFormula` single-ref string return and `isInsideFormula` logic (maps to AC-5, AC-6)
- [ ] O4 — Add AGENTS.md rule for `=(ref)` in mixed strings (maps to AC-7, AC-8)
- [ ] O5 — Run content migration on warpgogol-com (maps to AC-9)
- [ ] O6 — Verify all acceptance criteria and stamp implemented (maps to AC-10)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/content-references.ts` — promote REF-04 from `warnings.push()` to `violations.push()` when pattern matches a known collection
- `packages/os/site-kernel-codegen/src/content-formula-migrate.ts` — add second scan pass for bare braceless refs in mixed strings
- `packages/share/src/formula-eval.ts` — already implemented (single-ref string return), no changes needed
- `packages/share/src/tests/formula-eval.test.ts` — add tests for single-ref string return path
- `packages/os/site-kernel-checks/src/tests/` — add tests for `isInsideFormula` logic and REF-04 promotion

### 2.2 Configuration and data

- `systems/registry.yaml` — no changes (warpgogol-com already registered)
- No new config files

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add `=(ref)` rule for mixed strings
- `packages/share/AGENTS.md` — update formula-eval entry with RFC-0723 string-value extension
- `docs/rfcs/archive/implemented/rfc-0529-*.md` — add `RFC-0723` to `amendedBy` (V-19 fix)
- No `docs/*.xml` Compass changes needed (no new source files, no new commands)

### 2.4 Validation and pipelines

- `content.references.validate` — already in `sites-check-author` pipeline, REF-04 promotion makes it blocking
- `content.formula.migrate` — manual command, not in any pipeline
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Promote REF-04 from warning to error

**Goal:** Make REF-04 a build-blocking error for bare braceless refs matching known collections in mixed strings.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/content-references.ts`, change the REF-04 `warnings.push()` call to `violations.push()` when the pattern matches a known collection in the content ref index
- Keep REF-04 as a warning for patterns that do NOT match any known collection (likely literal text)
- Update the REF-04 message to include "use =(ref) syntax" guidance

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

**Completion criterion:** REF-04 appears in `violations[]` (not `warnings[]`) when a bare braceless ref matching a known collection appears in a mixed string; `content.references.validate` returns `failResult` when REF-04 violations exist.

**Human review:** no

---

### Step 2. Extend `content.formula.migrate` with mixed-string ref conversion

**Goal:** Add a second scan pass to the migrator that detects bare braceless refs in mixed strings and wraps them with `=(...)`.

**Agent actions:**

- In `packages/os/site-kernel-codegen/src/content-formula-migrate.ts`, add a second scan pass after the existing `HARDCODED_FORMULA_PATTERN` pass
- The new pass: scan for `BRACELESS_PATTERN` matches, skip pure refs (line text trimmed equals candidate), skip refs already inside `=(...)` (use `scanFormulas` spans), wrap remaining matches with `=(...)`
- Reuse `BRACELESS_PATTERN` from `content-references.ts` or define a local equivalent
- Collect conversions in the same `conversions[]` array

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run test`

**Completion criterion:** `content.formula.migrate` converts `Ab business-profile.offerings/...` to `Ab =(business-profile.offerings/...)` in a test fixture; idempotent (re-running on converted output is a no-op).

**Human review:** no

---

### Step 3. Add unit tests

**Goal:** Cover the RFC-0723-specific code paths with unit tests.

**Agent actions:**

- In `packages/share/src/tests/formula-eval.test.ts`, add tests:
  - `resolveFormula` returns string value for single-ref expression with non-numeric value
  - `resolveFormula` returns string value for single-ref expression with numeric value (unchanged behavior)
  - `resolveFormula` returns REF-07 for multi-ref expression with non-numeric operand
- In `packages/os/site-kernel-checks/src/tests/`, add tests:
  - `isInsideFormula` skips REF-04 for refs inside `=(...)`
  - REF-04 promoted to error (violations, not warnings) for known collection in mixed string
  - REF-04 remains warning for unknown collection in mixed string

**Validation:**

- `pnpm --filter @warpgogol/share run test`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 4. Add AGENTS.md rule

**Goal:** Document the `=(ref)` requirement in AGENTS.md files.

**Agent actions:**

- Add the rule text from RFC-0723 § AGENTS.md rule to root `AGENTS.md`
- Update `packages/share/AGENTS.md` formula-eval entry with RFC-0723 string-value extension note

**Validation:**

- Visual inspection — rule text present in both files

**Completion criterion:** Root `AGENTS.md` contains the `=(ref)` rule; `packages/share/AGENTS.md` mentions RFC-0723 string-value extension.

**Human review:** no

---

### Step 5. Fix V-19 — add RFC-0723 to RFC-0529.amendedBy

**Goal:** Resolve the V-19 validation warning by updating the amended RFC.

**Agent actions:**

- In `docs/rfcs/archive/implemented/rfc-0529-migrate-content-references-to-braceless-syntax.md`, add `RFC-0723` to the `amendedBy` array

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0723 --json` — V-19 warning resolved

**Completion criterion:** `rfc.validate --id RFC-0723` reports zero violations (zero warnings, zero errors).

**Human review:** no

---

### Step 6. Run content migration on warpgogol-com

**Goal:** Convert all 315 bare braceless refs in mixed strings to `=(ref)` syntax.

**Agent actions:**

- Run `pnpm exec site-kernel run content.formula.migrate --app warpgogol-com`
- Review the diff — verify conversions are correct
- Run `pnpm exec site-kernel run content.references.validate --app warpgogol-com` — verify zero REF-04 warnings remain
- Commit the migrated content

**Validation:**

- `content.references.validate --app warpgogol-com` — zero REF-04 warnings
- `git diff` review — all conversions wrap bare refs with `=(...)`

**Completion criterion:** Zero REF-04 warnings on warpgogol-com; all 315 instances converted.

**Human review:** yes — operator reviews the migration diff before commit. This is a content change to 22 files.

---

### Step 7. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify all `scope.docs` files are updated (root `AGENTS.md`, `packages/share/AGENTS.md`)
- Run `pnpm --filter @warpgogol/share run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0723`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`
- Check off acceptance criteria: verify each criterion against implemented code, mark `[x]` with `(evidence: ...)` annotations
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0723 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from this session
- `pnpm exec site-kernel run rfc.validate --id RFC-0723` — zero violations
- All affected packages pass `build:check`
- All new/changed tests pass
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0723`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm --filter @warpgogol/share run test`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm --filter @warpgogol/site-kernel-codegen run test`
- `pnpm exec site-kernel run content.references.validate --app warpgogol-com` — zero REF-04 warnings

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0723` in the subject line
- `docs/reviews/code/` — review report from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives in REF-04 promotion | Step 1 — only promote for known collections; unknown patterns remain warnings |
| Migration scope (315 instances, 22 files) | Step 6 — idempotent migrator, operator reviews diff before commit |
| Agent misinterpretation of `=(ref)` | Step 4 — AGENTS.md rule explicitly states scope |
| Performance | Negligible — O(n) per line, no measurable impact |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-4 or DNA-24, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0723 --reason "..." --invariant "DNA-N"` instead of working around it.
