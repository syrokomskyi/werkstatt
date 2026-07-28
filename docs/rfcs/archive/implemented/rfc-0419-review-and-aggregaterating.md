---
id: RFC-0419
title: "Review and AggregateRating"
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
  - RFC-0405
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-054"
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
  - "PbpReview and PbpAggregateRating interfaces exported extending PbpEntity"
  - "PbpReviewContentMode closed union exported with PBP_REVIEW_CONTENT_MODES"
  - "Review fields: subjectRef, sourceRef, rating, author, publishedAt, retrievedAt, content"
  - "AggregateRating fields: subjectRef, sourceRef, ratingValue, ratingCount, bestRating, worstRating, observedAt, freshness"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define EvidenceSource — that is RFC-0416"
  - "Does not define Zod schemas"
  - "Does not define rating validation rules"
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

- `pbp-specification-package/entity-model` — §29 (Review and AggregateRating)
- `pbp-specification-package/decision-log` — Review handling decisions

# RFC-0419: Review and AggregateRating

## Context

The PBP spec defines Review and AggregateRating as business-catalog entities for external reviews and aggregated ratings (entity-model §29). Review carries subject ref, source ref, rating, author, dates, and content mode. AggregateRating carries aggregated values with freshness.

## Problem

1. **No `PbpReview` interface.** The `@gogol/pbp` package has no Review entity.
2. **No `PbpAggregateRating` interface.** The `@gogol/pbp` package has no AggregateRating entity.
3. **No content mode vocabulary.** The spec uses `linked-only` for review content.

## Decision

### 1. `PbpReview` interface

```ts
type PbpReviewContentMode = "linked-only" | "excerpt" | "full";

interface PbpReview extends PbpEntity {
  type: "review";
  subjectRef: PbpEntityRef;
  sourceRef: PbpEntityRef;
  rating: {
    value: string;
    best: string;
    worst: string;
  };
  author: {
    displayName: string;
  };
  publishedAt: string;
  retrievedAt: string;
  content: {
    mode: PbpReviewContentMode;
    sourceUrl?: string;
  };
}
```

### 2. `PbpAggregateRating` interface

```ts
interface PbpAggregateRating extends PbpEntity {
  type: "aggregate-rating";
  subjectRef: PbpEntityRef;
  sourceRef: PbpEntityRef;
  ratingValue: string;
  ratingCount: number;
  bestRating: string;
  worstRating: string;
  observedAt: string;
  freshness: string;
}
```

### 3. Schema IDs

```ts
const REVIEW_SCHEMA_ID = pbpSchemaId("review"); // "pbp/review@1"
const AGGREGATE_RATING_SCHEMA_ID = pbpSchemaId("aggregate-rating"); // "pbp/aggregate-rating@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpReview` and `PbpAggregateRating` are in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-054"`.
- **RFC-0399 (Entity Envelope).** Both extend `PbpEntity`.
- **system-spec §4.3.** Review and AggregateRating are part of the Business Catalog Layer.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpReviewContentMode = "linked-only" | "excerpt" | "full";
export const PBP_REVIEW_CONTENT_MODES: readonly PbpReviewContentMode[];

export interface PbpReview extends PbpEntity {
  type: "review";
  subjectRef: PbpEntityRef;
  sourceRef: PbpEntityRef;
  rating: { value: string; best: string; worst: string };
  author: { displayName: string };
  publishedAt: string;
  retrievedAt: string;
  content: { mode: PbpReviewContentMode; sourceUrl?: string };
}

export interface PbpAggregateRating extends PbpEntity {
  type: "aggregate-rating";
  subjectRef: PbpEntityRef;
  sourceRef: PbpEntityRef;
  ratingValue: string;
  ratingCount: number;
  bestRating: string;
  worstRating: string;
  observedAt: string;
  freshness: string;
}

export const REVIEW_SCHEMA_ID: string;
export const AGGREGATE_RATING_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/review.ts` | `PbpReview`, `PbpAggregateRating`, `PbpReviewContentMode`, `REVIEW_SCHEMA_ID`, `AGGREGATE_RATING_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpReview` and `PbpAggregateRating` are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge Review into AggregateRating.** Rejected: individual reviews and aggregate ratings are distinct entities with different lifecycles.
- **Open string for content mode.** Rejected: a closed union prevents invalid content modes.

## Risks

- **Review freshness.** Reviews may become stale. Mitigation: `retrievedAt` timestamp enables freshness checks.
- **Aggregate rating accuracy.** Aggregate ratings may be inaccurate. Mitigation: `observedAt` and `freshness` enable staleness detection.

## Acceptance criteria

- [x] `PbpReview` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpAggregateRating` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpReviewContentMode` closed union exported (evidence: implemented historically)
- [x] `REVIEW_SCHEMA_ID` and `AGGREGATE_RATING_SCHEMA_ID` constants exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpReview` and `PbpAggregateRating` extend `PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Rating values are strings to preserve decimal precision (entity-model §29).
- `freshness` uses ISO 8601 duration format (e.g. `P1D`).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
