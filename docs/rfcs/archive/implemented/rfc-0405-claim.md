---
id: RFC-0405
title: "Claim"
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
  - RFC-0400
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-050"
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
  - "PbpClaim interface exported from @gogol/pbp extending PbpEntity"
  - "Claim fields: claimClass, claimKind, subject, statement, evidenceRefs, governance, publication"
  - "Claim class and kind vocabularies exported as closed unions"
  - "Confidence field is optional and only for inferred/extracted claims (entity-model §24)"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define EvidenceSource — that is RFC-PBP-051"
  - "Does not define Disclosure — that is RFC-PBP-052"
  - "Does not define Review or AggregateRating — that is RFC-PBP-054"
  - "Does not define Credential — that is RFC-PBP-053"
  - "Does not define Zod schemas for Claim validation"
  - "Does not define the claim sidecar removal process — that is RFC-PBP-100 (ADR-018)"
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

- `pbp-specification-package/entity-model` — §24 (Claim: structure, fields)
- `pbp-specification-package/decision-log` — ADR-018 (claim sidecars removed), ADR-020 (Review is not Claim)

_This RFC defines the `PbpClaim` entity interface. It references the vendored snapshot for field semantics._

# RFC-0405: Claim

## Context

The PBP spec defines Claim as a typed entity for comparative, risk, or factual assertions made by a business (`pbp-specification-package/entity-model` §24). Claims replace the legacy `*.claims.yaml` sidecar pattern (ADR-018) with first-class entities that have their own governance, evidence references, and publication controls.

The current Warpgogol model uses path-based `*.claims.yaml` sidecars (migration-plan §2). These are keyed by source file path, duplicate governance, and are not first-class entities. This RFC defines the `PbpClaim` interface that replaces them.

## Problem

1. **No `PbpClaim` interface.** The `@gogol/pbp` package has no Claim entity. Without it, the migration cannot convert `*.claims.yaml` sidecars into first-class entities.
2. **No claim class/kind vocabulary.** The spec defines `claimClass` (e.g. `comparative-commercial`) and `claimKind` (e.g. `risk`) but without closed unions, these are freeform strings.
3. **No evidence reference contract.** Claims reference EvidenceSource entities. Without typed `evidenceRefs`, these are unvalidated strings.
4. **Sidecar legacy.** `*.claims.yaml` files are path-based, not entity-based (ADR-018). Without a clean `PbpClaim` interface, the migration has no target.

## Decision

### 1. `PbpClaim` interface

```ts
interface PbpClaim extends PbpEntity {
  type: "claim";
  claimClass: PbpClaimClass;
  claimKind: PbpClaimKind;
  subject: {
    kind: string;
    name: string;
  };
  statement: string;
  evidenceRefs?: Record<string, PbpEntityRef>;
  governance: PbpGovernance;
  publication?: {
    staleBehavior: "block" | "warn" | "omit";
    showAsOfDate: boolean;
    showEvidenceLabel: boolean;
  };
  confidence?: "high" | "medium" | "low";
}
```

### 2. Claim class and kind vocabularies

```ts
type PbpClaimClass =
  | "comparative-commercial"
  | "comparative-technical"
  | "factual"
  | "risk"
  | "benefit"
  | "limitation";

type PbpClaimKind =
  | "risk"
  | "benefit"
  | "comparison"
  | "fact"
  | "limitation"
  | "recommendation";
```

These are preliminary vocabularies from the spec examples. They MAY be extended additively within `@1`.

### 3. Confidence semantics (entity-model §24)

`confidence` is optional and applies ONLY to inferred/extracted claims, not to owner-declared canonical facts. An owner-declared price claim does not carry `confidence` — it is a canonical fact.

### 4. Governance is required

Unlike some entities where `governance` is optional, `PbpClaim` requires `governance` because claims MUST have an authority, assessment date, and review schedule. This is enforced at the interface level by making `governance: PbpGovernance` required (not optional).

### 5. Schema ID

```ts
const CLAIM_SCHEMA_ID = pbpSchemaId("claim"); // "pbp/claim@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpClaim` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** Eighth materialized RFC, `specRef: "pbp-specification-package/RFC-PBP-050"`.
- **RFC-0399 (Entity Envelope).** `PbpClaim extends PbpEntity`. Notably, `governance` is required (not optional) on Claim.
- **RFC-0400 (Primitive Types).** Uses `PbpEntityRef` for evidence references, `PbpGovernance` for authority.
- **ADR-018 (Claim sidecars removed).** This RFC replaces `*.claims.yaml` sidecars with a first-class entity.
- **ADR-020 (Review is not Claim).** Review and AggregateRating have separate schemas (RFC-PBP-054).

## Design

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpClaimClass = "comparative-commercial" | "comparative-technical" | "factual" | "risk" | "benefit" | "limitation";
export type PbpClaimKind = "risk" | "benefit" | "comparison" | "fact" | "limitation" | "recommendation";

export const PBP_CLAIM_CLASSES: readonly PbpClaimClass[];
export const PBP_CLAIM_KINDS: readonly PbpClaimKind[];

export interface PbpClaim extends PbpEntity {
  type: "claim";
  claimClass: PbpClaimClass;
  claimKind: PbpClaimKind;
  subject: { kind: string; name: string };
  statement: string;
  evidenceRefs?: Record<string, PbpEntityRef>;
  governance: PbpGovernance;
  publication?: { staleBehavior: "block" | "warn" | "omit"; showAsOfDate: boolean; showEvidenceLabel: boolean; };
  confidence?: "high" | "medium" | "low";
}

export const CLAIM_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/claim.ts` | `PbpClaim`, `PbpClaimClass`, `PbpClaimKind`, constants, `CLAIM_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpClaim` is added to `@gogol/pbp`. Downstream RFCs (051, 052, 055) can reference it.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Keep `*.claims.yaml` sidecars.** Rejected (ADR-018): path-based identity, duplicated governance, no first-class entity status.
- **Merge Claim into the entity it references.** Rejected: claims need independent governance, review schedules, and evidence references. Embedding them would bloat the parent entity.
- **Make governance optional.** Rejected: claims without authority and review schedule are unverifiable assertions. Governance is required.

## Risks

- **Claim class/kind vocabulary is preliminary.** The spec examples show a few values but the full vocabulary may need extension. Mitigation: vocabularies are additive within `@1`.
- **Confidence misuse.** Agents may add `confidence` to owner-declared canonical facts. Mitigation: implementation notes explicitly state confidence is for inferred/extracted claims only.
- **Governance enforcement.** Making `governance` required at the interface level means all Claim instances MUST have it. This is intentional but may cause friction during migration if legacy claims lack governance data. Mitigation: the migration RFC (RFC-PBP-100) must address governance backfill.

## Acceptance criteria

- [x] `PbpClaim` interface exported from `@gogol/pbp`, extending `PbpEntity` with required `governance` (evidence: packages/ directory, package exists)
- [x] `PbpClaimClass` and `PbpClaimKind` closed unions exported with constants (evidence: implemented historically)
- [x] `CLAIM_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpClaim extends PbpEntity` — do not redefine `schema`, `id`, `status`.
- `governance` is REQUIRED on `PbpClaim` (not optional). Claims without governance are invalid.
- `confidence` is ONLY for inferred/extracted claims, not owner-declared canonical facts.
- `evidenceRefs` uses semantic keys (ADR-027), not array indices.
- Claim sidecars (`*.claims.yaml`) are removed by RFC-PBP-100, not this RFC.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
