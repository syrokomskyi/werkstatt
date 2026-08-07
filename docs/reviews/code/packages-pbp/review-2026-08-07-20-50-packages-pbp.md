---
reviewId: REVIEW-CODE-2026-08-07-02
date: 2026-08-07
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: e791c5de...HEAD
filesReviewed:
  - packages/pbp/src/compiler/projection.ts
  - packages/pbp/src/compiler/pipeline.ts
  - packages/pbp/src/compiler/index.ts
  - packages/pbp/src/compiler/__tests__/compiler-pipeline.test.ts
  - packages/share/src/semantic/models.ts
  - packages/share/src/semantic/business-projection.ts
  - packages/share/src/semantic/jsonld/organization.ts
  - packages/share/src/tests/organization-jsonld.test.ts
  - packages/pbp/AGENTS.md
  - packages/share/AGENTS.md
---

# Code Review (re-run): e791c5de...HEAD (RFC-0745 Currency-Aware Schema.org Mapping)

### Verdict: Approved

All three findings from the first review have been resolved. `priceCurrency` validation added, charge selection is deterministic via sorted keys, and typed `PbpOffering.pricing` access replaces `unknown` casts.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/pbp run build:check` exits 0. 20 compiler-pipeline tests pass. 3 organization-jsonld tests pass.

### Axis A — Structural correctness

No issues. Previous findings resolved:
1. `priceCurrency` validation — `validateSchemaOrgPrices` now accepts `canonicalCurrencies: Set<string>` and checks `priceCurrency` field (projection.ts:151-162).
2. Deterministic charge selection — `extractCanonicalPrice` sorts charge keys (`Object.keys(charges).sort()`, projection.ts:98) before selecting the first fixed-model charge.
3. Typed access — `generateSchemaOrg` and `buildCanonicalPriceSet` now use `offering.pricing` directly (projection.ts:82, 112) instead of `as unknown as Record<string, unknown>` casts. `extractCanonicalPrice` accepts `PbpPricing | undefined` instead of `Record<string, unknown> | undefined`.

### Axis B — DNA alignment

No issues. DNA-4 satisfied — canonical content only. Pass.

### Axis C — Ecosystem fit

No issues. `buildCanonicalCurrencySet` exported from compiler index. AGENTS.md updated. Pass.

### Axis D — Forward-only compliance

No issues. No shims or dual paths. Pass.

### Axis E — Agent-facing clarity

No issues. Compass scaffolding present on new test file. CHANGE_SUMMARY updated. Pass.

### Axis F — Pragmatism

No issues. `extractCanonicalPrice` shared between `generateSchemaOrg` and `buildCanonicalPriceSet`. `buildCanonicalCurrencySet` is minimal. Tests cover all new paths. Pass.

### Axis G — Blind spots

No issues. `priceCurrency` validation gap closed — the exact scenario from RFC line 202 (agent setting `priceCurrency: "UAH"`) is now caught. Empty `priceCurrency` string is skipped to avoid false positives for offerings without pricing. Deterministic charge selection eliminates iteration-order ambiguity. Pass.

### Spec compliance

| Requirement from the spec | Status | Evidence |
| --- | --- | --- |
| Schema.org `Offer.price` uses canonical source-currency decimal string | Done | `projection.ts:83-88` |
| `priceCurrency` uses canonical source currency code (both paths) | Done | `projection.ts:87`, `organization.ts:90` |
| `priceCurrency` added to share JSON-LD `makesOffer` | Done | `organization.ts:83-91` |
| `price` added to PBP compiler `generateSchemaOrg` | Done | `projection.ts:88` |
| No derived prices in Schema.org output | Done | `extractCanonicalPrice` reads only `pricing.charges` |
| Compiler validation blocks derived price in `price` field | Done | `validateSchemaOrgPrices:144-149` |
| `priceCurrency` validation catches non-canonical currency | Done | `validateSchemaOrgPrices:151-162` |
| Validation runs in Phase 12 | Done | `pipeline.ts:81-84` |
| Offerings without pricing don't trigger false positives | Done | Empty string skip at projection.ts:154 |
| Deterministic charge selection | Done | Sorted keys at projection.ts:98 |

### Questions for the author

No questions — all findings resolved.
