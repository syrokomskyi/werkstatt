---
reviewId: REVIEW-CODE-2026-08-07-01
date: 2026-08-07
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
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

# Code Review: e791c5de...HEAD (RFC-0745 Currency-Aware Schema.org Mapping)

### Verdict: Needs revision

Three findings: `priceCurrency` validation gap (RFC text explicitly requires it), non-deterministic charge selection when multiple fixed charges exist, and unnecessary type casts that bypass the typed `PbpOffering` interface.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/pbp run build:check` and `pnpm --filter @warpgogol/share run build:check` both exit 0. `rfc.validate --id RFC-0745` passes. 16 compiler-pipeline tests pass, 3 organization-jsonld tests pass, 302 share tests pass.

### Axis A — Structural correctness

1. **`priceCurrency` not validated.** RFC-0745 line 202 states: "The validation rule catches this: `priceCurrency` MUST be the canonical source currency, not the display currency." However, `validateSchemaOrgPrices` (`packages/pbp/src/compiler/projection.ts:125-145`) only checks `price` field values against the canonical set. It does not validate `priceCurrency` against the canonical source currency. An agent could set `priceCurrency: "UAH"` (display currency) and the validation would not catch it. The acceptance criteria don't explicitly require `priceCurrency` validation, but the RFC risk discussion does.

2. **Non-deterministic charge selection.** `extractCanonicalPrice` (`packages/pbp/src/compiler/projection.ts:95-108`) iterates `Object.values(charges)` and returns the first fixed-model charge found. If an offering has multiple fixed charges (e.g., `monthly` and `yearly`), the selected price depends on key insertion order in the parsed object. While JS string-key iteration follows insertion order (deterministic per parse), the "canonical" price is implicitly "whichever charge key appears first in the YAML" — this is fragile and undocumented. Consider sorting by charge key or using a designated canonical charge key.

3. **Unnecessary `as unknown as Record<string, unknown>` cast.** `buildCanonicalPriceSet` (`packages/pbp/src/compiler/projection.ts:114`) casts `offering as unknown as Record<string, unknown>` to access `.pricing`, but `PbpOffering` already types `pricing?: PbpPricing`. The cast bypasses the type system unnecessarily. This pattern originates from the pre-existing `generateSchemaOrg` code (line 81), but the new helper should use the typed access path: `offering.pricing` directly, then cast only `charges` (which is `Record<string, unknown>` in `PbpPricing`).

### Axis B — DNA alignment

No issues. DNA-4 (canonical content in `src/content/`) — `price` and `priceCurrency` are derived from `pricing.charges` and `pricing.currency` in offering entities, not from derived prices. Pass.

### Axis C — Ecosystem fit

No issues. Package boundaries respected — no cross-imports between `@warpgogol/pbp` and `@warpgogol/share`. AGENTS.md files updated for both packages. No new commands. Pass.

### Axis D — Forward-only compliance

No issues. No shims, no dual paths, no backward compatibility layers. Pass.

### Axis E — Agent-facing clarity

No issues. New test file (`organization-jsonld.test.ts`) carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. `projection.ts` `CHANGE_SUMMARY` updated with RFC-0745 entry. Comments reference RFC-0745 throughout. Pass.

### Axis F — Pragmatism

No issues. `extractCanonicalPrice` is shared between `generateSchemaOrg` and `buildCanonicalPriceSet` — no duplication. `SemanticPrice.currency` is optional, preserving existing consumers. Tests cover the key edge cases. Pass.

### Axis G — Blind spots

1. **False-positive rate for `priceCurrency` validation gap.** The RFC (line 200) claims false positives are impossible because derived prices are materialized separately. But without `priceCurrency` validation, a `priceCurrency: "UAH"` leak would go undetected — the exact scenario the RFC risk section warns about (line 202).

2. **Edge case: offering with multiple fixed charges.** The RFC does not address what happens when an offering has multiple fixed-model charges (e.g., monthly + yearly + setup). The current implementation silently picks one based on iteration order. Schema.org `Offer.price` expects a single price — the RFC should either document which charge is canonical or the implementation should handle this explicitly.

### Spec compliance

| Requirement from the spec | Status | Evidence |
| --- | --- | --- |
| Schema.org `Offer.price` uses canonical source-currency decimal string | Done | `projection.ts:83-88` |
| `priceCurrency` uses canonical source currency code (both paths) | Done | `projection.ts:87`, `organization.ts:90` |
| `priceCurrency` added to share JSON-LD `makesOffer` | Done | `organization.ts:83-91` |
| `price` added to PBP compiler `generateSchemaOrg` | Done | `projection.ts:88` |
| No derived prices in Schema.org output | Done | `extractCanonicalPrice` reads only from `pricing.charges` |
| Compiler validation blocks derived price in `price` field | Done | `validateSchemaOrgPrices:136-141` |
| Validation runs in Phase 12 | Done | `pipeline.ts:80-82` |
| Offerings without pricing don't trigger false positives | Done | `extractCanonicalPrice` returns `undefined`, validation skips |
| `priceCurrency` validation catches non-canonical currency | Missing | `validateSchemaOrgPrices` does not check `priceCurrency` — RFC line 202 explicitly requires this |

### Questions for the author

1. Should `validateSchemaOrgPrices` also validate `priceCurrency` against the canonical source currency set? The RFC risk section (line 202) explicitly says "The validation rule catches this" for non-canonical `priceCurrency`, but the implementation only checks `price` values.
2. What happens when an offering has multiple fixed-model charges (e.g., monthly + yearly)? Which one is the canonical `price` for Schema.org? The current implementation picks the first in iteration order — is this intentional?
3. Could `buildCanonicalPriceSet` access `offering.pricing` directly via the typed `PbpOffering` interface instead of casting through `unknown`?
