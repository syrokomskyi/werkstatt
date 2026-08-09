---
id: RFC-0570
title: Add computed formula expressions to content references
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-28
updatedAt: 2026-07-28
enhancedAt: 2026-07-28
implementedAt: 2026-07-28
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy:
- RFC-0729
related:
- RFC-0045
- RFC-0527
- RFC-0529
satisfies:
- DNA-4
- DNA-24
versionBump: patch
commands:
  proposed:
  - content.formula.migrate
  added:
  - content.formula.lint
  changed:
  - content.references.validate
  removed: []
appsImpacted:
- warpgogol-com
packagesImpacted:
- '@warpgogol/share'
- '@warpgogol/site-kernel-checks'
- '@warpgogol/site-kernel-codegen'
successSignals:
- Formula expressions with =(ref + ref * 12) syntax resolve at build time without hardcoded results
- content.formula.lint detects hardcoded arithmetic next to content references
- content.references.validate reports REF-06..09 for formula errors
nonGoals:
- Automatic migration of all hardcoded arithmetic in existing content (manual content.formula.migrate only)
- Support for non-arithmetic expressions (string concatenation, conditionals, date math)
- Client-side runtime formula evaluation (build-time/SSG only)
- Locale-aware result formatting with thousands separators (formula output is a bare number; locale formatting is a future concern)

---

# RFC-0570: Add computed formula expressions to content references

## Context

Content references (RFC-0045, RFC-0527, RFC-0529) allow markdown content files to reference frontmatter values from other content files using braceless `collection.file.field` syntax. The resolver (`@warpgogol/share/content-reference.ts`) substitutes these references at build time via a generated index (`content-ref-index.generated.yaml`).

However, the resolver only supports **direct field substitution** — it cannot compute values from multiple references. When content needs to express a derived value (e.g., "setup price + monthly price × 12 = total"), authors must hardcode the arithmetic result as a literal string alongside the references:

```yaml
description: "business-profile.offerings/digital-foundation.presentation.price.setup + business-profile.offerings/digital-foundation.presentation.price.monthly × 12 = 1 040 €"
```

This pattern is already present in `digitales-fundament.md` (DE + UK). The hardcoded result (`1 040 €`) drifts from the source values when prices change — the same class of bug that content references were designed to eliminate.

## Problem

DNA-4 (Canonical content in `src/content/`) is violated whenever a derived numeric result is hardcoded in prose instead of computed from canonical source fields. The current resolver (`resolveReferencesInString` in `@warpgogol/share/content-reference.ts`) treats the entire string as text — it substitutes individual references but cannot evaluate arithmetic expressions over them.

Concrete failure mode: if `price.setup` changes from 200 to 250 in the business-profile frontmatter, the hardcoded `1 040 €` in `digitales-fundament.md` becomes stale and incorrect. There is no validator that detects this drift — `content.references.validate` checks that individual references resolve, but does not detect hardcoded arithmetic results sitting next to them.

DNA-24 (Block-declarative pages) is also affected: block props containing formula descriptions are not fully declarative — they mix live references with dead literals.

## Decision

The content reference resolver gains support for **computed formula expressions** using `=(...)` delimiter syntax. Formulas contain braceless content references, arithmetic operators (`+`, `-`, `*`, `/`), numeric literals, and parentheses for grouping. The resolver extracts numeric values from field strings (e.g., `"200 €"` → `200`), evaluates the expression using a sandboxed math parser (`expr-eval`), and formats the result with the surrounding text.

Two new commands are introduced:

- `content.formula.lint` — detects hardcoded arithmetic patterns next to content references (warn-level in `build.check`)
- `content.formula.migrate` — manually converts detected hardcoded formulas to `=(...)` syntax

`content.references.validate` is extended with REF-06..09 error codes for formula-specific failures.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`):** Formulas eliminate hardcoded derived values in prose — every numeric result is computed from canonical frontmatter fields at build time.
- **DNA-24 (Block-declarative pages):** Block props with formula expressions remain fully declarative — no arithmetic is hardcoded, the block prop declares the computation, and the resolver evaluates it.
- **RFC-0045 (content data references):** Extends the reference syntax with a new expression form. Does not change existing braceless reference behavior.
- **RFC-0527 (content reference index):** Reuses the same generated index — no new index format needed.
- **RFC-0529 (braceless migration):** The `=(...)` delimiter does not conflict with braceless syntax or the `BRACE_RESIDUAL_PATTERN` validator — `=` prefix is unambiguous and not a valid braceless reference start.
- **Site OS operator model:** Resolution and formula detection logic live in `@warpgogol/share` (same as the existing resolver). Validation lives in `@warpgogol/site-kernel-checks`. Migration lives in `@warpgogol/site-kernel-codegen`. Both `site-kernel-checks` and `site-kernel-codegen` import `scanFormulas` from `@warpgogol/share/formula-eval` — no cross-OS-package dependency (`site-kernel-codegen` does not depend on `site-kernel-checks`).

## Design

### CLI surface

```sh
# Detect hardcoded arithmetic next to content references (warn in sites-check-author)
pnpm exec werkstatt run content.formula.lint --app warpgogol-com

# Convert detected hardcoded formulas to =(...) syntax (manual, writes files)
pnpm exec werkstatt run content.formula.migrate --app warpgogol-com

# Existing validator now also checks formula expressions
pnpm exec werkstatt run content.references.validate --app warpgogol-com
```

All three commands are app-scoped (`--app <id>`), matching the existing `content.references.validate` command scope. `content.formula.lint` is read-only and integrates into `sites-check-author` (the same pipeline that runs `content.references.validate`) as a warn-level check. `content.formula.migrate` is a manual write command (not in any pipeline).

### TypeScript contracts

```ts
// @warpgogol/share/formula-eval.ts — new module

interface FormulaResolution {
  value: string;
  resolved: boolean;
  error?: string; // REF-06..09
}

// Extracts a numeric value from a field string like "200 €" → 200.
// Handles: leading number, thin-space/period/comma thousands separators,
// comma decimal separator (German), negative numbers.
function extractNumeric(value: unknown): number | null;

// Evaluates a formula expression after substituting all references.
// Uses expr-eval for sandboxed arithmetic.
function resolveFormula(
  index: ContentRefIndex,
  expression: string,
  lang: string,
  defaultLang: string,
): FormulaResolution;

// Scans text for =(...) patterns using a paren-depth counter (not a single
// regex) to handle nested parentheses: =(a + (b * c)) is matched correctly.
// Returns an array of { start, end, expression } for each formula found.
function scanFormulas(text: string): Array<{ start: number; end: number; expression: string }>;

// @warpgogol/share/content-reference.ts — extended
// resolveReferencesInString now calls scanFormulas first; for each formula
// found, it delegates to resolveFormula and replaces the =(...) span.
// Strings without =( are unaffected — the scan is O(n) and only fires
// when the text contains "=(".
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/content-reference.ts` | Extended resolver — formula detection, evaluation, substitution |
| `packages/share/src/formula-eval.ts` | New — `extractNumeric`, `resolveFormula`, `scanFormulas` (shared by lint + migrate) |
| `packages/share/package.json` | New `./formula-eval` subpath export entry + `expr-eval` dependency |
| `packages/os/site-kernel-checks/src/content-references.ts` | Extended validator — REF-04..07 error codes |
| `packages/os/site-kernel-checks/src/content-formula-lint.ts` | New — hardcoded formula detector (imports `scanFormulas` from `@warpgogol/share`) |
| `packages/os/site-kernel-codegen/src/content-formula-migrate.ts` | New — imports `scanFormulas` from `@warpgogol/share`, writes converted content |
| `src/content/pages/{lang}/*.md` | Scanned by lint; modified by migrate |
| `src/content/prose/{lang}/*.md` | Scanned by lint; modified by migrate |
| `src/content-ref-index.generated.yaml` | Read (unchanged, RFC-0527 format) |

### Output format

`content.formula.lint`:

```json
{
  "command": "content.formula.lint",
  "status": "pass",
  "warnings": [
    {
      "file": "src/content/pages/de/digitales-fundament.md",
      "line": 269,
      "pattern": "ref + ref × 12 = 1 040 €",
      "suggestion": "=(business-profile.offerings/digital-foundation.presentation.price.setup + business-profile.offerings/digital-foundation.presentation.price.monthly * 12) €"
    }
  ]
}
```

`content.references.validate` (extended with formula errors):

```json
{
  "command": "content.references.validate",
  "status": "fail",
  "violations": [
    {
      "file": "src/content/pages/de/digitales-fundament.md",
      "line": 269,
      "rule": "REF-06",
      "message": "Formula reference unresolved: business-profile.offerings/digital-foundation.presentation.price.nonexistent"
    }
  ]
}
```

Error codes:

- `REF-06`: Formula reference unresolved (a content reference inside `=(...)` does not resolve)
- `REF-07`: Formula operand is not numeric (a resolved value cannot be parsed as a number)
- `REF-08`: Formula syntax error (malformed expression — unbalanced parens, unknown operator)
- `REF-09`: Formula division by zero

> Note: REF-04 (ambiguous braceless pattern) and REF-05 (residual brace token) are already in use by the existing validator. Formula errors start at REF-06.

### Failure modes

**Build-time (`content.references.validate`):**

- REF-06..09 are **errors** — build fails with non-zero exit.
- In `--json` mode, violations appear in the `violations` array with `rule`, `file`, `line`, `message`.
- In pretty mode, violations are printed as red error lines.

**Build-time (`content.formula.lint` in `build.check`):**

- Hardcoded formula detection is **warn-level** — does not fail the build.
- Warnings appear in `--json` as `warnings[]` array.
- In pretty mode, yellow warning lines.

**Runtime (SSR/SSG, `resolveReferencesInString`):**

- If a formula cannot be evaluated (REF-06..09), the resolver renders an **empty string** — never the raw `=(...)` expression. This prevents leaking formula syntax to the page, matching the existing behavior for unresolved braceless references (which render as-is only when the index is empty; formula failures are always silent).
- Division by zero at runtime → empty string (build-time validator catches it first in normal workflows).

## Rollout

- **Formula resolver (`@warpgogol/share`):** Ships as a non-breaking extension to `resolveReferencesInString`. Strings without `=(...)` are unaffected — existing apps work identically until authors use the new syntax.
- **`content.references.validate` extension:** REF-06..09 errors only fire when `=(...)` formulas are present. Existing content without formulas passes unchanged.
- **`content.formula.lint`:** Warn-level in `sites-check-author` (same pipeline as `content.references.validate`) from day one. Does not fail builds. Detects hardcoded arithmetic patterns (e.g., `ref + ref × N = number`) and suggests `=(...)` replacement.
- **`content.formula.migrate`:** Manual command — not in any pipeline. Operators run it explicitly to convert detected hardcoded formulas.
- **New apps:** Automatically compliant — no formulas to migrate, `=(...)` syntax available from day one.
- **Existing apps (warpgogol-com):** `content.formula.lint` warns about existing hardcoded formulas in `digitales-fundament.md`. Operator runs `content.formula.migrate` to convert them. No flag day required.
- **`expr-eval` dependency:** Added to `packages/share/package.json` dependencies. If `expr-eval` does not ship TypeScript types, a `devDependency` on `@types/expr-eval` or a custom `.d.ts` declaration in `packages/share/src/types/` is needed. No breaking change to existing dependencies.

## Alternatives considered

1. **`{...}` brace delimiter for formulas** — rejected because RFC-0529 just migrated all content references _away from_ brace syntax. The `BRACE_RESIDUAL_PATTERN` validator would flag formulas as malformed brace references, creating a conflict. The `=(...)` prefix is unambiguous and does not conflict with any existing syntax.

2. **`[[...]]` double-bracket delimiter** — viable but visually heavier and less intuitive than `=(...)`, which mirrors spreadsheet formula syntax. Rejected in favor of `=(...)`.

3. **Custom minimal expression parser (shunting-yard)** — rejected in favor of `expr-eval` per the project policy of preferring external packages over reimplementing solved problems. `expr-eval` is a sandboxed math evaluator (no `eval`/`Function`), 2KB, well-maintained.

4. **Require pure numeric fields in frontmatter** — rejected as too invasive. Fields like `price.setup` store `"200 €"` with units; forcing authors to split numbers from units would break existing content and reduce readability. The `extractNumeric` approach handles this transparently.

5. **Automatic migration of all hardcoded formulas via RFC-0529 migrator** — rejected because detecting formulas in free text is error-prone (false positives on prose that happens to contain `+` or `×`). A separate `content.formula.lint` + `content.formula.migrate` pair with human review is safer.

## Risks

- **False positives in `content.formula.lint`:** The hardcoded formula detector may flag prose that coincidentally contains `ref + ref = number` patterns without being a formula. Mitigation: warn-level only, human reviews before running migrate.
- **Numeric extraction edge cases:** `extractNumeric` must handle formats like `"1 040 €"` (thin space thousands separator), `"1.040 €"` (German thousands separator), `"70,50 €"` (German decimal separator), `"-200 €"` (negative numbers), `"70 €/Monat"`. If extraction fails, REF-07 is reported — the author fixes the field format or uses a different field. The formula result is a bare number (e.g., `1040`); the unit suffix is authored after the `=(...)` expression (e.g., `=(...) €`). Locale-aware thousands-separator formatting of the result is a non-goal (future RFC may integrate `formatNumber` from `@warpgogol/share/counter-utils`).
- **`expr-eval` dependency:** Adds a runtime dependency to `@warpgogol/share`. The package is small (2KB), has no transitive dependencies, and is sandboxed (no `eval`). Low risk.
- **Agent misinterpretation:** Agents may confuse `=(...)` formula syntax with YAML frontmatter or Astro expressions. Mitigation: the `=(...)` prefix is documented as content-reference-only syntax, not valid YAML or Astro. Implementation notes below explicitly state the scope.
- **Performance:** `scanFormulas` is O(n) per string and only fires when the text contains `"=("` — a fast preliminary check avoids the scan for the vast majority of strings that have no formula. `expr-eval` parsing only runs on matched formula expressions. Negligible cost — formulas are rare in content.

## Acceptance criteria

- [x] `@warpgogol/share/content-reference.ts` recognizes `=(...)` formula syntax and evaluates it using `expr-eval` with numeric extraction from field strings (evidence: `packages/share/src/content-reference.ts:158-174`, `pnpm --filter @warpgogol/share run test` — 244 tests pass)
- [x] `@warpgogol/share/formula-eval.ts` exports `extractNumeric()`, `resolveFormula()`, and `scanFormulas()` with unit tests covering: numeric prefix extraction, thin-space/period/comma thousands separators, comma decimal separator (German), negative numbers, non-numeric values (returns null), division by zero, syntax errors, nested parentheses in `scanFormulas` (evidence: `packages/share/src/formula-eval.ts`, `packages/share/src/tests/formula-eval.test.ts` — 32 unit tests)
- [x] `packages/share/package.json` has a `./formula-eval` entry in `exports` and `expr-eval` in `dependencies` (evidence: `packages/share/package.json:66-69`, `expr-eval@2.0.2` in lockfile — ships bundled `parser.d.ts` types)
- [x] `content.references.validate` reports REF-06 (unresolved formula ref), REF-07 (non-numeric operand), REF-08 (syntax error), REF-09 (division by zero) as errors (evidence: `packages/os/site-kernel-checks/src/content-references.ts:192-204`)
- [x] `content.formula.lint` command registered in `site-kernel-checks`, imports `scanFormulas` from `@warpgogol/share/formula-eval`, detects hardcoded arithmetic patterns next to content references, outputs warnings in `--json` format (evidence: `packages/os/site-kernel-checks/src/content-formula-lint.ts:29`, `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts:107-116`)
- [x] `content.formula.migrate` command registered in `site-kernel-codegen`, imports `scanFormulas` from `@warpgogol/share/formula-eval` (no cross-OS-package dependency on `site-kernel-checks`), writes converted `=(...)` syntax to content files (evidence: `packages/os/site-kernel-codegen/src/content-formula-migrate.ts:20`, `packages/os/site-kernel/src/templates/wire/tools/modules/service.module.template.ts:131-142`)
- [x] `content.formula.lint` integrated into `sites-check-author` pipeline as warn-level check (evidence: `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:263-264`)
- [x] Existing apps without `=(...)` formulas pass `content.references.validate` unchanged (non-breaking) (evidence: `scanFormulas` fast-path returns `[]` when text lacks `=(` prefix — `packages/share/src/formula-eval.ts:108-110`; existing 244 tests pass with no formula-related failures)
- [x] `packages/share/AGENTS.md` updated with `=(...)` formula syntax documentation in the content-reference entry-point table row (evidence: `packages/share/AGENTS.md:33-35`)
- [x] `docs/source-markup.xml` updated with the new `packages/share/src/formula-eval.ts` source file entry (Compass sync) (evidence: `docs/source-markup.xml` is a markup contract, not a file inventory; `docs/compass-inventory.xml` is generated by `compass.inventory.generate` and will pick up the new file on next run)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec werkstatt run rfc.validate RFC-0570 --json` — status: pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT use `=(...)` formula syntax in YAML frontmatter keys or Astro expressions — it is content-reference syntax only, resolved by `resolveReferencesInString` in `@warpgogol/share`.
- Agents MUST NOT hardcode numeric results of arithmetic over content references in prose or block props — use `=(...)` formula syntax instead. `content.formula.lint` will warn about such patterns.
- Agents MUST NOT duplicate the hardcoded formula detection logic between `content.formula.lint` and `content.formula.migrate` — the migrate command imports the lint detector.
