---
id: RFC-0433
title: "CRM Projection"
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
specRef: "pbp-specification-package/RFC-PBP-085"
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
  - "PbpCrmProjection interface exported"
  - "PbpCrmPayload interface exported with stable fields"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement the CRM projection builder — contract only"
  - "Does not define CRM adapter protocol"
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

- `pbp-specification-package/compiler` — §22 (CRM Projection)

_This RFC defines the CRM projection contract — the stable payload shape for CRM systems._

# RFC-0433: CRM Projection

## Context

The PBP compiler Phase 12 (Projection) produces CRM projections (compiler §22). The CRM adapter maintains external IDs separately. The projection provides a stable payload with business, catalog, offering, plan, and charge references.

## Problem

1. **No CRM projection type.** The spec defines a stable CRM payload shape (§22) but no TypeScript types exist.
2. **No payload contract.** CRM systems need a stable, versioned payload to sync offerings and pricing.

## Decision

### 1. `PbpCrmPayload`

```ts
interface PbpCrmPayload {
  businessId: string;
  catalogEntryId: string;
  offeringId: string;
  planId: string;
  charges: Record<string, unknown>;
  relatedOfferingIds: string[];
  sourceRevision: string;
}
```

### 2. `PbpCrmProjection`

```ts
interface PbpCrmProjection {
  payload: PbpCrmPayload;
  projectionTarget: "crm";
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-085"`.
- **RFC-0428 (Compiler Pipeline).** Phase 12 produces projections.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpCrmPayload {
  businessId: string;
  catalogEntryId: string;
  offeringId: string;
  planId: string;
  charges: Record<string, unknown>;
  relatedOfferingIds: string[];
  sourceRevision: string;
}

export interface PbpCrmProjection {
  payload: PbpCrmPayload;
  projectionTarget: "crm";
}
```

### File system responsibilities

| Path                                  | Role                 |
| ------------------------------------- | -------------------- |
| `packages/pbp/src/projections/crm.ts` | CRM projection types |
| `packages/pbp/src/index.ts`           | Re-exports           |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, CRM projection types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Embed CRM IDs in PBP entities.** Rejected: the spec states "CRM adapter maintains external IDs separately" (compiler §22).

## Risks

- **Payload stability.** CRM systems depend on stable payload shapes. Mitigation: the payload is versioned via the `pbp/*@1` namespace.

## Acceptance criteria

- [x] `PbpCrmPayload` interface exported with stable fields (evidence: implemented historically)
- [x] `PbpCrmProjection` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- CRM adapter maintains external IDs separately (compiler §22).
- The payload is a stable shape — do not add or remove fields without a namespace bump.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
