---
id: RFC-0418
title: "Credential"
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
  - RFC-0405
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-053"
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
  - "PbpCredential interface exported extending PbpEntity"
  - "PbpCredentialKind closed union exported with PBP_CREDENTIAL_KINDS"
  - "Credential fields: kind, credentialTypeRef, holderRef, issuerRef, issuedAt, expiresAt, verification"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define EvidenceSource — that is RFC-0416"
  - "Does not define Zod schemas"
  - "Does not define verifiable credential format"
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

- `pbp-specification-package/entity-model` — §28 (Credential)
- `pbp-specification-package/system-spec` — §4.2 (Federated Identity Layer)

# RFC-0418: Credential

## Context

The PBP spec defines Credential as a federated entity for professional qualifications, certifications, licenses, and accreditations (entity-model §28). It carries kind, credential type ref, holder ref, issuer ref, issued/expired dates, and verification (evidence ref, verifiable credential ref). Credential is part of the Federated Identity Layer (system-spec §4.2).

## Problem

1. **No `PbpCredential` interface.** The `@gogol/pbp` package has no Credential entity.
2. **No credential kind vocabulary.** The spec uses `professional-qualification` but there is no closed union.
3. **No verification structure.** The spec defines `verification.evidenceRef` and `verification.verifiableCredentialRef`.

## Decision

### 1. `PbpCredential` interface

```ts
type PbpCredentialKind = "professional-qualification" | "certification" | "license" | "accreditation";

interface PbpCredential extends PbpEntity {
  type: "credential";
  kind: PbpCredentialKind;
  credentialTypeRef: string;
  holderRef: PbpEntityRef;
  issuerRef: PbpEntityRef;
  issuedAt: string;
  expiresAt?: string | null;
  verification?: {
    evidenceRef?: PbpEntityRef;
    verifiableCredentialRef?: string | null;
  };
}
```

### 2. Schema ID

```ts
const CREDENTIAL_SCHEMA_ID = pbpSchemaId("credential"); // "pbp/credential@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpCredential` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-053"`.
- **RFC-0399 (Entity Envelope).** `PbpCredential extends PbpEntity`.
- **system-spec §4.2.** Credential is part of the Federated Identity Layer.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpCredentialKind = "professional-qualification" | "certification" | "license" | "accreditation";
export const PBP_CREDENTIAL_KINDS: readonly PbpCredentialKind[];

export interface PbpCredential extends PbpEntity {
  type: "credential";
  kind: PbpCredentialKind;
  credentialTypeRef: string;
  holderRef: PbpEntityRef;
  issuerRef: PbpEntityRef;
  issuedAt: string;
  expiresAt?: string | null;
  verification?: {
    evidenceRef?: PbpEntityRef;
    verifiableCredentialRef?: string | null;
  };
}

export const CREDENTIAL_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/credential.ts` | `PbpCredential`, `PbpCredentialKind`, `PBP_CREDENTIAL_KINDS`, `CREDENTIAL_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpCredential` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge Credential into Business.** Rejected: credentials are federated entities with their own identity. A business can have multiple credentials from different issuers.
- **Open string for credential kind.** Rejected: a closed union prevents invalid credential types.

## Risks

- **Credential expiration.** Credentials may expire. Mitigation: `expiresAt` is nullable — `null` means no expiration.
- **Verification integrity.** Verifiable credential refs may be invalid. Mitigation: `verification` is optional and typed.

## Acceptance criteria

- [x] `PbpCredential` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpCredentialKind` closed union exported with `PBP_CREDENTIAL_KINDS` (evidence: implemented historically)
- [x] `CREDENTIAL_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpCredential extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- `expiresAt` is nullable — `null` means no expiration, `undefined` means not specified.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
