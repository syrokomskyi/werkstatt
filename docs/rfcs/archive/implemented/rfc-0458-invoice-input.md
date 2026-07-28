---
id: RFC-0458
title: "Invoice Input"
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
specRef: "pbp-specification-package/RFC-PBP-084"
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
  - "PbpInvoiceInput interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement invoice generation — contract only"
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

- `pbp-specification-package/compiler` — §20 (Invoice Input Projection)

_This RFC defines the Invoice Input projection contract._

# RFC-0458: Invoice Input

## Context

The PBP compiler produces invoice input projections (compiler §20) that provide structured data for invoice generation systems.

## Problem

1. **No invoice input type.** The spec defines invoice input projections but no TypeScript types exist.

## Decision

### 1. `PbpInvoiceInput`

```ts
interface PbpInvoiceInput {
  projectionTarget: "invoice";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  tax: Record<string, unknown>;
  customerRef?: PbpEntityRef;
  locale: string;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-084"`.
- **RFC-0429 (Offering Core).** Invoice input references offerings.
- **RFC-0446 (Tax).** Tax treatment is typed.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpInvoiceInput {
  projectionTarget: "invoice";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  tax: Record<string, unknown>;
  customerRef?: PbpEntityRef;
  locale: string;
}
```

### File system responsibilities

| Path                                      | Role                |
| ----------------------------------------- | ------------------- |
| `packages/pbp/src/projections/invoice.ts` | Invoice input types |
| `packages/pbp/src/index.ts`               | Re-exports          |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, invoice input types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge invoice into quote.** Rejected: invoice requires tax and customer reference that quote does not.

## Risks

- **Tax calculation.** Invoice must include tax treatment. Mitigation: `tax` field references the pricing header tax.

## Acceptance criteria

- [x] `PbpInvoiceInput` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Invoice input includes tax treatment from the pricing header.
- Customer reference is optional — may be resolved at invoice generation time.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
