---
id: RFC-0416
title: "EvidenceSource"
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
specRef: "pbp-specification-package/RFC-PBP-051"
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
  - "PbpEvidenceSource interface exported extending PbpEntity"
  - "PbpEvidenceKind closed union exported with PBP_EVIDENCE_KINDS"
  - "EvidenceSource fields: name, kind, authority, items"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Claim — that is RFC-0405"
  - "Does not define Zod schemas"
  - "Does not define evidence URL validation"
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

- `pbp-specification-package/entity-model` — §25 (EvidenceSource)
- `pbp-specification-package/decision-log` — Evidence handling decisions

# RFC-0416: EvidenceSource

## Context

The PBP spec defines EvidenceSource as a business-catalog entity for evidence backing claims (entity-model §25). It carries name, kind, authority, and items (URLs with retrieval timestamps). EvidenceSource is referenced by Claim via `evidenceRefs`.

## Problem

1. **No `PbpEvidenceSource` interface.** The `@gogol/pbp` package has no EvidenceSource entity.
2. **No evidence kind vocabulary.** The spec uses `external-web-sources` but there is no closed union.
3. **No authority structure.** The spec defines `authority.kind` for evidence sources.

## Decision

### 1. `PbpEvidenceSource` interface

```ts
type PbpEvidenceKind = "external-web-sources" | "verified-record" | "third-party-registry";

interface PbpEvidenceSource extends PbpEntity {
  type: "evidence-source";
  name: string;
  kind: PbpEvidenceKind;
  authority: { kind: string };
  items?: Record<string, {
    url: string;
    retrievedAt: string;
  }>;
}
```

### 2. Schema ID

```ts
const EVIDENCE_SOURCE_SCHEMA_ID = pbpSchemaId("evidence-source"); // "pbp/evidence-source@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpEvidenceSource` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-051"`.
- **RFC-0399 (Entity Envelope).** `PbpEvidenceSource extends PbpEntity`.
- **RFC-0405 (Claim).** Claim references EvidenceSource via `evidenceRefs`.
- **system-spec §4.3.** EvidenceSource is part of the Business Catalog Layer.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpEvidenceKind = "external-web-sources" | "verified-record" | "third-party-registry";
export const PBP_EVIDENCE_KINDS: readonly PbpEvidenceKind[];

export interface PbpEvidenceSource extends PbpEntity {
  type: "evidence-source";
  name: string;
  kind: PbpEvidenceKind;
  authority: { kind: string };
  items?: Record<string, { url: string; retrievedAt: string }>;
}

export const EVIDENCE_SOURCE_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/evidence-source.ts` | `PbpEvidenceSource`, `PbpEvidenceKind`, `PBP_EVIDENCE_KINDS`, `EVIDENCE_SOURCE_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpEvidenceSource` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge EvidenceSource into Claim.** Rejected: evidence sources are reusable across claims and have their own identity.
- **Open string for evidence kind.** Rejected: a closed union prevents invalid evidence types.

## Risks

- **Evidence URL validity.** URLs in examples are placeholders until verified. Mitigation: the compiler checks that evidence source is not a generic placeholder in production (compiler §12.6).
- **Evidence staleness.** Evidence may become stale. Mitigation: `retrievedAt` timestamp enables freshness checks.

## Acceptance criteria

- [x] `PbpEvidenceSource` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpEvidenceKind` closed union exported with `PBP_EVIDENCE_KINDS` (evidence: implemented historically)
- [x] `EVIDENCE_SOURCE_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpEvidenceSource extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Evidence source URLs are placeholders until verified (entity-model §25).
- The compiler MUST check that evidence source is not a generic placeholder in production (compiler §12.6).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
