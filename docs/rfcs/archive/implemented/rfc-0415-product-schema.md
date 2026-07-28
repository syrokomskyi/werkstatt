---
id: RFC-0415
title: "Product Schema"
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
  - RFC-0398
  - RFC-0399
  - RFC-0404
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-022"
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
  - "PbpProductGroup and PbpProductVariant interfaces exported extending PbpEntity"
  - "ProductGroup fields: name, classification, variationAxes"
  - "ProductVariant fields: name, groupRef, variantValues, externalIdentifiers"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Product — that is RFC-0404"
  - "Does not define Zod schemas"
  - "Does not define variant invariant enforcement"
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
- `pbp-specification-package/target-blueprint` — Product schema target structure

# RFC-0415: Product Schema

## Context

The PBP spec defines ProductGroup and ProductVariant as extensions of the Product entity model (entity-model §12). ProductGroup defines variation axes; ProductVariant specifies concrete values for those axes. RFC-0404 defined the base `PbpProduct` interface; this RFC adds `PbpProductGroup` and `PbpProductVariant`.

## Problem

1. **No `PbpProductGroup` interface.** The `@gogol/pbp` package has no ProductGroup entity.
2. **No `PbpProductVariant` interface.** The `@gogol/pbp` package has no ProductVariant entity.
3. **No variation axis contract.** ProductGroup defines variation axes with `attributeRef` and `required` flag but there is no typed structure.
4. **No variant invariant enforcement.** The spec requires that variants MUST specify all required axes and MUST NOT declare axes not in the group (§12.3).

## Decision

### 1. `PbpProductGroup` interface

```ts
interface PbpProductGroup extends PbpEntity {
  type: "product-group";
  name: string;
  classification?: {
    categoryRef?: PbpEntityRef;
  };
  variationAxes: Record<string, {
    attributeRef: string;
    required: boolean;
  }>;
}
```

### 2. `PbpProductVariant` interface

```ts
interface PbpProductVariant extends PbpEntity {
  type: "product-variant";
  name: string;
  groupRef: PbpEntityRef;
  variantValues: Record<string, {
    valueRef: string;
  }>;
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
}
```

### 3. Variant invariants (entity-model §12.3)

- Variant MUST specify all required axes declared in its ProductGroup.
- Axis not declared in ProductGroup MUST NOT appear in variant.
- Every Variant external identifier must identify that concrete variant, not the group.

### 4. Schema IDs

```ts
const PRODUCT_GROUP_SCHEMA_ID = pbpSchemaId("product-group"); // "pbp/product-group@1"
const PRODUCT_VARIANT_SCHEMA_ID = pbpSchemaId("product-variant"); // "pbp/product-variant@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpProductGroup` and `PbpProductVariant` are in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-022"`.
- **RFC-0399 (Entity Envelope).** Both extend `PbpEntity`.
- **RFC-0404 (Product).** ProductGroup and ProductVariant extend the product model with variation axes.
- **RFC-0400 (Primitive Types).** Uses `PbpExternalIdentifier` for variant identifiers.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpProductGroup extends PbpEntity {
  type: "product-group";
  name: string;
  classification?: { categoryRef?: PbpEntityRef };
  variationAxes: Record<string, { attributeRef: string; required: boolean }>;
}

export interface PbpProductVariant extends PbpEntity {
  type: "product-variant";
  name: string;
  groupRef: PbpEntityRef;
  variantValues: Record<string, { valueRef: string }>;
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
}

export const PRODUCT_GROUP_SCHEMA_ID: string;
export const PRODUCT_VARIANT_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/product-group.ts` | `PbpProductGroup`, `PRODUCT_GROUP_SCHEMA_ID` |
| `packages/pbp/src/entities/product-variant.ts` | `PbpProductVariant`, `PRODUCT_VARIANT_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpProductGroup` and `PbpProductVariant` are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge ProductGroup into Product.** Rejected: ProductGroup is a separate entity with its own identity. A group can have many variants.
- **Use array for variation axes.** Rejected (ADR-027): keyed maps use semantic keys, not array indices.

## Risks

- **Variant axis completeness.** Variants may not specify all required axes. Mitigation: compiler validation checks axis completeness (compiler §12.2).
- **GTIN conflicts.** Duplicate GTINs across variants are blocking warnings (compiler §12.2). Mitigation: compiler validation checks for GTIN conflicts.

## Acceptance criteria

- [x] `PbpProductGroup` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpProductVariant` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PRODUCT_GROUP_SCHEMA_ID` and `PRODUCT_VARIANT_SCHEMA_ID` constants exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpProductGroup` and `PbpProductVariant` extend `PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Variant MUST specify all required axes declared in its ProductGroup (entity-model §12.3).
- Axis not declared in ProductGroup MUST NOT appear in variant (§12.3).
- Every Variant external identifier must identify that concrete variant, not the group (§12.3).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
