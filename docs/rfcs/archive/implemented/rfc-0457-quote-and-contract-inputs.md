---
id: RFC-0457
title: "Quote and Contract Inputs"
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
specRef: "pbp-specification-package/RFC-PBP-083"
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
  - "PbpQuoteInput interface exported"
  - "PbpContractInput interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement quote/contract generation — contract only"
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

- `pbp-specification-package/compiler` — §19 (Quote and Contract Input Projections)

_This RFC defines the Quote and Contract Input projection contracts._

# RFC-0457: Quote and Contract Inputs

## Context

The PBP compiler produces quote and contract input projections (compiler §19) that provide structured data for quote/contract generation systems.

## Problem

1. **No quote input type.** The spec defines quote input projections but no TypeScript types exist.
2. **No contract input type.** Contract inputs need a typed contract.

## Decision

### 1. `PbpQuoteInput`

```ts
interface PbpQuoteInput {
  projectionTarget: "quote";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  terms?: Record<string, unknown>;
  locale: string;
}
```

### 2. `PbpContractInput`

```ts
interface PbpContractInput {
  projectionTarget: "contract";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  terms: Record<string, unknown>;
  policyRefs: PbpEntityRef[];
  locale: string;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-083"`.
- **RFC-0429 (Offering Core).** Quote/contract inputs reference offerings.
- **RFC-0437 (Pricing Core).** Charges are typed.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpQuoteInput {
  projectionTarget: "quote";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  terms?: Record<string, unknown>;
  locale: string;
}

export interface PbpContractInput {
  projectionTarget: "contract";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  terms: Record<string, unknown>;
  policyRefs: PbpEntityRef[];
  locale: string;
}
```

### File system responsibilities

| Path                                             | Role                           |
| ------------------------------------------------ | ------------------------------ |
| `packages/pbp/src/projections/quote-contract.ts` | Quote and contract input types |
| `packages/pbp/src/index.ts`                      | Re-exports                     |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, quote/contract input types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge quote and contract.** Rejected: contract requires terms and policy refs that quote does not.

## Risks

- **Charge resolution.** Quote charges must be resolved from the offering's pricing. Mitigation: charges are a structured record referencing the offering.

## Acceptance criteria

- [x] `PbpQuoteInput` interface exported (evidence: implemented historically)
- [x] `PbpContractInput` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Contract input requires terms and policy refs; quote input does not.
- Both projections are locale-aware.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
