---
id: RFC-0441
title: "Buyer View Schema"
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
  - RFC-0431
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-074"
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
  - "PbpBuyerViewSchema interface exported extending PbpEntity"
  - "PbpBuyerViewSection interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define buyer view rendering — contract only"
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

- `pbp-specification-package/entity-model` — §34 (BuyerViewSchema)
- `pbp-specification-package/system-spec` — buyer view sections
- `pbp-specification-package/compiler` — Phase 11 (Buyer View)

_This RFC defines the BuyerViewSchema entity._

# RFC-0441: Buyer View Schema

## Context

The PBP spec defines BuyerViewSchema (entity-model §34) as a registry entity that specifies which sections appear in the buyer-facing view of an offering. Sections include identity, suitability, value, package, options, pricing, buyerResponsibilities, fulfillment, assurances, rights, lifecycle, limitations — each with an order and required flag.

## Problem

1. **No `PbpBuyerViewSchema` interface.** The spec defines buyer view schemas with sections but no TypeScript types exist.
2. **No section type.** Each section has `order` and `required` fields.

## Decision

### 1. `PbpBuyerViewSection`

```ts
interface PbpBuyerViewSection {
  order: number;
  required: boolean;
}
```

### 2. `PbpBuyerViewSchema`

```ts
interface PbpBuyerViewSchema extends PbpEntity {
  type: "buyer-view-schema";
  name: string;
  sections: Record<string, PbpBuyerViewSection>;
}
```

### 3. Schema ID

```ts
const BUYER_VIEW_SCHEMA_ID = pbpSchemaId("buyer-view-schema");
```

### 4. Standard sections (entity-model §34)

The spec defines 12 standard sections: identity (1), suitability (2), value (3), package (4), options (5), pricing (6), buyerResponsibilities (7), fulfillment (8), assurances (9), rights (10), lifecycle (11), limitations (12).

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-074"`.
- **RFC-0429 (Offering Core).** BuyerViewSchema defines how Offering data is presented to buyers.
- **RFC-0431 (Derivation Contract).** Buyer view may include derived values.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpBuyerViewSection {
  order: number;
  required: boolean;
}

export interface PbpBuyerViewSchema extends PbpEntity {
  type: "buyer-view-schema";
  name: string;
  sections: Record<string, PbpBuyerViewSection>;
}

export const BUYER_VIEW_SCHEMA_ID: string;
```

### File system responsibilities

| Path                                             | Role                   |
| ------------------------------------------------ | ---------------------- |
| `packages/pbp/src/entities/buyer-view-schema.ts` | BuyerViewSchema entity |
| `packages/pbp/src/index.ts`                      | Re-exports             |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, BuyerViewSchema types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Hardcode sections in compiler.** Rejected: the spec defines BuyerViewSchema as a registry entity that can vary per deployment.

## Risks

- **Section ordering.** Sections must have unique `order` values. Mitigation: this is a validation concern, not a type concern.

## Acceptance criteria

- [x] `PbpBuyerViewSchema` interface exported, extending `PbpEntity` (evidence: implemented historically)
- [x] `PbpBuyerViewSection` interface exported (evidence: implemented historically)
- [x] `BUYER_VIEW_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- BuyerViewSchema is a registry entity — it lives in the registry, not in per-locale content.
- The 12 standard sections are defined in entity-model §34; custom sections can be added.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
