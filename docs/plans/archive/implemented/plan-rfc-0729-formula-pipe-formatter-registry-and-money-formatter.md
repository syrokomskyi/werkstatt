---
rfcId: RFC-0729
planId: PLAN-RFC-0729-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - packages/share
  services: []
  docs:
    - packages/share/AGENTS.md
---

# Implementation Plan: RFC-0729

## 1. Objectives

- [ ] Export `PipeFormatter`, `PipeFormatterContext`, `registerPipeFormatter`, `getPipeFormatter` from `@warpgogol/share/formula-eval` — maps to acceptance criterion 1
- [ ] Register `money` formatter by default at module initialization — maps to acceptance criterion 2
- [ ] Extend `resolveFormula` to handle pipe syntax (split on `|`, evaluate left, invoke formatter on right) — maps to acceptance criterion 3
- [ ] Preserve existing behavior for expressions without `|` (RFC-0570, RFC-0723 compatibility) — maps to acceptance criterion 4
- [ ] `money` formatter produces correct locale-aware output for EUR and UAH conversion — maps to acceptance criteria 5, 6
- [ ] Unknown formatter name produces `REF-10` error — maps to acceptance criterion 7
- [ ] `build:check` and `test` pass for `@warpgogol/share` — maps to acceptance criteria 8, 9
- [ ] `rfc.validate` passes — maps to acceptance criterion 10

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/formula-eval.ts` — add `PipeFormatter`, `PipeFormatterContext`, `registerPipeFormatter`, `getPipeFormatter`; register `money` formatter at module init; extend `resolveFormula` with pipe parsing
- `packages/share/src/tests/formula-eval.test.ts` — add unit tests for pipe parsing, formatter registry, money formatter, REF-10 error

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `packages/share/AGENTS.md` — update `formula-eval` entry-point table row to list new exports

### 2.4 Validation and pipelines

No pipeline changes. The existing `content.references.validate` validator already calls `resolveFormula` and reports errors — `REF-10` will surface through this existing path without changes to `content-references.ts`.

## 3. Step sequence

### Step 1. Add formatter registry types and exports

**Goal:** Add the `PipeFormatter` type, `PipeFormatterContext` interface, `registerPipeFormatter`, and `getPipeFormatter` to `formula-eval.ts`.

**Agent actions:**

- Add `PipeFormatter` type and `PipeFormatterContext` interface to `packages/share/src/formula-eval.ts`
- Add module-level `Map<string, PipeFormatter>` registry
- Add `registerPipeFormatter(name, formatter)` and `getPipeFormatter(name)` functions
- Update `MODULE_CONTRACT` purpose to mention pipe formatting and formatter registry
- Add `CHANGE_SUMMARY` entry for RFC-0729

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` — TypeScript compiles with new types

**Completion criterion:** `registerPipeFormatter`, `getPipeFormatter`, `PipeFormatter`, `PipeFormatterContext` are exported and TypeScript compiles.

**Human review:** no

---

### Step 2. Register `money` formatter by default

**Goal:** Register the `money` formatter at module initialization time using `Intl.NumberFormat`.

**Agent actions:**

- Add `registerPipeFormatter("money", ...)` call at module top level (after registry declaration) in `formula-eval.ts`
- Implement the formatter per RFC design: `currency` (default EUR), `locale` (default `context.lang`), `targetCurrency` + `rate` for conversion
- Use `Intl.NumberFormat` with `style: "currency"`, `minimumFractionDigits: 0`, `maximumFractionDigits: 2`

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` — TypeScript compiles

**Completion criterion:** `getPipeFormatter("money")` returns a function after module import.

**Human review:** no

---

### Step 3. Extend `resolveFormula` with pipe parsing

**Goal:** Make `resolveFormula` detect `|` in the expression, split into arithmetic (left) and formatter (right), evaluate left as before, invoke formatter on the numeric result.

**Agent actions:**

- In `resolveFormula`, after the existing arithmetic evaluation produces a numeric result, check if the original expression contains `|`
- If no `|`: return result as today (unchanged behavior)
- If `|` present:
  - Split on first `|` at top level → `arithmeticExpr` (left) and `formatterSpec` (right)
  - Evaluate `arithmeticExpr` using the existing reference substitution + `expr-eval` path
  - Parse `formatterSpec`: first token = formatter name, remaining tokens = `key=value` pairs
  - Look up formatter via `getPipeFormatter(name)`
  - If not found (including empty name): return `{ value: "", resolved: false, error: "REF-10: Unknown pipe formatter: <name>" }`
  - Construct `PipeFormatterContext` from `lang` and `defaultLang` args
  - Invoke formatter with numeric value, params, context
  - Return `{ value: formatterResult, resolved: true }`
- Handle the RFC-0723 single-ref case: if the expression is a single ref with a pipe (e.g., `ref | money`), the left side resolves to a string value. If `extractNumeric` succeeds, use the numeric value. If it fails and the expression is a single ref, use the string value — but formatters expect a number, so if the value is non-numeric, return `REF-07` (the formatter cannot format a non-numeric value)

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` — TypeScript compiles
- Existing tests still pass (no-pipe expressions unchanged)

**Completion criterion:** `resolveFormula` handles `|` pipe syntax; expressions without `|` return identical results to before.

**Human review:** no

---

### Step 4. Add unit tests

**Goal:** Comprehensive unit tests for pipe parsing, formatter registry, money formatter, and REF-10 error.

**Agent actions:**

- Add test group "pipe syntax" to `formula-eval.test.ts`:
  - `=(ref | money currency=EUR locale=de)` with canonical `"70.00"` → `70 €`
  - `=(ref | money currency=EUR locale=de targetCurrency=UAH rate=45)` with canonical `"70.00"` → `3.150 ₴`
  - `=(ref | money currency=EUR locale=uk)` with canonical `"70.00"` → `70 €`
  - `=(ref * 12 | money currency=EUR locale=de)` with `70` → `840 €`
  - Expression without `|` returns same result as before (compatibility)
  - Single-ref with pipe: `=(ref | money currency=EUR locale=de)` where ref is a numeric string
- Add test group "formatter registry":
  - `registerPipeFormatter("custom", fn)` then `getPipeFormatter("custom")` returns `fn`
  - `getPipeFormatter("nonexistent")` returns `undefined`
- Add test group "REF-10":
  - `=(ref | unknownFormatter)` → `resolved: false`, `error` contains `REF-10`
  - `=(ref |)` (empty formatter name) → `resolved: false`, `error` contains `REF-10`
- Add test for invalid `rate` param: `rate=abc` → formatter ignores conversion, formats in original currency

**Validation:**

- `pnpm --filter @warpgogol/share run test` — all tests pass including new ones

**Completion criterion:** All new tests pass; existing tests unchanged.

**Human review:** no

---

### Step 5. Update `packages/share/AGENTS.md`

**Goal:** Update the `formula-eval` entry-point table row to list the new exports.

**Agent actions:**

- Find the `@warpgogol/share/formula-eval` row in the entry-point table in `packages/share/AGENTS.md`
- Append `registerPipeFormatter`, `getPipeFormatter`, `PipeFormatter`, `PipeFormatterContext` to the exports list
- Add note about RFC-0729 pipe syntax and `money` formatter

**Validation:**

- Visual inspection — table row is accurate

**Completion criterion:** `AGENTS.md` table row lists all new exports.

**Human review:** no

---

### Step 6. Validate acceptance criteria and run verification

**Goal:** Verify all acceptance criteria pass, run `rfc.validate`, and emit verification evidence.

**Agent actions:**

- Run `pnpm --filter @warpgogol/share run build:check`
- Run `pnpm --filter @warpgogol/share run test`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0729 --json`
- Check off each acceptance criterion in the RFC with inline evidence
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0729` (RFC-0330)
- Commit verification evidence file

**Validation:**

- `build:check` passes
- `test` passes
- `rfc.validate` passes
- Verification evidence file exists

**Completion criterion:** All acceptance criteria checked off with evidence; verification file committed.

**Human review:** no

---

### Step 7. Code review and fix

**Goal:** Run `fo-review` on all session code changes; fix any findings.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all session code changes
- If findings reported, invoke `fo-fix` via the `skill` tool
- Re-run `fo-review` to confirm all findings resolved (max 3 iterations)

**Validation:**

- Review report exists in `docs/reviews/code/`
- All findings resolved (or no findings)

**Completion criterion:** Code review passed with zero unresolved findings.

**Human review:** no

---

### Step 8. Stamp implemented

**Goal:** Transition RFC-0729 from `accepted` to `implemented`.

**Agent actions:**

- Get the implementation commit SHA (last commit with code changes)
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0729 --implementation-commit <sha>`
- The command validates all preconditions atomically (status, criteria, clean tree, commit reachability)

**Validation:**

- `rfc.implement.stamp` exits 0
- RFC status is `implemented`

**Completion criterion:** RFC-0729 is stamped as `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0729`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/share run test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0729` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0729.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0729` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| ` | ` character in content reference values misinterpreted as pipe | Step 3: split on first ` | `only; content reference values are decimal strings/URIs/enums that don't contain` | ` |
| `Intl.NumberFormat` locale data availability | Steps 2, 4: Node.js and Cloudflare Workers both support `Intl.NumberFormat` natively — no polyfill |
| Formatter registry is global state | Step 2: registration at module init (top-level side effect), not runtime; `money` is the only default formatter |
| Pipe syntax confusion with bitwise OR | Step 4: test that `expr-eval` does not support ` | `as bitwise OR —` | `is unambiguous inside`=(…)` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-4, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0729 --reason "..." --invariant "DNA-4"` instead of working around it.
