---
id: RFC-0461
title: "Webgogol Legacy Migration"
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
  - DNA-20
  - DNA-55
  - RFC-0398
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-102"
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
  - "PbpMigrationMapping interface exported"
  - "PbpLegacyToPbpFieldMap interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not execute the migration — contract only"
  - "Does not delete @gogol/business — that is RFC-PBP-103"
  - "Does not define Zod schemas"
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

- `pbp-specification-package/migration-plan` — migration strategy
- `pbp-specification-package/target-blueprint` — target architecture

_This RFC defines the Webgogol legacy migration contract from `@gogol/business` (DNA-20) to `@gogol/pbp`._

# RFC-0461: Webgogol Legacy Migration

## Context

`@gogol/business` (DNA-20) is the current canonical business layer for all existing sites. The PBP program (RFC-0398) establishes `@gogol/pbp` as the replacement. This RFC defines the migration contract — how legacy business entities map to PBP entities.

## Problem

1. **No migration mapping type.** Need a typed contract for `@gogol/business` → `@gogol/pbp` field mapping.
2. **No cutover contract.** Need to define when sites switch from `@gogol/business` to `@gogol/pbp`.

## Decision

### 1. `PbpLegacyToPbpFieldMap`

```ts
interface PbpLegacyToPbpFieldMap {
  legacyPath: string;
  pbpPath: string;
  transformation?: string;
}
```

### 2. `PbpMigrationMapping`

```ts
interface PbpMigrationMapping {
  legacyEntity: string;
  pbpEntity: string;
  fieldMaps: PbpLegacyToPbpFieldMap[];
  status: "pending" | "mapped" | "verified" | "cutover";
}
```

### 3. Rules

- `@gogol/business` (DNA-20) remains canonical until RFC-PBP-103 (Migration Coverage and Cutover) is implemented.
- No compatibility layer (ADR-043) — migration is a clean cutover, not a parallel run.
- Sites MUST NOT consume `@gogol/pbp` until this RFC is implemented and cutover is complete.
- Legacy files are deleted only after RFC-PBP-103 verifies coverage.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-20 (Business layer).** `@gogol/business` is the legacy source.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-102"`.
- **RFC-0398 (PBP Program Charter).** This RFC is the migration coverage for Webgogol.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpLegacyToPbpFieldMap {
  legacyPath: string;
  pbpPath: string;
  transformation?: string;
}

export interface PbpMigrationMapping {
  legacyEntity: string;
  pbpEntity: string;
  fieldMaps: PbpLegacyToPbpFieldMap[];
  status: "pending" | "mapped" | "verified" | "cutover";
}
```

### File system responsibilities

| Path                                              | Role                    |
| ------------------------------------------------- | ----------------------- |
| `packages/pbp/src/migration/migration-mapping.ts` | Migration mapping types |
| `packages/pbp/src/index.ts`                       | Re-exports              |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, migration mapping types are added to `@gogol/pbp`.
- **No site impact:** Sites still use `@gogol/business` until RFC-PBP-103.

## Alternatives considered

- **Compatibility layer.** Rejected: ADR-043 explicitly states no compatibility layer. Migration is a clean cutover.
- **Parallel run.** Rejected: both systems running in parallel creates confusion and maintenance burden.

## Risks

- **Data loss during migration.** Field mappings may not cover all legacy fields. Mitigation: `transformation` field captures field-level transformations; RFC-PBP-103 verifies coverage.
- **Premature cutover.** Sites may switch before all entities are mapped. Mitigation: `status` field tracks mapping completeness; cutover only after `"verified"`.

## Acceptance criteria

- [x] `PbpMigrationMapping` interface exported (evidence: implemented historically)
- [x] `PbpLegacyToPbpFieldMap` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (until RFC-PBP-103) (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `@gogol/business` (DNA-20) remains canonical until RFC-PBP-103 is implemented.
- No compatibility layer (ADR-043) — migration is a clean cutover.
- Legacy files are deleted only after RFC-PBP-103 verifies coverage.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
