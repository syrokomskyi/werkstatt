---
rfcId: RFC-0691
planId: PLAN-RFC-0691-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0691

## 1. Objectives

- [ ] Objective 1 — Add `html-attribute-pattern` check kind to `profileInvariantCheckSchema` and `ProfileInvariantCheck` interface (maps to acceptance criterion 1)
- [ ] Objective 2 — Implement `html-attribute-pattern` check in `invariant-engine.ts` with element extraction and attribute validation (maps to acceptance criterion 2)
- [ ] Objective 3 — Add VIDEO-04 through VIDEO-09 invariants to `editframe-html.yaml` (maps to acceptance criterion 3)
- [ ] Objective 4 — Verify `forge.doctor` checks VIDEO-04..09 and reports violations (maps to acceptance criterion 4)
- [ ] Objective 5 — Add unit tests for `html-attribute-pattern` with positive, negative, and absent-attribute cases (maps to acceptance criteria 5-7)
- [ ] Objective 6 — Update `editframe-profile.test.ts` to verify 9 VIDEO-* invariants (maps to acceptance criterion 8)
- [ ] Objective 7 — Update `packages/forge/AGENTS.md` with `html-attribute-pattern` documentation (maps to acceptance criterion 9)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/profiles/profile-schema.ts` — add `html-attribute-pattern` to Zod enum and TypeScript union, add `element`/`attribute` optional fields, add `.refine()` for conditional required validation
- `packages/forge/src/onboarding/invariant-engine.ts` — add `html-attribute-pattern` case branch in `runCheck` function: element extraction regex, attribute extraction regex, pattern validation
- `packages/forge/os/core/handlers/invariant-engine.test.ts` — add test cases for `html-attribute-pattern` (valid values, invalid values, absent attribute, multiple elements)
- `packages/forge/src/tests/editframe-profile.test.ts` — update VIDEO-* invariant count assertion from 3 to 9

### 2.2 Configuration and data

- `packages/forge/profiles/editframe-html.yaml` — add VIDEO-04 through VIDEO-09 invariant declarations after existing VIDEO-01/02/03

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add `html-attribute-pattern` check kind documentation to the Domain-aware commands section (RFC-0640)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/forge run test` — Vitest unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0691` — RFC validation
- `pnpm exec werkstatt run forge.profile.validate --id editframe-html` — profile validation

## 3. Step sequence

### Step 1. Extend profile invariant schema with `html-attribute-pattern`

**Goal:** Add the new check kind to the Zod schema and TypeScript interface, with conditional required validation for `element`/`attribute`.

**Agent actions:**

- Edit `packages/forge/src/profiles/profile-schema.ts`:
  - Add `"html-attribute-pattern"` to the `z.enum([...])` in `profileInvariantCheckSchema`
  - Add `element: z.string().optional()` and `attribute: z.string().optional()` fields
  - Add `.refine()` to enforce `element` and `attribute` are non-null when `kind === "html-attribute-pattern"`
  - Add `"html-attribute-pattern"` to the `ProfileInvariantCheck` interface union type
  - Add `element?: string` and `attribute?: string` to the interface

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles without errors

**Completion criterion:** `profileInvariantCheckSchema` accepts `html-attribute-pattern` with `element` and `attribute`; rejects `html-attribute-pattern` without them; existing check kinds still parse.

**Human review:** no

---

### Step 2. Implement `html-attribute-pattern` check in invariant engine

**Goal:** Add the check kind implementation that extracts elements by tag name, reads attributes, and validates against regex patterns.

**Agent actions:**

- Edit `packages/forge/src/onboarding/invariant-engine.ts`:
  - Add `case "html-attribute-pattern":` branch in the `runCheck` function's `switch` statement
  - Extract `element` and `attribute` from `check` — if either is undefined (schema `.refine()` should prevent this, but defensive check), return a warning violation
  - For each file matching `glob`:
    - Read file content
    - Find all elements matching tag name: `new RegExp(\`<${element}[^>]*>\`, "gi")`
    - For each matched element, extract attribute value: `new RegExp(\`${attribute}="([^"]*)"|\${attribute}='([^']*)'\`, "i")`
    - If attribute is present and value does NOT match `pattern`, report violation with file path and element snippet
    - If attribute is absent, skip (no violation)
  - Update MODULE_CONTRACT purpose comment to include `html-attribute-pattern`
  - Update CHANGE_SUMMARY with RFC-0691 entry

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles
- `pnpm --filter @warpgogol/forge run test` — existing tests still pass

**Completion criterion:** `runCheck` handles `html-attribute-pattern` case; violations are reported for non-matching attribute values; absent attributes produce no violation.

**Human review:** no

---

### Step 3. Add VIDEO-04..09 invariants to editframe-html profile

**Goal:** Declare the six new time model invariants in the profile YAML.

**Agent actions:**

- Edit `packages/forge/profiles/editframe-html.yaml`:
  - Add VIDEO-04 (root timegroup duration/mode, `file-contains`, severity: error)
  - Add VIDEO-05 (duration CSS time string, `html-attribute-pattern`, severity: error)
  - Add VIDEO-06 (mode enum, `html-attribute-pattern`, severity: error)
  - Add VIDEO-07 (fps positive integer, `html-attribute-pattern`, severity: warning)
  - Add VIDEO-08 (loop only on root, `file-not-contains`, severity: warning)
  - Add VIDEO-09 (offset CSS time string, `html-attribute-pattern`, severity: warning)
  - Insert after existing VIDEO-03, before `workspace:` section

**Validation:**

- `pnpm exec werkstatt run forge.profile.validate --id editframe-html` — profile validates against schema
- `pnpm --filter @warpgogol/forge run test` — `editframe-profile.test.ts` passes (after update in Step 5)

**Completion criterion:** `editframe-html.yaml` declares 9 VIDEO-* invariants; profile validates against `forge/stack-profile@1` schema including the new `.refine()`.

**Human review:** no

---

### Step 4. Add unit tests for `html-attribute-pattern` check kind

**Goal:** Verify the new check kind works correctly with positive, negative, and edge cases.

**Agent actions:**

- Edit `packages/forge/os/core/handlers/invariant-engine.test.ts`:
  - Add test: `html-attribute-pattern detects invalid attribute values` — file with `<ef-timegroup duration="5">` (missing unit) should violate
  - Add test: `html-attribute-pattern passes valid attribute values` — file with `<ef-timegroup duration="5s">` should not violate
  - Add test: `html-attribute-pattern skips elements without the declared attribute` — file with `<ef-timegroup mode="sequence">` and no `duration` should not violate VIDEO-05
  - Add test: `html-attribute-pattern handles multiple elements in one file` — file with 2 `ef-timegroup` elements, one valid and one invalid, should report 1 violation
  - Add test: `html-attribute-pattern handles single-quoted attribute values` — file with `duration='5s'` should not violate
  - Update CHANGE_SUMMARY with RFC-0691 entry

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass

**Completion criterion:** 5 new test cases pass; existing tests still pass; total test count increases by 5.

**Human review:** no

---

### Step 5. Update editframe-profile test for 9 VIDEO-* invariants

**Goal:** Update the existing profile test to reflect the new invariant count.

**Agent actions:**

- Edit `packages/forge/src/tests/editframe-profile.test.ts`:
  - Change assertion `expect(videoInvariants?.length).toBeGreaterThanOrEqual(3)` to `toBeGreaterThanOrEqual(9)`

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — test passes

**Completion criterion:** `editframe-profile.test.ts` asserts at least 9 VIDEO-* invariants.

**Human review:** no

---

### Step 6. Update packages/forge/AGENTS.md

**Goal:** Document the new check kind in the forge AGENTS.md.

**Agent actions:**

- Edit `packages/forge/AGENTS.md`:
  - In the "Domain-aware commands (RFC-0640)" section, under `forge.doctor`, update the `domain-invariants` check description to include `html-attribute-pattern` in the list of supported check kinds
  - Add note: `html-attribute-pattern` requires `element` and `attribute` fields (schema-enforced via `.refine()`)

**Validation:**

- Visual inspection — AGENTS.md is not compiled

**Completion criterion:** `packages/forge/AGENTS.md` mentions `html-attribute-pattern` check kind in the `forge.doctor` domain-invariants documentation.

**Human review:** no

---

### Step 7. Validation suite

**Goal:** Run all validation commands to verify the implementation is complete and correct.

**Agent actions:**

- Run `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation
- Run `pnpm --filter @warpgogol/forge run test` — all unit tests
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0691` — RFC validation
- Run `pnpm exec werkstatt run forge.profile.validate --id editframe-html` — profile validation

**Validation:**

- All commands exit 0

**Completion criterion:** All 4 validation commands pass with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (Step 6).
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0691 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0691`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0691`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run forge.profile.validate --id editframe-html`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0691` in the subject line (RFC-0265 commit hygiene)
- Test output showing 5 new test cases passing

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Regex fragility — element extraction may miss unusual formatting | Step 4 tests cover multiple elements and self-closing tags; Step 2 uses `[^>]*` which handles common formatting |
| False positives on non-timegroup elements | Step 2 matches by tag name only; `ef-timegroup` is an Editframe custom element — unlikely to be redefined |
| VIDEO-08 regex greediness | Step 3 declares severity as `warning` (not `error`); Step 4 tests verify `file-not-contains` still works |
| Missing element/attribute fields — silent false negatives | Step 1 adds `.refine()` for schema-level enforcement; Step 4 tests verify valid and invalid cases |
| Attribute value with single quotes | Step 2 handles both double and single quotes in extraction regex; Step 4 tests single-quoted values |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0691 --reason "..." --invariant "DNA-54"` instead of working around it.
- If the `.refine()` approach causes issues with Zod schema inference (e.g. `z.infer` produces wrong type), escalate to a manual validation function instead of `.refine()`.
