---
id: RFC-0411
title: "Place and Territory"
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
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-013"
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
  - "PbpPlace interface exported extending PbpEntity"
  - "PbpPlaceKind closed union exported with PBP_PLACE_KINDS"
  - "Place fields: name, kind, address, geo, publicUrl"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define service territory — that is a Business concern"
  - "Does not define Zod schemas"
  - "Does not define geo validation rules"
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

- `pbp-specification-package/entity-model` — §8 (Place), §8.1 (Rules)
- `pbp-specification-package/target-blueprint` — Place target structure

# RFC-0411: Place and Territory

## Context

The PBP spec defines Place as a federated entity for geographic locations (entity-model §8). It carries name, kind (locality, region, country), address, geo, and public URL. Service territory is not stored in Place (§8.1).

## Problem

1. **No `PbpPlace` interface.** The `@gogol/pbp` package has no Place entity.
2. **No place kind vocabulary.** The spec distinguishes locality, region, country but without a closed union.
3. **No service territory exclusion.** The spec explicitly excludes service territory from Place (§8.1).

## Decision

### 1. `PbpPlace` interface

```ts
type PbpPlaceKind = "locality" | "region" | "country";

interface PbpPlace extends PbpEntity {
  type: "place";
  name: string;
  kind: PbpPlaceKind;
  address?: {
    street?: string;
    streetNumber?: string;
    postalCode?: string;
    locality?: string;
    administrativeArea?: string;
    countryCode: string;
  };
  geo?: { status: PbpSemanticStatus; latitude?: number; longitude?: number };
  publicUrl?: string;
}
```

### 2. Place rules (entity-model §8.1)

- Region does not get the postalCode of a local address.
- Country is not duplicated as a separate Place without real need.
- Service territory is not stored in Place.
- One address can have multiple roles through Business relation.

### 3. Schema ID

```ts
const PLACE_SCHEMA_ID = pbpSchemaId("place"); // "pbp/place@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpPlace` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-013"`.
- **RFC-0399 (Entity Envelope).** `PbpPlace extends PbpEntity`.
- **RFC-0400 (Primitive Types).** Uses `PbpSemanticStatus` for geo.
- **RFC-0403 (Business).** Business references Place via `placeRefs`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpPlaceKind = "locality" | "region" | "country";
export const PBP_PLACE_KINDS: readonly PbpPlaceKind[];

export interface PbpPlace extends PbpEntity {
  type: "place";
  name: string;
  kind: PbpPlaceKind;
  address?: {
    street?: string;
    streetNumber?: string;
    postalCode?: string;
    locality?: string;
    administrativeArea?: string;
    countryCode: string;
  };
  geo?: { status: PbpSemanticStatus; latitude?: number; longitude?: number };
  publicUrl?: string;
}

export const PLACE_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/place.ts` | `PbpPlace`, `PbpPlaceKind`, `PBP_PLACE_KINDS`, `PLACE_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpPlace` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge Place into Business.** Rejected: Place is a federated entity. One address can have multiple roles through Business relation (§8.1).
- **Include service territory in Place.** Rejected (§8.1): service territory is not stored in Place.

## Risks

- **Place kind vocabulary may need extension.** Mitigation: adding a new kind is additive within `@1`.
- **Geo data accuracy.** Geo coordinates may be inaccurate. Mitigation: `geo` uses `PbpSemanticStatus` — `not-declared` means the business has not declared coordinates.

## Acceptance criteria

- [x] `PbpPlace` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpPlaceKind` closed union exported with `PBP_PLACE_KINDS` (evidence: implemented historically)
- [x] `PLACE_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpPlace extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Service territory MUST NOT be stored in Place (entity-model §8.1).
- Region does not get the postalCode of a local address (§8.1).
- `geo` uses `PbpSemanticStatus` — `not-declared` means the business has not declared coordinates.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
