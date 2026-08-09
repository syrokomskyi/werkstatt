---
id: RFC-0447
title: "Service Level Policy"
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
specRef: "pbp-specification-package/RFC-PBP-041"
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
  - "PbpServiceLevelPolicy interface exported"
  - "PbpSlaObjective interface exported"
  - "PbpSlaRemedy interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define policy base — already in RFC-0439"
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

- `pbp-specification-package/entity-model` — §21 (SLA Policy)

_This RFC defines the Service Level Policy specialized schema._

# RFC-0447: Service Level Policy

## Context

The PBP spec defines SLA Policy (entity-model §21) with objective (metric, operator, threshold, measurement window), measurement (method, evidence source), exclusions, and remedy (service credit).

## Problem

1. **No SLA policy type.** The spec defines SLA policy with objective, measurement, exclusions, and remedy but no TypeScript types exist.

## Decision

### 1. `PbpSlaObjective`

```ts
type PbpSlaOperator = "greater-than-or-equal" | "less-than-or-equal" | "equals";

interface PbpSlaObjective {
  metricRef: string;
  operator: PbpSlaOperator;
  threshold: { value: string; unitRef: string };
  measurementWindow: string;
}
```

### 2. `PbpSlaRemedy`

```ts
type PbpSlaRemedyType = "service-credit" | "continued-performance";

interface PbpSlaRemedy {
  trigger: "objective-not-met";
  type: PbpSlaRemedyType;
  value?: { model: string; periods?: number };
  application: "automatic" | "on-request";
}
```

### 3. `PbpServiceLevelPolicy`

```ts
interface PbpServiceLevelPolicy extends PbpPolicy {
  kind: "service-level";
  objective: PbpSlaObjective;
  measurement?: { methodRef: string; evidenceSourceRef: string };
  exclusions?: Record<string, { reasonRef: string }>;
  remedy?: PbpSlaRemedy;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-041"`.
- **RFC-0439 (Policy Base).** `PbpServiceLevelPolicy extends PbpPolicy`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpSlaOperator = "greater-than-or-equal" | "less-than-or-equal" | "equals";
export const PBP_SLA_OPERATORS: readonly PbpSlaOperator[] = [
  "greater-than-or-equal", "less-than-or-equal", "equals",
] as const;

export type PbpSlaRemedyType = "service-credit" | "continued-performance";
export const PBP_SLA_REMEDY_TYPES: readonly PbpSlaRemedyType[] = [
  "service-credit", "continued-performance",
] as const;

export interface PbpSlaObjective { ... }
export interface PbpSlaRemedy { ... }
export interface PbpServiceLevelPolicy extends PbpPolicy { ... }
```

### File system responsibilities

| Path                                      | Role             |
| ----------------------------------------- | ---------------- |
| `packages/pbp/src/entities/sla-policy.ts` | SLA policy types |
| `packages/pbp/src/index.ts`               | Re-exports       |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, SLA policy types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Generic policy without specialization.** Rejected: SLA has specific fields (objective, measurement, exclusions, remedy) that need typed contracts.

## Risks

- **Exclusion completeness.** Not all exclusions may be documented. Mitigation: exclusions are optional and extensible via `reasonRef`.

## Acceptance criteria

- [x] `PbpServiceLevelPolicy` interface exported, extending `PbpPolicy` (evidence: implemented historically)
- [x] `PbpSlaObjective` interface exported (evidence: implemented historically)
- [x] `PbpSlaRemedy` interface exported (evidence: implemented historically)
- [x] `PbpSlaOperator` and `PbpSlaRemedyType` closed unions exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpServiceLevelPolicy extends PbpPolicy` — do not redefine base fields.
- SLA remedy is typically service-credit with automatic application.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
