---
rfcId: RFC-0570
auditId: AUDIT-RFC-0570-01
date: 2026-07-28
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0570

## Verdict: Needs revision

The RFC is structurally complete and well-motivated, but has two factual errors in the CLI surface (`--site` instead of `--app`), a regex design flaw that breaks on nested parentheses, a missing `exports` entry for the new `formula-eval.ts` subpath, and an unaddressed cross-package dependency direction for `content.formula.migrate` importing from `site-kernel-checks`.

## Mechanical validation (rfc.validate)

Pass — no violations.

## Axis A — Structural completeness

- **A1 (CLI surface):** The CLI examples use `--site warpgogol-com` but all existing commands in `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` use `scope: "app"` and the `--app` flag. The RFC's CLI surface is factually wrong — it should use `--app warpgogol-com`.

- **A2 (FORMULA_PATTERN regex):** The proposed `FORMULA_PATTERN = /=(([^)]+))/g` does not handle nested parentheses. A formula like `=(a + (b * c))` would match only `a + (b * c` (stopping at the first `)`), producing a syntax error. The regex must use a balanced-paren matcher or a recursive approach. This is a design-level flaw, not just a typo.

- **A3 (TypeScript contracts):** The contracts section is minimal and well-shaped. No issues.

- **A4 (Output format):** The `--json` shapes are documented with concrete examples. No issues.

## Axis B — DNA alignment

- **B1 (DNA-4):** The RFC explains how formulas eliminate hardcoded derived values — this is a genuine enforcement of DNA-4. No issues.

- **B2 (DNA-24):** The RFC claims block props with formulas "remain fully declarative." This is accurate — the formula is a declarative expression, not a hardcoded result. No issues.

- **B3 (Related RFCs):** `related: [RFC-0045, RFC-0527, RFC-0529]` — all three are relevant and correctly referenced as extensions, not amends. No issues.

## Axis C — Ecosystem fit

- **C1 (Package boundaries — cross-package import):** The RFC states `content.formula.migrate` in `@warpgogol/site-kernel-codegen` imports the lint detector from `@warpgogol/site-kernel-checks`. This creates a dependency `site-kernel-codegen → site-kernel-checks`. The RFC does not mention adding `@warpgogol/site-kernel-checks` to `packages/os/site-kernel-codegen/package.json` dependencies. Alternatively, the detection logic could live in `@warpgogol/share` (which both packages already depend on) to avoid a new cross-OS-package dependency. The RFC should justify the chosen direction.

- **C2 (Pipeline placement):** The RFC says `content.formula.lint` integrates into "build.check". `content.references.validate` lives in `SITES_CHECK_AUTHOR_PIPELINE` (`sites-check-author.ts:263`), which is spread into `SITES_BUILD_CHECK_PIPELINE` (`build-check.ts:20`). "build.check" is technically correct but imprecise — the RFC should name `sites-check-author` as the insertion point, matching how RFC-0529 and RFC-0045 reference pipeline placement.

- **C3 (Missing `exports` entry):** The RFC proposes a new file `packages/share/src/formula-eval.ts` but does not mention adding a `./formula-eval` entry to the `exports` map in `packages/share/package.json`. The share package uses explicit subpath exports (62+ entries); a new module must be exported explicitly. The acceptance criteria should include this.

- **C4 (AGENTS.md update specificity):** The acceptance criteria say "AGENTS.md updated with `=(...)` formula syntax documentation" but does not specify which AGENTS.md. It should be `packages/share/AGENTS.md` (where `@warpgogol/share/content-reference` is documented in the entry-point table) and possibly `packages/AGENTS.md`.

- **C5 (Compass sync):** The RFC changes `@warpgogol/share` public API (new module, extended resolver). Root AGENTS.md Compass document duties require synchronizing `docs/*.xml` files when shared package contracts change. The RFC does not mention which `docs/*.xml` files need updates (likely `docs/source-markup.xml` for the new source file).

## Axis D — Forward-only compliance

- **D1:** The RFC is purely additive — no compatibility shim, no dual-path, no legacy maintenance. Existing content without `=(...)` is unaffected. No issues.

- **D2:** `content.formula.migrate` is a one-way conversion tool, not a bridge. No issues.

## Axis E — Agent-facing policy

- **E1 (Status gate):** The RFC is `status: draft` and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted." No issues.

- **E2 (Implementation notes):** References RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation), RFC-0330 (verification evidence). These are the correct governance rules. No issues.

- **E3 (Anti-fabrication):** The acceptance criteria distinguish between code changes (agent can do) and content authoring (human). `content.formula.migrate` is a code command, not content authoring. No issues.

## Axis F — Pragmatism

- **F1 (Minimal command surface):** Two new commands (`lint` + `migrate`) plus one extension (`validate`). `content.formula.lint` could theoretically be a flag on `content.references.validate` (e.g., `--detect-hardcoded`), but the separation is justified: lint is warn-level, validate is error-level — different pipeline semantics. No issues.

- **F2 (Lean contracts):** The TypeScript contracts are minimal — `FormulaResolution`, `extractNumeric`, `resolveFormula`. No speculative generality. No issues.

- **F3 (`expr-eval` type declarations):** The RFC does not mention whether `expr-eval` ships TypeScript type declarations. If it does not, `@types/expr-eval` or a custom `.d.ts` will be needed. This should be noted in the acceptance criteria or implementation notes.

## Axis G — Blind spots

- **G1 (Numeric extraction edge cases):** The Risks section mentions thin-space and period thousands separators. However, `extractNumeric` must also handle: comma decimal separators (`"70,50 €"` in German), negative numbers (`"-200 €"`), and numbers without units (`"200"`). The RFC should acknowledge these cases or explicitly scope `extractNumeric` to prefix-only extraction.

- **G2 (Locale-dependent number formatting):** The RFC does not address how the formula result is formatted. If `=(business-profile.offerings/...price.setup + ...price.monthly * 12)` evaluates to `1040`, should the output be `"1040 €"`, `"1 040 €"`, or `"1.040 €"`? The result formatting is locale-dependent (German uses `.` for thousands, French uses space). The RFC should specify whether the result inherits the unit suffix from the surrounding text or from the first operand, and how thousands separators are handled.

- **G3 (Performance — re-scan cost):** The RFC says formula evaluation adds "one regex scan + one expr-eval parse per string with `=(...)`". But `resolveReferencesInString` is called on every string leaf in every block prop via `resolveReferencesDeep`. The RFC should clarify that the `=(...)` scan is only triggered when the `FORMULA_PATTERN` matches, not on every string — which is what the RFC implies but does not state explicitly.

## Questions for the author

1. Should `content.formula.migrate` import the detection logic from `@warpgogol/site-kernel-checks` (creating a new cross-OS-package dependency), or should the detection logic live in `@warpgogol/share` so both `site-kernel-checks` and `site-kernel-codegen` import from there?

2. How does `extractNumeric` handle locale-specific number formats (comma decimals, German thousands separators)? And how is the formula result formatted — does it inherit the unit suffix from the surrounding text, from the first operand, or is it specified explicitly after the `=(...)` expression?

3. The `FORMULA_PATTERN = /=(([^)]+))/g` regex breaks on nested parentheses (`=(a + (b * c))`). What is the intended parsing strategy — a balanced-paren matcher, a recursive regex, or limiting formulas to a single group with no nesting?
