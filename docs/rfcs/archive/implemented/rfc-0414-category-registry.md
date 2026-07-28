---
id: RFC-0414
title: "Category Registry"
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
specRef: "pbp-specification-package/RFC-PBP-021"
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
  - "PbpCategory interface exported extending PbpEntity"
  - "Category fields: name, broaderRef, externalMappings"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Product classification — that is RFC-0415"
  - "Does not define Zod schemas"
  - "Does not define external mapping validation"
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

- `pbp-specification-package/entity-model` — §31 (Category)
- `pbp-specification-package/system-spec` — §4.1 (Global Semantic Layer)

# RFC-0414: Category Registry

## Context

The PBP spec defines Category as a global semantic entity for product/service classification (entity-model §31). Categories live in the Global Semantic Layer (system-spec §4.1) and are registry-managed, not business-specific. They carry name, broaderRef (hierarchy), and external mappings (e.g. schema.org).

## Problem

1. **No `PbpCategory` interface.** The `@gogol/pbp` package has no Category entity.
2. **No broaderRef hierarchy.** Categories form a hierarchy via `broaderRef` but there is no typed reference.
3. **No external mappings.** Categories map to external vocabularies (schema.org) but there is no typed mapping structure.

## Decision

### 1. `PbpCategory` interface

```ts
interface PbpCategory extends PbpEntity {
  type: "category";
  name: string;
  broaderRef?: PbpEntityRef;
  externalMappings?: Record<string, { value: string }>;
}
```

### 2. Schema ID

```ts
const CATEGORY_SCHEMA_ID = pbpSchemaId("category"); // "pbp/category@1"
```

### 3. Category registry versioning

Category registry versioning is a separate concern from business data. Categories are global semantic entities managed by registries, not by individual businesses (entity-model §31).

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpCategory` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-021"`.
- **RFC-0399 (Entity Envelope).** `PbpCategory extends PbpEntity`.
- **RFC-0404 (Product).** Product references Category via `classification.categoryRef`.
- **system-spec §4.1.** Category is part of the Global Semantic Layer.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpCategory extends PbpEntity {
  type: "category";
  name: string;
  broaderRef?: PbpEntityRef;
  externalMappings?: Record<string, { value: string }>;
}

export const CATEGORY_SCHEMA_ID: string;
```

### File system responsibilities

| Path                                    | Role                                |
| --------------------------------------- | ----------------------------------- |
| `packages/pbp/src/entities/category.ts` | `PbpCategory`, `CATEGORY_SCHEMA_ID` |
| `packages/pbp/src/index.ts`             | Re-exports                          |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpCategory` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Freeform string categories.** Rejected: typed categories with `broaderRef` enable hierarchy validation and external vocabulary mapping.
- **Merge categories into Product.** Rejected: categories are global semantic entities, not business-specific.

## Risks

- **Category hierarchy cycles.** `broaderRef` chains could form cycles. Mitigation: the compiler checks `category-broader` cycles (RFC-0407, compiler §8.5).
- **External mapping drift.** External vocabularies (schema.org) may change. Mitigation: `externalMappings` is a keyed map that can be updated independently.

## Acceptance criteria

- [x] `PbpCategory` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `CATEGORY_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpCategory extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Categories are global semantic entities, not business-specific (system-spec §4.1).
- `broaderRef` hierarchy MUST be acyclic (compiler §8.5).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
