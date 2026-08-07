---
id: RFC-0740
title: "Derived Price Materialization"
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
  - DNA-1
  - DNA-4
  - DNA-55
  - RFC-0735
  - RFC-0736
  - RFC-0737
  - RFC-0738
  - RFC-0739
satisfies:
  - DNA-1
versionBump: minor
commands:
  proposed:
    - derived-prices.materialize
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/pbp"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "PbpMaterializedDerivedPrice interface exported from @warpgogol/pbp"
  - "derived-prices.materialize command registered and produces materialized prices"
  - "Materialized prices attached to compiled graph Offerings"
  - "Compiler validation blocks publication on invariant violations"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define entitlement gating — that is RFC-0741"
  - "Does not define the price projection — that is RFC-0742"
  - "Does not define the currency selector UI — that is RFC-0743"
  - "Does not define aggregate-then-convert (multi-currency TCO) — future RFC"
  - "Does not modify PbpCharge or PbpPricing — canonical price is untouched"
  - "Does not materialize non-fixed charge amounts (range, unit-rate, tiered) — only model: fixed charges are materialized in the current phase; other models are skipped"
  - "Does not produce indicative prices — priceKind is always derived in the current phase; indicative is reserved for future use when allowLastKnownValue produces a price from a stale snapshot"
  - "Does not define PriceDerivationModel entity — that is a future RFC if needed; the derivation contract ref is used directly"
  - "Does not enforce projection-side amount immutability — that is RFC-0742's scope"
  - "Does not enforce transactional scope rules (invoice/settlement cross-validation) — all transactional currentUses are false in the current phase"
---

# RFC-0740: Derived Price Materialization

## Context

RFC-0739 defines the `currency-conversion` derivation contract that computes a derived price from a canonical source price, a rate snapshot, and a pipeline. This RFC defines how derived prices are **materialized** — persisted into the compiled graph as pre-computed price objects that the site can read at render time.

The research document emphasizes:

- Derived prices are materialized at build time, not computed at page-render time
- Materialization ensures consistency, reproducibility, and cacheability
- The materialized price includes provenance and trace
- The materialized price declares `allowedUses` (what scopes may consume it)

## Problem

1. **No materialized derived price type.** The compiled graph (`PbpResolvedGraph`) has no field for derived prices. Derivation results are returned as `PbpDerivationResult[]` but not attached to Offerings.

2. **No build-time materialization.** There is no command that runs the currency-conversion derivation for every Charge in every Offering and stores the results.

3. **No compiler validation.** There are no validation rules that block publication when invariants are violated (e.g. target currency not registered, no rate snapshot, conflicting strategies).

4. **No `allowedUses` enforcement.** There is no mechanism to prevent a derived price marked `presentation: true, invoice: false` from being used in an invoice projection.

## Decision

### 1. `PbpMaterializedDerivedPrice` type

```ts
export type PbpPriceKind = "derived";

export type PbpCommercialMeaning = "derived-price";

export interface PbpMaterializedDerivedPrice {
  /** Charge key within pricing.charges (e.g. "monthly", "activation"). */
  chargeRef: string;
  targetCurrency: string;
  amount: {
    value: string;
    currency: string;
  };
  priceKind: PbpPriceKind;
  commercialMeaning: PbpCommercialMeaning;
  derivation: {
    /** Derivation contract ref (e.g. "pbp-derivation:currency-conversion/1"). */
    modelRef: string;
    modelVersion: string;
    /** ISO 8601 UTC timestamp when the derivation was executed. */
    calculatedAt: string;
  };
  trace: PbpCurrencyConversionTrace;
  allowedUses: PbpCurrentUses;
}
```

### 2. Attachment to compiled graph

The `PbpResolvedGraph` type gains a new field:

```ts
export interface PbpResolvedGraph {
  // ... existing fields ...
  derivedPrices?: Record<string, PbpMaterializedDerivedPrice[]>;
}
```

Keyed by Offering ID. Each Offering has an array of materialized derived prices, one per Charge per target currency.

### 3. `derived-prices.materialize` command

```sh
pnpm exec site-kernel run derived-prices.materialize --system warpgogol-com
```

This command:

1. Calls `compilePbpProfile()` from `@warpgogol/pbp/compiler` internally to obtain the compiled PBP graph (`PbpCompilerResult`).
2. Reads the CurrencyPricingPolicy for the business from the compiled graph.
3. For each Offering with `pricing` and `pricing.charges`: a. For each Charge key in `pricing.charges`: i. Skip charges where `amount.model` is not `"fixed"` (range, unit-rate, tiered are not materialized in the current phase). ii. For each target currency in the CurrencyPricingPolicy: - Resolve the RatePolicy and find the applicable RateSnapshot. - Build the `PbpCurrencyConversionDerivation` contract. - Execute `computeCurrencyConversion`. - If successful, create a `PbpMaterializedDerivedPrice`.
4. Write the materialized derived prices into the compiled graph's `derivedPrices` field.
5. Write the materialized derived prices to `src/derived-prices.generated.json` using `writeFileIfChanged` from `@warpgogol/site-kernel`.

### 4. Compiler validation rules

The materialization command blocks publication when:

1. **Target currency not registered.** A derived price references a target currency not in any CurrencyPricingPolicy.
2. **No single business strategy.** Multiple CurrencyPricingPolicy entities declare different strategies for the same target currency.
3. **`strategy: derived` but no RatePolicy.** The `ratePolicyRef` is missing or unresolvable.
4. **`strategy: fixed` but a derived price exists.** A derived price was materialized for a currency declared as `fixed` strategy.
5. **Offering overrides currency strategy.** An Offering attempts to declare its own currency strategy (not allowed — strategy is business-level).
6. **Source and target currency are the same.**
7. **Rate direction undefined.** The RatePolicy's `quotation.direction` is missing.
8. **No applicable rate snapshot.** No RateSnapshot exists for the pair, or all snapshots are past `freshUntil` and `allowLastKnownValue` is `false`.
9. **RateSchedule has two entries with same `validFrom`.**
10. **No applicable internal rate.** For `business-fixed` mode, no RateSchedule entry has `validFrom` <= target time.
11. **Price ending `9` without rounding to 10.** `priceEnding.value: "1.00"` but `rounding.increment` is not `"10"`.
12. **Price ending `99` without rounding to 100.** `priceEnding.value: "1.00"` but `rounding.increment` is not `"100"`.
13. **Derived result is negative.**
14. **Derived result is zero for positive source price.**
15. **Derived result not reproducible from trace.** Re-running the pipeline from the trace does not produce the same result.

### 5. `allowedUses` enforcement

The `allowedUses` field on each materialized derived price is copied from the `CurrencyPricingPolicy.targetCurrencies[].currentUses`. The projection layer (RFC-0742) MUST check `allowedUses` before including a derived price in any projection:

- `presentation: true` → may appear in website projection
- `aiAnswers: true` → may appear in AI answer projection
- `quote: false` → MUST NOT appear in quote projection (future)
- `contract: false` → MUST NOT appear in contract projection (future)
- `invoice: false` → MUST NOT appear in invoice projection (future)
- `settlement: false` → MUST NOT appear in settlement projection (future)

### 6. Generated file location

Materialized derived prices are written to:

```
src/derived-prices.generated.json
```

This follows the `src/surface.generated.json` pattern (DNA-39) — generated files at the `src/` level, not under `src/content/` (which is reserved for canonical authored content per DNA-4). The file is added to the workpiece `.gitignore` and regenerated on every build using `writeFileIfChanged` from `@warpgogol/site-kernel`.

### 7. `priceKind` and `commercialMeaning`

- `priceKind: "derived"` — the price was computed by the currency-conversion derivation using a specific rate snapshot.
- `commercialMeaning: "derived-price"` — the price is a business-approved derived price.

The `indicative` variant for both unions is reserved for a future RFC when `allowLastKnownValue` produces a price from a stale snapshot. It is not defined in the current phase to avoid speculative generality.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Materialization logic in `packages/pbp/` and `packages/os/site-kernel-checks/`.
- **DNA-4 (Canonical content in `src/content/`).** Derived prices are generated into `src/derived-prices.generated.json` — NOT under `src/content/`, which is reserved for canonical authored content. Generated files follow the `src/surface.generated.json` pattern (DNA-39).
- **DNA-55 (Spec vendoring).** Referenced in `related[]` because this RFC extends the PBP namespace (`pbp/*@1`). Not in `satisfies[]` — this RFC does not vendor or enforce spec packages.
- **RFC-0739 (Currency Conversion Derivation).** This RFC invokes `computeCurrencyConversion` for each Charge.
- **RFC-0736 (CurrencyPricingPolicy).** This RFC reads the policy to determine target currencies and strategies.

## Design

### CLI surface

```sh
pnpm exec site-kernel run derived-prices.materialize --system warpgogol-com
```

Flags:

- `--system <id>` (required) — Sternsystem ID
- `--json` — output JSON result envelope

### TypeScript contracts

```ts
// packages/pbp/src/materialized-derived-price.ts

export type PbpPriceKind = "derived";
export const PBP_PRICE_KINDS: readonly PbpPriceKind[] = ["derived"] as const;

export type PbpCommercialMeaning = "derived-price";
export const PBP_COMMERCIAL_MEANINGS: readonly PbpCommercialMeaning[] = [
  "derived-price",
] as const;

export interface PbpMaterializedDerivedPrice {
  /** Charge key within pricing.charges (e.g. "monthly", "activation"). */
  chargeRef: string;
  targetCurrency: string;
  amount: { value: string; currency: string };
  priceKind: PbpPriceKind;
  commercialMeaning: PbpCommercialMeaning;
  derivation: {
    /** Derivation contract ref (e.g. "pbp-derivation:currency-conversion/1"). */
    modelRef: string;
    modelVersion: string;
    /** ISO 8601 UTC timestamp when the derivation was executed. */
    calculatedAt: string;
  };
  trace: PbpCurrencyConversionTrace;
  allowedUses: PbpCurrentUses;
}
```

The `derivation` block contains only the flat fields needed for quick access (`modelRef`, `modelVersion`, `calculatedAt`). All rate-level provenance (`rateSnapshotRef`, `rateSnapshotDigest`, `rateValue`, `rateDirection`) lives in `trace` and is not duplicated in `derivation`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/materialized-derived-price.ts` | Type definitions |
| `packages/pbp/src/compiler/materialize.ts` | Materialization logic (iterate Offerings, Charges, target currencies) |
| `packages/pbp/src/compiler/types.ts` | `PbpResolvedGraph` gains `derivedPrices` field |
| `packages/os/site-kernel-checks/src/derived-prices-materialize.ts` | Command handler for `derived-prices.materialize` |
| `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` | Command table entry for `derived-prices.materialize` (scope: `workspace`) |
| `src/derived-prices.generated.json` | Generated output (gitignored, workpiece `.gitignore`) |

**Note:** `packages/pbp/src/compiler/derivations.ts` is modified by RFC-0739 (dispatcher gains `currency-conversion` branch), NOT by this RFC. Listed here for reference only.

### Output format

The `--json` flag produces a standard `KernelCommandResult` envelope:

```json
{
  "data": {
    "command": "derived-prices.materialize",
    "status": "ok",
    "system": "warpgogol-com",
    "materializedCount": 24,
    "offerings": 6,
    "targetCurrencies": ["UAH", "USD"],
    "errors": []
  },
  "exitCode": 0,
  "summary": "Materialized 24 derived prices across 6 offerings for currencies: UAH, USD",
  "nextSteps": []
}
```

### Failure modes

- **No CurrencyPricingPolicy found.** Command exits with error: "No CurrencyPricingPolicy found for business {businessRef}".
- **No RateSnapshot for a pair.** Command skips that target currency for all Charges and logs a warning. If `failure.noAcceptableRate: "block-publication"`, the command exits with error.
- **Derivation fails for a Charge.** Command logs the error and skips that Charge. The error is included in the output JSON `errors` array.
- **Validation rule violation.** Command exits with error and lists all violations.
- **Offering without `pricing` or `charges`.** Command skips the Offering gracefully — no error, no warning.
- **Charge with non-`fixed` amount model.** Command skips the Charge gracefully — no error, no warning.
- **`derived-prices.generated.json` does not exist.** Command creates it. The site's render layer falls back to canonical prices only when the file is absent.

## Rollout

- **Immediate:** Upon acceptance, the materialization command and types are added.
- **Pipeline integration:** RFC-0741 integrates `derived-prices.materialize` into the `build-prepare` pipeline, gated by the `multi-currency` entitlement.
- **No backward compatibility:** The compiled graph is extended with `derivedPrices`. No migration.

## Alternatives considered

- **Compute at render time.** Run the derivation on each page render. Rejected: the research document explicitly recommends build-time materialization for consistency, reproducibility, and cacheability. Render-time computation would produce different results if rates change between page loads.

- **Store derived prices in Offering content.** Write derived prices back into the Offering's `pricing` field. Rejected: the Offering's `pricing` is authored content. Derived prices are generated. Mixing them creates confusion and validation conflicts.

- **Separate derived-price entity.** Create a `pbp/derived-price@1` entity type. Rejected: derived prices are materialized output, not authored entities. They belong in the compiled graph, not in the content collection.

## Risks

- **Performance.** Materializing derived prices for every Charge × every target currency could be slow for large catalogs. Mitigation: the current site (warpgogol-com) has 6 Offerings with ~4 Charges each and 2 target currencies = ~48 derivations. This is trivial. For future large catalogs, the materialization can be parallelized.

- **Generated file size.** The `derived-prices.json` file includes full traces. For 48 derivations, this is manageable. For 10,000+ SKUs, traces could be large. Mitigation: traces can be optionally omitted for large catalogs (future optimization).

- **Stale materialized prices.** If rates change but the site is not rebuilt, materialized prices are stale. Mitigation: RFC-0744 (Rate Fetcher Service) triggers a rebuild when new snapshots are accepted.

## Acceptance criteria

- [ ] `PbpMaterializedDerivedPrice` interface exported from `@warpgogol/pbp`
- [ ] `PbpPriceKind` and `PbpCommercialMeaning` closed unions exported (single-member: `"derived"`, `"derived-price"`)
- [ ] `PbpResolvedGraph` has `derivedPrices` field
- [ ] `derived-prices.materialize` command registered in `04-content-quality.ts` command table (scope: `workspace`)
- [ ] Command calls `compilePbpProfile()` internally and produces `src/derived-prices.generated.json`
- [ ] Command uses `writeFileIfChanged` for generated file writes
- [ ] Materialization command blocks publication on validation rule violations
- [ ] `allowedUses` is copied from CurrencyPricingPolicy
- [ ] Non-`fixed` charge amounts and Offerings without `pricing` are skipped gracefully
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Materialized derived prices are generated, not authored. Never write them to `src/content/business-profile/` or `src/content/generated/`.
- The `derivedPrices` field on `PbpResolvedGraph` is optional — Offerings without a CurrencyPricingPolicy have no derived prices.
- `allowedUses` MUST be copied from the CurrencyPricingPolicy, not invented by the materialization command.
- The trace MUST be included in every materialized derived price. It is consumed by RFC-0742 (AI projection).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- `PbpPricing.charges` is typed as `Record<string, unknown>` — the materialization logic must cast each entry to `PbpCharge` before accessing `amount.model`.
- Generated file writes MUST use `writeFileIfChanged` from `@warpgogol/site-kernel` to avoid git churn.
- The command is `scope: "workspace"` — it takes `--system <id>` and operates on a single Sternsystem.
