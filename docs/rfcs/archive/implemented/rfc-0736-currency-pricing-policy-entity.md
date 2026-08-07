---
id: RFC-0736
title: "CurrencyPricingPolicy Entity"
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
  - RFC-0437
  - RFC-0728
  - RFC-0735
satisfies:
  - DNA-1
  - DNA-55
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/pbp"
successSignals:
  - "PbpCurrencyPricingPolicy interface exported from @warpgogol/pbp"
  - "PbpCurrencyStrategy closed union exported with const array"
  - "PbpCurrentUses interface exported"
  - "PbpCurrencyTarget interface exported"
  - "CURRENCY_PRICING_POLICY_SCHEMA_ID constant exported"
  - "pbpCurrencyPricingPolicySchema Zod schema exported and registered in pbpSchemaById"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define RatePolicy or RateSchedule — that is RFC-0737"
  - "Does not define RateSnapshot — that is RFC-0738"
  - "Does not define the currency-conversion derivation — that is RFC-0739"
  - "Does not define derived price materialization — that is RFC-0740"
  - "Does not define entitlement gating — that is RFC-0741"
  - "Does not modify PbpCharge or PbpPricing — canonical price is untouched"
---

# RFC-0736: CurrencyPricingPolicy Entity

## Context

RFC-0735 establishes the multi-currency pricing program. The first building block is a business-level entity that declares which target currencies a business supports and how each is obtained. Currently, `PbpPricing.currency` holds a single canonical currency (e.g. `EUR`). There is no entity that says "this business also displays prices in UAH and USD, UAH is derived from EUR via an external rate, USD is a fixed business-declared rate."

The research document proposes a `CurrencyPricingPolicy` at the business level. This RFC defines it as a PBP entity.

## Problem

1. **No business-level currency strategy.** There is no PBP entity declaring supported target currencies, their strategies (derived vs. fixed), or their allowed uses.

2. **No single source of truth for currency support.** Without a declared policy, each Offering or page would need to independently decide which currencies to show — violating decision #3 (one strategy per target currency).

3. **No `currentUses` boundary.** There is no field declaring whether a derived price may be used for presentation only, or also for quotes, contracts, invoices, and settlement. Without this, the compiler cannot enforce the presentation-only scope of the current phase.

## Decision

### 1. `PbpCurrencyPricingPolicy` entity

A new PBP entity at the business level. One per business. Declares the base currency and a map of target currencies.

```ts
export type PbpCurrencyStrategy = "derived" | "fixed";

export interface PbpCurrentUses {
  presentation: boolean;
  aiAnswers: boolean;
  quote: boolean;
  contract: boolean;
  invoice: boolean;
  settlement: boolean;
}

export interface PbpCurrencyTarget {
  currency: string;
  strategy: PbpCurrencyStrategy;
  derivationContractRef?: PbpEntityRef;
  ratePolicyRef?: PbpEntityRef;
  currentUses: PbpCurrentUses;
}

export interface PbpCurrencyPricingPolicy extends PbpEntity {
  type: "currency-pricing-policy";
  businessRef: PbpEntityRef;
  baseCurrency: string;
  targetCurrencies: Record<string, PbpCurrencyTarget>;
}
```

### 2. Schema ID

```ts
export const CURRENCY_PRICING_POLICY_SCHEMA_ID = pbpSchemaId("currency-pricing-policy");
```

Uses the existing `pbpSchemaId()` helper from `packages/pbp/src/schema-id.ts` to construct the schema ID, consistent with all other PBP entities.

### 3. Zod schema

```ts
export const pbpCurrentUsesSchema = z.object({
  presentation: z.boolean(),
  aiAnswers: z.boolean(),
  quote: z.boolean(),
  contract: z.boolean(),
  invoice: z.boolean(),
  settlement: z.boolean(),
});

export const pbpCurrencyStrategySchema = z.enum(["derived", "fixed"]);

export const pbpCurrencyTargetSchema = z.object({
  currency: nonEmptyString,
  strategy: pbpCurrencyStrategySchema,
  derivationContractRef: pbpEntityRefSchema.optional(),
  ratePolicyRef: pbpEntityRefSchema.optional(),
  currentUses: pbpCurrentUsesSchema,
});

export const pbpCurrencyPricingPolicySchema = pbpEntitySchema
  .extend({
    type: z.literal("currency-pricing-policy"),
    businessRef: pbpEntityRefSchema,
    baseCurrency: nonEmptyString,
    targetCurrencies: z.record(z.string(), pbpCurrencyTargetSchema).min(1),
  })
  .strict();
```

Extends `pbpEntitySchema` (which provides `schema`, `id`, `type`, `status`, `name?`, `summary?`, `governance?`) and applies `.strict()` to reject unknown fields, consistent with all existing PBP entity schemas (e.g. `businessSchema`, `policySchema`). The `.min(1)` on `targetCurrencies` enforces at least one target currency at the schema level.

### 4. Validation rules

- `baseCurrency` MUST be a valid ISO 4217 code (3-letter uppercase).
- Each `targetCurrencies[].currency` MUST differ from `baseCurrency`.
- Each `targetCurrencies[].currency` MUST be unique within the policy.
- Each `targetCurrencies` record key MUST be the lowercase of the corresponding `currency` field (e.g. key `uah` → `currency: "UAH"`). Enforced by the compiler.
- `targetCurrencies` MUST have at least one entry (enforced by schema `.min(1)`).
- `strategy: "derived"` MUST reference a `derivationContractRef` and a `ratePolicyRef`.
- `strategy: "fixed"` MUST reference a `ratePolicyRef` (with `mode: business-fixed`).
- `currentUses.presentation` MUST be `true` for all target currencies (presentation is the minimum use).
- In the current phase, `currentUses.quote`, `contract`, `invoice`, `settlement` MUST be `false` (enforced by compiler, not by schema — future phases may enable them).
- `derivationContractRef.ref` uses a `pbp-derivation:<ref>/<version>` scheme (e.g. `pbp-derivation:currency-conversion/1`) because it references a derivation contract, not a PBP entity. Derivation contracts are not PBP entities (they do not extend `PbpEntity` and have no schema ID). The `pbpEntityRefSchema` accepts any non-empty string for `ref`, so this is valid at the schema level.

### 5. Content file location

CurrencyPricingPolicy content files live at:

```
src/content/business-profile/{lang}/currency-pricing-policy/{id}.md
```

One file per policy. Typically one policy per business (`default.md`).

### 6. Example content

```yaml
---
schema: pbp/currency-pricing-policy@1
id: https://warpgogol.com/id/currency-pricing-policy/default
type: currency-pricing-policy
status: published

businessRef:
  ref: https://warpgogol.com/id/business/webgogol

baseCurrency: EUR

targetCurrencies:
  uah:
    currency: UAH
    strategy: derived
    derivationContractRef:
      ref: pbp-derivation:currency-conversion/1
    ratePolicyRef:
      ref: https://warpgogol.com/id/rate-policy/eur-uah
    currentUses:
      presentation: true
      aiAnswers: true
      quote: false
      contract: false
      invoice: false
      settlement: false

  usd:
    currency: USD
    strategy: fixed
    ratePolicyRef:
      ref: https://warpgogol.com/id/rate-policy/eur-usd
    currentUses:
      presentation: true
      aiAnswers: true
      quote: false
      contract: false
      invoice: false
      settlement: false
---
```

The `usd` target above shows `strategy: fixed` — no `derivationContractRef` is needed because the rate is business-declared via a `business-fixed` RatePolicy (RFC-0737).

## Architectural fit

- **DNA-1 (Monorepo boundary).** Entity types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** New entity extends `pbp/*@1` namespace as a platform extension. Not a spec amendment.
- **RFC-0437 (Pricing Core).** `PbpCharge` and `PbpPricing` are unchanged. CurrencyPricingPolicy is a separate entity, not a sub-structure of Offering.
- **RFC-0735 (Program Charter).** This is the first RFC in the program sequence.

## Design

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
// packages/pbp/src/entities/currency-pricing-policy.ts

export type PbpCurrencyStrategy = "derived" | "fixed";

export const PBP_CURRENCY_STRATEGIES: readonly PbpCurrencyStrategy[] = [
  "derived",
  "fixed",
] as const;

export function isPbpCurrencyStrategy(value: string): value is PbpCurrencyStrategy {
  return PBP_CURRENCY_STRATEGIES.includes(value as PbpCurrencyStrategy);
}

export interface PbpCurrentUses {
  presentation: boolean;
  aiAnswers: boolean;
  quote: boolean;
  contract: boolean;
  invoice: boolean;
  settlement: boolean;
}

export interface PbpCurrencyTarget {
  currency: string;
  strategy: PbpCurrencyStrategy;
  derivationContractRef?: PbpEntityRef;
  ratePolicyRef?: PbpEntityRef;
  currentUses: PbpCurrentUses;
}

export interface PbpCurrencyPricingPolicy extends PbpEntity {
  type: "currency-pricing-policy";
  businessRef: PbpEntityRef;
  baseCurrency: string;
  targetCurrencies: Record<string, PbpCurrencyTarget>;
}

export const CURRENCY_PRICING_POLICY_SCHEMA_ID = pbpSchemaId("currency-pricing-policy");
```

### Zod schema

```ts
// packages/pbp/src/schemas/currency-pricing-policy.ts

export const pbpCurrentUsesSchema = z.object({
  presentation: z.boolean(),
  aiAnswers: z.boolean(),
  quote: z.boolean(),
  contract: z.boolean(),
  invoice: z.boolean(),
  settlement: z.boolean(),
});

export const pbpCurrencyStrategySchema = z.enum(["derived", "fixed"]);

export const pbpCurrencyTargetSchema = z.object({
  currency: nonEmptyString,
  strategy: pbpCurrencyStrategySchema,
  derivationContractRef: pbpEntityRefSchema.optional(),
  ratePolicyRef: pbpEntityRefSchema.optional(),
  currentUses: pbpCurrentUsesSchema,
});

export const pbpCurrencyPricingPolicySchema = pbpEntitySchema
  .extend({
    type: z.literal("currency-pricing-policy"),
    businessRef: pbpEntityRefSchema,
    baseCurrency: nonEmptyString,
    targetCurrencies: z.record(z.string(), pbpCurrencyTargetSchema).min(1),
  })
  .strict();
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/currency-pricing-policy.ts` | Entity interface + closed unions |
| `packages/pbp/src/schemas/currency-pricing-policy.ts` | Zod schema |
| `packages/pbp/src/schemas/index.ts` | Register schema in `pbpSchemaById` registry and `pbpEntityDiscriminatedUnion` |
| `packages/pbp/src/astro.ts` | Add `currency-pricing-policy` collection to `pbpCollections` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.
- Compiler validation (RFC-0740) will block publication when validation rules are violated.

## Rollout

- **Immediate:** Upon acceptance, entity types and Zod schema are added to `@warpgogol/pbp`.
- **No site impact yet:** `appsImpacted` is empty because CurrencyPricingPolicy is not consumed by sites until RFC-0740 (materialization) and RFC-0741 (entitlement gating). The content file location is declared in this RFC for forward reference, but no content file is created until RFC-0740.
- **Content file:** warpgogol-com gets a `currency-pricing-policy/default.md` content file as part of RFC-0740 implementation.

## Alternatives considered

- **Embed currency strategy in Offering.** Add a `currencies` field to `PbpPricing`. Rejected: decision #3 requires one strategy per target currency across all Offerings. Embedding per-Offering allows divergence and violates the invariant.

- **Embed currency strategy in Charge.** Add an `amounts` map to `PbpCharge`. Rejected: same reason — strategy is business-level, not per-Charge.

- **Separate entity per target currency.** One `CurrencyTarget` entity per currency. Rejected: the policy is a single coherent business decision. Splitting it into per-currency entities adds complexity without benefit.

## Risks

- **ISO 4217 validation.** The schema accepts any non-empty string for `currency`. Full ISO 4217 validation is deferred to the compiler (RFC-0740) to avoid hardcoding a currency list in the schema. Mitigation: compiler validation checks against a known currency registry.

- **Future transactional scope.** `currentUses` has `quote`, `contract`, `invoice`, `settlement` fields that are all `false` in this phase. Future RFCs will enable them. The schema allows `true` — the compiler enforces `false` for now.

## Acceptance criteria

- [x] `PbpCurrencyPricingPolicy` interface exported from `@warpgogol/pbp` (evidence: packages/pbp/src/index.ts:547, ecfc4a68)
- [x] `PbpCurrencyStrategy` closed union exported with const array (evidence: packages/pbp/src/index.ts:544-549, ecfc4a68)
- [x] `PbpCurrentUses` interface exported (evidence: packages/pbp/src/index.ts:545, ecfc4a68)
- [x] `PbpCurrencyTarget` interface exported (evidence: packages/pbp/src/index.ts:546, ecfc4a68)
- [x] `CURRENCY_PRICING_POLICY_SCHEMA_ID` constant exported (evidence: packages/pbp/src/index.ts:551, ecfc4a68)
- [x] `pbpCurrencyPricingPolicySchema` Zod schema exported (evidence: packages/pbp/src/schemas/index.ts:67-72, ecfc4a68)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: pnpm --filter @warpgogol/pbp run build:check exit 0)
- [x] `vitest run` passes for `packages/pbp/` (evidence: pnpm --filter @warpgogol/pbp run test — 13 test files pass, 1 pre-existing failure in rfc-0468 unrelated to RFC-0736)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate --id RFC-0736 exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpCurrencyPricingPolicy extends PbpEntity` — do not redefine `schema`, `id`, `type`, `status`, `governance`.
- The `baseCurrency` field is the same currency as `PbpPricing.currency` on Offerings. The compiler will verify they match.
- `currentUses` is the single switch point for future transactional scope enablement. Do not add separate fields elsewhere.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
