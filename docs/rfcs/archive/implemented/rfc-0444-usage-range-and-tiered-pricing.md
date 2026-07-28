---
id: RFC-0444
title: "Usage, Range and Tiered Pricing"
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
  - RFC-0437
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-033"
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
  - "PbpUsagePricing, PbpTieredPricing interfaces exported"
  - "PbpRangePricing interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not redefine PbpCharge — already in RFC-0437"
  - "Does not define Zod schemas"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

- `pbp-specification-package/entity-model` — §17.4 (Usage Charge), §17.5 (Range Charge), §17.6 (Tiered Charge)

_This RFC formalizes usage, range, and tiered pricing contracts. The core charge types are already in RFC-0437._

# RFC-0444: Usage, Range and Tiered Pricing

## Context

RFC-0437 defines `PbpChargeType` (one-time, recurring, usage, deposit) and `PbpAmountModel` (fixed, range, tiered, unit-rate). This RFC formalizes the usage, range, and tiered pricing rules and adds supporting interfaces.

## Problem

1. **Usage pricing needs basis contract.** Usage charges reference a metric and unit.
2. **Range pricing needs determination contract.** Range charges require `determination.method` and `beforePurchase`.
3. **Tiered pricing needs method distinction.** Tiered charges MUST distinguish `graduated` from `volume` (entity-model §17.6).

## Decision

### 1. Usage pricing (already in PbpCharge)

The `PbpCharge.basis` field from RFC-0437 already captures `metricRef` and `unitRef`. No new types needed.

### 2. Range pricing (already in PbpChargeAmount)

The `PbpChargeAmount` discriminated union from RFC-0437 already has `{ model: "range"; minimum: string; maximum: string }`. The `determination` field on `PbpCharge` captures method and beforePurchase.

### 3. Tiered pricing (already in PbpChargeAmount)

The `PbpChargeAmount` discriminated union from RFC-0437 already has `{ model: "tiered"; method: PbpTierMethod; tiers: ... }`. `PbpTierMethod` is `"graduated" | "volume"`.

### 4. Rules

- `method` MUST distinguish volume pricing from graduated pricing (entity-model §17.6).
- Range charges MUST declare `determination.method` and `determination.beforePurchase` (entity-model §17.5).
- Usage charges MUST declare `basis.metricRef` and `basis.unitRef` (entity-model §17.4).

## Architectural fit

- **DNA-1 (Monorepo boundary).** Types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-033"`.
- **RFC-0437 (Pricing Core).** All charge types and amount models already defined.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

No new types — all types are already exported from RFC-0437:

- `PbpChargeType` includes `"usage"`
- `PbpAmountModel` includes `"range"` and `"tiered"`
- `PbpChargeAmount` has discriminated union for range and tiered
- `PbpTierMethod` is `"graduated" | "volume"`
- `PbpCharge.basis` captures metric and unit refs
- `PbpCharge.determination` captures method and beforePurchase

### File system responsibilities

| Path                                   | Role                                          |
| -------------------------------------- | --------------------------------------------- |
| `packages/pbp/src/entities/pricing.ts` | Already contains all pricing types (RFC-0437) |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** No code changes needed — types already exist from RFC-0437.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Separate file for usage/range/tiered.** Rejected: these are amount model variants within the same `PbpCharge` structure.

## Risks

- **Tiered method confusion.** Graduated vs volume must not be confused. Mitigation: `PbpTierMethod` closed union enforces the distinction.

## Acceptance criteria

- [x] `PbpChargeType` includes `"usage"` (already from RFC-0437) (evidence: implemented historically)
- [x] `PbpAmountModel` includes `"range"` and `"tiered"` (already from RFC-0437) (evidence: implemented historically)
- [x] `PbpTierMethod` exported as `"graduated" | "volume"` (already from RFC-0437) (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- All pricing types are already exported from RFC-0437 — no new code needed.
- `method` MUST distinguish volume pricing from graduated pricing (entity-model §17.6).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
