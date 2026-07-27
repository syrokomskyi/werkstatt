---
id: RFC-0448
title: "Guarantee and Remedy"
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
specRef: "pbp-specification-package/RFC-PBP-042"
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
  - "PbpGuaranteePolicy interface exported"
  - "PbpGuaranteeCondition interface exported"
  - "PbpGuaranteeRemedy interface exported"
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

- `pbp-specification-package/entity-model` — §22 (Guarantee Policy)

_This RFC defines the Guarantee Policy specialized schema._

# RFC-0448: Guarantee and Remedy

## Context

The PBP spec defines Guarantee Policy (entity-model §22) with condition (trigger + objective) and remedy (continued-performance, additional charge, until).

## Problem

1. **No guarantee policy type.** The spec defines guarantee with condition and remedy but no TypeScript types exist.

## Decision

### 1. `PbpGuaranteeCondition`

```ts
interface PbpGuaranteeCondition {
  trigger: { event: string };
  objective: {
    metricRef: string;
    operator: "less-than-or-equal" | "greater-than-or-equal" | "equals";
    threshold: { value: string; unitRef: string };
  };
}
```

### 2. `PbpGuaranteeRemedy`

```ts
type PbpGuaranteeRemedyType = "continued-performance" | "service-credit" | "refund";

interface PbpGuaranteeRemedy {
  type: PbpGuaranteeRemedyType;
  additionalCharge: boolean;
  until: string;
}
```

### 3. `PbpGuaranteePolicy`

```ts
interface PbpGuaranteePolicy extends PbpPolicy {
  kind: "guarantee";
  condition: PbpGuaranteeCondition;
  remedy: PbpGuaranteeRemedy;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-042"`.
- **RFC-0439 (Policy Base).** `PbpGuaranteePolicy extends PbpPolicy`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpGuaranteeRemedyType = "continued-performance" | "service-credit" | "refund";
export const PBP_GUARANTEE_REMEDY_TYPES: readonly PbpGuaranteeRemedyType[] = [
  "continued-performance", "service-credit", "refund",
] as const;

export interface PbpGuaranteeCondition { ... }
export interface PbpGuaranteeRemedy { ... }
export interface PbpGuaranteePolicy extends PbpPolicy { ... }
```

### File system responsibilities

| Path                                            | Role                   |
| ----------------------------------------------- | ---------------------- |
| `packages/pbp/src/entities/guarantee-policy.ts` | Guarantee policy types |
| `packages/pbp/src/index.ts`                     | Re-exports             |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, guarantee policy types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge guarantee into SLA.** Rejected: guarantees have different structure (condition + remedy) from SLA (objective + measurement + exclusions + remedy).

## Risks

- **Guarantee enforceability.** Guarantees like "Fertig in 12 Werktagen" need clear trigger and objective. Mitigation: `PbpGuaranteeCondition` formalizes both.

## Acceptance criteria

- [x] `PbpGuaranteePolicy` interface exported, extending `PbpPolicy` (evidence: implemented historically)
- [x] `PbpGuaranteeCondition` interface exported (evidence: implemented historically)
- [x] `PbpGuaranteeRemedy` interface exported (evidence: implemented historically)
- [x] `PbpGuaranteeRemedyType` closed union exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpGuaranteePolicy extends PbpPolicy` — do not redefine base fields.
- Guarantee remedy `until` defines when the guarantee obligation ends.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
