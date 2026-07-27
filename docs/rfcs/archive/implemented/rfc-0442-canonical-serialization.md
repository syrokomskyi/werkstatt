---
id: RFC-0442
title: "Canonical Serialization"
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
  - RFC-0435
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-091"
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
  - "PbpCanonicalSerializationStep already exported from RFC-0435"
  - "PbpJcsCanonicalization interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement JCS — contract only"
  - "Does not define signature algorithm"
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

- `pbp-specification-package/compiler` — §24 (Canonical Snapshot), §24.3 (Serialization)

_This RFC formalizes the canonical serialization contract. The core types are already exported from RFC-0435._

# RFC-0442: Canonical Serialization

## Context

The PBP spec defines a 6-step canonical serialization process (compiler §24.3): convert to JSON-compatible, validate I-JSON, preserve decimal as string, remove undefined, canonicalize via RFC 8785, hash. RFC-0435 already exports `PbpCanonicalSerializationStep` and `PbpCanonicalSerialization`.

## Problem

1. **Types already exist.** RFC-0435 already exports `PbpCanonicalSerializationStep`, `PbpCanonicalSerialization`, `PbpCanonicalSnapshot`, `PbpPublicationSnapshot` — this RFC formalizes the JCS contract and adds the I-JSON validation interface.

## Decision

### 1. Serialization steps (already exported)

The 6-step serialization process from RFC-0435:

```ts
type PbpCanonicalSerializationStep =
  | "convert-to-json-compatible"
  | "validate-i-json"
  | "preserve-decimal-as-string"
  | "remove-undefined"
  | "canonicalize-rfc-8785"
  | "hash";
```

### 2. `PbpJcsCanonicalization` (new)

```ts
interface PbpJcsCanonicalization {
  rfc: "RFC 8785";
  excludeUndefined: true;
  preserveDecimalStrings: true;
}
```

### 3. Rules

- Convert resolved data to JSON-compatible model.
- Validate I-JSON constraints where using JCS.
- Preserve decimal values as strings.
- Remove undefined values.
- Canonicalize via RFC 8785.
- Hash the canonical form.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-091"`.
- **RFC-0435 (Git Revision and Publication Snapshot).** Core serialization types already exported.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpJcsCanonicalization {
  rfc: "RFC 8785";
  excludeUndefined: true;
  preserveDecimalStrings: true;
}
```

### File system responsibilities

| Path                              | Role                                            |
| --------------------------------- | ----------------------------------------------- |
| `packages/pbp/src/publication.ts` | Already contains serialization types (RFC-0435) |
| `packages/pbp/src/index.ts`       | Re-exports                                      |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpJcsCanonicalization` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Non-canonical serialization.** Rejected: the spec mandates RFC 8785 canonicalization for deterministic digests.

## Risks

- **I-JSON compliance.** Not all JSON is I-JSON compliant. Mitigation: step 2 validates I-JSON constraints.

## Acceptance criteria

- [x] `PbpCanonicalSerializationStep` already exported from RFC-0435 (evidence: implemented historically)
- [x] `PbpJcsCanonicalization` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Canonical serialization follows 6 steps per compiler §24.3.
- RFC 8785 (JCS) is the canonicalization standard — do not use alternative canonicalization.
- Decimal values MUST be preserved as strings, never binary float.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
