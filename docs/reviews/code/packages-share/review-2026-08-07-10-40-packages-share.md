---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: b2b92eff...HEAD
filesReviewed:
  - packages/share/src/formula-eval.ts
  - packages/share/src/tests/formula-eval.test.ts
  - packages/share/AGENTS.md
---

# Code Review: b2b92eff...HEAD (RFC-0729 implementation)

### Verdict: Approved

The diff cleanly implements RFC-0729 (pipe syntax, formatter registry, money formatter) with no findings across all seven axes. The code is minimal, well-typed, uses platform-native `Intl.NumberFormat`, and preserves existing RFC-0570/RFC-0723 behavior for expressions without `|`.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/share build:check` (tsc --noEmit) exit 0. `pnpm --filter @warpgogol/share test` — 287 tests passed, 0 failed. `rfc.validate --id RFC-0729` — zero violations.

### Axis A — Structural correctness

No issues.

- `PipeFormatter` type and `PipeFormatterContext` interface are properly typed with no `any`.
- `registerPipeFormatter`/`getPipeFormatter` are minimal Map wrappers — no over-engineering.
- `money` formatter correctly uses `Number.isFinite(rate)` to guard against `NaN` from `Number("abc")`.
- Pipe parsing in `resolveFormula` splits on first `|` via `indexOf("|")` — simple and correct.
- `specTokens` parsing handles `key=value` pairs with `eqIndex > 0` guard (skips tokens without `=`).
- Empty formatter spec `=(ref |)` → `specTokens` is empty → `formatterName` is `""` → `getPipeFormatter("")` returns `undefined` → REF-10. Tested and correct.
- No dead code, no magic numbers, no duplicated logic.

### Axis B — DNA alignment

No issues.

- **DNA-4** (Canonical content in `src/content/`): pipe formatting preserves canonical content as single source of truth — display strings are produced at render time via `Intl.NumberFormat`, not stored in content files. The formatter operates on numeric values extracted from canonical decimal strings.

### Axis C — Ecosystem fit

No issues.

- Package boundaries: `formula-eval.ts` imports only from `./content-reference.ts` in the same package. No cross-package imports added.
- `packages/share/AGENTS.md` entry-point table updated with new exports (`registerPipeFormatter`, `getPipeFormatter`, `PipeFormatter`, `PipeFormatterContext`).
- No new commands added — no command manifest regeneration needed.
- No `docs/*.xml` changes needed — this is a package-internal change.

### Axis D — Forward-only compliance

No issues.

- No backward compatibility layers or shims.
- Pipe syntax is additive — existing expressions without `|` return identical results (tested: "preserves existing behavior for expressions without pipe" and "preserves RFC-0723 single-ref string return without pipe").
- No dual paths — the `hasPipe` check is a branch, not a compatibility layer.

### Axis E — Agent-facing clarity

No issues.

- `MODULE_CONTRACT` updated with RFC-0729 purpose and non-goals (including "Do not add formatters other than money").
- `CHANGE_SUMMARY` updated with RFC-0729 entry.
- Variable names are self-documenting: `pipeIndex`, `hasPipe`, `arithmeticExpr`, `formatterSpec`, `specTokens`, `formatterName`.
- Test `MODULE_CONTRACT` updated to mention RFC-0729.

### Axis F — Pragmatism

No issues.

- Uses `Intl.NumberFormat` (platform native) instead of a third-party formatting library.
- No new dependencies added.
- Formatter registry is minimal: a `Map<string, PipeFormatter>` and two functions.
- No speculative generality — only `money` formatter registered, no unused optional fields.
- The `money` formatter's parameter handling uses defaults (`?? "EUR"`, `?? context.lang`) — no over-engineered config object.

### Axis G — Blind spots

No issues.

- `|` split uses `indexOf("|")` on the raw expression before reference substitution — content reference paths don't contain `|`, so no false splits.
- Invalid `rate` param: `Number("abc")` → `NaN` → `Number.isFinite(NaN)` → `false` → conversion ignored, formats in original currency. Tested.
- Empty formatter spec edge case: tested (REF-10).
- No security/privacy concerns — no user data, PII, or external services touched.

### Spec compliance

| Requirement from RFC-0729 | Status | Evidence |
| --- | --- | --- |
| Export `registerPipeFormatter`, `getPipeFormatter`, `PipeFormatter`, `PipeFormatterContext` | Done | `formula-eval.ts:35-54` |
| `money` formatter registered by default | Done | `formula-eval.ts:56-75`, test passes |
| `resolveFormula` handles pipe syntax | Done | `formula-eval.ts:199-306`, tests pass |
| Expressions without `|` unchanged | Done | Tests "preserves existing behavior" and "preserves RFC-0723 single-ref" pass |
| `=(ref \| money currency=EUR locale=de)` → `70 €` | Done | Test passes (`70\u00A0€` with non-breaking space) |
| `=(ref \| money ... targetCurrency=UAH rate=45)` → `3.150 UAH` | Done | Test passes (`3.150\u00A0UAH`) |
| Unknown formatter → REF-10 | Done | Tests for unknown and empty formatter name pass |
| `build:check` passes | Done | tsc --noEmit exit 0 |
| `test` passes | Done | 287 tests passed |
| `rfc.validate` passes | Done | Zero violations |

### Questions for the author

None — the implementation is clean and complete.
