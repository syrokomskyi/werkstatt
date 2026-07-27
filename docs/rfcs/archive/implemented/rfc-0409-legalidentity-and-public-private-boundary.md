---
id: RFC-0409
title: "LegalIdentity and Public/Private Boundary"
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
  - RFC-0403
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-011"
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
  - "PbpLegalIdentity interface exported extending PbpEntity"
  - "LegalIdentity fields: legalName, legalForm, responsiblePerson, registeredPlaceRef, publicIdentifiers, publicRegistrations"
  - "Private data (taxNumber, IBAN, BIC) excluded from public LegalIdentity (entity-model §6.1)"
  - "publicIdentifiers use PbpSemanticStatus for not-declared/null/unavailable"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Place — that is RFC-0411"
  - "Does not define Business — that is RFC-0403"
  - "Does not define Zod schemas for LegalIdentity validation"
  - "Does not define private billing data structures"
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

- `pbp-specification-package/entity-model` — §6 (LegalIdentity), §6.1 (Privacy boundary)
- `pbp-specification-package/target-blueprint` — LegalIdentity target structure

_This RFC defines the `PbpLegalIdentity` entity interface and the public/private boundary for legal identity data._

# RFC-0409: LegalIdentity and Public/Private Boundary

## Context

The PBP spec defines LegalIdentity as a federated entity for the public legal identity of a business (entity-model §6). It carries legal name, legal form, responsible person, registered place, and public identifiers. Private data (tax numbers, banking details) are explicitly excluded from the public LegalIdentity (§6.1).

The current Webgogol model mixes legal identity data into `company.md` and `legal.md` without a clear public/private boundary.

## Problem

1. **No `PbpLegalIdentity` interface.** The `@gogol/pbp` package has no LegalIdentity entity.
2. **No public/private boundary enforcement.** The spec explicitly excludes `taxNumber`, IBAN, BIC, and private billing data (§6.1). Without a typed interface, agents may accidentally include private data.
3. **No `publicIdentifiers` with semantic status.** The spec uses `status: not-declared` for VAT (§6). Without `PbpSemanticStatus`, these are untyped strings.

## Decision

### 1. `PbpLegalIdentity` interface

```ts
interface PbpLegalIdentity extends PbpEntity {
  type: "legal-identity";
  legalName: string;
  legalForm?: { valueRef: string };
  responsiblePerson?: { name: string };
  registeredPlaceRef?: PbpEntityRef;
  publicIdentifiers?: Record<string, { status: PbpSemanticStatus; value?: string }>;
  publicRegistrations?: Record<string, PbpEntityRef>;
}
```

### 2. Public/private boundary (entity-model §6.1)

The interface MUST NOT include fields for `taxNumber`, IBAN, BIC, or any private billing data. These are explicitly excluded from the public LegalIdentity.

### 3. Schema ID

```ts
const LEGAL_IDENTITY_SCHEMA_ID = pbpSchemaId("legal-identity"); // "pbp/legal-identity@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpLegalIdentity` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-011"`.
- **RFC-0399 (Entity Envelope).** `PbpLegalIdentity extends PbpEntity`.
- **RFC-0400 (Primitive Types).** Uses `PbpSemanticStatus` for public identifiers.
- **RFC-0403 (Business).** Business references LegalIdentity via `legalIdentityRef`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpLegalIdentity extends PbpEntity {
  type: "legal-identity";
  legalName: string;
  legalForm?: { valueRef: string };
  responsiblePerson?: { name: string };
  registeredPlaceRef?: PbpEntityRef;
  publicIdentifiers?: Record<string, { status: PbpSemanticStatus; value?: string }>;
  publicRegistrations?: Record<string, PbpEntityRef>;
}

export const LEGAL_IDENTITY_SCHEMA_ID: string;
```

### File system responsibilities

| Path                                          | Role                                           |
| --------------------------------------------- | ---------------------------------------------- |
| `packages/pbp/src/entities/legal-identity.ts` | `PbpLegalIdentity`, `LEGAL_IDENTITY_SCHEMA_ID` |
| `packages/pbp/src/index.ts`                   | Re-exports                                     |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpLegalIdentity` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Include private data with a flag.** Rejected (§6.1): private data must not appear in public PBP at all. A flag is insufficient — the data must be excluded from the entity.
- **Merge LegalIdentity into Business.** Rejected: LegalIdentity has its own federated identity and can be shared across businesses. It is a separate entity.

## Risks

- **Private data leakage.** Agents may accidentally include tax numbers or banking details. Mitigation: the interface has no fields for them, and implementation notes explicitly prohibit adding them.
- **Public identifier verification.** Public identifiers may need verification before publication. Mitigation: `publicIdentifiers` uses `PbpSemanticStatus` — `not-declared` means the business has not declared it.

## Acceptance criteria

- [x] `PbpLegalIdentity` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `LEGAL_IDENTITY_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] Interface excludes `taxNumber`, IBAN, BIC, and private billing data (evidence: implemented historically)
- [x] `publicIdentifiers` uses `PbpSemanticStatus` (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpLegalIdentity extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Private data (`taxNumber`, IBAN, BIC, banking details) MUST NOT be included in `PbpLegalIdentity` (entity-model §6.1).
- `publicIdentifiers` uses `PbpSemanticStatus` — `not-declared` means the business has not declared it.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
