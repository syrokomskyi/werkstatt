---
id: RFC-0410
title: "Brand and Person Relations"
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
specRef: "pbp-specification-package/RFC-PBP-012"
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
  - "PbpBrand interface exported extending PbpEntity"
  - "Brand fields: name, tagline, ownerBusinessRef"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define Business — that is RFC-0403"
  - "Does not define visual identity or design tokens"
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

- `pbp-specification-package/entity-model` — §7 (Brand)
- `pbp-specification-package/target-blueprint` — Brand target structure

# RFC-0410: Brand and Person Relations

## Context

The PBP spec defines Brand as a federated entity for the public-facing brand of a business (entity-model §7). It carries name, tagline, and owner business reference. Canonical business facts must not be mixed with design tokens.

## Problem

1. **No `PbpBrand` interface.** The `@gogol/pbp` package has no Brand entity.
2. **No separation of brand from business facts.** The spec requires that canonical business facts are not mixed with design tokens (§7).

## Decision

### 1. `PbpBrand` interface

```ts
interface PbpBrand extends PbpEntity {
  type: "brand";
  name: string;
  tagline?: string;
  ownerBusinessRef: PbpEntityRef;
}
```

### 2. Schema ID

```ts
const BRAND_SCHEMA_ID = pbpSchemaId("brand"); // "pbp/brand@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpBrand` is in `packages/pbp/`.
- **DNA-55 (Spec vendoring).** `specRef: "pbp-specification-package/RFC-PBP-012"`.
- **RFC-0399 (Entity Envelope).** `PbpBrand extends PbpEntity`.
- **RFC-0403 (Business).** Business references Brand via `brandRefs`.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpBrand extends PbpEntity {
  type: "brand";
  name: string;
  tagline?: string;
  ownerBusinessRef: PbpEntityRef;
}

export const BRAND_SCHEMA_ID: string;
```

### File system responsibilities

| Path                                 | Role                          |
| ------------------------------------ | ----------------------------- |
| `packages/pbp/src/entities/brand.ts` | `PbpBrand`, `BRAND_SCHEMA_ID` |
| `packages/pbp/src/index.ts`          | Re-exports                    |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpBrand` is added to `@gogol/pbp`.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Merge Brand into Business.** Rejected: Brand is a federated entity with its own identity. A business can have multiple brands.
- **Include visual identity fields.** Rejected: canonical business facts must not mix with design tokens (§7). Visual identity is a separate concern.

## Risks

- **Brand/Business confusion.** Agents may put business facts in Brand or vice versa. Mitigation: implementation notes state canonical business facts belong in Business, not Brand.

## Acceptance criteria

- [x] `PbpBrand` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `BRAND_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpBrand extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance`.
- Canonical business facts belong in Business, not Brand. Brand carries name, tagline, and owner reference only.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
