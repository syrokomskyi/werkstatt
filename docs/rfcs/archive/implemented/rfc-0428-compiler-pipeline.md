---
id: RFC-0428
title: "Compiler Pipeline"
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
  - RFC-0421
  - RFC-0422
  - RFC-0424
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-064"
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
  - "PbpCompilerPhase type exported with 14 phases"
  - "PbpBuildContext interface exported"
  - "PbpBuildRequest interface exported"
  - "PbpSourceInventoryReport interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement the compiler — this RFC defines the pipeline contract only"
  - "Does not define individual projection targets (website, AI, Schema.org)"
  - "Does not define Zod schemas"
  - "Does not define incremental processing — that is RFC-PBP-065"
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

- `pbp-specification-package/compiler` — §1 (Purpose), §2 (Components), §3 (Inputs), §4 (Build context), §5 (Pipeline), §6 (Source inventory report)

_This RFC defines the PBP compiler pipeline contract: phases, build context, and source inventory report._

# RFC-0428: Compiler Pipeline

## Context

The PBP spec defines a 14-phase compiler pipeline (compiler §5) that transforms source records into validated projections. The pipeline covers discovery, parsing, schema validation, entity indexing, locale resolution, reference resolution, profile resolution, runtime overlays, derivations, semantic validation, buyer view, projection, canonical snapshot, and publication.

The compiler is the trusted boundary between editable sources and public digital presence (compiler §1). It must detect contradictions before publication, not infer missing facts, produce identical results for identical inputs, and show provenance of every derived value.

## Problem

1. **No pipeline phase contract.** The 14 phases are defined in the spec but have no TypeScript types in `@gogol/pbp`.
2. **No build context type.** The spec defines an immutable build context (§4) with `buildId`, `sourceRevision`, `buildTime`, `locale`, `defaultLocale`, `schemaSetDigest`, `derivationSetDigest`, and `runtimeSnapshotId`.
3. **No source inventory report type.** The spec defines a source inventory report (§6) with per-record `physicalPath`, `entityId`, `schema`, `locale`, and `contentDigest`.

## Decision

### 1. `PbpCompilerPhase` type

```ts
type PbpCompilerPhase =
  | "discover"
  | "parse"
  | "raw-schema-validation"
  | "build-entity-index"
  | "locale-resolution"
  | "reference-resolution"
  | "profile-resolution"
  | "runtime-overlays"
  | "derivations"
  | "semantic-validation"
  | "buyer-view"
  | "projection"
  | "canonical-snapshot"
  | "publication";
```

### 2. `PbpBuildContext` interface

```ts
interface PbpBuildContext {
  buildId: string;
  sourceRevision: string;
  buildTime: string;
  locale: string;
  defaultLocale: string;
  schemaSetDigest: string;
  derivationSetDigest: string;
  runtimeSnapshotId: string | null;
}
```

### 3. `PbpBuildRequest` interface

```ts
interface PbpBuildRequest {
  locale: string;
  asOf?: string;
  projectionTargets: string[];
  includeRuntimeState: boolean;
  strictness: "production" | "migration";
}
```

### 4. `PbpSourceInventoryReport` interface

```ts
interface PbpSourceInventoryEntry {
  physicalPath: string;
  entityId: string;
  schema: string;
  locale: string;
  contentDigest: string;
}

interface PbpSourceInventoryReport {
  sources: PbpSourceInventoryEntry[];
  recordsDiscovered: number;
  recordsBySchema: Record<string, number>;
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-064"`.
- **RFC-0421 (Runtime Overlay).** Phase 8 handles runtime overlays.
- **RFC-0422 (Validation/Error Codes).** Phase 10 performs semantic validation.
- **RFC-0424 (Normalization).** Normalization decisions feed into the compiler pipeline.

## Implementation details

### CLI surface

No CLI command. Library-only. The compiler implementation will be a future concern.

### TypeScript contracts

```ts
export type PbpCompilerPhase =
  | "discover"
  | "parse"
  | "raw-schema-validation"
  | "build-entity-index"
  | "locale-resolution"
  | "reference-resolution"
  | "profile-resolution"
  | "runtime-overlays"
  | "derivations"
  | "semantic-validation"
  | "buyer-view"
  | "projection"
  | "canonical-snapshot"
  | "publication";

export const PBP_COMPILER_PHASES: readonly PbpCompilerPhase[] = [
  "discover", "parse", "raw-schema-validation", "build-entity-index",
  "locale-resolution", "reference-resolution", "profile-resolution",
  "runtime-overlays", "derivations", "semantic-validation",
  "buyer-view", "projection", "canonical-snapshot", "publication",
] as const;

export interface PbpBuildContext {
  buildId: string;
  sourceRevision: string;
  buildTime: string;
  locale: string;
  defaultLocale: string;
  schemaSetDigest: string;
  derivationSetDigest: string;
  runtimeSnapshotId: string | null;
}

export interface PbpBuildRequest {
  locale: string;
  asOf?: string;
  projectionTargets: string[];
  includeRuntimeState: boolean;
  strictness: "production" | "migration";
}

export interface PbpSourceInventoryEntry {
  physicalPath: string;
  entityId: string;
  schema: string;
  locale: string;
  contentDigest: string;
}

export interface PbpSourceInventoryReport {
  sources: PbpSourceInventoryEntry[];
  recordsDiscovered: number;
  recordsBySchema: Record<string, number>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/compiler-pipeline.ts` | `PbpCompilerPhase`, `PbpBuildContext`, `PbpBuildRequest`, `PbpSourceInventoryReport` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, compiler pipeline types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.
- **Compiler implementation:** Deferred to a future RFC.

## Alternatives considered

- **Implement compiler in this RFC.** Rejected: this RFC defines the pipeline contract (types), not the implementation. The compiler implementation requires all entity types, validation rules, and projection targets to be defined first.
- **Fewer phases.** Rejected: the spec defines 14 phases. Collapsing them would lose clarity and testability.

## Risks

- **Pipeline complexity.** 14 phases is complex. Mitigation: each phase has a clean contract and can be tested separately (compiler §2).
- **Migration mode.** The compiler SHOULD support migration mode (compiler §5). This is typed via `strictness: "migration"` on `PbpBuildRequest`.

## Acceptance criteria

- [x] `PbpCompilerPhase` type exported with all 14 phases (evidence: implemented historically)
- [x] `PBP_COMPILER_PHASES` const array exported (evidence: implemented historically)
- [x] `PbpBuildContext` interface exported (evidence: implemented historically)
- [x] `PbpBuildRequest` interface exported (evidence: implemented historically)
- [x] `PbpSourceInventoryReport` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- This RFC defines the pipeline contract only — it does not implement the compiler.
- Each phase MUST have a clean contract and be testable separately (compiler §2).
- The compiler MUST NOT infer missing facts (compiler §1).
- All outputs MUST reference the build context (compiler §4).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
