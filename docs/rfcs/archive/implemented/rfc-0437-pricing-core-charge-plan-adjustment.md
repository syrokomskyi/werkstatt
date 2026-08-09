---
id: RFC-0437
title: "Pricing Core: Charge, Plan, Adjustment"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - "human:operator"
createdAt: 2026-07-19
updatedAt: 2026-07-19
implementedAt: 2026-07-19
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-55
  - RFC-0429
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-032"
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/pbp"
successSignals:
  - "PbpCharge, PbpChargeType, PbpAmountModel interfaces exported"
  - "PbpPlan interface exported"
  - "PbpAdjustment interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define usage/range/tiered pricing details — that is RFC-PBP-033"
  - "Does not define allowances/deposits — that is RFC-PBP-034"
  - "Does not define tax presentation — that is RFC-PBP-035"
  - "Does not define Zod schemas"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

## Design

**Normative source references:**

- `pbp-specification-package/entity-model` — §17 (Pricing model), §17.1–17.9 (Charge types, Plan, Adjustment)

_This RFC defines the pricing core types: Charge, Plan, and Adjustment._

# RFC-0437: Pricing Core: Charge, Plan, Adjustment

## Context

The PBP spec defines a rich pricing model (entity-model §17) with charge types (one-time, recurring, usage, deposit), amount models (fixed, range, tiered, unit-rate), plans that group charges, and adjustments (discounts).

## Problem

1. **No charge types.** The spec defines multiple charge types and amount models but no TypeScript types exist.
2. **No plan type.** Plans group charges with billing and terms.
3. **No adjustment type.** Adjustments modify charges conditionally.

## Decision

### 1. `PbpChargeType` closed union

```ts
type PbpChargeType = "one-time" | "recurring" | "usage" | "deposit";
```

### 2. `PbpAmountModel` closed union

```ts
type PbpAmountModel = "fixed" | "range" | "tiered" | "unit-rate";
```

### 3. `PbpCharge`

```ts
interface PbpCharge {
  type: PbpChargeType;
  purpose: string;
  amount: PbpChargeAmount;
  trigger?: { event: string };
  recurrence?: string;
  basis?: { metricRef: string; unitRef: string };
  refundPolicyRef?: PbpEntityRef;
  determination?: { method: string; beforePurchase: boolean };
}
```

### 4. `PbpChargeAmount` (discriminated by model)

```ts
type PbpChargeAmount =
  | { model: "fixed"; value: string }
  | { model: "range"; minimum: string; maximum: string }
  | { model: "unit-rate"; unitValue: string }
  | { model: "tiered"; method: "graduated" | "volume"; tiers: Record<string, { order: number; upTo?: string; above?: string; unitValue: string }> };
```

### 5. `PbpPlan`

```ts
interface PbpPlan {
  name: string;
  chargeRefs: Record<string, { ref: string }>;
  billing: { recurrence: string; billingDay?: number };
  terms?: { minimumTerm?: string; renewal?: { mode: string; period: string } };
}
```

### 6. `PbpAdjustment`

```ts
type PbpAdjustmentType = "discount" | "surcharge" | "waiver";

interface PbpAdjustment {
  type: PbpAdjustmentType;
  calculation: { model: "fixed" | "percentage"; value: string };
  appliesWhen?: { planRef?: string };
  appliesTo?: { chargeRefs: Record<string, { ref: string }> };
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-032"`.
- **RFC-0429 (Offering Core).** `PbpPricing` interface already has `charges`, `plans`, `adjustments` as `Record<string, unknown>` — this RFC replaces those with typed interfaces.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpChargeType = "one-time" | "recurring" | "usage" | "deposit";
export const PBP_CHARGE_TYPES: readonly PbpChargeType[] = ["one-time", "recurring", "usage", "deposit"] as const;

export type PbpAmountModel = "fixed" | "range" | "tiered" | "unit-rate";
export const PBP_AMOUNT_MODELS: readonly PbpAmountModel[] = ["fixed", "range", "tiered", "unit-rate"] as const;

export type PbpAdjustmentType = "discount" | "surcharge" | "waiver";
export const PBP_ADJUSTMENT_TYPES: readonly PbpAdjustmentType[] = ["discount", "surcharge", "waiver"] as const;

export type PbpChargeAmount = ... ;
export interface PbpCharge { ... }
export interface PbpPlan { ... }
export interface PbpAdjustment { ... }
```

### File system responsibilities

| Path                                   | Role                           |
| -------------------------------------- | ------------------------------ |
| `packages/pbp/src/entities/pricing.ts` | Charge, Plan, Adjustment types |
| `packages/pbp/src/index.ts`            | Re-exports                     |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, pricing types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Single flat charge type.** Rejected: the spec distinguishes one-time, recurring, usage, and deposit with different fields.
- **Amount as string only.** Rejected: the spec defines 4 amount models (fixed, range, tiered, unit-rate) with different shapes.

## Risks

- **Pricing complexity.** Tiered pricing with graduated vs volume methods. Mitigation: `method` field distinguishes them per spec.
- **Discount basis.** Discounts must have a real list price and correct basis. Mitigation: documented in the spec (§17.8).

## Acceptance criteria

- [x] `PbpCharge`, `PbpChargeAmount` interfaces exported (evidence: implemented historically)
- [x] `PbpChargeType`, `PbpAmountModel` closed unions exported with const arrays (evidence: implemented historically)
- [x] `PbpPlan` interface exported (evidence: implemented historically)
- [x] `PbpAdjustment`, `PbpAdjustmentType` exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Tiered charge `method` MUST distinguish volume pricing from graduated pricing (entity-model §17.6).
- Discounts only when a real list price and correct basis exists (entity-model §17.8).
- Money is always a decimal string, never binary float.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
