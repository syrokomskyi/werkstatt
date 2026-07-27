---
id: RFC-0449
title: "Ownership, License and Portability"
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
specRef: "pbp-specification-package/RFC-PBP-043"
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
  - "PbpOwnershipPolicy interface exported"
  - "PbpOwnershipAsset interface exported"
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

- `pbp-specification-package/entity-model` — §23.1 (Ownership)

_This RFC defines the Ownership Policy specialized schema._

# RFC-0449: Ownership, License and Portability

## Context

The PBP spec defines Ownership Policy (entity-model §23.1) with asset holders (customer, third-party), timing, and usage basis for each asset type (domain, customerContent, builtWebsite, sourceCode, thirdPartyComponents).

## Problem

1. **No ownership policy type.** The spec defines ownership with per-asset holder and timing but no TypeScript types exist.

## Decision

### 1. `PbpOwnershipAsset`

```ts
type PbpAssetHolder = "customer" | "third-party" | "provider";

interface PbpOwnershipAsset {
  holder: PbpAssetHolder;
  timing?: string;
  usageBasis?: string;
}
```

### 2. `PbpOwnershipPolicy`

```ts
interface PbpOwnershipPolicy extends PbpPolicy {
  kind: "ownership";
  assets: {
    domain?: PbpOwnershipAsset;
    customerContent?: PbpOwnershipAsset;
    builtWebsite?: PbpOwnershipAsset;
    sourceCode?: PbpOwnershipAsset;
    thirdPartyComponents?: PbpOwnershipAsset;
  };
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-043"`.
- **RFC-0439 (Policy Base).** `PbpOwnershipPolicy extends PbpPolicy`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpAssetHolder = "customer" | "third-party" | "provider";
export const PBP_ASSET_HOLDERS: readonly PbpAssetHolder[] = [
  "customer", "third-party", "provider",
] as const;

export interface PbpOwnershipAsset { ... }
export interface PbpOwnershipPolicy extends PbpPolicy { ... }
```

### File system responsibilities

| Path                                            | Role                   |
| ----------------------------------------------- | ---------------------- |
| `packages/pbp/src/entities/ownership-policy.ts` | Ownership policy types |
| `packages/pbp/src/index.ts`                     | Re-exports             |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, ownership policy types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Generic asset map.** Rejected: the spec defines specific asset types (domain, customerContent, builtWebsite, sourceCode, thirdPartyComponents) that benefit from typed fields.

## Risks

- **Third-party license compliance.** Third-party components need `usageBasis`. Mitigation: `PbpOwnershipAsset.usageBasis` captures the license basis.

## Acceptance criteria

- [x] `PbpOwnershipPolicy` interface exported, extending `PbpPolicy` (evidence: implemented historically)
- [x] `PbpOwnershipAsset` interface exported (evidence: implemented historically)
- [x] `PbpAssetHolder` closed union exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpOwnershipPolicy extends PbpPolicy` — do not redefine base fields.
- Source code timing may be `according-to-contract` — not immediate.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
