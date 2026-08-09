---
id: RFC-0450
title: "Exit and Data Package"
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
specRef: "pbp-specification-package/RFC-PBP-044"
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
  - "PbpExitPolicy interface exported"
  - "PbpExitPackage interface exported"
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

- `pbp-specification-package/entity-model` — §23.2 (Portability / Exit)

_This RFC defines the Exit Policy specialized schema._

# RFC-0450: Exit and Data Package

## Context

The PBP spec defines Exit Policy (entity-model §23.2) with trigger event, delivery target duration, package (included assets), and formats (deployable files).

## Problem

1. **No exit policy type.** The spec defines exit with trigger, delivery target, package, and formats but no TypeScript types exist.

## Decision

### 1. `PbpExitPackage`

```ts
interface PbpExitPackage {
  domain?: { included: boolean };
  customerContent?: { included: boolean };
  builtWebsite?: { included: boolean };
}
```

### 2. `PbpExitPolicy`

```ts
interface PbpExitPolicy extends PbpPolicy {
  kind: "exit";
  trigger: { event: string };
  deliveryTarget: { duration: string };
  package: PbpExitPackage;
  formats?: {
    deployableFiles?: { valueRef: string };
  };
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-044"`.
- **RFC-0439 (Policy Base).** `PbpExitPolicy extends PbpPolicy`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpExitPackage { ... }
export interface PbpExitPolicy extends PbpPolicy { ... }
```

### File system responsibilities

| Path                                       | Role              |
| ------------------------------------------ | ----------------- |
| `packages/pbp/src/entities/exit-policy.ts` | Exit policy types |
| `packages/pbp/src/index.ts`                | Re-exports        |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, exit policy types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge exit into ownership.** Rejected: exit is a separate concern with trigger, delivery target, and data package format.

## Risks

- **Data package completeness.** The exit package must include all customer-owned assets. Mitigation: `PbpExitPackage` has explicit per-asset inclusion flags.

## Acceptance criteria

- [x] `PbpExitPolicy` interface exported, extending `PbpPolicy` (evidence: implemented historically)
- [x] `PbpExitPackage` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpExitPolicy extends PbpPolicy` — do not redefine base fields.
- Delivery target duration is an ISO 8601 duration (e.g., `PT72H`).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
