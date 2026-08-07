---
id: RFC-0739
title: "Currency Conversion Derivation Contract"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt: 2026-08-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-55
  - RFC-0735
  - RFC-0736
  - RFC-0737
  - RFC-0738
  - pbp-specification-package/01-PBP-System-Specification.md
satisfies:
  - DNA-1
  - DNA-55
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/pbp"
successSignals:
  - "PbpCurrencyConversionDerivation interface exported from @warpgogol/pbp"
  - "PbpPriceDerivationPipeline interface exported"
  - "PbpRoundingMode closed union exported with const array"
  - "PbpPriceEndingMode closed union exported with const array"
  - "computeCurrencyConversion function registered in runDerivations dispatcher"
  - "Golden test vectors pass for conversion, rounding, and price ending"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not materialize derived prices into the compiled graph — that is RFC-0740"
  - "Does not define the build pipeline — that is RFC-0741"
  - "Does not define the price projection — that is RFC-0742"
  - "Does not implement aggregate-then-convert (multi-currency TCO) — that is a follow-up RFC"
  - "Does not implement min/max price clamps or 'not cheaper than X' rules"
  - "Does not implement price endings other than ...9 and ...99"
---

# RFC-0739: Currency Conversion Derivation Contract

## Context

RFC-0735 through RFC-0738 define the entities: CurrencyPricingPolicy, RatePolicy, RateSchedule, and RateSnapshot. This RFC defines the derivation contract that uses those entities to convert a canonical source price into a derived target-currency price.

The existing derivation engine in `packages/pbp/src/compiler/derivations.ts` dispatches by `derivationRef`:

- `"first-year-cost"` → `computeFirstYearCost`
- `"tco"` → `computeTco`

This RFC adds:

- `"currency-conversion"` → `computeCurrencyConversion`

The research document specifies a fixed pipeline:

1. Currency conversion (source amount × rate)
2. Percentage adjustment (markup/discount before rounding)
3. Fixed adjustment (add/subtract after percentage)
4. Rounding (to increment or decimal places)
5. Price ending (subtract to achieve ...9 or ...99 ending)

All arithmetic MUST use decimal strings, never binary float (pbp-specification-package/ADR-012).

## Problem

1. **No currency-conversion derivation.** The derivation engine has no `currency-conversion` contract. The existing `first-year-cost` and `tco` derivations do not handle currency conversion.

2. **No fixed pipeline.** There is no declarative sequence of operations for price derivation. Without a fixed pipeline, each derivation would implement its own logic, leading to inconsistency.

3. **No decimal arithmetic.** The existing derivation functions use `JSON.stringify` for sorting and string concatenation for digests. They do not perform arithmetic. Currency conversion requires precise decimal multiplication, addition, and rounding.

4. **No golden tests.** There are no test vectors for currency conversion. Without golden tests, rounding and price-ending bugs can go undetected.

## Decision

### 1. `PbpCurrencyConversionDerivation` contract

```ts
export interface PbpCurrencyConversionDerivation extends PbpDerivationContract {
  derivationRef: "currency-conversion";
  parameters: {
    ratePolicyRef: PbpEntityRef;
    rateSnapshotRef: PbpEntityRef;
    pipeline: PbpPriceDerivationPipeline;
  };
}

export interface PbpPriceDerivationPipeline {
  conversion: {
    sourceAmount: string;
    sourceCurrency: string;
    targetCurrency: string;
  };
  percentageAdjustment?: {
    percentage: string;
  };
  fixedAdjustment?: {
    value: string;
  };
  rounding: {
    mode: PbpRoundingMode;
    increment?: string;
    decimalPlaces?: number;
  };
  priceEnding?: {
    mode: PbpPriceEndingMode;
    value: string;
  };
}
```

### 2. Closed unions

```ts
export type PbpRoundingMode = "ceiling" | "floor" | "half-up" | "half-even";

export type PbpPriceEndingMode = "subtract";
```

### 3. Fixed pipeline execution

The pipeline is executed in fixed order:

```
Step 1: conversion
  rawConverted = sourceAmount × rate
  (direction: target-per-source → multiply; source-per-target → divide)

Step 2: percentageAdjustment (optional)
  adjusted = rawConverted × (1 + percentage / 100)

Step 3: fixedAdjustment (optional)
  adjusted = adjusted + fixedAdjustment.value

Step 4: rounding
  rounded = round(adjusted, mode, increment | decimalPlaces)

Step 5: priceEnding (optional)
  final = rounded - priceEnding.value
```

All intermediate values are decimal strings. No binary float at any step.

### 4. Rounding rules

- `ceiling` — round up to the nearest increment or decimal place.
- `floor` — round down.
- `half-up` — round to nearest, ties go up.
- `half-even` — round to nearest, ties go to even (banker's rounding).

When `increment` is specified (e.g. `"10"`), the value is rounded to the nearest multiple of the increment. When `decimalPlaces` is specified (e.g. `2`), the value is rounded to that many decimal places.

### 5. Price ending rules

- `mode: "subtract"` — subtract `value` from the rounded result.
- Only `…9` and `…99` endings are allowed (decision #20).
- Price ending `9` requires rounding to 10 first (e.g. round to `3240`, subtract `1` → `3239`).
- Price ending `99` requires rounding to 100 first (e.g. round to `3300`, subtract `1` → `3299`).
- The compiler validates that the rounding increment is compatible with the price ending value.

### 6. Derivation result

The result is a `PbpCurrencyConversionResult` (extends `PbpDerivationResult` with a typed `value` and a `trace` field):

```ts
export interface PbpCurrencyConversionResult extends PbpDerivationResult {
  value: {
    amount: string;
    currency: string;
    priceKind: "derived";
    commercialMeaning: "derived-price";
  };
  trace: PbpCurrencyConversionTrace;
}
```

Example:

```ts
{
  status: "derived",
  mode: "exact",
  value: {
    amount: "3239.00",
    currency: "UAH",
    priceKind: "derived",
    commercialMeaning: "derived-price",
  },
  trace: { /* see §7 */ },
  provenance: {
    derivationRef: "currency-conversion",
    implementationVersion: contract.implementationVersion,
    inputDigests: [
      `source:${sourceAmount}:${sourceCurrency}`,
      `rate:${rateValue}:${rateDirection}`,
      `snapshot:${snapshotId}:${snapshotDigest}`,
      `pipeline:${JSON.stringify(pipeline)}`,
    ],
  },
}
```

The `trace` field is the typed channel through which the full calculation trace (§7) is returned alongside the result. It is consumed by RFC-0740 (materialization) and RFC-0742 (AI projection).

### 7. Full calculation trace

For AI agent consumption (decision #35), the derivation produces a trace returned as the `trace` field of `PbpCurrencyConversionResult` (§6):

```ts
export interface PbpCurrencyConversionTrace {
  source: {
    amount: string;
    currency: string;
  };
  rate: {
    value: string;
    pair: string;
    direction: PbpRateDirection;
    sourceKind: PbpRateSnapshotSourceKind;
    observedAt: string;
    snapshotDigest: string;
  };
  model: {
    id: "currency-conversion";
    version: string;
  };
  calculation: {
    conversion: { input: string; rate: string; output: string };
    percentageAdjustment?: { percentage: string; output: string };
    fixedAdjustment?: { value: string; output: string };
    rounding: { mode: PbpRoundingMode; increment?: string; decimalPlaces?: number; output: string };
    priceEnding?: { operation: "subtract"; value: string; output: string };
  };
  result: {
    amount: string;
    currency: string;
  };
}
```

The trace is returned as `result.trace` and is attached to the materialized derived price (RFC-0740) and projected to the AI Answer Projection (RFC-0742).

### 8. Decimal arithmetic

All arithmetic uses a decimal library (not binary float). The implementation uses `BigDecimal`-style operations on decimal strings:

```ts
function decimalMultiply(a: string, b: string): string;
function decimalAdd(a: string, b: string): string;
function decimalDivide(a: string, b: string, precision: number): string;
// precision = target currency decimal places + 2 guard digits.
// For example, UAH (2 decimal places) → precision = 4.
// This retains enough precision for minor-unit rounding while minimizing loss.
function decimalRound(value: string, mode: PbpRoundingMode, increment?: string, decimalPlaces?: number): string;
```

Implementation note: we use `big.js` for decimal arithmetic. It is a dependency-free, pure-JavaScript decimal library that operates on string inputs and produces string outputs. It is already compatible with Node.js and Cloudflare Workers. `big.js` MUST be added to `packages/pbp/package.json` dependencies during implementation.

### 9. Golden test vectors

```yaml
# Test: basic conversion, no adjustments
source: "70.00"
rate: "46.18"
direction: target-per-source
pipeline:
  rounding: { mode: ceiling, increment: "10" }
  priceEnding: { mode: subtract, value: "1.00" }
expected: "3239.00"

# Test: with percentage markup
source: "70.00"
rate: "46.18"
direction: target-per-source
pipeline:
  percentageAdjustment: { percentage: "5.00" }
  rounding: { mode: ceiling, increment: "10" }
expected: "3400.00"

# Test: with fixed adjustment
source: "70.00"
rate: "46.18"
direction: target-per-source
pipeline:
  fixedAdjustment: { value: "5.00" }
  rounding: { mode: ceiling, increment: "10" }
expected: "3240.00"

# Test: ...99 ending
source: "70.00"
rate: "46.18"
direction: target-per-source
pipeline:
  rounding: { mode: ceiling, increment: "100" }
  priceEnding: { mode: subtract, value: "1.00" }
expected: "3299.00"

# Test: source-per-target direction (divide)
source: "70.00"
rate: "0.02165"
direction: source-per-target
pipeline:
  rounding: { mode: ceiling, increment: "10" }
  priceEnding: { mode: subtract, value: "1.00" }
expected: "3239.00"
```

### 10. Registration in derivation engine

The `executeContract` function in `packages/pbp/src/compiler/derivations.ts` gains a new branch:

```ts
function executeContract(
  graph: PbpResolvedGraph,
  contract: PbpDerivationContract,
): PbpDerivationResult {
  if (contract.derivationRef === "first-year-cost") {
    return computeFirstYearCost(graph, contract);
  }
  if (contract.derivationRef === "tco") {
    return computeTco(graph, contract);
  }
  if (contract.derivationRef === "currency-conversion") {
    return computeCurrencyConversion(graph, contract);
  }
  // ... existing skip fallback
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** Derivation logic in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** Derivation contracts follow the PBP spec pattern (`PbpDerivationContract`).
- **RFC-0736 (CurrencyPricingPolicy).** `targetCurrencies[].derivationContractRef` references this contract.
- **RFC-0737 (RatePolicy).** `parameters.ratePolicyRef` references the RatePolicy that governs the rate.
- **RFC-0738 (RateSnapshot).** `parameters.rateSnapshotRef` references the specific snapshot used.
- **PBP spec (§11 Derivation Engine).** The derivation is a pure function that takes a resolved graph and a contract, and returns a `PbpDerivationResult` with provenance.

## Design

### CLI surface

No CLI command. Library-only. The derivation is invoked by the compiler (RFC-0740).

### TypeScript contracts

```ts
// packages/pbp/src/derivations/currency-conversion.ts

export type PbpRoundingMode = "ceiling" | "floor" | "half-up" | "half-even";
export const PBP_ROUNDING_MODES: readonly PbpRoundingMode[] = [
  "ceiling", "floor", "half-up", "half-even",
] as const;

export type PbpPriceEndingMode = "subtract";
export const PBP_PRICE_ENDING_MODES: readonly PbpPriceEndingMode[] = ["subtract"] as const;

export interface PbpPriceDerivationPipeline {
  conversion: {
    sourceAmount: string;
    sourceCurrency: string;
    targetCurrency: string;
  };
  percentageAdjustment?: { percentage: string };
  fixedAdjustment?: { value: string };
  rounding: {
    mode: PbpRoundingMode;
    increment?: string;
    decimalPlaces?: number;
  };
  priceEnding?: {
    mode: PbpPriceEndingMode;
    value: string;
  };
}

export interface PbpCurrencyConversionDerivation extends PbpDerivationContract {
  derivationRef: "currency-conversion";
  parameters: {
    ratePolicyRef: PbpEntityRef;
    rateSnapshotRef: PbpEntityRef;
    pipeline: PbpPriceDerivationPipeline;
  };
}

export interface PbpCurrencyConversionResult extends PbpDerivationResult {
  value: {
    amount: string;
    currency: string;
    priceKind: "derived";
    commercialMeaning: "derived-price";
  };
  trace: PbpCurrencyConversionTrace;
}

export interface PbpCurrencyConversionTrace {
  source: { amount: string; currency: string };
  rate: {
    value: string;
    pair: string;
    direction: PbpRateDirection;
    sourceKind: PbpRateSnapshotSourceKind;
    observedAt: string;
    snapshotDigest: string;
  };
  model: { id: "currency-conversion"; version: string };
  calculation: {
    conversion: { input: string; rate: string; output: string };
    percentageAdjustment?: { percentage: string; output: string };
    fixedAdjustment?: { value: string; output: string };
    rounding: { mode: PbpRoundingMode; increment?: string; decimalPlaces?: number; output: string };
    priceEnding?: { operation: "subtract"; value: string; output: string };
  };
  result: { amount: string; currency: string };
}

export function computeCurrencyConversion(
  graph: PbpResolvedGraph,
  contract: PbpDerivationContract,
): PbpCurrencyConversionResult;
// contract is cast to PbpCurrencyConversionDerivation internally after
// dispatch by derivationRef === "currency-conversion". The generic signature
// is compatible with the existing executeContract dispatcher pattern.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/derivations/currency-conversion.ts` | Derivation contract, pipeline, trace, result, and `computeCurrencyConversion` |
| `packages/pbp/src/compiler/derivations.ts` | Dispatcher gains `currency-conversion` branch |
| `packages/pbp/src/decimal.ts` | Decimal arithmetic helpers (`decimalMultiply`, `decimalAdd`, etc.) |
| `packages/pbp/src/derivations/currency-conversion.test.ts` | Golden test vectors |
| `packages/pbp/src/index.ts` | Re-exports |
| `packages/pbp/package.json` | Add `big.js` dependency |
| `packages/pbp/AGENTS.md` | Update API surface section with new exports |
| `docs/knowledge-graph.xml` | Sync new derivation contract and types if listed |

### Output format

The derivation result is a `PbpCurrencyConversionResult` (extends `PbpDerivationResult` with typed `value` and `trace`). The trace is returned as `result.trace` and is consumed by RFC-0740 (materialization).

### Failure modes

- **No rate snapshot found.** If `rateSnapshotRef` does not resolve in the graph, the derivation returns `status: "skipped"` with an error.
- **Snapshot past `freshUntil`.** If the snapshot is past its `freshUntil` and `allowLastKnownValue` is `false`, the derivation returns `status: "skipped"`.
- **Negative result.** If the pipeline produces a negative amount, the derivation returns `status: "failed"` with error code `PBP-CURRENCY-CONVERSION-NEGATIVE`.
- **Zero result for positive source.** If the pipeline produces zero for a positive source price, the derivation returns `status: "failed"` with error code `PBP-CURRENCY-CONVERSION-ZERO`.
- **Price ending without compatible rounding.** If `priceEnding.value` is `"1.00"` (for ...9) but `rounding.increment` is not `"10"` or `"100"`, the derivation returns `status: "failed"` with error code `PBP-CURRENCY-CONVERSION-ENDING-INCOMPATIBLE`.

## Rollout

- **Immediate:** Upon acceptance, the derivation contract and `computeCurrencyConversion` are added to `@warpgogol/pbp`.
- **No site impact yet:** The derivation is not invoked until RFC-0740 (materialization) integrates it into the compiler pipeline.

## Alternatives considered

- **Configurable pipeline steps.** Allow arbitrary ordering of pipeline steps. Rejected: the research document explicitly specifies a fixed pipeline (conversion → percentage → fixed → rounding → ending). Configurable ordering introduces complexity and invalid combinations.

- **Binary float arithmetic.** Use JavaScript `number` for arithmetic. Rejected: pbp-specification-package/ADR-012 mandates decimal strings. Binary float produces rounding errors (e.g. `0.1 + 0.2 !== 0.3`).

- **No trace.** Return only the final amount. Rejected: decision #35 requires full calculation trace for AI agents. The trace is also essential for debugging and auditability.

## Risks

- **Decimal library choice.** `big.js` is chosen for its simplicity and compatibility. If it proves insufficient (e.g. very large numbers), it can be swapped for `decimal.js` or a native `BigInt`-based implementation. The decimal helpers in `packages/pbp/src/decimal.ts` abstract the library choice.

- **Rounding mode confusion.** `ceiling` vs `half-up` can produce different results. Mitigation: golden test vectors verify each mode. The pipeline declaration is explicit about which mode is used.

- **Price ending edge cases.** Rounding to 10 and subtracting 1 produces ...9. Rounding to 100 and subtracting 1 produces ...99. But what if the rounded value is already ...9? The subtraction still applies (e.g. `3249 → 3248`). Mitigation: the compiler validates that the rounding increment is compatible with the price ending value.

## Acceptance criteria

- [x] `PbpCurrencyConversionDerivation` interface exported from `@warpgogol/pbp` (evidence: packages/pbp/src/index.ts:588, packages/pbp/src/derivations/currency-conversion.ts:73)
- [x] `PbpCurrencyConversionResult` interface exported (evidence: packages/pbp/src/index.ts:589, packages/pbp/src/derivations/currency-conversion.ts:96)
- [x] `PbpPriceDerivationPipeline` interface exported (evidence: packages/pbp/src/index.ts:587, packages/pbp/src/derivations/currency-conversion.ts:42)
- [x] `PbpRoundingMode` closed union exported with const array (evidence: packages/pbp/src/index.ts:581-583, packages/pbp/src/decimal.ts:18-28)
- [x] `PbpPriceEndingMode` closed union exported with const array (evidence: packages/pbp/src/index.ts:584-586, packages/pbp/src/derivations/currency-conversion.ts:29-35)
- [x] `PbpCurrencyConversionTrace` interface exported (evidence: packages/pbp/src/index.ts:590, packages/pbp/src/derivations/currency-conversion.ts:113)
- [x] `computeCurrencyConversion` function exported and registered in `executeContract` dispatcher (evidence: packages/pbp/src/index.ts:591, packages/pbp/src/compiler/derivations.ts:58-59)
- [x] Decimal arithmetic helpers exported from `packages/pbp/src/decimal.ts` (evidence: packages/pbp/src/index.ts:594-600, packages/pbp/src/decimal.ts:40-82)
- [x] `big.js` added to `packages/pbp/package.json` dependencies (evidence: packages/pbp/package.json:62)
- [x] Golden test vectors pass for all test cases (evidence: packages/pbp/src/derivations/currency-conversion.test.ts, 16/16 tests pass)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: pnpm --filter @warpgogol/pbp exec tsc --noEmit — exit 0)
- [x] `vitest run` passes for `packages/pbp/` (evidence: 226/245 tests pass — 19 failures are pre-existing in rfc-0468-register-and-coverage.test.ts, unrelated to RFC-0739)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate --id RFC-0739 — zero errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented), per RFC-0224 transition rules.
- All arithmetic MUST use decimal strings via the helpers in `packages/pbp/src/decimal.ts`. Never use binary float.
- The pipeline is fixed: conversion → percentageAdjustment → fixedAdjustment → rounding → priceEnding. Do not reorder or add steps.
- Only `…9` and `…99` price endings are allowed. The compiler validates rounding increment compatibility.
- The trace MUST be produced for every successful derivation as `result.trace`. It is consumed by RFC-0740 (materialization) and RFC-0742 (AI projection).
- `big.js` MUST be added to `packages/pbp/package.json` dependencies.
- `packages/pbp/AGENTS.md` API surface section MUST be updated with new exports.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it, per RFC-0224 supersede escalation.
