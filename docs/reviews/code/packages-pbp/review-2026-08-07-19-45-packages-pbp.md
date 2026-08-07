---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 0e6f9f1f...HEAD
filesReviewed:
  - packages/pbp/src/projections/price-projection.ts
  - packages/pbp/src/projections/website.ts
  - packages/pbp/src/projections/ai-answer.ts
  - packages/pbp/src/projections/__tests__/price-projection.test.ts
  - packages/pbp/src/index.ts
  - packages/pbp/src/compiler/projection.ts
  - packages/pbp/AGENTS.md
---

# Code Review: 0e6f9f1f...HEAD (RFC-0742)

### Verdict: Needs revision

Implementation is structurally sound and covers all acceptance criteria. Three findings: one type-width issue, one redundant re-export, and one minor redundancy in locale resolution.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/pbp build:check` (tsc --noEmit) exit 0. `vitest run` on the new test file: 10/10 passed.

### Axis A — Structural correctness

**Finding A1: Type wider than needed in `projection.ts` line 30.**

```ts
const priceProjections: Record<string, ReturnType<typeof buildPriceProjection>> = {};
```

`ReturnType<typeof buildPriceProjection>` is `PbpPriceProjection | null`, but only non-null values are stored (line 33 guards with `if (projection)`). The record type should be `Record<string, PbpPriceProjection>` to reflect that null values are filtered out.

### Axis B — DNA alignment

No issues. DNA-4 (canonical content in `src/content/`) is not violated — the RFC explicitly designates note templates as code, not content. DNA-55 (spec vendoring) is not applicable.

### Axis C — Ecosystem fit

**Finding C1: Redundant re-export of `PbpCurrencyConversionTrace` in `price-projection.ts` line 224.**

```ts
export type { PbpCurrencyConversionTrace };
```

`PbpCurrencyConversionTrace` is already exported from `packages/pbp/src/index.ts` line 590 via the RFC-0739 export block. Re-exporting it from `price-projection.ts` creates a second export path for the same type, which violates the packages/AGENTS.md rule: "Do not export Zod schemas or types without at least one consumer." The `ai-answer.ts` import on line 10 sources directly from `../derivations/currency-conversion.js`, not from `price-projection.js` — so this re-export has no consumer.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code retained.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present on the new file. JSDoc references real RFC sections and types. No ungrounded assertions.

### Axis F — Pragmatism

**Finding F1: Redundant `resolveLocale` call in `composeNote`.**

`buildPriceProjection` (line 192) resolves the locale via `resolveLocale(locale)`, then passes `resolvedLocale` to `composeNote`. But `composeNote` (line 126) calls `resolveLocale(locale)` again internally. The second resolution is a no-op since the locale is already resolved, but it's redundant work. Either pass the already-resolved locale and skip re-resolution in `composeNote`, or remove the resolution from `buildPriceProjection` and let `composeNote` handle it.

### Axis G — Blind spots

No issues. Empty `derivedPrices` handled via `?? {}`. Unsupported locale handled via fallback to `uk`. No performance concerns — build-time only, no I/O.

### Spec compliance

| Requirement from RFC-0742 | Status | Evidence |
| --- | --- | --- |
| `PbpPriceProjection` interface exported | Done | `index.ts:615`, `price-projection.ts:48` |
| `PbpPriceDisplayConfig` interface exported | Done | `index.ts:616`, `price-projection.ts:28` |
| `buildPriceProjection` function exported | Done | `index.ts:617`, `price-projection.ts:184` |
| Website Projection includes `priceProjections` | Done | `website.ts:18`, `projection.ts:28-44` |
| AI Answer Projection includes `priceTraces` | Done | `ai-answer.ts:20`, `projection.ts:46-62` |
| `allowedUses` enforcement returns `null` | Done | `price-projection.ts:188-189` |
| Display config follows decisions #29, #31, #34 | Done | `price-projection.ts:79-84` |
| `tsc --noEmit` passes | Done | `build:check` exit 0 |
| `vitest run` passes | Done | 10/10 tests passed |
| `rfc.validate` passes | Done | 0 violations |

### Questions for the author

1. Should `SUPPORTED_LOCALES` be sourced from a shared config rather than hardcoded? The RFC specifies UK and DE, but if a third locale is added, this constant and the `NOTE_TEMPLATES` map both need updating.
