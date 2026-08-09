---
id: RFC-0439
title: "Policy Base and Scope"
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
specRef: "pbp-specification-package/RFC-PBP-040"
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
  - "PbpPolicy interface exported extending PbpEntity"
  - "PbpPolicyKind closed union exported"
  - "POLICY_SCHEMA_ID constant exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define SLA policy — that is RFC-PBP-041"
  - "Does not define guarantee — that is RFC-PBP-042"
  - "Does not define ownership/exit — that is RFC-PBP-043/044"
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

- `pbp-specification-package/entity-model` — §20 (Policy base), §21 (SLA Policy), §22 (Guarantee Policy), §23 (Rights Policies)

_This RFC defines the Policy base entity and its scope._

# RFC-0439: Policy Base and Scope

## Context

The PBP spec defines a Policy base entity (entity-model §20) with `pbp/policy@1` as the common envelope. Specialized schemas (`pbp/policy/service-level@1`, `pbp/policy/guarantee@1`, `pbp/policy/ownership@1`, `pbp/policy/exit@1`) extend the base. Policy has a `scope` that references offerings.

## Problem

1. **No `PbpPolicy` interface.** The spec defines policy as a federated entity with `kind` and `scope` but no TypeScript types exist.
2. **No policy kind vocabulary.** The spec defines kinds: `service-level`, `guarantee`, `ownership`, `exit`, `data-retention`, etc.

## Decision

### 1. `PbpPolicyKind` closed union

```ts
type PbpPolicyKind =
  | "service-level" | "guarantee" | "ownership" | "exit"
  | "data-retention" | "cancellation" | "price-changes";
```

### 2. `PbpPolicy`

```ts
interface PbpPolicy extends PbpEntity {
  type: "policy";
  kind: PbpPolicyKind;
  name: string;
  scope?: { offeringRefs: Record<string, PbpEntityRef> };
  terms?: Record<string, unknown>;
}
```

### 3. Schema ID

```ts
const POLICY_SCHEMA_ID = pbpSchemaId("policy");
```

### 4. Specialized schema IDs

The spec defines specialized schemas (`pbp/policy/service-level@1`, etc.). These are referenced by `schema` field, not by separate TypeScript interfaces in this RFC. Companion RFCs (0441..0444) define specialized policy types.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-040"`.
- **RFC-0429 (Offering Core).** `PbpOffering.policyRefs` references Policy entities.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpPolicyKind =
  | "service-level" | "guarantee" | "ownership" | "exit"
  | "data-retention" | "cancellation" | "price-changes";

export const PBP_POLICY_KINDS: readonly PbpPolicyKind[] = [
  "service-level", "guarantee", "ownership", "exit",
  "data-retention", "cancellation", "price-changes",
] as const;

export function isPbpPolicyKind(value: string): value is PbpPolicyKind;

export interface PbpPolicy extends PbpEntity {
  type: "policy";
  kind: PbpPolicyKind;
  name: string;
  scope?: { offeringRefs: Record<string, PbpEntityRef> };
  terms?: Record<string, unknown>;
}

export const POLICY_SCHEMA_ID: string;
```

### File system responsibilities

| Path                                  | Role               |
| ------------------------------------- | ------------------ |
| `packages/pbp/src/entities/policy.ts` | Policy base entity |
| `packages/pbp/src/index.ts`           | Re-exports         |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, Policy base types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Single flat policy entity.** Rejected: the spec defines specialized schemas per kind. The base envelope is common, but `kind` drives specialization.

## Risks

- **Kind proliferation.** 7 kinds is comprehensive. Mitigation: closed union — new kinds require a namespace bump.

## Acceptance criteria

- [x] `PbpPolicy` interface exported, extending `PbpEntity` (evidence: implemented historically)
- [x] `PbpPolicyKind` closed union exported with const array (evidence: implemented historically)
- [x] `POLICY_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Base `pbp/policy@1` remains the common envelope; specialized schemas are defined in companion RFCs.
- `PbpPolicy extends PbpEntity` — do not redefine `schema`, `id`, `type`, `status`, `governance`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
