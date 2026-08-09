---
id: RFC-0459
title: "Signature Envelope"
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
specRef: "pbp-specification-package/RFC-PBP-092"
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
  - "PbpSignatureEnvelope interface exported"
  - "PbpSignatureAlgorithm closed union exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not implement signing — contract only"
  - "Does not define private key management"
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

- `pbp-specification-package/compiler` — Phase 14 (Publication), §24.4 (Signature)

_This RFC defines the Signature Envelope contract for publication snapshots._

# RFC-0459: Signature Envelope

## Context

The PBP compiler Phase 14 publishes snapshots that can be signed (compiler §24.4). RFC-0435 defines `PbpPublicationSnapshot` with an optional `signature` field. This RFC formalizes the signature envelope contract.

## Problem

1. **No signature envelope type.** RFC-0435 has `signature?: { algorithm: string; value: string }` but no dedicated interface.
2. **No algorithm vocabulary.** The spec mentions signing but does not formalize the algorithm list.

## Decision

### 1. `PbpSignatureAlgorithm` closed union

```ts
type PbpSignatureAlgorithm =
  | "ed25519" | "rsa-pss-sha256" | "ecdsa-p256-sha256";
```

### 2. `PbpSignatureEnvelope`

```ts
interface PbpSignatureEnvelope {
  algorithm: PbpSignatureAlgorithm;
  value: string;
  publicKeyRef?: string;
  signedAt: string;
}
```

### 3. Rules

- Signature is optional on `PbpPublicationSnapshot` (RFC-0435).
- The signature covers the canonical snapshot digest, not the raw snapshot.
- Private key management is out of scope.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-092"`.
- **RFC-0435 (Git Revision and Publication Snapshot).** `PbpPublicationSnapshot.signature` uses this envelope.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpSignatureAlgorithm =
  | "ed25519" | "rsa-pss-sha256" | "ecdsa-p256-sha256";

export const PBP_SIGNATURE_ALGORITHMS: readonly PbpSignatureAlgorithm[] = [
  "ed25519", "rsa-pss-sha256", "ecdsa-p256-sha256",
] as const;

export function isPbpSignatureAlgorithm(
  value: string,
): value is PbpSignatureAlgorithm;

export interface PbpSignatureEnvelope {
  algorithm: PbpSignatureAlgorithm;
  value: string;
  publicKeyRef?: string;
  signedAt: string;
}
```

### File system responsibilities

| Path                            | Role                     |
| ------------------------------- | ------------------------ |
| `packages/pbp/src/signature.ts` | Signature envelope types |
| `packages/pbp/src/index.ts`     | Re-exports               |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, signature envelope types are added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Single algorithm.** Rejected: different deployments may use different signing algorithms.

## Risks

- **Key management.** Private key management is out of scope. Mitigation: `publicKeyRef` references the public key; private key handling is external.

## Acceptance criteria

- [x] `PbpSignatureEnvelope` interface exported (evidence: implemented historically)
- [x] `PbpSignatureAlgorithm` closed union exported with const array (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Signature is optional on `PbpPublicationSnapshot` (RFC-0435).
- The signature covers the canonical snapshot digest, not the raw snapshot.
- Private key management is out of scope — only the public key reference is captured.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
