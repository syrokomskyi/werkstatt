---
rfcId: RFC-0570
planId: PLAN-RFC-0570-01
status: draft
owner: architecture
createdAt: 2026-07-28
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
    - packages/share/AGENTS.md
    - docs/source-markup.xml
    - docs/rfcs/rfc-0570-add-computed-formula-expressions-to-content-references.md
---

# Implementation Plan: RFC-0570

## 1. Objectives

- [ ] O1 — Formula resolver: `@warpgogol/share/formula-eval.ts` exports `extractNumeric`, `resolveFormula`, `scanFormulas` with unit tests — maps to acceptance criteria 1-2
- [ ] O2 — Package exports: `packages/share/package.json` has `./formula-eval` subpath export + `expr-eval` dependency — maps to acceptance criterion 3
- [ ] O3 — Extended resolver: `resolveReferencesInString` handles `=(...)` formulas — maps to acceptance criterion 1
- [ ] O4 — Extended validator: `content.references.validate` reports REF-06..09 for formula errors — maps to acceptance criterion 4
- [ ] O5 — Lint command: `content.formula.lint` in `site-kernel-checks`, warn-level in `sites-check-author` — maps to acceptance criteria 5, 7
- [ ] O6 — Migrate command: `content.formula.migrate` in `site-kernel-codegen` — maps to acceptance criterion 6
- [ ] O7 — Documentation: `packages/share/AGENTS.md` + `docs/source-markup.xml` updated — maps to acceptance criteria 8-9
- [ ] O8 — Non-breaking: existing apps without `=(...)` pass unchanged — maps to acceptance criterion 10

**Critical correction:** The RFC proposed REF-04..07 for formula errors, but the existing validator already uses REF-04 (ambiguous braceless pattern, `content-references.ts:146`) and REF-05 (residual brace token, `content-references.ts:187`). Formula error codes must be renumbered to **REF-06..09**:

- `REF-06`: Formula reference unresolved
- `REF-07`: Formula operand is not numeric
- `REF-08`: Formula syntax error
- `REF-09`: Formula division by zero

## 2. Affected artifacts

### 2.1 Code and commands

| Package | File | Action |
| --- | --- | --- |
| `@warpgogol/share` | `src/formula-eval.ts` | **New** — `extractNumeric`, `resolveFormula`, `scanFormulas` |
| `@warpgogol/share` | `src/content-reference.ts` | **Extended** — `resolveReferencesInString` calls `scanFormulas` before braceless scan |
| `@warpgogol/share` | `src/tests/formula-eval.test.ts` | **New** — unit tests |
| `@warpgogol/share` | `src/tests/content-reference.test.ts` | **Extended** — formula integration tests |
| `@warpgogol/share` | `package.json` | **Extended** — `./formula-eval` export entry + `expr-eval` dependency |
| `@warpgogol/site-kernel-checks` | `src/content-references.ts` | **Extended** — REF-06..09 formula validation |
| `@warpgogol/site-kernel-checks` | `src/content-formula-lint.ts` | **New** — hardcoded formula detector |
| `@warpgogol/site-kernel-checks` | `src/command-tables/04-content-quality.ts` | **Extended** — register `content.formula.lint` |
| `@warpgogol/site-kernel-checks` | `src/pipelines/sites-check-author.ts` | **Extended** — add `content.formula.lint` step (warn-level) |
| `@warpgogol/site-kernel-codegen` | `src/content-formula-migrate.ts` | **New** — manual migration command |
| `@warpgogol/site-kernel-codegen` | `src/command-tables/` | **Extended** — register `content.formula.migrate` |

### 2.2 Configuration and data

- `packages/share/package.json` — new `expr-eval` dependency + `@types/expr-eval` (if no bundled types)
- `packages/share/src/index.ts` — do NOT add to root barrel (BARREL-01 rule); subpath only

### 2.3 Documentation and specs

- `packages/share/AGENTS.md` — add `@warpgogol/share/formula-eval` row to entry-point table
- `docs/source-markup.xml` — add `packages/share/src/formula-eval.ts` source file entry
- `docs/rfcs/rfc-0570-*.md` — update REF-04..07 → REF-06..09 in error codes section

### 2.4 Validation and pipelines

- `sites-check-author` pipeline — new `content.formula.lint` step (warn-level, before `content.references.validate`)
- No CI workflow changes needed — `sites-check-author` runs inside `build.check` which is already in CI

## 3. Step sequence

### Step 1. Create `formula-eval.ts` with `extractNumeric`, `scanFormulas`, `resolveFormula`

**Goal:** Implement the core formula evaluation module in `@warpgogol/share`.

**Agent actions:**

- Install `expr-eval` and (if needed) `@types/expr-eval`: `pnpm --filter @warpgogol/share add expr-eval` and `pnpm --filter @warpgogol/share add -D @types/expr-eval` (check if types are bundled first)
- Create `packages/share/src/formula-eval.ts` with:
  - `extractNumeric(value: unknown): number | null` — handles: leading number, thin-space (`\u202f`) / period / comma thousands separators, comma decimal separator (German), negative numbers. Strips non-numeric prefix/suffix. Returns `null` for non-numeric strings.
  - `scanFormulas(text: string): Array<{ start: number; end: number; expression: string }>` — scans for `=(` prefix, then uses a paren-depth counter to find the matching `)`. Handles nested parens. Fast path: returns `[]` immediately if text does not contain `"=("`.
  - `resolveFormula(index: ContentRefIndex, expression: string, lang: string, defaultLang: string): FormulaResolution` — substitutes braceless references inside the expression using `resolveReference`, extracts numeric values via `extractNumeric`, evaluates with `expr-eval`'s `Parser.evaluate`. Returns `{ value, resolved, error? }`. Catches `expr-eval` errors and maps to REF-06..09.
  - `FormulaResolution` interface: `{ value: string; resolved: boolean; error?: string }`
- Add `./formula-eval` to `packages/share/package.json` exports map
- Add `expr-eval` to `packages/share/package.json` dependencies

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` — TypeScript compiles
- `pnpm --filter @warpgogol/share run test` — existing tests still pass

**Completion criterion:** `packages/share/src/formula-eval.ts` exists, exports all three functions, TypeScript compiles, existing tests pass.

**Human review:** no

---

### Step 2. Write unit tests for `formula-eval.ts`

**Goal:** Comprehensive test coverage for numeric extraction, formula scanning, and formula resolution.

**Agent actions:**

- Create `packages/share/src/tests/formula-eval.test.ts` with test cases:
  - `extractNumeric`: `"200 €"` → 200, `"1 040 €"` → 1040, `"1.040 €"` → 1040, `"70,50 €"` → 70.5, `"-200 €"` → -200, `"70 €/Monat"` → 70, `"no number"` → null, `null` → null, `200` → 200
  - `scanFormulas`: `no formula` → `[]`, `=(a + b)` → 1 match, `=(a + (b * c))` → 1 match (nested parens), `text =(a) more =(b) end` → 2 matches, `no prefix (a + b)` → `[]`
  - `resolveFormula`: valid expression with resolvable refs → `{ value, resolved: true }`, unresolved ref → `{ resolved: false, error: "REF-06" }`, non-numeric operand → `{ resolved: false, error: "REF-07" }`, syntax error → `{ resolved: false, error: "REF-08" }`, division by zero → `{ resolved: false, error: "REF-09" }`

**Validation:**

- `pnpm --filter @warpgogol/share run test` — all tests pass

**Completion criterion:** All test cases pass; coverage includes all edge cases listed in acceptance criterion 2.

**Human review:** no

---

### Step 3. Extend `resolveReferencesInString` with formula support

**Goal:** The existing resolver now handles `=(...)` formulas alongside braceless references.

**Agent actions:**

- Edit `packages/share/src/content-reference.ts`:
  - Import `scanFormulas`, `resolveFormula` from `./formula-eval.ts`
  - In `resolveReferencesInString`, before the braceless scan, call `scanFormulas(text)`. For each formula found, call `resolveFormula(index, expression, lang, defaultLang)`. If resolved, replace the `=(...)` span with the result value. If not resolved, replace with empty string (runtime silent failure — never leak `=(...)` syntax).
  - After formula substitution, proceed with the existing braceless reference scan on the remaining text.
- Add integration tests to `packages/share/src/tests/content-reference.test.ts`:
  - String with only a formula: `=(collection.file.field + 10)` → resolved value
  - String with formula + surrounding text: `Total: =(a + b) €` → `Total: 1040 €`
  - String with formula + braceless refs: `=(a + b) and c.d.e` → formula resolved + braceless resolved
  - String without formulas: unchanged behavior
  - Formula with unresolved ref: `=(nonexistent.file.field + 10)` → empty string at runtime

**Validation:**

- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/share run test` — all tests pass including new ones

**Completion criterion:** `resolveReferencesInString` handles `=(...)` formulas; existing tests pass unchanged; new formula tests pass.

**Human review:** no

---

### Step 4. Extend `content.references.validate` with REF-06..09

**Goal:** The validator now checks formula expressions and reports formula-specific errors.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/content-references.ts`:
  - Import `scanFormulas`, `resolveFormula` from `@warpgogol/share/formula-eval`
  - For each markdown file, after the existing braceless reference validation, call `scanFormulas(source)`. For each formula found, call `resolveFormula(index, expression, inferredLang, defaultLang)`. If not resolved, push a violation with the appropriate REF code:
    - REF-06: `Formula reference unresolved: <ref> in =(...)`
    - REF-07: `Formula operand not numeric: <ref> resolved to "<value>" in =(...)`
    - REF-08: `Formula syntax error: <expression>`
    - REF-09: `Formula division by zero: <expression>`
  - Use `findLineNumbersContaining` for line numbers, same as existing REF-01..05.
- Update RFC-0570 error codes section: REF-04..07 → REF-06..09

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test` (if tests exist for content-references)

**Completion criterion:** Validator reports REF-06..09 for formula errors; existing REF-01..05 behavior unchanged; TypeScript compiles.

**Human review:** no

---

### Step 5. Create `content.formula.lint` command

**Goal:** Warn-level command that detects hardcoded arithmetic patterns next to content references.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/content-formula-lint.ts`:
  - Export `runContentFormulaLint(input, context): Promise<KernelCommandResult>`
  - Scan `src/content/**/*.md` files (same directories as `content.references.validate`)
  - For each file, detect patterns like: `<braceless-ref> + <braceless-ref> × <number> = <number>` or `<braceless-ref> + <braceless-ref> = <number>` — i.e., arithmetic operators between content references followed by `=` and a literal number
  - Use `scanFormulas` from `@warpgogol/share/formula-eval` for shared scanning infrastructure (the detection pattern is a superset of formula scanning — it looks for arithmetic _without_ `=(` prefix)
  - Output warnings with file, line, pattern, and suggestion (the `=(...)` replacement)
  - Always returns `passResult` (warn-level — never fails the build)
- Register in `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`:
  - `name: "content.formula.lint"`, `scope: "app"`, `supportsAllSites: true`
- Add to `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`:
  - Insert `{ command: "content.formula.lint" }` before `{ command: "content.references.validate" }` (line 263)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run content.formula.lint --app warpgogol-com --json` — runs without error

**Completion criterion:** `content.formula.lint` command registered, runs, outputs warnings in `--json` format, always exits 0.

**Human review:** no

---

### Step 6. Create `content.formula.migrate` command

**Goal:** Manual command that converts detected hardcoded formulas to `=(...)` syntax.

**Agent actions:**

- Create `packages/os/site-kernel-codegen/src/content-formula-migrate.ts`:
  - Export `runContentFormulaMigrate(input, context): Promise<KernelCommandResult>`
  - Import the detection logic from `@warpgogol/share/formula-eval` (same `scanFormulas` or a shared detection function — no duplicated logic)
  - Scan `src/content/**/*.md` files for hardcoded arithmetic patterns
  - For each detected pattern, replace the hardcoded arithmetic + result with `=(...)` syntax
  - Write modified files back to disk
  - Output a summary of converted formulas (file, line, before → after)
- Register in the appropriate command table in `packages/os/site-kernel-codegen/src/`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm exec werkstatt run content.formula.migrate --app warpgogol-com --json` — runs without error

**Completion criterion:** `content.formula.migrate` command registered, runs, writes converted content, no duplicated detection logic.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** All documentation artifacts synchronized with the new module and commands.

**Agent actions:**

- Update `packages/share/AGENTS.md`:
  - Add `@warpgogol/share/formula-eval` row to the entry-point table: `src/formula-eval.ts` — RFC-0570 formula evaluation: `extractNumeric`, `resolveFormula`, `scanFormulas`, `FormulaResolution`
  - Update `@warpgogol/share/content-reference` row to mention `=(...)` formula support (RFC-0570)
- Update `docs/source-markup.xml`:
  - Add `<file>` entry for `packages/share/src/formula-eval.ts`
- Update `docs/rfcs/rfc-0570-*.md`:
  - Fix error codes: REF-04..07 → REF-06..09 throughout (Output format, Failure modes, Acceptance criteria sections)

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0570 --json` — passes
- `git diff` shows all scope.docs files updated

**Completion criterion:** All documentation artifacts in `scope.docs` are updated; `rfc.validate` passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0570 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0570`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0570`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/share run test`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm exec werkstatt run content.formula.lint --app warpgogol-com --json`
- `pnpm exec werkstatt run content.references.validate --app warpgogol-com --json`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0570` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0570.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0570` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives in `content.formula.lint` | Step 5: warn-level only, never fails build |
| Numeric extraction edge cases | Step 2: comprehensive test cases for thin-space, period, comma, negative, decimal |
| `expr-eval` dependency | Step 1: check for bundled types, add `@types/expr-eval` if needed |
| Agent misinterpretation of `=(...)` | Step 7: AGENTS.md documents scope explicitly |
| REF code conflict (REF-04/05 already used) | Step 4: renumber formula errors to REF-06..09 |
| Performance | Step 1: `scanFormulas` fast-path returns `[]` when text lacks `"=("` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-4 or DNA-24, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0570 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `expr-eval` proves unsuitable (security, bundle size, API mismatch), create an ADR documenting the alternative choice and update the RFC's Alternatives section.
