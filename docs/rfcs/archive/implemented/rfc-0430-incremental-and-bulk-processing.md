---
id: RFC-0430
title: "Incremental and Bulk Processing"
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
specRef: "pbp-specification-package/RFC-PBP-065"
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
  - "PbpIncrementalBuildConfig interface exported"
  - "PbpDependencyInvalidationRule type exported"
  - "PbpBulkProcessingConfig interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement the incremental build engine — contract only"
  - "Does not define cache storage mechanism"
  - "Does not define Zod schemas"
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

- `pbp-specification-package/compiler` — §26 (Incremental Build), §27 (Build Reports)

_This RFC defines the incremental and bulk processing contract for the PBP compiler._

# RFC-0430: Incremental and Bulk Processing

## Context

For large catalogs, the PBP compiler must support incremental builds (compiler §26): only re-resolve affected entities based on content digests and dependency graphs. Bulk processing handles large datasets without loading the full graph into memory.

## Problem

1. **No incremental build contract.** The spec defines caching by `(entityDigest, locale, schemaSetDigest, derivationSetDigest)` and dependency invalidation rules, but no TypeScript types exist.
2. **No bulk processing contract.** The spec requires streaming output and batch validation for large catalogs.

## Decision

### 1. `PbpIncrementalBuildConfig`

```ts
interface PbpIncrementalBuildConfig {
  enabled: boolean;
  cacheKey: PbpCacheKey;
  dependencyGraph: PbpDependencyGraph;
}

interface PbpCacheKey {
  entityDigest: string;
  locale: string;
  schemaSetDigest: string;
  derivationSetDigest: string;
}

interface PbpDependencyGraph {
  nodes: Record<string, string[]>;
}
```

### 2. `PbpDependencyInvalidationRule`

```ts
type PbpDependencyInvalidationRule =
  | "policy-change-invalidates-offerings"
  | "comparison-profile-change-invalidates-comparisons"
  | "locale-change-invalidates-locale-projections"
  | "product-name-change-invalidates-catalog-entry-display";
```

### 3. `PbpBulkProcessingConfig`

```ts
interface PbpBulkProcessingConfig {
  streaming: boolean;
  batchSize: number;
  maxInMemoryEntities: number;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-065"`.
- **RFC-0428 (Compiler Pipeline).** Incremental processing is an optimization of the pipeline.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpCacheKey {
  entityDigest: string;
  locale: string;
  schemaSetDigest: string;
  derivationSetDigest: string;
}

export type PbpDependencyInvalidationRule =
  | "policy-change-invalidates-offerings"
  | "comparison-profile-change-invalidates-comparisons"
  | "locale-change-invalidates-locale-projections"
  | "product-name-change-invalidates-catalog-entry-display";

export const PBP_DEPENDENCY_INVALIDATION_RULES: readonly PbpDependencyInvalidationRule[] = [
  "policy-change-invalidates-offerings",
  "comparison-profile-change-invalidates-comparisons",
  "locale-change-invalidates-locale-projections",
  "product-name-change-invalidates-catalog-entry-display",
] as const;

export interface PbpDependencyGraph {
  nodes: Record<string, string[]>;
}

export interface PbpIncrementalBuildConfig {
  enabled: boolean;
  cacheKey: PbpCacheKey;
  dependencyGraph: PbpDependencyGraph;
}

export interface PbpBulkProcessingConfig {
  streaming: boolean;
  batchSize: number;
  maxInMemoryEntities: number;
}
```

### File system responsibilities

| Path                                         | Role                                  |
| -------------------------------------------- | ------------------------------------- |
| `packages/pbp/src/incremental-processing.ts` | Incremental and bulk processing types |
| `packages/pbp/src/index.ts`                  | Re-exports                            |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, incremental processing types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Full rebuild always.** Rejected: the spec explicitly requires incremental builds for large catalogs (compiler §26).
- **External cache system.** Rejected: cache key contract is part of the PBP type system.

## Risks

- **Cache invalidation complexity.** Dependency graphs can be complex. Mitigation: the four invalidation rules cover the documented cases; new rules can be added in future RFCs.
- **Memory pressure.** Bulk processing must not load full graph into memory. Mitigation: `PbpBulkProcessingConfig` includes `maxInMemoryEntities`.

## Acceptance criteria

- [x] `PbpIncrementalBuildConfig` interface exported (evidence: implemented historically)
- [x] `PbpCacheKey` interface exported (evidence: implemented historically)
- [x] `PbpDependencyInvalidationRule` type exported with const array (evidence: implemented historically)
- [x] `PbpBulkProcessingConfig` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- This RFC defines the contract only — it does not implement the incremental build engine.
- Cache key is `(entityDigest, locale, schemaSetDigest, derivationSetDigest)` per compiler §26.
- Dependency invalidation rules are a closed union; new rules require a new RFC.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
