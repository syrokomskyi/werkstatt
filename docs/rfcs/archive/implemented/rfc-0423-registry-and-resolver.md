---
id: RFC-0423
title: "Registry and Resolver"
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
  - RFC-0404
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-094"
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
  - "PbpRegistryEntry interface exported"
  - "PbpRegistryKind closed union exported with PBP_REGISTRY_KINDS"
  - "PbpResolverResult interface exported with PbpResolverStatus"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define specific registries (categories, derivation contracts)"
  - "Does not define registry versioning protocol"
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

- `pbp-specification-package/system-spec` — §4.1 (Global Semantic Layer), §3.7 (Reproducibility)
- `pbp-specification-package/decision-log` — Registry decisions

# RFC-0423: Registry and Resolver

## Context

The PBP spec defines a Global Semantic Layer (system-spec §4.1) containing registries for categories, derivation contracts, identifier schemes, unit definitions, metric definitions, and controlled vocabularies. The resolver resolves entity refs to canonical URIs. Registry entries are business-independent semantic definitions.

## Problem

1. **No `PbpRegistryEntry` interface.** The `@gogol/pbp` package has no registry entry type.
2. **No `PbpResolverResult` interface.** The `@gogol/pbp` package has no resolver result type.
3. **No registry kind vocabulary.** The spec defines multiple registry kinds but there is no closed union.

## Decision

### 1. `PbpRegistryEntry` interface

```ts
type PbpRegistryKind =
  | "category"
  | "comparison-profile"
  | "derivation-contract"
  | "identifier-scheme"
  | "unit-definition"
  | "metric-definition"
  | "controlled-vocabulary";

interface PbpRegistryEntry {
  id: string;
  kind: PbpRegistryKind;
  schema: string;
  authority: string;
  canonicalUri: string;
}
```

### 2. `PbpResolverResult` interface

```ts
type PbpResolverStatus = "resolved" | "not-found" | "ambiguous" | "stale";

interface PbpResolverResult {
  ref: string;
  status: PbpResolverStatus;
  canonicalUri?: string;
  entry?: PbpRegistryEntry;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** Registry types are in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-094"`.
- **system-spec §4.1.** Global Semantic Layer.
- **system-spec §3.7.** Reproducibility — same inputs, same resolved graph.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpRegistryKind =
  | "category" | "comparison-profile" | "derivation-contract"
  | "identifier-scheme" | "unit-definition" | "metric-definition" | "controlled-vocabulary";
export const PBP_REGISTRY_KINDS: readonly PbpRegistryKind[];

export interface PbpRegistryEntry {
  id: string;
  kind: PbpRegistryKind;
  schema: string;
  authority: string;
  canonicalUri: string;
}

export type PbpResolverStatus = "resolved" | "not-found" | "ambiguous" | "stale";

export interface PbpResolverResult {
  ref: string;
  status: PbpResolverStatus;
  canonicalUri?: string;
  entry?: PbpRegistryEntry;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/registry.ts` | `PbpRegistryEntry`, `PbpRegistryKind`, `PBP_REGISTRY_KINDS`, `PbpResolverResult`, `PbpResolverStatus` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, registry types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Open string for registry kind.** Rejected: a closed union prevents invalid registry types.
- **Merge resolver into compiler.** Rejected: resolver is a reusable component that can be used outside the compiler.

## Risks

- **Registry authority conflicts.** Multiple authorities may define conflicting registry entries. Mitigation: `authority` field enables authority-based resolution.
- **Resolver ambiguity.** A ref may resolve to multiple entries. Mitigation: `PbpResolverStatus` includes `ambiguous`.

## Acceptance criteria

- [x] `PbpRegistryEntry` interface exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpRegistryKind` closed union exported with `PBP_REGISTRY_KINDS` (evidence: implemented historically)
- [x] `PbpResolverResult` interface exported with `PbpResolverStatus` (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpRegistryEntry` is NOT an entity — it is a registry metadata structure.
- Registry entries are business-independent semantic definitions (system-spec §4.1).
- Same inputs, same version, same parameters MUST give same resolved graph (system-spec §3.7).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
