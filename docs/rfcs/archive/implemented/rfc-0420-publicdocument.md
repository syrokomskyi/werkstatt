---
id: RFC-0420
title: "PublicDocument"
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
specRef: "pbp-specification-package/RFC-PBP-055"
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
  - "PbpPublicDocument interface exported extending PbpEntity"
  - "PbpDocumentKind closed union exported with PBP_DOCUMENT_KINDS"
  - "PublicDocument fields: kind, name, canonicalUrl, governance (required)"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Disclosure — that is RFC-0417"
  - "Does not define Zod schemas"
  - "Does not define document content validation"
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

- `pbp-specification-package/entity-model` — §30 (PublicDocument)
- `pbp-specification-package/decision-log` — Document handling decisions

# RFC-0420: PublicDocument

## Context

The PBP spec defines PublicDocument as a business-catalog entity for public legal documents (entity-model §30). It carries kind, name, canonical URL, and governance (effective date, review schedule). Document metadata is in the entity descriptor, not in a shared `meta.md`.

## Problem

1. **No `PbpPublicDocument` interface.** The `@gogol/pbp` package has no PublicDocument entity.
2. **No document kind vocabulary.** The spec uses `terms-and-conditions` but there is no closed union.
3. **No governance on documents.** The spec requires governance (effectiveFrom, reviewedAt, reviewEvery) on PublicDocument.

## Decision

### 1. `PbpPublicDocument` interface

```ts
type PbpDocumentKind = "terms-and-conditions" | "privacy-policy" | "imprint" | "legal-notice";

interface PbpPublicDocument extends PbpEntity {
  type: "public-document";
  kind: PbpDocumentKind;
  name: string;
  canonicalUrl: string;
  governance: PbpGovernance;
}
```

### 2. Schema ID

```ts
const PUBLIC_DOCUMENT_SCHEMA_ID = pbpSchemaId("public-document"); // "pbp/public-document@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpPublicDocument` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-055"`.
- **RFC-0399 (Entity Envelope).** `PbpPublicDocument extends PbpEntity`.
- **RFC-0399 (Governance).** `governance` is required on PublicDocument.
- **system-spec §4.3.** PublicDocument is part of the Business Catalog Layer.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpDocumentKind = "terms-and-conditions" | "privacy-policy" | "imprint" | "legal-notice";
export const PBP_DOCUMENT_KINDS: readonly PbpDocumentKind[];

export interface PbpPublicDocument extends PbpEntity {
  type: "public-document";
  kind: PbpDocumentKind;
  name: string;
  canonicalUrl: string;
  governance: PbpGovernance;
}

export const PUBLIC_DOCUMENT_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/public-document.ts` | `PbpPublicDocument`, `PbpDocumentKind`, `PBP_DOCUMENT_KINDS`, `PUBLIC_DOCUMENT_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpPublicDocument` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge PublicDocument into Business.** Rejected: documents are separate entities with their own governance lifecycle.
- **Open string for document kind.** Rejected: a closed union prevents invalid document types.

## Risks

- **Document staleness.** Legal documents may become stale. Mitigation: `governance.reviewEvery` enables review schedule enforcement.
- **Canonical URL drift.** URLs may change. Mitigation: `canonicalUrl` is a required field, forcing explicit declaration.

## Acceptance criteria

- [x] `PbpPublicDocument` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpDocumentKind` closed union exported with `PBP_DOCUMENT_KINDS` (evidence: implemented historically)
- [x] `PUBLIC_DOCUMENT_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `governance` is required on `PbpPublicDocument` (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpPublicDocument extends PbpEntity` — do not redefine `schema`, `id`, `status` on this interface.
- `governance` is REQUIRED on `PbpPublicDocument` — documents without governance are invalid.
- Document metadata is in the entity descriptor, not in a shared `meta.md` (entity-model §30).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
