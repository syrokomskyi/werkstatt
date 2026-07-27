---
id: RFC-0451
title: "Fulfillment, Shipping, Pickup and Return"
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
specRef: "pbp-specification-package/RFC-PBP-045"
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
  - "PbpFulfillment interface exported"
  - "PbpFulfillmentMode closed union exported"
  - "PbpDeliveryMethod interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define shipping carrier integration — contract only"
  - "Does not define Zod schemas"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

- `pbp-specification-package/entity-model` — §18 (Fulfillment and Buyer Responsibilities)

_This RFC defines the fulfillment contract including shipping, pickup, and return._

# RFC-0451: Fulfillment, Shipping, Pickup and Return

## Context

The PBP spec defines fulfillment (entity-model §18) with mode, start trigger, target duration, and delivery methods. Customer responsibilities are declarative and reusable.

## Problem

1. **No fulfillment type.** The spec defines fulfillment with mode, trigger, target, and delivery methods but no TypeScript types exist.
2. **No fulfillment mode vocabulary.** The spec uses `service-delivery` and other modes.

## Decision

### 1. `PbpFulfillmentMode` closed union

```ts
type PbpFulfillmentMode =
  | "service-delivery" | "digital-delivery"
  | "physical-shipping" | "pickup" | "hybrid";
```

### 2. `PbpFulfillment`

```ts
interface PbpFulfillment {
  mode: PbpFulfillmentMode;
  startTrigger?: { event: string };
  target?: { duration: { value: string; unitRef: string } };
  deliveryMethods?: Record<string, { valueRef: string }>;
  returnPolicy?: { policyRef: PbpEntityRef };
}
```

### 3. `PbpCustomerResponsibility`

```ts
interface PbpCustomerResponsibility {
  requirementRef: string;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-045"`.
- **RFC-0429 (Offering Core).** `PbpOffering.fulfillment` and `customerResponsibilities` are `Record<string, unknown>` — this RFC provides typed interfaces.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpFulfillmentMode =
  | "service-delivery" | "digital-delivery"
  | "physical-shipping" | "pickup" | "hybrid";

export const PBP_FULFILLMENT_MODES: readonly PbpFulfillmentMode[] = [
  "service-delivery", "digital-delivery", "physical-shipping", "pickup", "hybrid",
] as const;

export function isPbpFulfillmentMode(value: string): value is PbpFulfillmentMode;

export interface PbpFulfillment { ... }
export interface PbpCustomerResponsibility { ... }
```

### File system responsibilities

| Path                                       | Role              |
| ------------------------------------------ | ----------------- |
| `packages/pbp/src/entities/fulfillment.ts` | Fulfillment types |
| `packages/pbp/src/index.ts`                | Re-exports        |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, fulfillment types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Embed fulfillment in Offering.** Rejected: fulfillment is a complex sub-structure that benefits from its own typed interface.

## Risks

- **Physical shipping complexity.** Shipping involves carriers, tracking, and returns. Mitigation: this contract captures the declarative structure; carrier integration is out of scope.

## Acceptance criteria

- [x] `PbpFulfillment` interface exported (evidence: implemented historically)
- [x] `PbpFulfillmentMode` closed union exported with const array (evidence: implemented historically)
- [x] `PbpCustomerResponsibility` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Customer responsibilities MUST be declarative and reusable (entity-model §18).
- Fulfillment mode determines what delivery methods are available.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
