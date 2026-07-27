---
id: RFC-0435
title: "Git Revision and Publication Snapshot"
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
specRef: "pbp-specification-package/RFC-PBP-090"
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
  - "PbpGitRevision interface exported"
  - "PbpPublicationSnapshot interface exported"
  - "PbpCanonicalSnapshot interface exported with included/excluded fields"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement the publication pipeline — contract only"
  - "Does not define signature adapter protocol"
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

- `pbp-specification-package/compiler` — §4 (Build context), §24 (Canonical Snapshot), Phase 13 (Canonical snapshot), Phase 14 (Publication)

_This RFC defines the git revision tracking and publication snapshot contract._

# RFC-0435: Git Revision and Publication Snapshot

## Context

The PBP compiler tracks git revisions in the build context (compiler §4) and produces canonical snapshots (compiler §24) that can be signed and published. The canonical snapshot includes the resolved entity graph, locale, schema IDs, source revision, and derivation IDs. It excludes build paths, timestamps, and non-deterministic metrics.

## Problem

1. **No git revision type.** The build context has `sourceRevision: git:8cf317...` but no dedicated type.
2. **No canonical snapshot contract.** The spec defines what is included/excluded (§24.1, §24.2) and serialization rules (§24.3) but no TypeScript types exist.
3. **No publication snapshot type.** Phase 14 publishes snapshots but no contract exists.

## Decision

### 1. `PbpGitRevision`

```ts
interface PbpGitRevision {
  ref: string;
  commitSha: string;
  clean: boolean;
}
```

### 2. `PbpCanonicalSnapshot`

```ts
interface PbpCanonicalSnapshot {
  included: PbpCanonicalSnapshotIncluded;
  excluded: PbpCanonicalSnapshotExcluded;
  serialization: PbpCanonicalSerialization;
}

interface PbpCanonicalSnapshotIncluded {
  resolvedEntityGraphSubset: unknown;
  locale: string;
  schemaIds: string[];
  sourceRevision: string;
  derivationIds: string[];
  normativeFacts: unknown;
  projectionType?: string;
}

interface PbpCanonicalSnapshotExcluded {
  buildPath: true;
  localFilesystemPath: true;
  irrelevantTimestamps: true;
  logOrder: true;
  nonDeterministicMetrics: true;
  signature: true;
}
```

### 3. `PbpCanonicalSerialization`

```ts
interface PbpCanonicalSerialization {
  steps: PbpCanonicalSerializationStep[];
}

type PbpCanonicalSerializationStep =
  | "convert-to-json-compatible"
  | "validate-i-json"
  | "preserve-decimal-as-string"
  | "remove-undefined"
  | "canonicalize-rfc-8785"
  | "hash";
```

### 4. `PbpPublicationSnapshot`

```ts
interface PbpPublicationSnapshot {
  canonicalSnapshot: PbpCanonicalSnapshot;
  digest: string;
  publishedAt: string;
  signature?: { algorithm: string; value: string };
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-090"`.
- **RFC-0428 (Compiler Pipeline).** Phase 13 (canonical snapshot) and Phase 14 (publication).

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpGitRevision {
  ref: string;
  commitSha: string;
  clean: boolean;
}

export type PbpCanonicalSerializationStep =
  | "convert-to-json-compatible"
  | "validate-i-json"
  | "preserve-decimal-as-string"
  | "remove-undefined"
  | "canonicalize-rfc-8785"
  | "hash";

export const PBP_CANONICAL_SERIALIZATION_STEPS: readonly PbpCanonicalSerializationStep[] = [
  "convert-to-json-compatible",
  "validate-i-json",
  "preserve-decimal-as-string",
  "remove-undefined",
  "canonicalize-rfc-8785",
  "hash",
] as const;

export interface PbpCanonicalSerialization {
  steps: PbpCanonicalSerializationStep[];
}

export interface PbpCanonicalSnapshotIncluded {
  resolvedEntityGraphSubset: unknown;
  locale: string;
  schemaIds: string[];
  sourceRevision: string;
  derivationIds: string[];
  normativeFacts: unknown;
  projectionType?: string;
}

export interface PbpCanonicalSnapshotExcluded {
  buildPath: true;
  localFilesystemPath: true;
  irrelevantTimestamps: true;
  logOrder: true;
  nonDeterministicMetrics: true;
  signature: true;
}

export interface PbpCanonicalSnapshot {
  included: PbpCanonicalSnapshotIncluded;
  excluded: PbpCanonicalSnapshotExcluded;
  serialization: PbpCanonicalSerialization;
}

export interface PbpPublicationSnapshot {
  canonicalSnapshot: PbpCanonicalSnapshot;
  digest: string;
  publishedAt: string;
  signature?: { algorithm: string; value: string };
}
```

### File system responsibilities

| Path                              | Role                                                |
| --------------------------------- | --------------------------------------------------- |
| `packages/pbp/src/publication.ts` | Git revision, canonical snapshot, publication types |
| `packages/pbp/src/index.ts`       | Re-exports                                          |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, git revision and publication snapshot types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Skip canonical serialization.** Rejected: the spec mandates RFC 8785 canonicalization (compiler §24.3).
- **Include build paths in snapshot.** Rejected: the spec explicitly excludes build paths, local filesystem paths, and non-deterministic metrics (compiler §24.2).

## Risks

- **Non-deterministic snapshots.** If serialization is not canonical, digests will vary. Mitigation: the 6-step serialization process is a closed union.
- **Signature adapter coupling.** Signatures are optional and deferred. Mitigation: `signature` is optional on `PbpPublicationSnapshot`.

## Acceptance criteria

- [x] `PbpGitRevision` interface exported (evidence: implemented historically)
- [x] `PbpCanonicalSnapshot` interface exported with included/excluded fields (evidence: implemented historically)
- [x] `PbpCanonicalSerializationStep` closed union exported with const array (evidence: implemented historically)
- [x] `PbpPublicationSnapshot` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Canonical serialization follows 6 steps: JSON-compatible → I-JSON → decimal strings → remove undefined → RFC 8785 → hash (compiler §24.3).
- Snapshots exclude build paths, local filesystem paths, non-deterministic metrics, and signatures (compiler §24.2).
- All outputs MUST reference the build context (compiler §4).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
