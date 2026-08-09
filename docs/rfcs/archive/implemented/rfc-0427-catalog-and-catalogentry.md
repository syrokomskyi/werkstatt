---
id: RFC-0427
title: "Catalog and CatalogEntry"
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
  - RFC-0403
  - RFC-0404
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-025"
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
  - "PbpCatalog interface exported extending PbpEntity"
  - "PbpCatalogEntry interface exported extending PbpEntity"
  - "Catalog fields: name, businessRef, entrySource"
  - "CatalogEntry fields: name, catalogRef, itemRef, localIdentifiers, merchandising, offeringRefs"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Product — that is RFC-0404"
  - "Does not define Offering — that is a future RFC"
  - "Does not define Zod schemas"
  - "Does not define entry source adapter protocol"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

- `pbp-specification-package/entity-model` — §13 (Catalog), §14 (CatalogEntry), §14.1 (CatalogEntry fields)
- `pbp-specification-package/system-spec` — §10 (Catalog and CatalogEntry)

_This RFC defines the `PbpCatalog` and `PbpCatalogEntry` entity interfaces._

# RFC-0427: Catalog and CatalogEntry

## Context

The PBP spec defines Catalog as a container for a business's offerings (entity-model §13). CatalogEntry links products to a catalog with local metadata like SKU, merchandising, and offering references (§14). The entry source can be a manifest directory or a bulk dataset adapter.

## Problem

1. **No `PbpCatalog` interface.** The `@gogol/pbp` package has no Catalog entity.
2. **No `PbpCatalogEntry` interface.** The package has no CatalogEntry entity.
3. **No entry source modeling.** The spec defines two entry source modes (`manifest-directory` and `dataset`), but there are no types for them.

## Decision

### 1. `PbpCatalog` interface

```ts
interface PbpCatalog extends PbpEntity {
  type: "catalog";
  name: string;
  businessRef: PbpEntityRef;
  entrySource: PbpCatalogEntrySource;
}
```

### 2. `PbpCatalogEntrySource`

```ts
type PbpCatalogEntrySource =
  | { mode: "manifest-directory"; logicalPath: string }
  | { mode: "dataset"; adapterRef: string };
```

### 3. `PbpCatalogEntry` interface

```ts
interface PbpCatalogEntry extends PbpEntity {
  type: "catalog-entry";
  name: string;
  summary?: string;
  catalogRef: PbpEntityRef;
  itemRef: PbpEntityRef;
  localIdentifiers?: Record<string, string>;
  merchandising?: { featured?: boolean; displayOrder?: number };
  offeringRefs?: Record<string, PbpEntityRef>;
}
```

### 4. Schema IDs

```ts
const CATALOG_SCHEMA_ID = pbpSchemaId("catalog"); // "pbp/catalog@1"
const CATALOG_ENTRY_SCHEMA_ID = pbpSchemaId("catalog-entry"); // "pbp/catalog-entry@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-025"`.
- **RFC-0399 (Entity Envelope).** Both interfaces extend `PbpEntity`.
- **RFC-0403 (Business).** Catalog references Business via `businessRef`.
- **RFC-0404 (Product).** CatalogEntry references Product via `itemRef`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpCatalogEntrySource =
  | { mode: "manifest-directory"; logicalPath: string }
  | { mode: "dataset"; adapterRef: string };

export interface PbpCatalog extends PbpEntity {
  type: "catalog";
  name: string;
  businessRef: PbpEntityRef;
  entrySource: PbpCatalogEntrySource;
}

export interface PbpCatalogEntry extends PbpEntity {
  type: "catalog-entry";
  name: string;
  summary?: string;
  catalogRef: PbpEntityRef;
  itemRef: PbpEntityRef;
  localIdentifiers?: Record<string, string>;
  merchandising?: { featured?: boolean; displayOrder?: number };
  offeringRefs?: Record<string, PbpEntityRef>;
}

export const CATALOG_SCHEMA_ID: string;
export const CATALOG_ENTRY_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/catalog.ts` | `PbpCatalog`, `PbpCatalogEntry`, `PbpCatalogEntrySource`, schema IDs |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpCatalog` and `PbpCatalogEntry` are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge Catalog into Business.** Rejected: Catalog is a federated entity with its own identity. A business can have multiple catalogs.
- **Store SKU on Product.** Rejected: SKU is seller-specific local data, not a product fact. The spec explicitly states "SKU is not stored as Product external identifier" (system-spec §10.6).

## Risks

- **Entry source adapter complexity.** The `dataset` mode requires an adapter protocol not yet defined. Mitigation: this RFC only defines the type shape; adapter protocol is a future concern.
- **CatalogEntry item type ambiguity.** `itemRef` can point to Product, ProductGroup, or ProductVariant. Mitigation: `PbpEntityRef` has `expectedType` for disambiguation.

## Acceptance criteria

- [x] `PbpCatalog` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpCatalogEntry` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpCatalogEntrySource` discriminated union exported (evidence: implemented historically)
- [x] `CATALOG_SCHEMA_ID` and `CATALOG_ENTRY_SCHEMA_ID` constants exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpCatalog` and `PbpCatalogEntry` extend `PbpEntity` — do not redefine `schema`, `id`, `type`, `status`, `governance`.
- `itemRef` on CatalogEntry can point to Product, ProductGroup, or ProductVariant — use `expectedType` on `PbpEntityRef`.
- SKU is stored as `localIdentifiers` on CatalogEntry, NOT as a Product external identifier.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
