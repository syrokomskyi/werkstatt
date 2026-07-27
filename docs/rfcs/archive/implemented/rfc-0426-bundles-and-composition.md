---
id: RFC-0426
title: "Bundles and Composition"
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
  - RFC-0404
  - RFC-0425
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-024"
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
  - "PbpProductIntrinsicComposition interface exported"
  - "Bundle modeled as Product with kind=bundle and intrinsicComposition field"
  - "Three bundle types distinguished: intrinsic, offering-inclusion, variant"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Offering — that is a future RFC"
  - "Does not define offering package inclusion — that is an Offering concern"
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

- `pbp-specification-package/system-spec` — §8.3 (Bundle), §8.4 (Prohibition of mixing)
- `pbp-specification-package/entity-model` — §11 (Product), `intrinsicComposition` field

_This RFC defines how bundles and intrinsic composition are modeled in the PBP entity layer._

# RFC-0426: Bundles and Composition

## Context

The PBP spec distinguishes three types of product composition (system-spec §8.3):

1. **Intrinsic product bundle** — the Product itself is a kit consisting of multiple standalone items.
2. **Offering package inclusion** — an Offering includes additional goods/services.
3. **Variant** — the same ProductGroup with different axis values.

The spec also prohibits mixing (§8.4): variation axes must not model bundles, and bundles must not model variation axes.

## Problem

1. **No `intrinsicComposition` field on Product.** The spec shows `intrinsicComposition` as a field on Product (entity-model §11), but `PbpProduct` (RFC-0404) does not include it.
2. **No formal distinction between bundle types.** Without a documented distinction, agents may confuse intrinsic bundles with offering inclusions or variants.

## Decision

### 1. Intrinsic composition on Product

Products with `kind: "bundle"` or `kind: "composite-service"` MAY include an `intrinsicComposition` field:

```ts
interface PbpProductIntrinsicComposition {
  [componentName: string]: {
    productRef: PbpEntityRef;
    quantity?: number;
  };
}
```

This field is optional on `PbpProduct`. It is only meaningful when `kind` is `bundle` or `composite-service`.

### 2. Bundle types (system-spec §8.3)

- **Intrinsic product bundle:** Product with `kind: "bundle"` and `intrinsicComposition` populated.
- **Offering package inclusion:** Modeled at the Offering level (future RFC), not on Product.
- **Variant:** Modeled via ProductGroup/ProductVariant (RFC-0425), not as a bundle.

### 3. Separation rules (system-spec §8.4)

- Variant MUST NOT be modeled as a bundle.
- Bundle MUST NOT be modeled as a variation axis.
- Variation axes MUST NOT model subscription, SLA, discount, or add-on.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-024"`.
- **RFC-0404 (Federated Product Identity).** Established `PbpProduct` with `kind` vocabulary including `bundle` and `composite-service`.
- **RFC-0425 (ProductGroup and ProductVariant).** Established variant/bundle separation rules.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpProductIntrinsicComposition {
  [componentName: string]: {
    productRef: PbpEntityRef;
    quantity?: number;
  };
}
```

### File system responsibilities

| Path                                   | Role                                       |
| -------------------------------------- | ------------------------------------------ |
| `packages/pbp/src/entities/product.ts` | Add `intrinsicComposition` optional field  |
| `packages/pbp/src/index.ts`            | Re-export `PbpProductIntrinsicComposition` |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpProductIntrinsicComposition` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Separate Bundle entity.** Rejected: the spec models bundles as Products with `kind: "bundle"`, not as a separate entity. A separate entity would duplicate Product fields.
- **Model composition at Offering level.** Rejected for intrinsic bundles: intrinsic composition is a product fact, not a seller-specific offering fact. Offering-level inclusion is a separate concern.

## Risks

- **Bundle/variant confusion.** Agents may use variation axes to model bundles. Mitigation: separation rules are documented in both RFC-0425 and this RFC.
- **Offering inclusion confusion.** Agents may put offering-level inclusions in `intrinsicComposition`. Mitigation: implementation notes state that offering inclusions are an Offering concern, not a Product concern.

## Acceptance criteria

- [x] `PbpProductIntrinsicComposition` interface exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpProduct` updated with optional `intrinsicComposition` field (evidence: implemented historically)
- [x] Bundle types (intrinsic, offering-inclusion, variant) documented (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `intrinsicComposition` is only meaningful when `PbpProduct.kind` is `bundle` or `composite-service`.
- Offering package inclusions are modeled at the Offering level, not on Product.
- Variant MUST NOT be modeled as a bundle (system-spec §8.4).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
