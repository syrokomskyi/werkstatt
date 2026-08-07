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
enhancedAt: 2026-08-07
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
  - DNA-4
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

This constraint applies to **both** Schema.org emission paths in the codebase:

- **PBP compiler projection** (`generateSchemaOrg` in `packages/pbp/src/compiler/projection.ts`) — Phase 12 projection
- **Share JSON-LD builder** (`buildOrganizationNode` in `packages/share/src/semantic/jsonld/organization.ts`) — page-level JSON-LD

### 2. No `Offer` duplication

Do NOT create multiple `Offer` entries for the same product — one per currency. Search engines interpret multiple `Offer` entries as different offers, not different display currencies.

### 3. `price` field added to PBP compiler projection

The current `generateSchemaOrg` in `projection.ts` emits `priceCurrency` but does NOT emit `price`. This RFC adds the `price` field, populated from the canonical source-currency charge amount (`pricing.charges.<key>.amount.value` where `model: "fixed"`).

### 4. `priceCurrency` added to share JSON-LD builder

The current `buildOrganizationNode` in `organization.ts` emits `priceSpecification.price` but does NOT emit `priceCurrency`. This RFC adds `priceCurrency` to the `Offer` node, populated from the canonical source currency.

### 5. Validation rule (projection-level)

The compiler validates that Schema.org output for Offering pages does not contain derived price values. If a derived price value appears in the `price` field, the build fails with a `PBP-SCHEMA-PRICE` error. This validation runs in Phase 12 (projection), not Phase 10 (semantic entity validation) — it checks the generated Schema.org output, not raw entities.

### 6. Rich result compatibility

The Schema.org output remains compatible with Google's rich result requirements:

- `Offer.price` is a number or numeric string
- `Offer.priceCurrency` is an ISO 4217 code
- `Offer.availability` is a Schema.org `ItemAvailability` value
- No additional fields for derived prices

### 7. Example Schema.org output

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

- **DNA-4 (Canonical content in `src/content/`).** Schema.org `price` and `priceCurrency` are derived from canonical PBP content (`pricing.charges` and `pricing.currency` in offering entities), not from derived/materialized prices. This enforces that structured data reflects the business-declared canonical content.
- **DNA-16 (Semantic layer shares topology with navigation).** Related — Schema.org output is a semantic output derived from the page topology. This RFC constrains price fields within that output but does not change topology derivation.
- **RFC-0432 (Schema.org Mapping).** This RFC constrains the price output of the existing mapping.
- **RFC-0742 (Price Projection).** The projection provides derived prices for display. Schema.org ignores the projection and uses the canonical price.

## Design

### CLI surface

No new CLI command. The Schema.org generation logic is extended with a validation check.

### TypeScript contracts

```ts
// packages/pbp/src/compiler/projection.ts — extend generateSchemaOrg

function generateSchemaOrg(graph: PbpResolvedGraph): Record<string, unknown> {
  // Each Offer node gains:
  //   price: canonical source-currency decimal string (from pricing.charges.<key>.amount.value)
  //   priceCurrency: already present (from pricing.currency)
  // No includeDerivedPrices option — derived prices are never emitted.
  // The validation rule below enforces this at build time.
}

// packages/share/src/semantic/jsonld/organization.ts — extend buildOrganizationNode

// The makesOffer Offer nodes gain:
//   priceCurrency: canonical source currency code
//   (price is already present via priceSpecification.price)

// packages/pbp/src/compiler/projection.ts — validation function

function validateSchemaOrgPrices(
  schemaOrg: Record<string, unknown>,
  canonicalPrices: Set<string>,
): PbpValidationError[];
```

No `includeDerivedPrices` option. The constraint is enforced by the validation rule, not by an API parameter. An always-false option adds dead code and API surface without value.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/compiler/projection.ts` | Extend `generateSchemaOrg` to emit `price` field; add `validateSchemaOrgPrices` validation function |
| `packages/share/src/semantic/jsonld/organization.ts` | Extend `buildOrganizationNode` `makesOffer` to include `priceCurrency` |
| `packages/pbp/src/compiler/pipeline.ts` | Call `validateSchemaOrgPrices` after projection generation (Phase 12) |

### Output format

N/A — constrains existing Schema.org output.

### Failure modes

- **Derived price in Schema.org.** Compiler validation fails with error: "PBP-SCHEMA-PRICE: Derived price value '{value}' found in Schema.org price field. Only canonical source-currency prices are allowed in structured data." This is a blocking error in `build.check` pipeline step.
- **Offering without pricing.** If an offering has no `pricing` field, the Schema.org `Offer` node omits `price` and `priceCurrency`. The validation rule skips offerings without pricing — no false positive.
- **Offering with non-fixed charge model.** If `pricing.charges.<key>.amount.model` is not `"fixed"` (e.g. `"range"`, `"tiered"`), the `price` field is omitted. Schema.org `Offer.price` requires a single decimal string; range/tiered prices cannot be represented.

## Rollout

- **Immediate:** Upon acceptance, `price` is added to PBP compiler projection, `priceCurrency` is added to share JSON-LD builder, and the validation rule is added to Phase 12.
- **No content changes:** Existing content is already correct (canonical prices only). This RFC makes the constraint explicit and enforced.
- **Compass sync:** `docs/technology.xml` may need update if it references Schema.org output shape.

## Alternatives considered

- **Emit derived prices in Schema.org.** Include UAH/USD prices as additional `Offer` entries. Rejected: search engines interpret multiple `Offer` entries as different offers. This creates confusion and potential rich result penalties.

- **Use `priceSpecification` with multiple prices.** Schema.org `PriceSpecification` allows compound price specifications. Rejected: this is intended for different pricing models (e.g. subscription vs one-time), not for display currencies. Using it for currency display is semantically incorrect.

- **No validation.** Trust that the implementation won't emit derived prices. Rejected: without validation, a future change could accidentally leak derived prices into Schema.org. The validation rule prevents this.

## Risks

- **SEO impact of multi-currency display.** Search engines see the source-currency price in Schema.org but the page may display a derived price (if the user selects a different currency). This is intentional — the canonical price is the business-declared price. The derived price is a display enhancement. Search engines understand that display prices may vary by user preference.

- **Rich result price mismatch.** If a user sees UAH 3239 on the page but Schema.org says EUR 70, the search snippet may show EUR 70. This is correct behavior — the canonical price is EUR 70. The UAH price is an approximate conversion.

- **False-positive rate.** The validation rule compares `price` field values against the set of known derived price values. False positives are impossible in the current architecture: derived prices are materialized separately from canonical prices (RFC-0740), and the `price` field is populated from `pricing.charges.<key>.amount.value` (canonical source). A derived price can only leak into `price` if the projection builder is modified to read from the wrong source — which is exactly the scenario the validation catches.

- **Agent misinterpretation.** An agent might think adding `priceCurrency: "UAH"` is helpful when the user selects UAH display. The validation rule catches this: `priceCurrency` MUST be the canonical source currency, not the display currency.

## Acceptance criteria

- [ ] Schema.org `Offer.price` uses canonical source-currency decimal string (PBP compiler path)
- [ ] Schema.org `Offer.priceCurrency` uses canonical source currency code (both paths)
- [ ] `priceCurrency` added to share JSON-LD `buildOrganizationNode` `makesOffer` nodes
- [ ] `price` added to PBP compiler `generateSchemaOrg` Offer nodes
- [ ] No derived/indicative prices in Schema.org output (both paths)
- [ ] Compiler validation blocks publication if derived price appears in Schema.org `price` field
- [ ] Validation runs in Phase 12 (projection), not Phase 10 (semantic)
- [ ] Offerings without `pricing` field do not trigger false positives
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Schema.org output MUST always use the canonical source-currency price, regardless of the user's display currency selection.
- Never emit derived or indicative prices in Schema.org structured data.
- The validation rule MUST catch any accidental leakage of derived prices into Schema.org.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
