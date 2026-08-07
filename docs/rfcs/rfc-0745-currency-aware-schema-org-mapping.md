---
id: RFC-0745
title: "Currency-Aware Schema.org Mapping"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-07
updatedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-16
  - RFC-0735
  - RFC-0742
  - pbp-specification-package/RFC-PBP-082
satisfies:
  - DNA-16
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/pbp"
successSignals:
  - "Schema.org output emits business-declared prices only"
  - "Derived/indicative prices NOT emitted in structured data"
  - "Offering pages with multi-currency entitled still emit valid Schema.org"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define the price projection — that is RFC-0742"
  - "Does not define the currency selector UI — that is RFC-0743"
  - "Does not change Schema.org mappings for non-pricing fields"
  - "Does not add new Schema.org types — only constrains price output"
---

# RFC-0745: Currency-Aware Schema.org Mapping

## Context

RFC-PBP-082 (materialized as RFC-0432) defines the Schema.org mapping for PBP entities. When multi-currency is enabled, offering pages display derived prices in target currencies (UAH, USD). This RFC defines how Schema.org structured data handles multi-currency prices.

The key principle: **Schema.org output emits business-declared prices only** (source currency). Derived/indicative prices are NOT emitted in structured data. This preserves SEO correctness — search engines see canonical prices, not converted approximations.

## Problem

1. **No multi-currency Schema.org guidance.** The existing Schema.org mapping (RFC-0432) does not address what happens when a page displays prices in multiple currencies. Without guidance, implementations might emit derived prices in structured data, confusing search engines.

2. **Risk of duplicate price signals.** If Schema.org emits both source and derived prices, search engines may see conflicting prices for the same offering. This can trigger rich result penalties or incorrect price displays in search snippets.

3. **No validation rule.** There is no validation rule preventing derived prices from leaking into Schema.org output.

## Decision

### 1. Schema.org emits business-declared prices only

The Schema.org `Offer` price specification for an Offering MUST use:
- `price`: the canonical source-currency decimal string (e.g. `"70.00"`)
- `priceCurrency`: the canonical source currency code (e.g. `"EUR"`)

Derived prices (UAH, USD) are NOT emitted in Schema.org structured data.

### 2. No `Offer` duplication

Do NOT create multiple `Offer` entries for the same product — one per currency. Search engines interpret multiple `Offer` entries as different offers, not different display currencies.

### 3. Validation rule

The compiler validates that Schema.org output for Offering pages does not contain derived price values. If a derived price value appears in `price` field, the build fails.

### 4. Rich result compatibility

The Schema.org output remains compatible with Google's rich result requirements:
- `Offer.price` is a number or numeric string
- `Offer.priceCurrency` is an ISO 4217 code
- `Offer.availability` is a Schema.org `ItemAvailability` value
- No additional fields for derived prices

### 5. Example Schema.org output

```json
{
  "@type": "Offer",
  "price": "70.00",
  "priceCurrency": "EUR",
  "availability": "https://schema.org/InStock"
}
```

No UAH or USD prices appear in this output, even when the page displays them.

## Architectural fit

- **DNA-16 (Semantic layer shares topology with navigation).** Schema.org output is derived from the same page topology. The price in Schema.org is the canonical PBP price, not the display price.
- **RFC-0432 (Schema.org Mapping).** This RFC constrains the price output of the existing mapping.
- **RFC-0742 (Price Projection).** The projection provides derived prices for display. Schema.org ignores the projection and uses the canonical price.

## Design

### CLI surface

No new CLI command. The Schema.org generation logic is extended with a validation check.

### TypeScript contracts

```ts
// packages/share/src/astro/seo/schema-org.ts — extension

export function buildOfferingSchemaOrg(
  offering: PbpOffering,
  options: { includeDerivedPrices: false },
): SchemaOrgOffer;
```

The `includeDerivedPrices` option is always `false`. It exists to make the constraint explicit and prevent accidental inclusion.

### File system responsibilities

| Path | Role |
|---|---|
| `packages/share/src/astro/seo/schema-org.ts` | Schema.org generation — price field uses canonical source price only |
| `packages/pbp/src/compiler/semantic.ts` | Validation rule: no derived price values in Schema.org output |

### Output format

N/A — constrains existing Schema.org output.

### Failure modes

- **Derived price in Schema.org.** Compiler validation fails with error: "PBP-SCHEMA-PRICE: Derived price value '{value}' found in Schema.org price field. Only canonical source-currency prices are allowed in structured data."

## Rollout

- **Immediate:** Upon acceptance, the validation rule and explicit `includeDerivedPrices: false` option are added.
- **No content changes:** Existing Schema.org output is already correct (canonical prices only). This RFC makes the constraint explicit and enforced.

## Alternatives considered

- **Emit derived prices in Schema.org.** Include UAH/USD prices as additional `Offer` entries. Rejected: search engines interpret multiple `Offer` entries as different offers. This creates confusion and potential rich result penalties.

- **Use `priceSpecification` with multiple prices.** Schema.org `PriceSpecification` allows compound price specifications. Rejected: this is intended for different pricing models (e.g. subscription vs one-time), not for display currencies. Using it for currency display is semantically incorrect.

- **No validation.** Trust that the implementation won't emit derived prices. Rejected: without validation, a future change could accidentally leak derived prices into Schema.org. The validation rule prevents this.

## Risks

- **SEO impact of multi-currency display.** Search engines see the source-currency price in Schema.org but the page may display a derived price (if the user selects a different currency). This is intentional — the canonical price is the business-declared price. The derived price is a display enhancement. Search engines understand that display prices may vary by user preference.

- **Rich result price mismatch.** If a user sees UAH 3239 on the page but Schema.org says EUR 70, the search snippet may show EUR 70. This is correct behavior — the canonical price is EUR 70. The UAH price is an approximate conversion.

## Acceptance criteria

- [ ] Schema.org `Offer.price` uses canonical source-currency decimal string
- [ ] Schema.org `Offer.priceCurrency` uses canonical source currency code
- [ ] No derived/indicative prices in Schema.org output
- [ ] Compiler validation blocks publication if derived price appears in Schema.org
- [ ] `includeDerivedPrices: false` option is explicit in `buildOfferingSchemaOrg`
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Schema.org output MUST always use the canonical source-currency price, regardless of the user's display currency selection.
- Never emit derived or indicative prices in Schema.org structured data.
- The validation rule MUST catch any accidental leakage of derived prices into Schema.org.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
