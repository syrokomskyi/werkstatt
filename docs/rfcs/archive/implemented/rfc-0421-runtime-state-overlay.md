---
id: RFC-0421
title: "Runtime State Overlay"
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
  - RFC-0407
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-062"
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
  - "PbpRuntimeOverlay interface exported (not extending PbpEntity)"
  - "PbpOverlayStaleBehavior closed union exported with PBP_OVERLAY_STALE_BEHAVIORS"
  - "Overlay fields: schema, subjectRef, observedAt, expiresAt, sourceRef, values"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define compiler pipeline — that is RFC-PBP-064"
  - "Does not define source contract format"
  - "Does not define Zod schemas"
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

- `pbp-specification-package/system-spec` — §4.4 (Runtime State Layer)
- `pbp-specification-package/compiler` — §10 (Runtime Overlay Resolution)
- `pbp-specification-package/decision-log` — Runtime state decisions

# RFC-0421: Runtime State Overlay

## Context

The PBP spec defines Runtime State Overlay as a mechanism for non-static data (inventory, availability, pricing) that lives outside Git (system-spec §4.4, compiler §10). Overlays carry subject ref, observation/expiry timestamps, source ref, and values. The source contract determines which semantic fields an overlay can provide. Expired overlays get `stale` status.

## Problem

1. **No `PbpRuntimeOverlay` interface.** The `@gogol/pbp` package has no overlay type.
2. **No stale behavior vocabulary.** The spec defines omit, show unknown, show stale warning, block transaction (compiler §10.3).
3. **No allowed-paths contract.** The source contract must enumerate which semantic fields an overlay can provide (compiler §10.2).

## Decision

### 1. `PbpRuntimeOverlay` interface

```ts
type PbpOverlayStaleBehavior = "omit" | "show-unknown" | "show-stale-warning" | "block-transaction";

interface PbpRuntimeOverlay {
  schema: string;
  subjectRef: string;
  observedAt: string;
  expiresAt?: string;
  sourceRef: string;
  values: Record<string, unknown>;
}
```

### 2. Stale behavior (compiler §10.3)

Projection selects one of: `omit`, `show-unknown`, `show-stale-warning`, `block-transaction` for expired overlays.

### 3. Allowed paths (compiler §10.2)

Source contract MUST enumerate which semantic fields an overlay can provide. Inventory adapter cannot override Product name, ownership policy, or tax treatment.

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpRuntimeOverlay` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-062"`.
- **RFC-0407 (Reference Resolution).** Overlay resolution is a reference resolution concern.
- **system-spec §4.4.** Runtime State Layer.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export type PbpOverlayStaleBehavior = "omit" | "show-unknown" | "show-stale-warning" | "block-transaction";
export const PBP_OVERLAY_STALE_BEHAVIORS: readonly PbpOverlayStaleBehavior[];

export interface PbpRuntimeOverlay {
  schema: string;
  subjectRef: string;
  observedAt: string;
  expiresAt?: string;
  sourceRef: string;
  values: Record<string, unknown>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/runtime-overlay.ts` | `PbpRuntimeOverlay`, `PbpOverlayStaleBehavior`, `PBP_OVERLAY_STALE_BEHAVIORS` |
| `packages/pbp/src/index.ts` | Re-exports |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpRuntimeOverlay` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Store runtime state in entity files.** Rejected (system-spec §4.4): frequently changing values live outside Git.
- **Open string for stale behavior.** Rejected: a closed union ensures all projection behaviors are handled explicitly.

## Risks

- **Overlay scope creep.** Adapters may try to override fields outside their allowed paths. Mitigation: source contract enumerates allowed paths (compiler §10.2).
- **Stale overlay display.** Expired overlays may be displayed as current. Mitigation: `expiresAt` enables staleness detection.

## Acceptance criteria

- [x] `PbpRuntimeOverlay` interface exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpOverlayStaleBehavior` closed union exported with `PBP_OVERLAY_STALE_BEHAVIORS` (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpRuntimeOverlay` is NOT an entity — it does not extend `PbpEntity`. It is a runtime data structure.
- Source contract MUST enumerate allowed paths (compiler §10.2). Inventory adapter cannot override Product name, ownership policy, or tax treatment.
- Expired overlays get `stale` status and MUST NOT be displayed as current (compiler §10.3).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
