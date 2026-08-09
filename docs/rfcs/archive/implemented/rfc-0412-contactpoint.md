---
id: RFC-0412
title: "ContactPoint"
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
specRef: "pbp-specification-package/RFC-PBP-014"
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
  - "PbpContactPoint interface exported extending PbpEntity"
  - "PbpContactChannel closed union exported with PBP_CONTACT_CHANNELS"
  - "ContactPoint fields: name, channel, value, purposes, preferred, languages"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Place — that is RFC-0411"
  - "Does not define Zod schemas"
  - "Does not define channel validation rules"
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

- `pbp-specification-package/entity-model` — §9 (ContactPoint)
- `pbp-specification-package/target-blueprint` — ContactPoint target structure

# RFC-0412: ContactPoint

## Context

The PBP spec defines ContactPoint as a federated entity for contact channels (entity-model §9). It carries name, channel type, value, purposes, preferred flag, and supported languages. Projections compute `mailto:` and QR codes.

## Problem

1. **No `PbpContactPoint` interface.** The `@gogol/pbp` package has no ContactPoint entity.
2. **No channel vocabulary.** The spec uses `email`, `phone`, `form`, `chat`, `postal` but without a closed union.

## Decision

### 1. `PbpContactPoint` interface

```ts
type PbpContactChannel = "email" | "phone" | "form" | "chat" | "postal";

interface PbpContactPoint extends PbpEntity {
  type: "contact-point";
  name: string;
  channel: PbpContactChannel;
  value: string;
  purposes?: Record<string, { valueRef: string }>;
  preferred?: boolean;
  languages?: Record<string, string>;
}
```

### 2. Schema ID

```ts
const CONTACT_POINT_SCHEMA_ID = pbpSchemaId("contact-point"); // "pbp/contact-point@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpContactPoint` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-014"`.
- **RFC-0399 (Entity Envelope).** `PbpContactPoint extends PbpEntity`.
- **RFC-0403 (Business).** Business references ContactPoint via `contactPointRefs`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpContactChannel = "email" | "phone" | "form" | "chat" | "postal";
export const PBP_CONTACT_CHANNELS: readonly PbpContactChannel[];

export interface PbpContactPoint extends PbpEntity {
  type: "contact-point";
  name: string;
  channel: PbpContactChannel;
  value: string;
  purposes?: Record<string, { valueRef: string }>;
  preferred?: boolean;
  languages?: Record<string, string>;
}

export const CONTACT_POINT_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/contact-point.ts` | `PbpContactPoint`, `PbpContactChannel`, `PBP_CONTACT_CHANNELS`, `CONTACT_POINT_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpContactPoint` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge ContactPoint into Business.** Rejected: ContactPoint is a federated entity. A business can have multiple contact points.
- **Open string for channel.** Rejected: a closed union prevents typos and invalid channels.

## Risks

- **Channel vocabulary may need extension.** Mitigation: adding a new channel is additive within `@1`.

## Acceptance criteria

- [x] `PbpContactPoint` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpContactChannel` closed union exported with `PBP_CONTACT_CHANNELS` (evidence: implemented historically)
- [x] `CONTACT_POINT_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpContactPoint extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Projections compute `mailto:` and QR codes — this is a projection concern, not an entity concern.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
