---
id: RFC-0737
title: "RatePolicy and RateSchedule Entities"
status: draft
kind: contract
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
  - DNA-55
  - RFC-0735
  - RFC-0736
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
  - "PbpRatePolicy interface exported from @warpgogol/pbp"
  - "PbpRateSchedule interface exported"
  - "PbpRateMode closed union exported with const array"
  - "PbpRateDirection closed union exported with const array"
  - "PbpCurrencyPair and PbpQuotation shared interfaces exported"
  - "pbpRatePolicySchema, pbpRateScheduleSchema Zod schemas exported and registered in pbpSchemaById"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define RateSnapshot — that is RFC-0738"
  - "Does not define the currency-conversion derivation — that is RFC-0739"
  - "Does not define rate source adapters — that is RFC-0744"
  - "Does not fetch rates — that is the Rate Fetcher Service (RFC-0744)"
  - "Does not define the rate source contract (external API details) — that is RFC-0744"
  - "Does not update docs/*.xml Compass files — new entity types are additive to pbp/*@1 and do not change repository-wide requirements or technology contracts"
---

# RFC-0737: RatePolicy and RateSchedule Entities

## Context

RFC-0736 defines `CurrencyPricingPolicy` which references a `ratePolicyRef` for each target currency. This RFC defines the `RatePolicy` entity (which rate to use, from where, with what freshness rules) and the `RateSchedule` entity (for `business-fixed` mode: a versioned schedule of internal rates).

The research document specifies:

- RatePolicy defines the source and nature of exchange rates (live external, internal fixed, snapshot)
- RateSchedule holds internal fixed rates with `validFrom` entries
- Old rate is valid until explicitly replaced (no `validUntil`)
- Future `validFrom` is supported
- One rate source for the business, with fallback
- Maximum age: 1 month (configurable)
- Last known rate allowed within max age

## Problem

1. **No rate source model.** There is no PBP entity declaring where exchange rates come from, what direction they're quoted, or what happens when the source is unavailable.

2. **No internal fixed rate schedule.** For `business-fixed` mode, there is no entity holding the business's internal rate schedule with `validFrom` entries.

3. **No freshness governance.** There is no field declaring the maximum age of a rate or whether the last known value is acceptable when the source is stale.

## Decision

### 1. Shared types

```ts
export interface PbpCurrencyPair {
  sourceCurrency: string;
  targetCurrency: string;
}

export interface PbpQuotation {
  direction: PbpRateDirection;
}
```

### 2. `PbpRatePolicy` entity

```ts
export type PbpRateMode = "external" | "business-fixed";

export type PbpRateDirection = "target-per-source" | "source-per-target";

export interface PbpRatePolicy extends PbpEntity {
  type: "rate-policy";
  pair: PbpCurrencyPair;
  quotation: PbpQuotation;
  mode: PbpRateMode;
  sources?: {
    primary: PbpEntityRef;
    fallback?: PbpEntityRef;
  };
  freshness: {
    maximumAge: string;
    allowLastKnownValue: boolean;
  };
  failure: {
    noAcceptableRate: "source-price-only" | "block-publication";
  };
}
```

- `mode: "external"` — rates fetched from an external source (RFC-0744). `sources` is required.
- `mode: "business-fixed"` — rates from a `RateSchedule` entity. `sources` is not required (rates are authored, not fetched).
- `sources.primary` and `sources.fallback` are `PbpEntityRef` pointing to rate source contracts (defined in RFC-0744). This matches the pattern in RFC-0736 where `PbpCurrencyTarget.ratePolicyRef` is also a bare `PbpEntityRef`.

### 3. `PbpRateSchedule` entity

```ts
export interface PbpRateScheduleEntry {
  value: string;
  validFrom: string;
}

export interface PbpRateSchedule extends PbpEntity {
  type: "rate-schedule";
  pair: PbpCurrencyPair;
  quotation: PbpQuotation;
  entries: Record<string, PbpRateScheduleEntry>;
}
```

- `value` is a decimal string (ADR-012), e.g. `"46.18"`.
- `validFrom` is an ISO 8601 datetime string.
- Entries are ordered by `validFrom` at compile time. The applicable rate for a given point in time is the entry with the latest `validFrom` that is <= the target time.
- No `validUntil` — old rate is valid until explicitly replaced (RFC-0735 §Decisions, item 8).
- `governance` is inherited from `PbpEntity` and is not redefined. The inherited `PbpGovernance.reviewEvery` field serves the schedule review cadence purpose.

### 4. Schema IDs

```ts
export const RATE_POLICY_SCHEMA_ID = pbpSchemaId("rate-policy");
export const RATE_SCHEDULE_SCHEMA_ID = pbpSchemaId("rate-schedule");
```

Uses the existing `pbpSchemaId()` helper from `packages/pbp/src/schema-id.ts` to construct the schema ID, consistent with all other PBP entities (e.g. `POLICY_SCHEMA_ID` in `policy.ts`).

### 5. Zod schemas

```ts
export const pbpRateModeSchema = z.enum(["external", "business-fixed"]);

export const pbpRateDirectionSchema = z.enum(["target-per-source", "source-per-target"]);

export const pbpCurrencyPairSchema = z.object({
  sourceCurrency: nonEmptyString,
  targetCurrency: nonEmptyString,
});

export const pbpQuotationSchema = z.object({
  direction: pbpRateDirectionSchema,
});

export const pbpRatePolicySchema = pbpEntitySchema
  .extend({
    type: z.literal("rate-policy"),
    pair: pbpCurrencyPairSchema,
    quotation: pbpQuotationSchema,
    mode: pbpRateModeSchema,
    sources: z.object({
      primary: pbpEntityRefSchema,
      fallback: pbpEntityRefSchema.optional(),
    }).optional(),
    freshness: z.object({
      maximumAge: nonEmptyString,
      allowLastKnownValue: z.boolean(),
    }),
    failure: z.object({
      noAcceptableRate: z.enum(["source-price-only", "block-publication"]),
    }),
  })
  .strict();

export const pbpRateScheduleEntrySchema = z.object({
  value: decimalString,
  validFrom: nonEmptyString,
});

export const pbpRateScheduleSchema = pbpEntitySchema
  .extend({
    type: z.literal("rate-schedule"),
    pair: pbpCurrencyPairSchema,
    quotation: pbpQuotationSchema,
    entries: z.record(z.string(), pbpRateScheduleEntrySchema),
  })
  .strict();
```

Extends `pbpEntitySchema` (which provides `schema`, `id`, `type`, `status`, `name?`, `summary?`, `governance?`) and applies `.strict()` to reject unknown fields, consistent with all existing PBP entity schemas (e.g. `businessSchema`, `policySchema`, `pbpCurrencyPricingPolicySchema`).

### 6. Validation rules

**RatePolicy:**

- `pair.sourceCurrency` MUST differ from `pair.targetCurrency`.
- `mode: "external"` MUST have `sources` with at least `primary`.
- `mode: "business-fixed"` MUST NOT have `sources` (rates come from RateSchedule).
- `freshness.maximumAge` MUST be a valid ISO 8601 duration (e.g. `P1M`, `P7D`).
- `failure.noAcceptableRate: "source-price-only"` means the site shows source-currency prices only when no acceptable rate is available.
- `failure.noAcceptableRate: "block-publication"` means the build fails when no acceptable rate is available.

**RateSchedule:**

- `pair.sourceCurrency` MUST differ from `pair.targetCurrency`.
- `quotation.direction` MUST match the corresponding RatePolicy's direction.
- All `entries[].value` MUST be positive decimal strings. Note: the `decimalString` schema (`/^\d+(\.\d+)?$/`) allows zero — positivity enforcement is deferred to the compiler (RFC-0740), not the schema.
- No two entries MAY have the same `validFrom`.
- `entries` MUST have at least one entry.

### 7. Rate selection algorithm (for `business-fixed` mode)

Given a target time `T`:

1. Sort entries by `validFrom` ascending.
2. Find the entry with the latest `validFrom` that is <= `T`.
3. If no entry has `validFrom` <= `T`, no applicable rate exists — the compiler blocks publication (or falls back to source-price-only per `failure.noAcceptableRate`).

### 8. Content file locations

```
src/content/business-profile/{lang}/rate-policy/{id}.md
src/content/business-profile/{lang}/rate-schedule/{id}.md
```

### 9. Example content

**RatePolicy (external mode):**

```yaml
---
schema: pbp/rate-policy@1
id: https://warpgogol.com/id/rate-policy/eur-uah
type: rate-policy
status: published

pair:
  sourceCurrency: EUR
  targetCurrency: UAH

quotation:
  direction: target-per-source

mode: external

sources:
  primary:
    ref: https://warpgogol.com/id/rate-source/primary
  fallback:
    ref: https://warpgogol.com/id/rate-source/fallback

freshness:
  maximumAge: P1M
  allowLastKnownValue: true

failure:
  noAcceptableRate: source-price-only
---
```

**RateSchedule (business-fixed mode):**

```yaml
---
schema: pbp/rate-schedule@1
id: https://warpgogol.com/id/rate-schedule/eur-usd
type: rate-schedule
status: published

pair:
  sourceCurrency: EUR
  targetCurrency: USD

quotation:
  direction: target-per-source

entries:
  rate-2026-08-07:
    value: "1.08"
    validFrom: 2026-08-07T00:00:00+02:00
  rate-2026-08-10:
    value: "1.09"
    validFrom: 2026-08-10T00:00:00+02:00

governance:
  reviewEvery: P1D
---
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** Entity types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** New entities extend `pbp/*@1` as platform extensions.
- **RFC-0736 (CurrencyPricingPolicy).** `CurrencyPricingPolicy.targetCurrencies[].ratePolicyRef` references a RatePolicy entity.
- **ADR-012 (Decimal strings).** `RateSchedule.entries[].value` is a `decimalString`.
- **Compass sync.** No `docs/*.xml` updates needed — new entity types are additive to `pbp/*@1` and do not change repository-wide requirements or technology contracts.
- **AGENTS.md update.** `packages/pbp/AGENTS.md` API surface listing must be updated with the new exported types (`PbpRatePolicy`, `PbpRateSchedule`, `PbpRateMode`, `PbpRateDirection`, `PbpCurrencyPair`, `PbpQuotation`, `PbpRateScheduleEntry`).

## Design

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
// packages/pbp/src/entities/rate-policy.ts

export type PbpRateMode = "external" | "business-fixed";
export const PBP_RATE_MODES: readonly PbpRateMode[] = ["external", "business-fixed"] as const;
export function isPbpRateMode(value: string): value is PbpRateMode {
  return PBP_RATE_MODES.includes(value as PbpRateMode);
}

export type PbpRateDirection = "target-per-source" | "source-per-target";
export const PBP_RATE_DIRECTIONS: readonly PbpRateDirection[] = [
  "target-per-source",
  "source-per-target",
] as const;
export function isPbpRateDirection(value: string): value is PbpRateDirection {
  return PBP_RATE_DIRECTIONS.includes(value as PbpRateDirection);
}

export interface PbpCurrencyPair {
  sourceCurrency: string;
  targetCurrency: string;
}

export interface PbpQuotation {
  direction: PbpRateDirection;
}

export interface PbpRatePolicy extends PbpEntity {
  type: "rate-policy";
  pair: PbpCurrencyPair;
  quotation: PbpQuotation;
  mode: PbpRateMode;
  sources?: { primary: PbpEntityRef; fallback?: PbpEntityRef };
  freshness: { maximumAge: string; allowLastKnownValue: boolean };
  failure: { noAcceptableRate: "source-price-only" | "block-publication" };
}

export interface PbpRateScheduleEntry {
  value: string;
  validFrom: string;
}

export interface PbpRateSchedule extends PbpEntity {
  type: "rate-schedule";
  pair: PbpCurrencyPair;
  quotation: PbpQuotation;
  entries: Record<string, PbpRateScheduleEntry>;
}

export const RATE_POLICY_SCHEMA_ID = pbpSchemaId("rate-policy");
export const RATE_SCHEDULE_SCHEMA_ID = pbpSchemaId("rate-schedule");
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/rate-policy.ts` | RatePolicy + RateSchedule entity interfaces, closed unions |
| `packages/pbp/src/schemas/rate-policy.ts` | Zod schemas |
| `packages/pbp/src/schemas/index.ts` | Register schemas in `pbpSchemaById` registry and `pbpEntityDiscriminatedUnion` |
| `packages/pbp/src/index.ts` | Re-exports |
| `packages/pbp/AGENTS.md` | Add new types to API surface listing |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.
- Compiler validation (RFC-0740) blocks publication when validation rules are violated.

## Rollout

- **Immediate:** Upon acceptance, entity types and Zod schemas are added to `@warpgogol/pbp`.
- **No site impact yet:** RatePolicy and RateSchedule are not consumed until RFC-0739 (derivation) and RFC-0740 (materialization).

## Alternatives considered

- **Single entity for both modes.** Merge RatePolicy and RateSchedule into one entity. Rejected: external and business-fixed modes have fundamentally different data shapes — external needs source refs, business-fixed needs entry schedules. Merging creates a confusing union type.

- **`validUntil` on schedule entries.** Add `validUntil` to rate schedule entries. Rejected: decision #8 explicitly states "old rate valid until replaced." `validUntil` adds complexity and can create gaps if not maintained. The applicable-rate algorithm uses `validFrom` ordering instead.

- **Rate direction as a transform flag.** Let the derivation handle direction normalization. Rejected: the rate policy must declare its quotation direction so the derivation knows whether to multiply or divide. Making it explicit prevents ambiguity.

## Risks

- **Stale rates.** A business-fixed schedule may not be updated regularly. Mitigation: `governance.reviewEvery` declares the review cadence. The compiler (RFC-0740) can warn when the latest entry is older than `reviewEvery`.

- **External source unavailability.** The external source may be down. Mitigation: fallback source + `allowLastKnownValue` within `maximumAge`. If all sources fail and last-known is outside `maximumAge`, `failure.noAcceptableRate` determines behavior.

## Acceptance criteria

- [ ] `PbpRatePolicy` interface exported from `@warpgogol/pbp`
- [ ] `PbpRateSchedule` interface exported
- [ ] `PbpRateMode` closed union exported with const array
- [ ] `PbpRateDirection` closed union exported with const array
- [ ] `PbpCurrencyPair` interface exported
- [ ] `PbpQuotation` interface exported
- [ ] `PbpRateScheduleEntry` interface exported
- [ ] `RATE_POLICY_SCHEMA_ID` constant exported
- [ ] `RATE_SCHEDULE_SCHEMA_ID` constant exported
- [ ] `pbpRatePolicySchema` Zod schema exported and registered in `pbpSchemaById`
- [ ] `pbpRateScheduleSchema` Zod schema exported and registered in `pbpSchemaById`
- [ ] `tsc --noEmit` passes for `packages/pbp/`
- [ ] `vitest run` passes for `packages/pbp/`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpRatePolicy extends PbpEntity` and `PbpRateSchedule extends PbpEntity` — do not redefine `schema`, `id`, `type`, `status`, `governance`.
- All monetary values (`RateSchedule.entries[].value`) are decimal strings (ADR-012), never binary float.
- `quotation.direction` determines whether the derivation multiplies (`target-per-source`) or divides (`source-per-target`). The derivation contract (RFC-0739) handles this.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Schema IDs MUST be constructed via `pbpSchemaId("rate-policy")` and `pbpSchemaId("rate-schedule")`, not hardcoded string literals.
- Zod schemas MUST extend `pbpEntitySchema` and apply `.strict()`, consistent with all existing PBP entity schemas (e.g. `pbpCurrencyPricingPolicySchema`).
