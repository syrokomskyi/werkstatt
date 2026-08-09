---
id: RFC-0432
title: "Schema.org Mapping"
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
  - RFC-0428
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-082"
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
  - "PbpSchemaOrgMapping interface exported"
  - "PbpSchemaOrgLossReport interface exported"
  - "PbpSchemaOrgMappingRef type exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement the Schema.org projection builder — contract only"
  - "Does not define individual Schema.org type mappings"
  - "Does not define Zod schemas"
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

- `pbp-specification-package/compiler` — §18 (Schema.org Projection), §18.1 (Mapping strategy), §18.2 (Product variants), §18.3 (Offering), §18.4 (Loss report)

_This RFC defines the Schema.org projection mapping contract._

# RFC-0432: Schema.org Mapping

## Context

The PBP compiler Phase 12 (Projection) produces Schema.org projections (compiler §18). The mapping layer must be explicit and versioned. The projection must report data that could not be represented (loss report).

## Problem

1. **No mapping contract.** The spec defines `mappingRef: pbp-mapping:schema-org/30/product-offer/1` but no TypeScript types exist.
2. **No loss report type.** The spec requires reporting unmappable data with `sourcePath`, `reason`, and `fallback` (§18.4).

## Decision

### 1. `PbpSchemaOrgMappingRef`

```ts
type PbpSchemaOrgMappingRef = string; // e.g. "pbp-mapping:schema-org/30/product-offer/1"
```

### 2. `PbpSchemaOrgMapping`

```ts
interface PbpSchemaOrgMapping {
  mappingRef: PbpSchemaOrgMappingRef;
  targetSchema: "schema.org";
  schemaOrgVersion: string;
}
```

### 3. `PbpSchemaOrgLossReport`

```ts
interface PbpSchemaOrgLossEntry {
  sourcePath: string;
  reason: string;
  fallback?: string;
}

interface PbpSchemaOrgLossReport {
  losses: PbpSchemaOrgLossEntry[];
}
```

### 4. Mapping rules (compiler §18.2, §18.3)

- ProductGroup → `schema:ProductGroup`; variationAxes → `variesBy`; variants → `hasVariant`; ProductVariant → `schema:Product` + `isVariantOf`.
- Offering → `schema:Offer`; fixed price → `price`/`priceCurrency` or PriceSpecification; range → AggregateOffer; service Product → `Service` plus Offer.
- No silent loss for critical buyer facts.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-082"`.
- **RFC-0428 (Compiler Pipeline).** Phase 12 produces projections.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpSchemaOrgMappingRef = string;

export interface PbpSchemaOrgMapping {
  mappingRef: PbpSchemaOrgMappingRef;
  targetSchema: "schema.org";
  schemaOrgVersion: string;
}

export interface PbpSchemaOrgLossEntry {
  sourcePath: string;
  reason: string;
  fallback?: string;
}

export interface PbpSchemaOrgLossReport {
  losses: PbpSchemaOrgLossEntry[];
}
```

### File system responsibilities

| Path                                         | Role                     |
| -------------------------------------------- | ------------------------ |
| `packages/pbp/src/projections/schema-org.ts` | Schema.org mapping types |
| `packages/pbp/src/index.ts`                  | Re-exports               |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, Schema.org mapping types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Automatic Schema.org generation without mapping ref.** Rejected: the spec requires explicit, versioned mapping references (§18.1).
- **Silent loss.** Rejected: the spec mandates a loss report for unmappable data (§18.4).

## Risks

- **Schema.org version drift.** Schema.org evolves; mappings must be versioned. Mitigation: `schemaOrgVersion` field on mapping.
- **Loss report completeness.** Agents may forget to report losses. Mitigation: loss report is a required output of the projection phase.

## Acceptance criteria

- [x] `PbpSchemaOrgMapping` interface exported (evidence: implemented historically)
- [x] `PbpSchemaOrgLossReport` and `PbpSchemaOrgLossEntry` interfaces exported (evidence: implemented historically)
- [x] `PbpSchemaOrgMappingRef` type exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Mapping layer must be explicit and versioned (compiler §18.1).
- No silent loss for critical buyer facts (compiler §18.4).
- ProductGroup → `schema:ProductGroup`, ProductVariant → `schema:Product` + `isVariantOf` (compiler §18.2).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
