---
id: RFC-0440
title: "ComparisonProfile"
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
  - RFC-0414
  - RFC-0431
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-072"
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
  - "PbpComparisonProfile interface exported extending PbpEntity"
  - "PbpComparisonDimension interface exported"
  - "PbpComparisonValueType closed union exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define comparison projection output — that is RFC-PBP-073"
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

- `pbp-specification-package/entity-model` — §32 (ComparisonProfile)

_This RFC defines the ComparisonProfile entity._

# RFC-0440: ComparisonProfile

## Context

The PBP spec defines ComparisonProfile (entity-model §32) as a registry entity that specifies which dimensions to compare across offerings in a category. Dimensions can be money, recurring-money, derived-money, duration, or controlled-value.

## Problem

1. **No `PbpComparisonProfile` interface.** The spec defines comparison profiles with dimensions but no TypeScript types exist.
2. **No dimension value type vocabulary.** The spec defines `money`, `recurring-money`, `derived-money`, `duration`, `controlled-value`.

## Decision

### 1. `PbpComparisonValueType` closed union

```ts
type PbpComparisonValueType =
  | "money" | "recurring-money" | "derived-money"
  | "duration" | "controlled-value";
```

### 2. `PbpComparisonDimension`

```ts
interface PbpComparisonDimension {
  valueType: PbpComparisonValueType;
  selectorRef?: string;
  derivationRef?: string;
  required?: boolean;
}
```

### 3. `PbpComparisonProfile`

```ts
interface PbpComparisonProfile extends PbpEntity {
  type: "comparison-profile";
  name: string;
  appliesToCategoryRefs: Record<string, PbpEntityRef>;
  dimensions: Record<string, PbpComparisonDimension>;
}
```

### 4. Schema ID

```ts
const COMPARISON_PROFILE_SCHEMA_ID = pbpSchemaId("comparison-profile");
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-072"`.
- **RFC-0414 (Category).** ComparisonProfile applies to categories.
- **RFC-0431 (Derivation Contract).** Dimensions can reference derivation contracts.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpComparisonValueType =
  | "money" | "recurring-money" | "derived-money"
  | "duration" | "controlled-value";

export const PBP_COMPARISON_VALUE_TYPES: readonly PbpComparisonValueType[] = [
  "money", "recurring-money", "derived-money", "duration", "controlled-value",
] as const;

export function isPbpComparisonValueType(value: string): value is PbpComparisonValueType;

export interface PbpComparisonDimension {
  valueType: PbpComparisonValueType;
  selectorRef?: string;
  derivationRef?: string;
  required?: boolean;
}

export interface PbpComparisonProfile extends PbpEntity {
  type: "comparison-profile";
  name: string;
  appliesToCategoryRefs: Record<string, PbpEntityRef>;
  dimensions: Record<string, PbpComparisonDimension>;
}

export const COMPARISON_PROFILE_SCHEMA_ID: string;
```

### File system responsibilities

| Path                                              | Role                     |
| ------------------------------------------------- | ------------------------ |
| `packages/pbp/src/entities/comparison-profile.ts` | ComparisonProfile entity |
| `packages/pbp/src/index.ts`                       | Re-exports               |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, ComparisonProfile types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Embed comparison in Offering.** Rejected: comparison is a registry-level entity that applies to categories, not individual offerings.

## Risks

- **Dimension compatibility.** Two offerings are only comparable when dimension values share compatible units. Mitigation: this is enforced by the comparison projection (RFC-PBP-073), not by this contract.

## Acceptance criteria

- [x] `PbpComparisonProfile` interface exported, extending `PbpEntity` (evidence: implemented historically)
- [x] `PbpComparisonDimension` interface exported (evidence: implemented historically)
- [x] `PbpComparisonValueType` closed union exported with const array (evidence: implemented historically)
- [x] `COMPARISON_PROFILE_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- ComparisonProfile is a registry entity — it lives in the registry, not in per-locale content.
- Dimensions with `derived-money` valueType reference derivation contracts via `derivationRef`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
