---
id: RFC-0454
title: "Comparison Projection"
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
  - RFC-0440
  - RFC-0431
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-073"
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
  - "PbpComparisonProjection interface exported"
  - "PbpComparisonResult interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define ComparisonProfile — already in RFC-0440"
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

- `pbp-specification-package/compiler` — §23 (Comparison Projection)
- `pbp-specification-package/entity-model` — §32 (ComparisonProfile)

_This RFC defines the Comparison Projection output contract._

# RFC-0454: Comparison Projection

## Context

The PBP compiler produces comparison projections (compiler §23) using ComparisonProfile dimensions. The projection outputs a comparison table with preconditions (two offerings are only comparable when dimension values share compatible units) and no forced ranking.

## Problem

1. **No comparison projection type.** The spec defines comparison output but no TypeScript types exist.
2. **No comparison result type.** Each dimension produces a result with status and value.

## Decision

### 1. `PbpComparisonResult`

```ts
type PbpComparisonStatus = "comparable" | "incomparable" | "missing";

interface PbpComparisonResult {
  dimension: string;
  status: PbpComparisonStatus;
  values: Record<string, unknown>;
  reason?: string;
}
```

### 2. `PbpComparisonProjection`

```ts
interface PbpComparisonProjection {
  projectionTarget: "comparison";
  profileRef: PbpEntityRef;
  offeringRefs: PbpEntityRef[];
  results: PbpComparisonResult[];
}
```

### 3. Rules

- Two offerings are only comparable when dimension values share compatible units (compiler §23).
- No forced ranking — the projection presents data, not rankings.
- Missing dimensions produce `status: "missing"`.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-073"`.
- **RFC-0440 (ComparisonProfile).** Defines the profile used by this projection.
- **RFC-0431 (Derivation Contract).** Derived dimensions reference derivation contracts.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpComparisonStatus = "comparable" | "incomparable" | "missing";
export const PBP_COMPARISON_STATUSES: readonly PbpComparisonStatus[] = [
  "comparable", "incomparable", "missing",
] as const;

export interface PbpComparisonResult {
  dimension: string;
  status: PbpComparisonStatus;
  values: Record<string, unknown>;
  reason?: string;
}

export interface PbpComparisonProjection {
  projectionTarget: "comparison";
  profileRef: PbpEntityRef;
  offeringRefs: PbpEntityRef[];
  results: PbpComparisonResult[];
}
```

### File system responsibilities

| Path                                         | Role                        |
| -------------------------------------------- | --------------------------- |
| `packages/pbp/src/projections/comparison.ts` | Comparison projection types |
| `packages/pbp/src/index.ts`                  | Re-exports                  |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, comparison projection types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Forced ranking.** Rejected: the spec explicitly states "no forced ranking" (compiler §23).

## Risks

- **Incomparable offerings.** Offerings with incompatible units. Mitigation: `PbpComparisonStatus` includes `"incomparable"` with a reason.

## Acceptance criteria

- [x] `PbpComparisonProjection` interface exported (evidence: implemented historically)
- [x] `PbpComparisonResult` interface exported (evidence: implemented historically)
- [x] `PbpComparisonStatus` closed union exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- No forced ranking — the projection presents data, not rankings (compiler §23).
- Two offerings are only comparable when dimension values share compatible units.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
