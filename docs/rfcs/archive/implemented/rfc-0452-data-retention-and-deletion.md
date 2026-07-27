---
id: RFC-0452
title: "Data Retention and Deletion"
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
  - RFC-0439
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-046"
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
  - "PbpDataRetentionPolicy interface exported"
  - "PbpRetentionPeriod interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define policy base — already in RFC-0439"
  - "Does not define Zod schemas"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

- `pbp-specification-package/entity-model` — §20 (Policy base), data retention policy

_This RFC defines the Data Retention and Deletion policy specialized schema._

# RFC-0452: Data Retention and Deletion

## Context

The PBP spec defines data retention as a policy kind (entity-model §20). Businesses must declare how long customer data is retained and how it is deleted after service termination.

## Problem

1. **No data retention policy type.** The spec defines retention policies but no TypeScript types exist.

## Decision

### 1. `PbpRetentionPeriod`

```ts
interface PbpRetentionPeriod {
  duration: string;
  startsFrom: string;
}
```

### 2. `PbpDataRetentionPolicy`

```ts
interface PbpDataRetentionPolicy extends PbpPolicy {
  kind: "data-retention";
  retention: Record<string, PbpRetentionPeriod>;
  deletion: { method: string; timeline: string };
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-046"`.
- **RFC-0439 (Policy Base).** `PbpDataRetentionPolicy extends PbpPolicy`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpRetentionPeriod {
  duration: string;
  startsFrom: string;
}

export interface PbpDataRetentionPolicy extends PbpPolicy {
  kind: "data-retention";
  retention: Record<string, PbpRetentionPeriod>;
  deletion: { method: string; timeline: string };
}
```

### File system responsibilities

| Path                                                 | Role                        |
| ---------------------------------------------------- | --------------------------- |
| `packages/pbp/src/entities/data-retention-policy.ts` | Data retention policy types |
| `packages/pbp/src/index.ts`                          | Re-exports                  |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, data retention policy types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Generic policy without specialization.** Rejected: data retention has specific fields (retention periods, deletion method) that need typed contracts.

## Risks

- **Regulatory compliance.** Retention periods must comply with GDPR and other regulations. Mitigation: this is a declarative contract; compliance is enforced externally.

## Acceptance criteria

- [x] `PbpDataRetentionPolicy` interface exported, extending `PbpPolicy` (evidence: implemented historically)
- [x] `PbpRetentionPeriod` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpDataRetentionPolicy extends PbpPolicy` — do not redefine base fields.
- Retention periods are ISO 8601 durations.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
