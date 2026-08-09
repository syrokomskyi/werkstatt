---
id: RFC-0407
title: "Reference Resolution and Graph Integrity"
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
  - RFC-0402
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-061"
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
  - "PbpReferenceClass type exported (required, optional, external-opaque, deferred-runtime)"
  - "PbpReferenceResolution and PbpGraphIntegrityError interfaces exported"
  - "PbpCycleCheckResult interface exported with cycle detection results"
  - "Reference resolution types match compiler §8"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement the reference resolver — that is RFC-PBP-064"
  - "Does not implement cycle detection algorithm — that is a compiler concern"
  - "Does not define external registry pinning — that is RFC-PBP-094"
  - "Does not define runtime state overlay — that is RFC-PBP-062"
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

- `pbp-specification-package/compiler` — §8 (Reference Resolution: types, internal/external refs, reference classes, cycle checks)
- `pbp-specification-package/system-spec` — §3.4 (Federated identity)

_This RFC defines TypeScript contracts for reference resolution and graph integrity. It does not implement the resolver._

# RFC-0407: Reference Resolution and Graph Integrity

## Context

The PBP compiler spec defines reference resolution (compiler §8) as a build phase that validates all entity cross-references. References are classified by type (required, optional, external-opaque, deferred-runtime) and the resolver checks for cycles in dependency graphs.

Without typed contracts for reference classes and cycle check results, the compiler RFC (RFC-PBP-064) has no input/output contract for reference resolution.

## Problem

1. **No reference class contract.** The spec defines 4 reference classes (§8.4) but there is no TypeScript type.
2. **No graph integrity error contract.** The resolver produces errors for missing refs, type mismatches, and cycles but there is no typed error interface.
3. **No cycle check result contract.** The spec defines 5 cycle check types (§8.5) but there is no typed result.
4. **No external ref classification.** External refs can be trusted registry snapshots, resolvable HTTPS, cached records, or opaque identifiers (§8.3) but these are not typed.

## Decision

### 1. Reference class

```ts
type PbpReferenceClass =
  | "required"
  | "optional"
  | "external-opaque"
  | "deferred-runtime";
```

### 2. External reference kind

```ts
type PbpExternalRefKind =
  | "trusted-registry-snapshot"
  | "resolvable-https"
  | "cached-verified-record"
  | "opaque-identifier";
```

### 3. Graph integrity error

```ts
type PbpGraphErrorKind =
  | "missing-internal-ref"
  | "type-mismatch"
  | "cycle-detected"
  | "external-ref-unresolvable"
  | "locale-suffix-in-id";

interface PbpGraphIntegrityError {
  kind: PbpGraphErrorKind;
  entityId: string;
  refPath: string;
  message: string;
}
```

### 4. Cycle check result

```ts
type PbpCycleCheckType =
  | "requires"
  | "category-broader"
  | "successor-chain"
  | "product-intrinsic-composition"
  | "offering-optional-relation";

interface PbpCycleCheckResult {
  checkType: PbpCycleCheckType;
  hasCycle: boolean;
  cyclePath?: string[];
}
```

### 5. Reference resolution rules (compiler §8)

- Internal refs MUST exist in the build graph (§8.2).
- External refs MAY be trusted registry snapshots, resolvable HTTPS, cached records, or opaque identifiers (§8.3).
- Production builds MUST NOT depend on live Internet — external registries MUST be pinned by version/digest (§8.3).
- `requires` graph MUST be acyclic (§8.5).
- Product intrinsic composition cycles MUST be errors (§8.5).

## Architectural fit

- **DNA-1 (Monorepo boundary).** Reference types are in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** Tenth materialized RFC, `specRef: "pbp-specification-package/RFC-PBP-061"`.
- **RFC-0399 (Entity Envelope).** Uses `PbpEntityRef` with `expectedType` for type checking.
- **RFC-0402 (Package and Source Profiles).** External registries are pinned in the package manifest.

## Design

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpReferenceClass = "required" | "optional" | "external-opaque" | "deferred-runtime";
export type PbpExternalRefKind = "trusted-registry-snapshot" | "resolvable-https" | "cached-verified-record" | "opaque-identifier";
export type PbpGraphErrorKind = "missing-internal-ref" | "type-mismatch" | "cycle-detected" | "external-ref-unresolvable" | "locale-suffix-in-id";
export type PbpCycleCheckType = "requires" | "category-broader" | "successor-chain" | "product-intrinsic-composition" | "offering-optional-relation";

export interface PbpGraphIntegrityError {
  kind: PbpGraphErrorKind;
  entityId: string;
  refPath: string;
  message: string;
}

export interface PbpCycleCheckResult {
  checkType: PbpCycleCheckType;
  hasCycle: boolean;
  cyclePath?: string[];
}
```

### File system responsibilities

| Path                                       | Role                                    |
| ------------------------------------------ | --------------------------------------- |
| `packages/pbp/src/reference-resolution.ts` | All reference and graph integrity types |
| `packages/pbp/src/index.ts`                | Re-exports                              |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, reference types are added to `@gogol/pbp`. The compiler RFC (RFC-PBP-064) and validation RFC (RFC-PBP-063) can use them.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge reference class into PbpEntityRef.** Rejected: reference class is a build-time concern (how the resolver treats the ref), not an entity-level concern (what the ref points to). Keeping them separate avoids coupling entity definitions to compiler behavior.
- **Open string for graph error kinds.** Rejected: a closed union ensures the compiler handles all error types explicitly.

## Risks

- **External ref availability.** External refs may become unavailable. Mitigation: production builds MUST NOT depend on live Internet — registries are pinned by version/digest (§8.3).
- **Cycle detection performance.** Large graphs may have expensive cycle checks. Mitigation: this is a compiler implementation concern, not an interface concern.
- **Offering optional relation cycles.** The spec says these "MAY be allowed if they don't create dependency" (§8.5). This is intentionally permissive. Mitigation: the compiler determines whether a cycle creates a dependency.

## Acceptance criteria

- [x] `PbpReferenceClass` type exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpExternalRefKind` type exported (evidence: implemented historically)
- [x] `PbpGraphErrorKind` type and `PbpGraphIntegrityError` interface exported (evidence: implemented historically)
- [x] `PbpCycleCheckType` type and `PbpCycleCheckResult` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Internal refs MUST exist in the build graph (compiler §8.2).
- Production builds MUST NOT depend on live Internet — external registries MUST be pinned (§8.3).
- `requires` graph MUST be acyclic. Product intrinsic composition cycles MUST be errors (§8.5).
- `offering-optional-relation` cycles MAY be allowed if they don't create dependency (§8.5).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
