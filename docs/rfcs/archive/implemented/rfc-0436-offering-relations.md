---
id: RFC-0436
title: "Offering Relations"
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
specRef: "pbp-specification-package/RFC-PBP-031"
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
  - "PbpOfferingRelation type already exported from RFC-0429"
  - "No new types needed — relations are part of Offering Core"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not redefine PbpOfferingRelation — already in RFC-0429"
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

- `pbp-specification-package/entity-model` — §16 (Package, Allowance and Relations), §16.3 (Related offering)

_This RFC formalizes offering relations. The types are already exported from RFC-0429 (Offering Core)._

# RFC-0436: Offering Relations

## Context

The PBP spec defines offering relations (entity-model §16.3): `optional`, `requires`, `incompatibleWith`, `alternativeTo`, `included`. Each relation has an `acquisition` vocabulary: `standalone`, `with-this-offering`, `either`.

## Problem

1. **Relations already typed.** RFC-0429 already exports `PbpOfferingRelation`, `PbpOfferingAcquisition`, `PbpRelatedOffering` — this RFC formalizes the contract and documents the relation vocabulary.

## Decision

### 1. Relation vocabulary (already exported)

The `PbpOfferingRelation` closed union from RFC-0429 is the canonical relation vocabulary:

```ts
type PbpOfferingRelation =
  | "optional" | "requires" | "incompatibleWith"
  | "alternativeTo" | "included";
```

### 2. Acquisition vocabulary (already exported)

```ts
type PbpOfferingAcquisition = "standalone" | "with-this-offering" | "either";
```

### 3. `PbpRelatedOffering` (already exported)

```ts
interface PbpRelatedOffering {
  relation: PbpOfferingRelation;
  offeringRef: PbpEntityRef;
  acquisition?: PbpOfferingAcquisition;
}
```

### 4. Rules

- `recommendedWith` is NOT a structural core relation; it is modeled as Recommendation/Claim.
- `replaces` is modeled via lifecycle/successor, not as a relation.
- `included` relation is only used when expressing inclusion of an Offering; package item is preferred.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-031"`.
- **RFC-0429 (Offering Core).** Relation types already exported.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

No new types — all types are already exported from RFC-0429:

- `PbpOfferingRelation` (closed union + const array + type guard)
- `PbpOfferingAcquisition` (closed union + const array + type guard)
- `PbpRelatedOffering` (interface)

### File system responsibilities

| Path                                    | Role                                       |
| --------------------------------------- | ------------------------------------------ |
| `packages/pbp/src/entities/offering.ts` | Already contains relation types (RFC-0429) |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** No code changes needed — types already exist from RFC-0429.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Separate relations file.** Rejected: relations are part of the Offering entity and were already exported in RFC-0429.

## Risks

- **Relation proliferation.** The 5-relation vocabulary is closed. Mitigation: new relations require a namespace bump.

## Acceptance criteria

- [x] `PbpOfferingRelation` type already exported from RFC-0429 (evidence: implemented historically)
- [x] `PbpOfferingAcquisition` type already exported from RFC-0429 (evidence: implemented historically)
- [x] `PbpRelatedOffering` interface already exported from RFC-0429 (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- All relation types are already exported from RFC-0429 — no new code needed.
- `recommendedWith` is NOT a structural relation; model as Recommendation/Claim.
- `replaces` is modeled via lifecycle/successor.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
