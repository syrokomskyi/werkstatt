# Multi-Currency Pricing Module — Architectural Integration Plan

> **Status:** Exploration — prepared for RFC drafting **Date:** 2026-08-07 **Source research:** `obsidian/.../6 Prices and Currencies - Chat GPT 5.6 Sol High.md` **Scope:** All sites created via Werkstatt; pluggable paid module

---

## 1. Context and Caveat

The research document was produced by an external expert who proposed a comprehensive multi-currency pricing model. The expert **did not know** the exact structure of our PBP specification package, our forge-spec RFC roadmap, or our pluggable module / entitlement architecture.

This plan adapts the expert's proposals to our actual system, mapping each concept to existing constructs and identifying what is genuinely new versus what already exists.

---

## 2. Mapping: Expert's Proposals → Our Architecture

### 2.1 What Already Exists in PBP

| Expert's concept | Our existing construct | Location |
| --- | --- | --- |
| Source PriceModel (fixed price) | `PbpCharge` + `PbpChargeAmount` | `packages/pbp/src/entities/pricing.ts` |
| Canonical currency | `PbpPricing.currency` | `packages/pbp/src/entities/offering.ts:67-73` |
| Derivation Contract | `PbpDerivationContract` + derivation engine | `packages/pbp/src/derivation.ts`, `packages/pbp/src/compiler/derivations.ts` |
| Derivation Result (with provenance) | `PbpDerivationResult` | `packages/pbp/src/derivation.ts:46-55` |
| First-Year Cost / TCO derivation | `computeFirstYearCost`, `computeTco` | `packages/pbp/src/compiler/derivations.ts:69-111` |
| Website Projection | RFC-PBP-080 (materialized as RFC-0455) | `docs/specs/pbp-specification-package/forge-spec.yaml:715-724` |
| AI Answer Projection | RFC-PBP-081 (materialized as RFC-0456) | `docs/specs/pbp-specification-package/forge-spec.yaml:725-734` |
| Schema.org Mapping | RFC-PBP-082 (materialized as RFC-0432) | `docs/specs/pbp-specification-package/forge-spec.yaml:735-743` |
| Decimal string money | ADR-012, `decimalString` schema | `packages/pbp/src/schemas/primitives.ts` |
| Policy entity | RFC-PBP-040 (materialized as RFC-0439) | `docs/specs/pbp-specification-package/forge-spec.yaml:488-496` |

### 2.2 What Is Genuinely New

| Expert's concept | Our adaptation | Why it's new |
| --- | --- | --- |
| CurrencyPricingPolicy | New PBP entity at business level | No business-level currency strategy exists |
| RatePolicy + RateSchedule | New PBP entities | No exchange rate model exists |
| PriceDerivationModel | New derivation contract type | Existing derivations don't do currency conversion |
| Materialized Derived Price | New projection output | Derivation results are not currently materialized as persistent price objects |
| Price Projection (currency-aware) | Extension of Website/AI projections | Projections don't currently handle multi-currency |
| Currency selector UI | New site module | No currency selection capability exists |
| Rate fetcher service | New service workspace | No external rate ingestion exists |

### 2.3 Key Architectural Divergences from Expert's Proposal

1. **No separate "PriceModel" entity.** The expert proposes `pbp/price-model@1` as a new top-level entity. In our PBP, the source price is already embedded in `Charge.amount` within `Offering.pricing`. We extend the existing `PbpCharge` structure, not create a parallel entity.

2. **No "Amount Rules" replacing `amount` on Charge.** The expert proposes replacing the single `amount` field with an `amounts` map. But the expert's own decision #3 ("one strategy per target currency across all Offerings") means the multi-currency logic belongs at the business level (CurrencyPricingPolicy), not duplicated per Charge. The Charge keeps its single canonical `amount`; derived amounts are materialized by the compiler from the business-level policy.

3. **PriceDerivationModel IS a Derivation Contract.** The expert proposes it as a separate entity. In our architecture, it is a specialized `PbpDerivationContract` with `derivationRef: "currency-conversion"`. The existing derivation engine (`runDerivations`) already supports this pattern.

4. **Materialized Derived Price is a projection, not a new entity type.** The expert proposes `pbp/price-model@1` with `modelKind: derived`. In our architecture, this is a derivation result that gets materialized into the compiled graph and projected through the existing projection contracts.

5. **The paid module gates site presentation, not PBP model.** PBP entities (CurrencyPricingPolicy, RatePolicy, derived prices) exist in the model regardless. The `multi-currency` entitlement gates whether the site compiles currency selector UI, derived price projections, and currency-aware Schema.org output. This mirrors how `blog`, `pseo`, and `nachweis` work.

---

## 3. Architecture by Layer

### 3.1 PBP Model Layer (`packages/pbp`)

#### 3.1.1 New Entities

**CurrencyPricingPolicy** (`pbp/currency-pricing-policy@1`)

Business-level policy declaring which target currencies are supported and how each is obtained.

```yaml
schema: pbp/currency-pricing-policy@1
id: https://webgogol.com/id/currency-pricing-policy/default
type: currency-pricing-policy
status: published

businessRef:
  ref: https://webgogol.com/id/business/webgogol

baseCurrency: EUR

targetCurrencies:
  uah:
    currency: UAH
    strategy: derived          # derived | fixed
    derivationContractRef:
      ref: pbp-derivation:currency-conversion/1
    ratePolicyRef:
      ref: https://webgogol.com/id/rate-policy/eur-uah
    currentUses:
      presentation: allowed
      aiAnswers: allowed
      quote: prohibited
      contract: prohibited
      invoice: prohibited
      settlement: prohibited

  usd:
    currency: USD
    strategy: fixed
    currentUses:
      presentation: allowed
      aiAnswers: allowed
      quote: prohibited
      contract: prohibited
      invoice: prohibited
      settlement: prohibited
```

**RatePolicy** (`pbp/rate-policy@1`)

Defines the exchange rate source and freshness rules per currency pair.

```yaml
schema: pbp/rate-policy@1
id: https://webgogol.com/id/rate-policy/eur-uah
type: rate-policy
status: published

pair:
  sourceCurrency: EUR
  targetCurrency: UAH

quotation:
  direction: target-per-source

mode: external              # external | business-fixed

sources:
  primary:
    sourceContractRef:
      ref: https://webgogol.com/id/rate-source/primary
  fallback:
    sourceContractRef:
      ref: https://webgogol.com/id/rate-source/fallback

freshness:
  maximumAge: P1M
  allowLastKnownValue: true

failure:
  noAcceptableRate: source-price-only
```

**RateSchedule** (`pbp/rate-schedule@1`)

For `business-fixed` mode: a versioned schedule of internal rates.

```yaml
schema: pbp/rate-schedule@1
id: https://webgogol.com/id/rate-schedule/eur-uah
type: rate-schedule

pair:
  sourceCurrency: EUR
  targetCurrency: UAH

entries:
  rate-2026-08-07:
    value: "46.00"
    validFrom: 2026-08-07T00:00:00+02:00
  rate-2026-08-10:
    value: "46.50"
    validFrom: 2026-08-10T00:00:00+02:00

governance:
  reviewEvery: P1D
```

**RateSnapshot** (`pbp/rate-snapshot@1`)

Immutable snapshot of a specific rate observation, created during materialization.

```yaml
schema: pbp/rate-snapshot@1
id: urn:pbp:rate-snapshot:2026-08-07:eur-uah:46.18
type: rate-snapshot

pair:
  sourceCurrency: EUR
  targetCurrency: UAH

value: "46.18"
source:
  kind: external
  sourceContractRef:
    ref: https://webgogol.com/id/rate-source/primary
observedAt: 2026-08-07T06:00:00Z
freshUntil: 2026-09-07T06:00:00Z
digest:
  algorithm: sha256
  value: "..."
```

#### 3.1.2 New Derivation Contract

**Currency Conversion Derivation** (`pbp-derivation:currency-conversion/1`)

A specialized `PbpDerivationContract` that takes a source amount, applies a RatePolicy, and runs a fixed pipeline:

```
1. Currency conversion:  sourceAmount × rate
2. Percentage adjustment: × (1 + percentage / 100)
3. Fixed adjustment:      + fixedAdjustment
4. Rounding:              round(result, roundingRule)
5. Price ending:          applyPriceEnding(rounded)
```

Parameters per target currency:

- `ratePolicyRef` — which rate to use
- `percentageAdjustment` — markup/discount before rounding
- `fixedAdjustment` — fixed add-on after percentage
- `rounding` — `{ mode, increment | decimalPlaces }`
- `priceEnding` — `{ mode: subtract, value, expectedEnding }`
- `commercialMeaning` — `{ kind: derived-price | indicative }`

The existing `runDerivations` function in `packages/pbp/src/compiler/derivations.ts` dispatches by `derivationRef`. We add a new branch:

```typescript
if (contract.derivationRef === "currency-conversion") {
  return computeCurrencyConversion(graph, contract);
}
```

#### 3.1.3 Materialized Derived Price

The derivation result is materialized into the compiled graph as a derived price entry attached to the Offering's Charge. This is not a new entity type — it is a projection of the derivation result:

```yaml
# Materialized into compiled graph, not authored
derivedPrices:
  digital-foundation-monthly-uah:
    chargeRef: monthly-subscription
    targetCurrency: UAH
    amount:
      value: "3239.00"
      currency: UAH
    priceKind: derived
    commercialMeaning: derived-price
    derivation:
      modelRef: pbp-derivation:currency-conversion/1
      rateSnapshotRef: urn:pbp:rate-snapshot:2026-08-07:eur-uah:46.18
    allowedUses:
      presentation: true
      aiAnswers: true
      quote: false
      contract: false
      invoice: false
      settlement: false
    calculatedAt: 2026-08-07T06:00:06Z
```

#### 3.1.4 Aggregate Monetary Derivation (TCO in target currency)

Separate derivation contract for aggregate-then-convert:

```yaml
id: pbp-derivation:aggregate-then-convert/1

aggregation:
  currency: source
  rounding: none

conversion:
  applyAfterAggregation: true

finalization:
  derivationContractRef:
    ref: pbp-derivation:currency-conversion/1
```

This ensures TCO is computed in source currency first, then converted and rounded once — not summed from rounded per-charge target amounts.

#### 3.1.5 Schema Changes to Existing Entities

**`PbpPricing`** — no change to `currency` field. It remains the canonical declared currency. Derived currencies are materialized separately, not authored.

**`PbpCharge`** — no change to `amount` field. The canonical amount stays. Derived amounts are materialized by the compiler.

This is a key simplification: the expert proposed changing `amount` to `amounts` (multi-currency rules per charge), but our architecture keeps the authored model clean and pushes multi-currency to the business-level policy + derivation.

### 3.2 PBP Spec Layer (`docs/specs/pbp-specification-package`)

New spec nodes to add to `forge-spec.yaml`:

| Node ID | Title | Depends on | Wave |
| --- | --- | --- | --- |
| RFC-PBP-036a | CurrencyPricingPolicy | RFC-PBP-030, RFC-PBP-040 | 5 |
| RFC-PBP-036b | RatePolicy and RateSchedule | RFC-PBP-036a | 5 |
| RFC-PBP-036c | RateSnapshot | RFC-PBP-036b | 5 |
| RFC-PBP-071a | Currency Conversion Derivation | RFC-PBP-070, RFC-PBP-036a, RFC-PBP-036b | 5 |
| RFC-PBP-071b | Derived Price Materialization | RFC-PBP-071a, RFC-PBP-064 | 5 |
| RFC-PBP-071c | Aggregate Monetary Derivation (multi-currency TCO) | RFC-PBP-071a, RFC-PBP-071 | 5 |
| RFC-PBP-080a | Currency-Aware Website Projection | RFC-PBP-080, RFC-PBP-071b | 5 |
| RFC-PBP-082a | Currency-Aware Schema.org Mapping | RFC-PBP-082, RFC-PBP-071b | 5 |

**Rationale for wave 5:** Multi-currency is a post-core extension. Waves 1-4 cover the PBP core, service businesses, physical commerce, and verification. Multi-currency pricing builds on all of these and is the first "open standard readiness" extension.

**Note:** These are new nodes in the vendored spec package. Per the spec vendoring rules (RFC-0394..0397), snapshot files are immutable. New nodes must be added via `docs/specs/<id>/amendments/` or through a spec version bump. Alternatively, these can be authored as standalone platform RFCs that reference the PBP spec without modifying it.

### 3.3 Platform Layer — Entitlement Gating

#### 3.3.1 New Entitled Feature

Add `multi-currency` to the closed catalog:

```typescript
// packages/share/src/entitlement.ts
export const ENTITLED_FEATURES = [
  "blog",
  "integrations.channels",
  // ... existing ...
  "nachweis",
  "multi-currency",           // NEW
] as const;

export const STRIPE_FEATURE_LOOKUP_MAP: Record<string, EntitledFeature> = {
  // ... existing ...
  feature_multi_currency: "multi-currency",   // NEW
};
```

#### 3.3.2 Build-Time Gate

The `entitlements.resolve` command (in `packages/os/site-kernel-checks/src/entitlements.ts`) already resolves features from Stripe and writes `src/entitlements.generated.yaml`. No change needed — the new feature flows through automatically.

The `entitlement.module.validate` command (in `packages/os/site-kernel-checks/src/entitlement-module.ts`) already validates that compiled modules are a subset of resolved entitlements. The multi-currency module declares `entitlement: "multi-currency"` in its surface module context, and the validator enforces it.

#### 3.3.3 Route Registry Gate

In `packages/share/src/astro/routes/registry.ts`, the pattern for gating routes by entitlement is established (blog, pseo, team.profiles, nachweis). The multi-currency module follows the same pattern:

```typescript
const multiCurrencyEntitled =
  entitledFeatures === null || entitledFeatures.includes("multi-currency");
if (multiCurrencyEntitled) {
  // Fold currency-aware price projection data into the registry
  // (not new routes, but enriched projection data for existing offering pages)
}
```

**Important:** Multi-currency does not add new routes. It enriches the projection data available to existing offering pages. The gate controls whether derived price data is compiled into the projection.

### 3.4 Site Layer — Presentation

#### 3.4.1 Currency Selector Component

A UI component (`packages/ui/src/components/currency-selector/`) that:

- Reads available target currencies from the compiled CurrencyPricingPolicy projection
- Persists user selection (localStorage, cookie, or URL param)
- Triggers re-render of price displays

The component is only compiled when the `multi-currency` entitlement is resolved.

#### 3.4.2 Price Display Component

Extension of existing price display components to:

- Read the Price Projection (see §3.5) for the selected currency
- Render formatted amount with locale-aware formatting
- Show disclosure note for derived prices:
  - `derived-price`: "Цена рассчитана по курсу 1 EUR = 46,18 UAH."
  - `indicative`: "Ориентировочная цена. Итоговая сумма зависит от применимого курса."
- Do NOT show source EUR price alongside (per decision #31)
- Do NOT show rate date near price (per decision #34)
- Do NOT use `≈` symbol (per decision #33)

#### 3.4.3 Schema.org Output

Schema.org structured data (`packages/share/src/astro/seo/`) must:

- Emit business-declared prices only (source currency)
- NOT emit derived/indicative prices in structured data
- This preserves SEO correctness — search engines see canonical prices

### 3.5 Price Projection Contract

The Website Projection (RFC-PBP-080 / RFC-0455) is extended to include a currency-aware price projection:

```json
{
  "amount": {
    "value": "3239.00",
    "currency": "UAH",
    "formatted": "3 239 ₴"
  },
  "priceKind": "derived",
  "commercialMeaning": "derived-price",
  "display": {
    "showSourcePrice": false,
    "showRate": true,
    "showRateDateNearPrice": false,
    "note": "Цена рассчитана по курсу 1 EUR = 46,18 UAH."
  },
  "allowedUses": {
    "presentation": true,
    "invoice": false
  }
}
```

The UI receives this projection and does NOT:

- compute the amount
- round
- select a rate
- interpret price status
- compose the disclosure note

The projection is assembled at build time from materialized derived prices.

### 3.6 AI Agent Trace

The AI Answer Projection (RFC-PBP-081 / RFC-0456) is extended to include the full calculation trace:

```yaml
source:
  amount: "70.00"
  currency: EUR
rate:
  value: "46.18"
  pair: EUR/UAH
  direction: target-per-source
  sourceKind: external-primary
  observedAt: 2026-08-07T06:00:00Z
  snapshotDigest: sha256:...
model:
  id: currency-conversion
  version: 1
calculation:
  conversion:
    input: "70.00"
    rate: "46.18"
    output: "3232.6000"
  percentageAdjustment:
    percentage: "0.00"
    output: "3232.6000"
  fixedAdjustment:
    value: "0.00"
    output: "3232.6000"
  rounding:
    mode: ceiling
    increment: "10"
    output: "3240.00"
  priceEnding:
    operation: subtract
    value: "1.00"
    output: "3239.00"
result:
  amount: "3239.00"
  currency: UAH
```

Per decision #35, the AI agent gets full calculation trace access.

### 3.7 Service Layer — Rate Fetcher

New service workspace: `services/rate-fetcher-worker/`

Responsibilities:

1. Fetch exchange rates from configured external sources (primary + fallback)
2. Create RateSnapshot records
3. Store snapshots in the site's content directory (or a shared rate store)
4. Trigger derived price rematerialization when new snapshots are accepted

Runs on a daily schedule (per decision #7: "Ежедневно"). The service is thin runtime composition only — rate source adapters, snapshot validation, and freshness rules belong in `packages/*`.

**Rate source adapters** live in a new package: `packages/pbp-rate-adapters/` (or within `packages/pbp` as a sub-module). Each adapter normalizes the external API response to a single `target-per-source` decimal value. The adapter handles the semantic choice (mid, buy, sell, official) per decision #12.

### 3.8 Materialization Pipeline

Derived prices are materialized at build time, not at page-render time. The pipeline:

```
1. entitlements.resolve          → resolves multi-currency feature
2. pbp.compile                   → compiles PBP graph (existing)
3. rate-snapshot.resolve         → loads/accepts rate snapshots (NEW)
4. currency-pricing.compile      → resolves CurrencyPricingPolicy (NEW)
5. derived-prices.materialize    → runs currency-conversion derivation (NEW)
6. website-projection.generate   → includes currency-aware projections (extended)
```

Steps 3-5 are new pipeline steps in the build-prepare pipeline (`packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`). They are gated by the `multi-currency` entitlement — if not entitled, they are skipped.

### 3.9 Rematerialization Triggers

Derived prices are rematerialized when:

- `source-price-model.published` — Offering pricing changes
- `rate-snapshot.accepted` — New rate snapshot available
- `price-derivation-model.activated` — PriceDerivationModel version activated
- `currency-pricing-policy.changed` — Business currency policy changes
- `manual-rebuild.requested` — Manual trigger

For the current project, a daily scheduled job is sufficient (per the research doc §14).

---

## 4. Invariants (Compiler Validation)

The PBP compiler must block publication when:

1. Target currency not registered in CurrencyPricingPolicy
2. No single business strategy for a target currency (conflicting strategies across Offerings)
3. `strategy: derived` but no RatePolicy referenced
4. `strategy: fixed` but a Derived Price exists for that currency
5. Offering attempts to override business-level currency strategy
6. Source and target currency are the same
7. Rate direction undefined
8. Primary and fallback sources return incompatible pairs
9. RateSnapshot older than `maximumAge` (for binding prices)
10. RateSchedule has two entries with same `validFrom`
11. No applicable internal rate for `business-fixed` mode
12. PriceDerivationModel has no version
13. Pipeline contains unsupported operation
14. Price ending `9` applied without rounding to 10 first
15. Price ending `99` applied without rounding to 100 first
16. Derived result is negative
17. Derived result is zero for positive source price
18. Derived PriceModel missing RateSnapshot
19. Derived PriceModel not reproducible from trace
20. `invoice: true` but `settlement: false` without special policy
21. Indicative price allowed for invoice
22. TCO summed from rounded target-currency Charges
23. Two active PriceDerivationModel versions overlap in time
24. Projection attempts to modify the final amount

---

## 5. Decisions Adopted from Research Document

All 35 design decisions from the research document's "Решения для окончательного проектирования" section are adopted:

- **Derived prices can be official** (decision #1) — `currentUses` field supports future invoice/contract use
- **Current scope: site presentation only** (decision #2) — `quote/contract/invoice/settlement: prohibited`
- **One strategy per target currency** (decision #3) — enforced at business level
- **Internal rate per currency pair** (decision #4) — RateSchedule per pair
- **One rate for all Offerings** (decision #5) — RatePolicy at business level
- **Daily review** (decision #7) — `reviewEvery: P1D`
- **Old rate valid until replaced** (decision #8) — `validFrom` without `validUntil`
- **Future `validFrom` supported** (decision #9)
- **One rate source for business** (decision #10) — with fallback (#11)
- **Single normalized return value** (decision #12) — adapter handles semantics
- **Max age 1 month, configurable** (decision #13)
- **Last known rate allowed within max age** (decision #14)
- **PriceModel at business level** (decision #15)
- **Percentage markup allowed** (decision #16)
- **Fixed adjustment after conversion** (decision #17)
- **No min/max price** (decision #18, #19)
- **Only `…9` and `…99` endings** (decision #20)
- **One model for multiple target currencies** (decision #21)
- **Model per Charge** (decision #22)
- **TCO: aggregate then convert** (decision #24)
- **Don't show activation + monthly + first-year simultaneously** (decision #25)
- **Price fixation: future** (decision #26) — current scope is presentation only
- **Quote validity: 3 days, configurable** (decision #27)
- **Rate snapshot in contract: yes** (decision #28) — future
- **Show rate to customer: yes** (decision #29)
- **Change PriceModel without changing Offering: yes** (decision #30)
- **Don't show source EUR price** (decision #31)
- **Brief explanation, not formula** (decision #32)
- **Text note only, no `≈`** (decision #33)
- **No rate date near price** (decision #34)
- **Full calculation trace for AI** (decision #35)

---

## 6. RFC Roadmap

### Platform RFCs (not PBP spec amendments)

These are Werkstatt platform RFCs that implement the multi-currency module using PBP constructs:

| RFC | Title | Kind | Satisfies |
| --- | --- | --- | --- |
| RFC-XXXX | Multi-Currency Pricing Module — Program Charter | architecture | DNA-49 (modular composition) |
| RFC-XXXX | CurrencyPricingPolicy Entity | architecture | DNA-20 (PBP business layer) |
| RFC-XXXX | RatePolicy and RateSchedule Entities | architecture | DNA-20 |
| RFC-XXXX | RateSnapshot Entity | architecture | DNA-20 |
| RFC-XXXX | Currency Conversion Derivation Contract | architecture | DNA-20 |
| RFC-XXXX | Derived Price Materialization | architecture | DNA-20 |
| RFC-XXXX | Aggregate Monetary Derivation (multi-currency TCO) | architecture | DNA-20 |
| RFC-XXXX | `multi-currency` Entitled Feature | architecture | DNA-49 |
| RFC-XXXX | Currency-Aware Website Projection | architecture | DNA-20 |
| RFC-XXXX | Currency-Aware Schema.org Mapping | architecture | DNA-20 |
| RFC-XXXX | Rate Fetcher Service | architecture | DNA-49 |
| RFC-XXXX | Currency Selector UI Component | architecture | DNA-49 |

### PBP Spec Nodes

New nodes added to `docs/specs/pbp-specification-package/forge-spec.yaml` as amendments (per RFC-0397) or as a spec version bump. These are referenced by the platform RFCs above.

---

## 7. Package Impact

| Package | Change type | Description |
| --- | --- | --- |
| `packages/pbp` | New entities + schemas | CurrencyPricingPolicy, RatePolicy, RateSchedule, RateSnapshot schemas, entities, and compiler extensions |
| `packages/pbp` | New derivation | `currency-conversion` derivation contract + `aggregate-then-convert` |
| `packages/pbp` | Compiler extension | Materialize derived prices into compiled graph |
| `packages/share` | Entitlement catalog | Add `multi-currency` feature + Stripe lookup key |
| `packages/share` | Route registry | Gate currency-aware projection data behind entitlement |
| `packages/share` | SEO/Schema.org | Emit business-declared prices only in structured data |
| `packages/ui` | New components | Currency selector, currency-aware price display |
| `packages/os/site-kernel-checks` | New commands | `rate-snapshot.resolve`, `currency-pricing.compile`, `derived-prices.materialize` |
| `packages/os/site-kernel-checks` | Pipeline extension | Add new steps to build-prepare pipeline (gated) |
| `packages/os/site-kernel-checks` | Entitlement validation | `entitlement.module.validate` covers multi-currency module |
| `services/rate-fetcher-worker` | New service | Daily rate fetching + snapshot creation |
| `packages/pbp-rate-adapters` | New package (or sub-module) | External rate source adapters |

---

## 8. Separation of Concerns

```
PBP Model (packages/pbp)
├── Authored entities: CurrencyPricingPolicy, RatePolicy, RateSchedule
├── Derived entities: RateSnapshot, Materialized Derived Prices
├── Derivation contracts: currency-conversion, aggregate-then-convert
└── Compiler: materializes derived prices into compiled graph

Platform (packages/os, packages/share)
├── Entitlement gating: multi-currency feature
├── Build pipeline: rate-snapshot.resolve → currency-pricing.compile → derived-prices.materialize
├── Route registry: gate currency-aware projection data
└── SEO: business-declared prices only in Schema.org

Site (composition only)
├── Currency selector component (UI)
├── Price display component (UI)
└── Projection data from compiled graph (no computation)

Service (services/rate-fetcher-worker)
├── External rate fetching (primary + fallback)
├── Snapshot creation and validation
└── Daily scheduled materialization trigger
```

---

## 9. Future Extensibility

The architecture is designed to support future transactional multi-currency without redesigning the pricing core:

1. **Quote Layer:** `currentUses.quote: allowed` → PriceSnapshot entity with `validUntil: P3D`
2. **Contract/Invoice:** `currentUses.contract/invoice: allowed` → same materialized derived price flows to contract/invoice projections
3. **Settlement:** `currentUses.settlement: allowed` → payment system integration
4. **Rate snapshot in contract:** Already stored in materialized derived price provenance

The `currentUses` field in CurrencyPricingPolicy is the single switch point. Changing from `prohibited` to `allowed` is a policy change, not a model change.

---

## 10. Open Questions

1. **Spec amendment vs. standalone RFCs:** Should the new PBP entities be added as spec amendments (RFC-0397) to `docs/specs/pbp-specification-package/`, or as standalone platform RFCs that reference the existing spec? The spec is `accepted` at `@1` — adding new entity types may require a minor version or amendment track.

2. **Rate storage location:** Should RateSnapshots live in the site's content directory (per-site) or in a shared rate store (cross-site)? For a single business with one rate policy, a shared store makes sense. For multi-tenant, per-site is safer.

3. **Decimal arithmetic library:** The research doc specifies "десятичная арифметика без binary float." We need to choose a decimal library (e.g., `decimal.js`, `big.js`, or native `BigInt` with manual scale). This should be consistent across PBP.

4. **Currency registry:** Do we need a currency code registry (ISO 4217) with minor units and formatting rules, or can we rely on `Intl.NumberFormat`? A declarative registry is more portable and validation-friendly.
