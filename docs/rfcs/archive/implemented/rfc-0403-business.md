---
id: RFC-0403
title: "Business"
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
  - RFC-0399
  - RFC-0400
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-010"
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
  - "PbpBusiness interface exported from @gogol/pbp extending PbpEntity"
  - "Business fields: name, summary, description, businessModel, markets, industries, yearEstablished, mission, brandRefs, legalIdentityRef, placeRefs, contactPointRefs, webPresenceRefs, catalogRefs"
  - "Business MUST NOT contain prices, SLA, service areas, or banking details (entity-model §5.3)"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define LegalIdentity — that is RFC-PBP-011"
  - "Does not define Brand — that is RFC-PBP-012"
  - "Does not define Place — that is RFC-PBP-013"
  - "Does not define ContactPoint — that is RFC-PBP-014"
  - "Does not define WebPresence — that is RFC-PBP-015"
  - "Does not define Catalog — that is RFC-PBP-025"
  - "Does not define Zod schemas — entity Zod schemas belong in downstream implementation RFCs"
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

- `pbp-specification-package/entity-model` — §5 (Business: structure, exclusions)
- `pbp-specification-package/target-blueprint` — Business entity blueprint
- `pbp-specification-package/decision-log` — ADR-005 (local catalog separated), ADR-036 (public/private profiles)

_This RFC defines the `PbpBusiness` entity interface. It references the vendored snapshot for field semantics — does not copy field tables._

# RFC-0403: Business

## Context

The PBP spec defines Business as the public operational identity of a business (`pbp-specification-package/entity-model` §5). It is the root entity from which all other entities are referenced: brands, legal identity, places, contact points, web presences, and catalogs.

The current `@gogol/business` package (DNA-20) mixes Business, Brand, market, territory, and Product promise into a single `company.md` (migration-plan §2). The PBP model separates these into distinct entities. This RFC defines the Business entity interface that will replace the mixed `company.md` model.

## Problem

1. **No `PbpBusiness` interface.** The `@gogol/pbp` package has the entity envelope (RFC-0399) and primitive types (RFC-0400) but no concrete entity interfaces. Business is the first entity — all others reference it.
2. **Mixed concerns in legacy.** The current `@gogol/business` package mixes business identity, brand, legal, and product promises. The PBP model separates these. Without a clean `PbpBusiness` interface, the migration (RFC-PBP-100) has no target.
3. **No exclusion enforcement.** The spec defines what Business MUST NOT contain (§5.3): prices, product promises, SLA, service areas, banking details, design mode, internal tech stack. Without a typed interface, these exclusions are unenforceable.

## Decision

### 1. `PbpBusiness` interface

```ts
interface PbpBusiness extends PbpEntity {
  type: "business";
  name: string;
  summary?: string;
  description?: string;
  businessModel?: { typeRef: string };
  markets?: Record<string, PbpControlledValue>;
  industries?: Record<string, { categoryRef: string }>;
  yearEstablished?: number;
  mission?: string;
  brandRefs?: Record<string, PbpEntityRef>;
  legalIdentityRef?: PbpEntityRef;
  placeRefs?: Record<string, PbpEntityRef & { role?: string }>;
  contactPointRefs?: Record<string, PbpEntityRef>;
  webPresenceRefs?: Record<string, PbpEntityRef>;
  catalogRefs?: Record<string, PbpEntityRef>;
}
```

### 2. Exclusions (entity-model §5.3)

`PbpBusiness` MUST NOT contain:

- Prices or pricing fields
- Product promises or deliverables
- SLA or service-level commitments
- Service area of a specific Offering
- Banking details or private financial data
- Design mode (`bodenstation`) as a business fact
- Internal technical stack details

These exclusions are documented in the interface's JSDoc and enforced by downstream Zod schemas (not in this RFC).

### 3. Schema ID

```ts
const BUSINESS_SCHEMA_ID = pbpSchemaId("business"); // "pbp/business@1"
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `PbpBusiness` is in `packages/pbp/`, a shared reusable library.
- **DNA-20 (Legacy business layer).** `@gogol/business` remains canonical until RFC-PBP-102. `PbpBusiness` is the target interface for migration.
- **DNA-55 (Spec vendoring).** Sixth materialized RFC, `specRef: "pbp-specification-package/RFC-PBP-010"`.
- **RFC-0399 (Entity Envelope).** `PbpBusiness extends PbpEntity` — inherits `schema`, `id`, `status`, `governance` without redefining them.
- **RFC-0400 (Primitive Types).** Uses `PbpControlledValue` for markets, `PbpEntityRef` for cross-entity references.

## Design

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpBusiness extends PbpEntity {
  type: "business";
  name: string;
  summary?: string;
  description?: string;
  businessModel?: { typeRef: string };
  markets?: Record<string, PbpControlledValue>;
  industries?: Record<string, { categoryRef: string }>;
  yearEstablished?: number;
  mission?: string;
  brandRefs?: Record<string, PbpEntityRef>;
  legalIdentityRef?: PbpEntityRef;
  placeRefs?: Record<string, PbpEntityRef & { role?: string }>;
  contactPointRefs?: Record<string, PbpEntityRef>;
  webPresenceRefs?: Record<string, PbpEntityRef>;
  catalogRefs?: Record<string, PbpEntityRef>;
}

export const BUSINESS_SCHEMA_ID: string; // "pbp/business@1"
```

### File system responsibilities

| Path                                    | Role                                          |
| --------------------------------------- | --------------------------------------------- |
| `packages/pbp/src/entities/business.ts` | `PbpBusiness` interface, `BUSINESS_SCHEMA_ID` |
| `packages/pbp/src/index.ts`             | Re-export `PbpBusiness`, `BUSINESS_SCHEMA_ID` |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, `PbpBusiness` is added to `@gogol/pbp`. Downstream RFCs (011-015, 025) can reference it.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102.

## Alternatives considered

- **Flatten Business fields into PbpEntity.** Rejected: not all entities have `businessModel`, `markets`, `industries`, etc. The envelope must remain generic.
- **Include pricing in Business.** Rejected: entity-model §5.3 explicitly excludes prices. Pricing belongs to Offering (RFC-PBP-030).
- **Use a single `refs` map instead of typed ref maps.** Rejected: typed ref maps (`brandRefs`, `placeRefs`, etc.) provide compile-time safety and make the entity structure self-documenting.

## Risks

- **Interface too wide.** 13 optional fields may seem like a lot. Mitigation: all are optional; a minimal Business has only `name`. Fields are additive within `@1`.
- **Ref map key naming.** Keys like `primary`, `headquarters`, `general` are semantic keys (ADR-027). Without a controlled vocabulary for keys, agents may invent inconsistent keys. Mitigation: keys are documented in the spec examples and downstream Zod schemas can validate them.

## Acceptance criteria

- [x] `PbpBusiness` interface exported from `@gogol/pbp`, extending `PbpEntity` (evidence: packages/ directory, package exists)
- [x] `BUSINESS_SCHEMA_ID` constant exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpBusiness extends PbpEntity` — do not redefine `schema`, `id`, `status`, `governance` on this interface.
- Business MUST NOT contain prices, SLA, service areas, or banking details (entity-model §5.3).
- `brandRefs`, `placeRefs`, `contactPointRefs`, `webPresenceRefs`, `catalogRefs` use semantic keys (ADR-027), not array indices.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
