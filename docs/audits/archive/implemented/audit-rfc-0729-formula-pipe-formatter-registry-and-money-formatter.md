---
rfcId: RFC-0729
auditId: AUDIT-RFC-0729-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0729

## Verdict: Needs revision

The RFC is architecturally sound and well-scoped, but has a factual error in an acceptance criterion (German locale does not produce thin-space thousands separators) and misses `packages/share/AGENTS.md` from its file system responsibilities. Three minor findings round out the set.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

**A1 — `PipeFormatterContext` mapping not explicit.** The RFC introduces `PipeFormatterContext { lang, defaultLang }` and shows `resolveFormula` being extended, but does not state that `lang` and `defaultLang` are passed through from `resolveFormula`'s existing args (`lang`, `defaultLang`) to the `PipeFormatterContext`. The implementation hint is implicit — an implementer must infer the mapping. Add one sentence: "The formatter context is constructed from `resolveFormula`'s `lang` and `defaultLang` arguments."

**A2 — Acceptance criterion `3 150 ₴` with `locale=de` is factually wrong.** Line 230: `=(ref | money currency=EUR locale=de targetCurrency=UAH rate=45)` claims output `3 150 ₴`. `Intl.NumberFormat("de", { style: "currency", currency: "UAH" })` produces `3.150 ₴` (German uses `.` for thousands separator, not thin space). The thin-space format `3 150 ₴` is the `uk` locale output. Either change `locale=de` to `locale=uk` in the criterion, or change the expected output to `3.150 ₴`.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-4]` is explained: "Pipe formatting preserves canonical content as the single source of truth — display strings are produced at render time, not stored in content files." The `amends: [RFC-0570]` relationship is bidirectionally consistent (RFC-0570's `amendedBy` includes `RFC-0729`).

## Axis C — Ecosystem fit

**C1 — `packages/share/AGENTS.md` update missing from file system responsibilities.** The `formula-eval` entry-point table row in `packages/share/AGENTS.md` currently lists exports: `extractNumeric`, `scanFormulas`, `resolveFormula`, `FormulaResolution`, and the RFC-0723 string-value behavior. After this RFC, it must also list `registerPipeFormatter`, `getPipeFormatter`, `PipeFormatter`, `PipeFormatterContext`. The "File system responsibilities" table (lines 180–183) only lists `formula-eval.ts` and `formula-eval.test.ts` — add `packages/share/AGENTS.md`.

## Axis D — Forward-only compliance

No issues. The pipe syntax is additive — expressions without `|` behave unchanged. No compatibility shim, no dual-path, no grace period.

## Axis E — Agent-facing policy

No issues. Status is `draft`, no self-authorizing language. Implementation notes reference RFC-0224, RFC-0330, RFC-0334 correctly. No `NEEDS CLARIFICATION` markers. No persistence or storage policy concerns.

## Axis F — Pragmatism

**F1 — `minimumFractionDigits: 0` for currency not justified.** The `money` formatter uses `minimumFractionDigits: 0, maximumFractionDigits: 2`. For EUR in German commerce, `70,00 €` is standard; `70 €` looks like a rounded approximation. The RFC's acceptance criterion expects `70 €`, which matches the config — but the design choice of suppressing zero cents is not explained. Add one sentence in the Decision section: why 0 minimum fraction digits (e.g., "prices are round numbers in the current catalog; future fractional prices can override via params").

## Axis G — Blind spots

**G1 — Empty formatter spec edge case not addressed.** `=(ref |)` (pipe with no formatter name) is not mentioned. The implicit behavior: `getPipeFormatter("")` returns `undefined` → `REF-10`. This is probably correct, but the Failure modes section should list it explicitly for completeness.

## Questions for the author

1. Should the UAH conversion acceptance criterion use `locale=uk` (to match `3 150 ₴`), or should the expected output be `3.150 ₴` (to match `locale=de`)?
2. Is `minimumFractionDigits: 0` intentional for EUR display (round-number prices), or should it be `2` for standard currency formatting with cents?
3. How is `PipeFormatterContext` populated — are `lang` and `defaultLang` passed directly from `resolveFormula`'s existing args to the context object?
