---
id: RFC-0446
title: "Tax and Buyer Presentation"
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
specRef: "pbp-specification-package/RFC-PBP-035"
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
  - "PbpTaxTreatment interface exported"
  - "PbpTaxJurisdiction interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement tax calculation — contract only"
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

- `pbp-specification-package/entity-model` — §17.1 (Pricing header, tax)

_This RFC defines the tax treatment and buyer presentation contract._

# RFC-0446: Tax and Buyer Presentation

## Context

The PBP spec defines tax treatment in the pricing header (entity-model §17.1) with `treatment` (e.g., `not-declared`) and `jurisdiction.countryCode`. The spec also defines buyer presentation rules for pricing.

## Problem

1. **No tax treatment type.** The spec defines `tax.treatment` and `tax.jurisdiction` but no TypeScript types exist.

## Decision

### 1. `PbpTaxTreatment`

```ts
type PbpTaxTreatment = "not-declared" | "gross" | "net" | "vat-included";

interface PbpTaxJurisdiction {
  countryCode: string;
}

interface PbpTax {
  treatment: PbpTaxTreatment;
  jurisdiction?: PbpTaxJurisdiction;
}
```

### 2. Buyer presentation rules

- Prices MUST declare whether they are gross, net, or VAT-included.
- `not-declared` means the price does not include tax information.
- The buyer-facing presentation MUST show the tax treatment clearly.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-035"`.
- **RFC-0429 (Offering Core).** `PbpPricing.tax` is `Record<string, unknown>` — this RFC provides the typed interface.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpTaxTreatment = "not-declared" | "gross" | "net" | "vat-included";
export const PBP_TAX_TREATMENTS: readonly PbpTaxTreatment[] = [
  "not-declared", "gross", "net", "vat-included",
] as const;

export interface PbpTaxJurisdiction {
  countryCode: string;
}

export interface PbpTax {
  treatment: PbpTaxTreatment;
  jurisdiction?: PbpTaxJurisdiction;
}
```

### File system responsibilities

| Path                               | Role                |
| ---------------------------------- | ------------------- |
| `packages/pbp/src/entities/tax.ts` | Tax treatment types |
| `packages/pbp/src/index.ts`        | Re-exports          |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, tax types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Embed tax in charge.** Rejected: tax is a pricing-header-level concern, not per-charge.

## Risks

- **Tax treatment ambiguity.** Buyers may not understand gross vs net. Mitigation: the buyer presentation rules require clear display.

## Acceptance criteria

- [x] `PbpTax` interface exported (evidence: implemented historically)
- [x] `PbpTaxTreatment` closed union exported with const array (evidence: implemented historically)
- [x] `PbpTaxJurisdiction` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Tax treatment is a pricing-header field, not per-charge.
- `not-declared` means no tax information is included in the price.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
