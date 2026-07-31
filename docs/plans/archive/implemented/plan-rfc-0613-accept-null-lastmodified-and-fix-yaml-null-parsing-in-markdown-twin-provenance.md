---
rfcId: RFC-0613
planId: PLAN-RFC-0613-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/share"
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - docs/rfcs/archive/implemented/rfc-0320-add-portable-provenance-frontmatter-to-markdown-twins.md
---

# Implementation Plan: RFC-0613

## 1. Objectives

- [ ] Objective 1 — Add regression test for `parseMarkdownTwinFrontmatter` null parsing (maps to acceptance criterion 1)
- [ ] Objective 2 — Add regression tests for `page.markdown.validate` null acceptance: MDMETA-02, MDMETA-04 (maps to acceptance criteria 2, 3)
- [ ] Objective 3 — Add regression test for `page.markdown.validate` still rejecting invalid date strings (maps to acceptance criterion 4)
- [ ] Objective 4 — Add AGENTS.md rule for agent education about `lastModified: null` (maps to Risks section)
- [ ] Objective 5 — Fix V-19 warning by adding RFC-0613 to RFC-0320's `amendedBy` list (maps to rfc.validate clean pass)
- [ ] Objective 6 — Verify all tests pass and rfc.validate is clean (maps to acceptance criteria 5, 6, 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/semantic/markdown-twin-provenance.ts` — already fixed (no code change needed, reference only)
- `packages/os/site-kernel-checks/src/page-markdown.ts` — already fixed (no code change needed, reference only)

### 2.2 Configuration and data

No configuration or data files need changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add agent education rule: `lastModified: null` is intentional for generated files per RFC-0602/RFC-0613
- `docs/rfcs/archive/implemented/rfc-0320-add-portable-provenance-frontmatter-to-markdown-twins.md` — add `RFC-0613` to `amendedBy` list (V-19 fix)

### 2.4 Validation and pipelines

- `packages/share/src/tests/markdown-twin-provenance.test.ts` — new test file for parser regression tests
- `packages/os/site-kernel-checks/src/tests/page-markdown.test.ts` — new test file for validator regression tests
- No pipeline changes — `page.markdown.validate` remains in its existing pipeline position

## 3. Step sequence

### Step 1. Add regression tests for parseMarkdownTwinFrontmatter null parsing

**Goal:** Verify that `parseMarkdownTwinFrontmatter` correctly parses YAML `null` as JS `null` (not the string `"null"`).

**Agent actions:**

- Create `packages/share/src/tests/markdown-twin-provenance.test.ts`
- Add test case: parse frontmatter with `lastModified: null` (bare YAML null) → `frontmatter.lastModified` is JS `null` (not string `"null"`)
- Add test case: parse frontmatter with `lastModified: "2026-07-30"` → `frontmatter.lastModified` is string `"2026-07-30"`
- Add test case: parse frontmatter with `lastModified: "null"` (quoted) → `frontmatter.lastModified` is string `"null"` (not JS `null` — quoted null is a string, not the YAML null keyword)
- Add test case: `buildMarkdownTwinFrontmatter` with `lastModified: null` → output contains `lastModified: null` (bare, not quoted)
- Add test case: `buildMarkdownTwinFrontmatter` with `lastModified: "2026-07-30"` → output contains `lastModified: "2026-07-30"`

**Validation:**

- `pnpm --filter @warpgogol/share test` passes with new tests

**Completion criterion:** Test file exists and all test cases pass, confirming bare `null` → JS `null` and quoted `"null"` → string `"null"`.

**Human review:** no

---

### Step 2. Add regression tests for page.markdown.validate null acceptance

**Goal:** Verify that `page.markdown.validate` accepts `lastModified: null` without MDMETA-02 or MDMETA-04 errors, and still rejects invalid date strings.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/page-markdown.test.ts`
- Add test case: validate a twin with `lastModified: null` → no MDMETA-02 error, no MDMETA-04 error
- Add test case: validate a twin with `lastModified: "2026-07-30"` → no MDMETA-02 error, no MDMETA-04 error (valid date format)
- Add test case: validate a twin with `lastModified: "2026-7-4"` → MDMETA-04 error (invalid date format)
- Add test case: validate a twin with `lastModified` field absent entirely → MDMETA-02 error (field is required, must be present even if null)
- Add test case: validate a twin with `lastModified: "null"` (quoted string) → MDMETA-04 error (string "null" is not a valid date)
- Testing approach: integration-style — create a temp directory with `dist/` and `public/` subdirectories, write minimal HTML files with `<link rel="alternate" type="text/markdown" href="...">` tags, generate twin files using `buildMarkdownTwin` from `@warpgogol/share/semantic`, construct a minimal `KernelRuntimeContext` with the temp directory as `appDirectory`, call `runPageMarkdownValidate`, and assert on the errors/warnings in the result.
- Use `buildMarkdownTwin` and `computeContentHash` from `@warpgogol/share/semantic` to generate valid test fixtures with all required fields, valid contentHash, and required body sections (`## Summary`, `## Business context`).
- For the `lastModified` absent test case, manually construct frontmatter without the `lastModified` field to verify MDMETA-02 fires.
- For the quoted `"null"` test case, manually write the frontmatter string with `lastModified: "null"` (quoted) to verify MDMETA-04 fires.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks test` passes with new tests

**Completion criterion:** Test file exists and all test cases pass, confirming null acceptance and invalid date rejection.

**Human review:** no

---

### Step 3. Add AGENTS.md rule and fix V-19

**Goal:** Add agent education rule to `packages/os/site-kernel-checks/AGENTS.md` and fix the V-19 warning by adding RFC-0613 to RFC-0320's `amendedBy` list.

**Agent actions:**

- Add a rule to `packages/os/site-kernel-checks/AGENTS.md` in the appropriate section: "Generated markdown twins may have `lastModified: null` — this is intentional per RFC-0602 (timestamp determinism) and RFC-0613. Do not replace `null` with a date string. The validator (`page.markdown.validate`) accepts `null` as a valid value for `lastModified`."
- Edit `docs/rfcs/archive/implemented/rfc-0320-add-portable-provenance-frontmatter-to-markdown-twins.md` — add `RFC-0613` to the `amendedBy` list (which already contains `RFC-0377`)

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0613 --json` — V-19 warning is resolved (0 violations)

**Completion criterion:** AGENTS.md contains the rule; RFC-0320's `amendedBy` includes `RFC-0613`; `rfc.validate` passes with zero warnings.

**Human review:** no

---

### Step 4. Run validation suite

**Goal:** Verify all affected packages pass typecheck and tests, and rfc.validate is clean.

**Agent actions:**

- Run `pnpm --filter @warpgogol/share run build:check` — typecheck passes
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes
- Run `pnpm --filter @warpgogol/share test` — all tests pass including new regression tests
- Run `pnpm --filter @warpgogol/site-kernel-checks test` — all tests pass including new regression tests
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0613 --json` — passes with zero violations

**Validation:**

- All commands exit 0

**Completion criterion:** All typecheck and test commands pass; rfc.validate is clean.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0613 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0613` — passes with zero violations.
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0613`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/share test`
- `pnpm --filter @warpgogol/site-kernel-checks test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0613` in the subject line (RFC-0265 commit hygiene)
- Test files with passing test cases as evidence for acceptance criteria 1-4
- `rfc.validate` output as evidence for acceptance criterion 7

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False negatives: if parseMarkdownTwinFrontmatter is not fixed, validator receives string "null" | Step 1 tests both parser and validator independently — parser test catches regression before validator test |
| Agent confusion: agents may interpret lastModified: null as missing and fill in a date | Step 3 adds AGENTS.md rule to packages/os/site-kernel-checks/AGENTS.md |
| Schema drift: future RFC changes lastModified type without updating parser and validator in sync | Step 1+2 tests cover both parser and validator — any type change must update both to keep tests green |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0613 --reason "..." --invariant "DNA-58"` instead of working around it.
