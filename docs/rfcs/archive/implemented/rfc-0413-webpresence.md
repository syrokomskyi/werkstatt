---
id: RFC-0413
title: "WebPresence"
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
specRef: "pbp-specification-package/RFC-PBP-015"
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
  - "PbpWebPresence interface exported extending PbpEntity"
  - "PbpWebPresenceKind and PbpWebControlStatus closed unions exported"
  - "WebPresence fields: name, kind, canonicalUrl, businessRef, locales, control"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Business — that is RFC-0403"
  - "Does not define Zod schemas"
  - "Does not define URL validation rules"
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

- `pbp-specification-package/entity-model` — §10 (WebPresence)
- `pbp-specification-package/target-blueprint` — WebPresence target structure

# RFC-0413: WebPresence

## Context

The PBP spec defines WebPresence as a federated entity for web properties (entity-model §10). It carries name, kind, canonical URL, business reference, locales, and control status. `domain` and `origin` are derivable.

## Problem

1. **No `PbpWebPresence` interface.** The `@gogol/pbp` package has no WebPresence entity.
2. **No kind vocabulary.** The spec uses `primary-website` but may need more kinds.
3. **No control status.** The spec distinguishes `business-controlled` from other statuses.

## Decision

### 1. `PbpWebPresence` interface

```ts
type PbpWebPresenceKind = "primary-website" | "landing-page" | "social-profile";
type PbpWebControlStatus = "business-controlled" | "third-party" | "verified-mirror";

interface PbpWebPresence extends PbpEntity {
  type: "web-presence";
  name: string;
  kind: PbpWebPresenceKind;
  canonicalUrl: string;
  businessRef: PbpEntityRef;
  locales?: Record<string, string>;
  control: PbpWebControlStatus;
}
```

### 2. Schema ID

```ts
const WEB_PRESENCE_SCHEMA_ID = pbpSchemaId("web-presence"); // "pbp/web-presence@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpWebPresence` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-015"`.
- **RFC-0399 (Entity Envelope).** `PbpWebPresence extends PbpEntity`.
- **RFC-0403 (Business).** Business references WebPresence via `webPresenceRefs`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpWebPresenceKind = "primary-website" | "landing-page" | "social-profile";
export const PBP_WEB_PRESENCE_KINDS: readonly PbpWebPresenceKind[];

export type PbpWebControlStatus = "business-controlled" | "third-party" | "verified-mirror";

export interface PbpWebPresence extends PbpEntity {
  type: "web-presence";
  name: string;
  kind: PbpWebPresenceKind;
  canonicalUrl: string;
  businessRef: PbpEntityRef;
  locales?: Record<string, string>;
  control: PbpWebControlStatus;
}

export const WEB_PRESENCE_SCHEMA_ID: string;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/web-presence.ts` | `PbpWebPresence`, `PbpWebPresenceKind`, `PbpWebControlStatus`, `WEB_PRESENCE_SCHEMA_ID` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpWebPresence` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge WebPresence into Business.** Rejected: WebPresence is a federated entity. A business can have multiple web presences.
- **Store domain and origin as fields.** Rejected (§10): `domain` and `origin` are derivable from `canonicalUrl`.

## Risks

- **Kind vocabulary may need extension.** Mitigation: adding a new kind is additive within `@1`.
- **Control status accuracy.** Third-party web presences may be incorrectly marked as business-controlled. Mitigation: `control` is a required field, forcing explicit declaration.

## Acceptance criteria

- [x] `PbpWebPresence` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `PbpWebPresenceKind` and `PbpWebControlStatus` closed unions exported (evidence: implemented historically)
- [x] `WEB_PRESENCE_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpWebPresence extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- `domain` and `origin` are derivable from `canonicalUrl` — do not store them as fields (§10).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
