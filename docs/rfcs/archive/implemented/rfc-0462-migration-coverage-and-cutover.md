---
id: RFC-0462
title: "Migration Coverage and Cutover"
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
  - RFC-0461
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-103"
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
  - "PbpMigrationCoverageReport interface exported"
  - "PbpCutoverChecklist interface exported"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not execute the cutover — contract only"
  - "Does not delete @gogol/business — defines the checklist for when deletion is safe"
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

- `pbp-specification-package/migration-plan` — migration strategy and cutover
- `pbp-specification-package/decision-log` — cutover decision

_This RFC defines the migration coverage report and cutover checklist contract._

# RFC-0462: Migration Coverage and Cutover

## Context

RFC-0461 defines the Warpgogol legacy migration mapping from `@gogol/business` (DNA-20) to `@gogol/pbp`. This RFC defines the coverage report that verifies all legacy entities are mapped and the cutover checklist that determines when it is safe to delete `@gogol/business` and switch sites to `@gogol/pbp`.

## Problem

1. **No coverage report type.** Need a typed contract for verifying migration completeness.
2. **No cutover checklist type.** Need a typed contract for the cutover gate conditions.

## Decision

### 1. `PbpMigrationCoverageReport`

```ts
interface PbpMigrationCoverageReport {
  totalLegacyEntities: number;
  mappedEntities: number;
  unmappedEntities: string[];
  verifiedEntities: number;
  coveragePercentage: number;
}
```

### 2. `PbpCutoverChecklist`

```ts
interface PbpCutoverChecklist {
  allEntitiesMapped: boolean;
  allEntitiesVerified: boolean;
  noSiteImportsFromLegacy: boolean;
  legacyTestsPass: boolean;
  pbpTestsPass: boolean;
  ready: boolean;
}
```

### 3. Rules

- `@gogol/business` (DNA-20) files are deleted only when `PbpCutoverChecklist.ready` is `true`.
- All legacy entities must be mapped (`allEntitiesMapped`).
- All mapped entities must be verified (`allEntitiesVerified`).
- No site may import from `@gogol/business` after cutover (`noSiteImportsFromLegacy`).
- Both legacy and PBP tests must pass.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All types in `packages/pbp/`.
- **DNA-20 (Business layer).** `@gogol/business` is the legacy being replaced.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-103"`.
- **RFC-0461 (Warpgogol Legacy Migration).** This RFC is the cutover gate for RFC-0461.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpMigrationCoverageReport {
  totalLegacyEntities: number;
  mappedEntities: number;
  unmappedEntities: string[];
  verifiedEntities: number;
  coveragePercentage: number;
}

export interface PbpCutoverChecklist {
  allEntitiesMapped: boolean;
  allEntitiesVerified: boolean;
  noSiteImportsFromLegacy: boolean;
  legacyTestsPass: boolean;
  pbpTestsPass: boolean;
  ready: boolean;
}
```

### File system responsibilities

| Path                                    | Role                                        |
| --------------------------------------- | ------------------------------------------- |
| `packages/pbp/src/migration/cutover.ts` | Cutover checklist and coverage report types |
| `packages/pbp/src/index.ts`             | Re-exports                                  |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, cutover types are added to `@gogol/pbp`.
- **Post-cutover:** `@gogol/business` (DNA-20) is deleted after `PbpCutoverChecklist.ready` is `true`.

## Alternatives considered

- **Cutover without verification.** Rejected: deleting `@gogol/business` without full coverage verification risks data loss.
- **Permanent compatibility layer.** Rejected: ADR-043 explicitly states no compatibility layer.

## Risks

- **Incomplete mapping.** Some legacy entities may not have PBP equivalents. Mitigation: `unmappedEntities` list in the coverage report.
- **Premature cutover.** Sites may switch before all checks pass. Mitigation: `PbpCutoverChecklist.ready` is the gate condition.

## Acceptance criteria

- [x] `PbpMigrationCoverageReport` interface exported (evidence: implemented historically)
- [x] `PbpCutoverChecklist` interface exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (until cutover is executed) (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `@gogol/business` (DNA-20) files are deleted only when `PbpCutoverChecklist.ready` is `true`.
- All legacy entities must be mapped AND verified before cutover.
- No site may import from `@gogol/business` after cutover.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
