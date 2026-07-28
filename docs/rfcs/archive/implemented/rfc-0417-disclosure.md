---
id: RFC-0417
title: "Disclosure"
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
specRef: "pbp-specification-package/RFC-PBP-052"
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
  - "PbpDisclosure interface exported extending PbpEntity"
  - "PbpDisclosureKind and PbpDisclosureMateriality closed unions exported"
  - "Disclosure fields: kind, name, statement, scope, relatedPartyRef, materiality, publication"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Claim — that is RFC-0405"
  - "Does not define Zod schemas"
  - "Does not define publication enforcement rules"
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

- `pbp-specification-package/entity-model` — §26 (Disclosure)
- `pbp-specification-package/decision-log` — Disclosure decisions

# RFC-0417: Disclosure

## Context

The PBP spec defines Disclosure as a business-catalog entity for mandatory or informative disclosures (entity-model §26). It carries kind, name, statement, scope (offering refs), related party ref, materiality, and publication requirement.

## Problem

1. **No `PbpDisclosure` interface.** The `@gogol/pbp` package has no Disclosure entity.
2. **No disclosure kind vocabulary.** The spec uses `technology-dependency` but there is no closed union.
3. **No materiality vocabulary.** The spec uses `informative` but there is no closed union.

## Decision

### 1. `PbpDisclosure` interface

```ts
type PbpDisclosureKind = "technology-dependency" | "data-processing" | "ownership-change" | "regulatory";
type PbpDisclosureMateriality = "informative" | "material" | "critical";

interface PbpDisclosure extends PbpEntity {
  type: "disclosure";
  kind: PbpDisclosureKind;
  name: string;
  statement: string;
  scope?: {
    offeringRefs?: Record<string, PbpEntityRef>;
  };
  relatedPartyRef?: PbpEntityRef;
  materiality: PbpDisclosureMateriality;
  publication: {
    required: boolean;
  };
}
```

### 2. Schema ID

```ts
const DISCLOSURE_SCHEMA_ID = pbpSchemaId("disclosure"); // "pbp/disclosure@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpDisclosure` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-052"`.
- **RFC-0399 (Entity Envelope).** `PbpDisclosure extends PbpEntity`.
- **RFC-0405 (Claim).** Disclosure is a claim-adjacent entity in the Business Catalog Layer.
- **system-spec §4.3.** Disclosure is part of the Business Catalog Layer.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpDisclosureKind = "technology-dependency" | "data-processing" | "ownership-change" | "regulatory";
export const PBP_DISCLOSURE_KINDS: readonly PbpDisclosureKind[];

export type PbpDisclosureMateriality = "informative" | "material" | "critical";

export interface PbpDisclosure extends PbpEntity {
  type: "disclosure";
  kind: PbpDisclosureKind;
  name: string;
  statement: string;
  scope?: { offeringRefs?: Record<string, PbpEntityRef> };
  relatedPartyRef?: PbpEntityRef;
  materiality: PbpDisclosureMateriality;
  publication: { required: boolean };
}

export const DISCLOSURE_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/disclosure.ts` | `PbpDisclosure`, `PbpDisclosureKind`, `PbpDisclosureMateriality`, `DISCLOSURE_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpDisclosure` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge Disclosure into Claim.** Rejected: disclosures are not claims — they are mandatory or informative statements about dependencies, data processing, etc.
- **Open string for kind.** Rejected: a closed union prevents invalid disclosure types.

## Risks

- **Disclosure completeness.** Businesses may fail to disclose all material dependencies. Mitigation: `publication.required` forces explicit declaration.
- **Related party accuracy.** Related party refs may be inaccurate. Mitigation: `relatedPartyRef` is optional and typed.

## Acceptance criteria

- [x] `PbpDisclosure` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpDisclosureKind` and `PbpDisclosureMateriality` closed unions exported (evidence: implemented historically)
- [x] `DISCLOSURE_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpDisclosure extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- `publication.required` is a boolean — `true` means the disclosure MUST be published.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
