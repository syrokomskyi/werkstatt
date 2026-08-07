---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 70d8c7bd...HEAD
filesReviewed:
  - packages/pbp/package.json
  - packages/pbp/src/decimal.ts
  - packages/pbp/src/derivations/currency-conversion.ts
  - packages/pbp/src/derivations/currency-conversion.test.ts
  - packages/pbp/src/compiler/derivations.ts
  - packages/pbp/src/compiler/types.ts
  - packages/pbp/src/compiler/profile.ts
  - packages/pbp/src/compiler/publication.ts
  - packages/pbp/src/index.ts
  - packages/pbp/AGENTS.md
---

# Code Review: 70d8c7bd...HEAD (RFC-0739 Currency Conversion Derivation)

### Verdict: Needs revision

The implementation is functionally correct — all 16 tests pass, tsc is clean, and the pipeline matches the RFC spec. Three findings require revision: a hardcoded precision constant, a fragile zero-check, and an unused import.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/pbp build:check` (tsc --noEmit) exits 0. `vitest run src/derivations/currency-conversion.test.ts` — 16/16 pass. `rfc.validate --id RFC-0739` — zero errors.

### Axis A — Structural correctness

- **A1 (concern): Hardcoded precision constant.** `currency-conversion.ts:189` uses `const precision = 2 + 2;` — a magic number. The RFC specifies "target currency decimal places + 2 guard digits", but the target currency decimal places are always hardcoded to 2. This should either be a parameter derived from the target currency, or at minimum a named constant with a comment explaining why 2 is the fixed value (all current target currencies have 2 decimal places except JPY which has 0, and the JPY test passes with precision=4).

- **A2 (concern): Fragile zero-check.** `currency-conversion.ts:251` checks `finalAmount === "0" || finalAmount === "0.0" || finalAmount === "0.00"`. This misses cases like `"0.000"` or `"-0.00"` (which `big.js` can produce). A more robust check would use `Big(finalAmount).eq(0)` or `Big(finalAmount).abs().eq(0)`. Same issue on line 252-256 for `sourceAmount`.

- **A3 (concern): Unused import.** `currency-conversion.ts:16` imports `PbpDerivationResult` but it is never referenced in the file — only `PbpDerivationContract` is used. This is dead code.

### Axis B — DNA alignment

No issues. DNA-1 (monorepo boundary) — all new code is in `packages/pbp/`. DNA-55 (spec vendoring) — the implementation follows the vendored PBP spec §11 derivation engine model. ADR-012 (decimal string, not float) — all arithmetic uses `big.js` via `decimal.ts` helpers.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct — no cross-package imports added. `PbpResolvedGraph` extension is additive. `executeContract` dispatcher registration follows the existing pattern. `AGENTS.md` API surface updated.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths. The `ratePolicies` and `rateSnapshots` fields on `PbpResolvedGraph` are additive — existing code that constructs the graph must add the new fields, but `emptyGraph()` and `resolveProfile()` are already updated.

### Axis E — Agent-facing clarity

No issues. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. JSDoc references include `@see RFC-0739` and `@see RFC-0737`/`@see RFC-0738` for cross-RFC type references. The downcast pattern (summit A1) and trace exposure note (summit S1) are documented in JSDoc.

### Axis F — Pragmatism

- **F1 (concern): `decimalSubtract` is exported but only used in `currency-conversion.ts`.** Per packages/AGENTS.md: "Do not export Zod schemas or types without at least one consumer." The same principle applies to functions — `decimalSubtract` has exactly one consumer (the price ending step). This is borderline since it's a natural part of the decimal helper API, but it could be internal to `currency-conversion.ts` if no other consumer is expected.

### Axis G — Blind spots

- **G1 (concern): `new Date().toISOString()` for freshness check.** `currency-conversion.ts:184` uses `new Date().toISOString()` to compare against `snapshot.freshUntil`. This makes the function non-deterministic at build time — the same inputs can produce different results depending on when the build runs. The compiler pipeline already has a `buildTime` field in `PbpCompilerInput` — the function should accept an optional `now` parameter or use the build context's time instead of wall-clock time.

### Spec compliance

| Requirement from RFC-0739 | Status | Evidence |
| --- | --- | --- |
| PbpCurrencyConversionDerivation extends PbpDerivationContract | Done | currency-conversion.ts:81 |
| Fixed pipeline: conversion → pct → fixed → rounding → ending | Done | currency-conversion.ts:191-241 |
| Decimal arithmetic via big.js, never float | Done | decimal.ts, all helpers use Big |
| PbpRoundingMode closed union with const array | Done | decimal.ts:20-27 |
| PbpPriceEndingMode closed union | Done | currency-conversion.ts:37-43 |
| Trace produced for every successful derivation | Done | currency-conversion.ts:266-282 |
| Failure modes: NEGATIVE, ZERO, ENDING-INCOMPATIBLE | Done | currency-conversion.ts:243-264, 232-238 |
| Golden test vectors (5) | Done | test.ts vectors 1-5 |
| Failure mode test vectors (3) | Done | test.ts vectors 6-8 |
| JPY zero-decimal test | Done | test.ts vector 9 |
| Rounding mode tests (5) | Done | test.ts vectors 10-14 |
| Registered in executeContract dispatcher | Done | derivations.ts:58-59 |
| AGENTS.md API surface updated | Done | AGENTS.md:124-125 |

### Questions for the author

1. Should `precision` be derived from the target currency's decimal places rather than hardcoded to 4? If all current currencies use 2 decimal places, is there a plan for JPY/KRW (0) or Bahrain (3)?
2. Is `new Date().toISOString()` acceptable for freshness checking, or should the build time from `PbpCompilerInput.buildTime` be threaded through?
3. Should `decimalSubtract` remain exported as part of the decimal helper API, or should it be inlined since it has only one consumer?
