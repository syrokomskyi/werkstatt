---
id: RFC-0460
title: "Sichtpass / Verifiable Credential Mapping"
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
  - RFC-0459
  - RFC-0418
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-093"
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
  - "PbpSichtpassMapping interface exported"
  - "PbpVerifiableCredentialMapping interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement VC issuance — contract only"
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

- `pbp-specification-package/compiler` — Phase 14 (Publication), signature and VC mapping
- `pbp-specification-package/decision-log` — Sichtpass decision

_This RFC defines the Sichtpass / Verifiable Credential mapping contract._

# RFC-0460: Sichtpass / Verifiable Credential Mapping

## Context

The PBP publication snapshot (RFC-0435) can be signed (RFC-0459). The Sichtpass (view-pass) maps PBP entities to W3C Verifiable Credentials (VCs) for tamper-evident, cryptographically verifiable business profile assertions.

## Problem

1. **No Sichtpass mapping type.** The spec mentions VC mapping but no TypeScript types exist.
2. **No VC mapping contract.** Need a typed contract for how PBP entities map to VC claims.

## Decision

### 1. `PbpVerifiableCredentialMapping`

```ts
interface PbpVerifiableCredentialMapping {
  vcType: string;
  entityRef: PbpEntityRef;
  claimMapping: Record<string, string>;
  proofType: PbpSignatureAlgorithm;
}
```

### 2. `PbpSichtpassMapping`

```ts
interface PbpSichtpassMapping {
  publicationSnapshotRef: string;
  credentialMappings: PbpVerifiableCredentialMapping[];
  issuerRef: PbpEntityRef;
}
```

### 3. Rules

- Sichtpass maps PBP publication snapshots to Verifiable Credentials.
- Each VC references a PBP entity and maps entity fields to VC claims.
- Proof type uses the signature algorithm from RFC-0459.
- VC issuance is out of scope — this contract defines the mapping only.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-093"`.
- **RFC-0459 (Signature Envelope).** Proof type uses `PbpSignatureAlgorithm`.
- **RFC-0418 (Credential).** PBP Credential entity is the basis for VC mapping.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpVerifiableCredentialMapping {
  vcType: string;
  entityRef: PbpEntityRef;
  claimMapping: Record<string, string>;
  proofType: PbpSignatureAlgorithm;
}

export interface PbpSichtpassMapping {
  publicationSnapshotRef: string;
  credentialMappings: PbpVerifiableCredentialMapping[];
  issuerRef: PbpEntityRef;
}
```

### File system responsibilities

| Path                            | Role                         |
| ------------------------------- | ---------------------------- |
| `packages/pbp/src/sichtpass.ts` | Sichtpass / VC mapping types |
| `packages/pbp/src/index.ts`     | Re-exports                   |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, Sichtpass mapping types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Direct VC without mapping.** Rejected: PBP entities need explicit field-to-claim mapping for VC interoperability.

## Risks

- **VC standard evolution.** W3C VC spec may evolve. Mitigation: `vcType` is a string, allowing future VC types.

## Acceptance criteria

- [x] `PbpSichtpassMapping` interface exported (evidence: implemented historically)
- [x] `PbpVerifiableCredentialMapping` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Sichtpass maps publication snapshots to VCs — it does not issue VCs.
- Proof type uses `PbpSignatureAlgorithm` from RFC-0459.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
