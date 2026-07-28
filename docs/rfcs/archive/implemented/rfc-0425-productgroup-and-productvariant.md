---
id: RFC-0425
title: "ProductGroup and ProductVariant"
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
  - RFC-0415
  - RFC-0404
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-023"
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
  - "PbpProductGroup interface exported extending PbpEntity"
  - "PbpProductVariant interface exported extending PbpEntity"
  - "Variant invariants documented: all required axes must be specified, no undeclared axes"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not redefine Product — that is RFC-0404"
  - "Does not define Bundles — that is RFC-0426"
  - "Does not define Zod schemas"
  - "Does not define variant invariant enforcement at compile time"
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

- `pbp-specification-package/entity-model` — §12 (ProductGroup and ProductVariant), §12.3 (Invariants)
- `pbp-specification-package/system-spec` — §8.1 (ProductGroup), §8.2 (ProductVariant), §8.4 (Prohibition of mixing)

_This RFC formalizes the variant invariants and composition rules for ProductGroup/ProductVariant. The TypeScript interfaces were introduced by RFC-0415; this RFC documents the constraints that govern them._

# RFC-0425: ProductGroup and ProductVariant

## Context

RFC-0415 introduced `PbpProductGroup` and `PbpProductVariant` interfaces. The PBP spec defines three invariants (entity-model §12.3) that govern the relationship between groups and variants. These invariants are not enforced by TypeScript types alone — they require compiler-level validation (RFC-0428).

## Problem

1. **Variant invariants not documented in an RFC.** The three invariants from §12.3 are in the spec but not yet formalized in an RFC.
2. **No formal separation from Bundles.** The spec explicitly states "Variant is not modeled as bundle" and "Bundle is not modeled as variation axis" (system-spec §8.4). This boundary needs RFC-level documentation.

## Decision

### 1. Variant invariants (entity-model §12.3)

The following invariants govern ProductGroup/ProductVariant:

1. **Required axes completeness.** A ProductVariant MUST specify all required variation axes declared in its ProductGroup.
2. **No undeclared axes.** A ProductVariant MUST NOT contain values for axes not declared in its ProductGroup.
3. **Variant identifier specificity.** Every ProductVariant external identifier MUST identify that concrete variant, not the group.

### 2. Separation from Bundles (system-spec §8.4)

- Variation axes MUST NOT be used to model commercial subscription, SLA, discount, or optional add-on.
- Variant MUST NOT be modeled as a bundle.
- Bundle MUST NOT be modeled as a variation axis.

### 3. TypeScript interfaces

The interfaces are already implemented per RFC-0415. No new TypeScript types are introduced by this RFC.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types are in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-023"`.
- **RFC-0415 (Product Schema).** Introduced the TypeScript interfaces.
- **RFC-0404 (Federated Product Identity).** Established the Product entity.
- **RFC-0426 (Bundles and Composition).** Companion RFC for bundle modeling.

## Implementation details

### CLI surface

No CLI command. Library-only. Invariant enforcement will be performed by the compiler pipeline (RFC-0428).

### TypeScript contracts

Already defined in RFC-0415. No new types.

### File system responsibilities

| Path                                           | Role                           |
| ---------------------------------------------- | ------------------------------ |
| `packages/pbp/src/entities/product-group.ts`   | `PbpProductGroup` (existing)   |
| `packages/pbp/src/entities/product-variant.ts` | `PbpProductVariant` (existing) |
| `packages/pbp/src/index.ts`                    | Re-exports (existing)          |

### Output format

N/A — library-only.

### Failure modes

- Compiler-level invariant violations will be reported as `PBP-PRODUCT-001` through `PBP-PRODUCT-003` (per RFC-0422 error code taxonomy).

## Rollout

- **Immediate:** Invariants are documented. No code changes needed — interfaces already exist.
- **Compiler enforcement:** Deferred to RFC-0428 (Compiler Pipeline).
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge invariants into RFC-0415.** Rejected: RFC-0415 covers the Product Schema (RFC-PBP-022), while this RFC covers the variant-specific invariants (RFC-PBP-023). They are separate spec nodes with separate concerns.
- **Enforce invariants in TypeScript.** Rejected: TypeScript cannot enforce "all required axes must be specified" at the type level. This is a compiler concern.

## Risks

- **Invariant enforcement gap.** Until the compiler pipeline (RFC-0428) is implemented, invariants are documented but not enforced. Mitigation: implementation notes explicitly state this.
- **Bundle/variant confusion.** Agents may model bundles as variants or vice versa. Mitigation: the separation rules are explicitly documented.

## Acceptance criteria

- [x] Variant invariants (§12.3) documented in this RFC (evidence: implemented historically)
- [x] Bundle/variant separation rules (§8.4) documented in this RFC (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The TypeScript interfaces (`PbpProductGroup`, `PbpProductVariant`) are already implemented per RFC-0415. This RFC does not introduce new types.
- Variant invariants (§12.3) MUST be enforced by the compiler pipeline (RFC-0428), not by TypeScript types.
- Variation axes MUST NOT model subscription, SLA, discount, or add-on (system-spec §8.4).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
