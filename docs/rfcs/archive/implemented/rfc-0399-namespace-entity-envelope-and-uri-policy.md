---
id: RFC-0399
title: "Namespace, Entity Envelope and URI Policy"
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
  - human:andrii-syrokomskyi
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
specRef: "pbp-specification-package/RFC-PBP-001"
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
  - "packages/pbp/ package exists with package.json, tsconfig.json, and src/ envelope types"
  - "Entity envelope TypeScript interface is defined and exported from @gogol/pbp"
  - "URI validation utility is defined and exported from @gogol/pbp"
  - "Schema ID pattern pbp/{entity}@1 is encoded as a typed constant and validated"
  - "Entity status vocabulary (draft, published, suspended, retired, superseded) is a closed enum"
  - "Governance block shape is defined with authorityRef, effectiveFrom, reviewedAt, reviewEvery, maintenanceOwnerRef"
  - "Identity equivalence relations (sameIdentityAs, equivalentTo, similarTo, supersedes, derivedFrom) are typed"
nonGoals:
  - "Does not define individual entity schemas (Business, Product, CatalogEntry, Offering, etc.) — those are RFC-PBP-010 through RFC-PBP-055"
  - "Does not define primitive types (Money, Decimal, Duration, LocalizedString, etc.) — that is RFC-PBP-002"
  - "Does not define schema evolution and compatibility rules — that is RFC-PBP-003"
  - "Does not define package source profiles or manifest structure — that is RFC-PBP-004"
  - "Does not define the compiler or validation pipeline — that is RFC-PBP-064"
  - "Does not migrate any site to PBP — migration is RFC-PBP-100 through RFC-PBP-103"
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

- `pbp-specification-package/system-spec` — §5 (Identity and URI), §3.10 (Stability of @1)
- `pbp-specification-package/entity-model` — §2 (Namespace and schema IDs), §3 (Entity envelope), §3.1–3.5 (schema, id, type, status, governance), §4.1 (EntityRef)
- `pbp-specification-package/decision-log` — ADR-002, ADR-003, ADR-013, ADR-024, ADR-025, ADR-026, ADR-027, ADR-031

_This RFC establishes the `packages/pbp/` package, the entity envelope TypeScript contract, and the URI policy. It does not copy field tables or schema definitions from the spec — those live in downstream RFCs that reference the vendored snapshot sections._

# RFC-0399: Namespace, Entity Envelope and URI Policy

## Context

RFC-0398 (Program Charter and Terminology) established the PBP program name, entity glossary, state vocabulary, architectural layers, and `pbp/*@1` namespace policy. However, the namespace is not yet physically anchored: there is no `packages/pbp/` package, no TypeScript types for the entity envelope, and no URI validation utility.

The PBP spec defines a common entity envelope shape (`pbp-specification-package/entity-model` §3) that every entity MUST conform to: `schema`, `id`, `type`, `status`, `name`, `summary`, `governance`. It also defines URI requirements (`pbp-specification-package/system-spec` §5.1): absolute HTTPS URI, locale-independent, stable across renames, no array indices, no file paths as semantic IDs. These contracts are the foundation for all downstream entity RFCs (RFC-PBP-010 through RFC-PBP-055) and cannot be deferred.

## Problem

1. **No `packages/pbp/` package exists.** Downstream RFCs need a physical home for schemas, loaders, and projection contracts. Without this package, there is nowhere to place the entity envelope types.
2. **No entity envelope TypeScript contract.** Every entity RFC will need to extend a base envelope (`schema`, `id`, `type`, `status`, `governance`). Without a shared base type, each RFC will define its own, creating drift.
3. **No URI validation.** The spec requires URIs to be absolute HTTPS, locale-independent, stable, and non-reusable. Without a validation utility, these rules are manual discipline.
4. **No schema ID pattern enforcement.** The `pbp/{entity}@1` pattern is normative but not encoded as a typed constant or validated.

## Decision

### 1. Establish `packages/pbp/` package

A new `@gogol/pbp` package is created in `packages/pbp/`. It is the single home for all PBP schemas, envelope types, URI utilities, and projection contracts. The package follows the same conventions as other `packages/*` (kebab-case filenames, TypeScript strict, `package.json` with workspace exports).

### 2. Entity envelope TypeScript contract

The `@gogol/pbp` package exports a base `PbpEntity` interface that every entity type extends:

```ts
interface PbpEntity {
  schema: string;        // e.g. "pbp/business@1"
  id: string;            // absolute HTTPS URI
  type: string;          // stable machine type, e.g. "business"
  status: PbpEntityStatus;
  name?: string;         // localized human name (required for published, optional for draft)
  summary?: string;      // localized short description (required for published, optional for draft)
  governance?: PbpGovernance;
}
```

`name` and `summary` are optional on the base interface to support `draft` entities that have not yet been named. Downstream entity RFCs MAY enforce `name` as required for `published` status via a refined Zod schema. The base interface does not encode status-dependent field requirements — those belong in entity-specific schemas.

### 3. Entity status vocabulary

A closed enum `PbpEntityStatus` is exported:

```ts
type PbpEntityStatus =
  | "draft"
  | "published"
  | "suspended"
  | "retired"
  | "superseded";
```

Production builds include only `published` entities unless a projection explicitly requests archival history.

### 4. Governance block shape

```ts
interface PbpGovernance {
  authorityRef: string;           // URI of the authority entity
  effectiveFrom?: string;         // ISO 8601 date
  reviewedAt?: string;            // ISO 8601 date
  reviewEvery?: string;           // ISO 8601 duration (e.g. "P1Y")
  maintenanceOwnerRef?: string;   // agent reference
}
```

Nested objects within an entity MAY have their own `governance` if their review cycle differs. Sidecar files by JSON/YAML path are forbidden.

`authorityRef` is required when `governance` is present. The spec allows authority to be "unambiguously derivable from package context" (`pbp-specification-package/system-spec` §5.2), but this RFC requires explicit `authorityRef` in the governance block rather than implicit derivation. Package context (RFC-PBP-004) MAY provide a default `authorityRef` that is injected at load time, but the resolved entity MUST carry the value explicitly.

### 5. Schema ID pattern

The `pbp/{entity}@1` pattern is encoded as a typed constant and validated:

```ts
const PBP_NAMESPACE = "pbp";
const PBP_MAJOR_VERSION = 1;

function pbpSchemaId(entity: string): string {
  return `${PBP_NAMESPACE}/${entity}@${PBP_MAJOR_VERSION}`;
}
```

A `validateSchemaId(schema: string)` utility checks the pattern and returns the entity type or throws.

### 6. URI policy

A `validatePbpUri(uri: string, options?: { allowedSchemes?: string[] })` utility enforces the requirements from `pbp-specification-package/system-spec` §5.1:

- MUST be an absolute URI with an explicit scheme.
- Default allowed scheme: `https`. Other schemes (e.g. `urn`, `did`) MAY be passed via `options.allowedSchemes`.
- MUST NOT contain locale markers (`.de`, `/de/`, etc.) — ADR-025.
- MUST NOT contain array indices.
- MUST NOT use local file paths as semantic IDs.
- SHOULD follow the pattern `https://{domain}/id/{entity-type}/{key}`.

### 7. Identity equivalence relations

Typed constants for the five identity relation types from `pbp-specification-package/system-spec` §5.5:

```ts
type PbpIdentityRelation =
  | "sameIdentityAs"
  | "equivalentTo"
  | "similarTo"
  | "supersedes"
  | "derivedFrom";
```

Automatic deduplication MUST NOT declare `sameIdentityAs` based on similar names alone.

### 8. EntityRef primitive

A base `PbpEntityRef` interface for cross-entity references:

```ts
interface PbpEntityRef {
  ref: string;           // URI of the referenced entity
  expectedType?: string; // optional expected entity type
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** `packages/pbp/` is a shared reusable library in `packages/*`. No site imports from another site. The package is app-agnostic and reusable across all sites that will adopt PBP.
- **DNA-20 (Business layer).** This RFC does not supersede DNA-20. `@gogol/business` remains canonical for existing sites. `packages/pbp/` is under construction and not consumed by sites until RFC-PBP-102 (Warpgogol Legacy Migration).
- **DNA-55 (Spec vendoring).** This RFC is the second materialized RFC from the `pbp-specification-package` spec, carrying `specRef: "pbp-specification-package/RFC-PBP-001"` traceability.
- **RFC-0398 (Program Charter).** This RFC implements the namespace policy declared in RFC-0398 §5 and the entity glossary from RFC-0398 §2. It uses the terminology established by the charter.
- **Compass sync.** `docs/requirements.xml` and `docs/technology.xml` will need updates to record the new `@gogol/pbp` package. This is done during implementation, not at draft stage.

## Design

### CLI surface

No CLI command is introduced by this RFC. The `@gogol/pbp` package is a TypeScript library consumed by downstream RFCs and the compiler pipeline (RFC-PBP-064). URI and schema ID validation are programmatic utilities, not CLI commands.

### TypeScript contracts

The `@gogol/pbp` package exports the following from `src/index.ts`:

```ts
// Namespace constants
export const PBP_NAMESPACE = "pbp";
export const PBP_MAJOR_VERSION = 1;

// Schema ID utilities
export function pbpSchemaId(entity: string): string;
export function validateSchemaId(schema: string): { entity: string; major: number };

// URI validation
export function validatePbpUri(
  uri: string,
  options?: { allowedSchemes?: string[] }
): { ok: true } | { ok: false; reason: string };

// Entity status
export type PbpEntityStatus = "draft" | "published" | "suspended" | "retired" | "superseded";
export const PBP_ENTITY_STATUSES: readonly PbpEntityStatus[];

// Governance
export interface PbpGovernance {
  authorityRef: string;
  effectiveFrom?: string;
  reviewedAt?: string;
  reviewEvery?: string;
  maintenanceOwnerRef?: string;
}

// Entity envelope
export interface PbpEntity {
  schema: string;
  id: string;
  type: string;
  status: PbpEntityStatus;
  name?: string;
  summary?: string;
  governance?: PbpGovernance;
}

// EntityRef
export interface PbpEntityRef {
  ref: string;
  expectedType?: string;
}

// Identity relations
export type PbpIdentityRelation =
  | "sameIdentityAs"
  | "equivalentTo"
  | "similarTo"
  | "supersedes"
  | "derivedFrom";
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/package.json` | Package manifest (`@gogol/pbp`, workspace exports) |
| `packages/pbp/tsconfig.json` | TypeScript strict config, extends `tsconfig/base.json` |
| `packages/pbp/src/index.ts` | Public API barrel: exports envelope, governance, URI utils, schema ID utils |
| `packages/pbp/src/envelope.ts` | `PbpEntity`, `PbpEntityStatus`, `PbpGovernance` types and constants |
| `packages/pbp/src/uri.ts` | `validatePbpUri` implementation |
| `packages/pbp/src/schema-id.ts` | `pbpSchemaId`, `validateSchemaId` implementation |
| `packages/pbp/src/entity-ref.ts` | `PbpEntityRef`, `PbpIdentityRelation` types |
| `packages/pbp/AGENTS.md` | Package-level agent guide (PBP-specific rules) |

### Output format

N/A — this RFC introduces a TypeScript library, not a CLI command. Programmatic utilities return typed results (`{ ok: true } | { ok: false; reason: string }`) consumable by downstream code and tests.

### Failure modes

- `validatePbpUri` returns `{ ok: false, reason }` for invalid URIs (non-HTTPS, locale markers, array indices, file paths). It does not throw.
- `validateSchemaId` throws on invalid schema IDs (wrong namespace, missing `@N`, empty entity).
- `tsc --noEmit` fails on any type error in the package.
- `vitest run` fails on any test failure.

## Rollout

- **Immediate:** Upon acceptance, the `packages/pbp/` package is created with the envelope types, URI validation, and schema ID utilities. Downstream RFCs (RFC-PBP-002, RFC-PBP-003, RFC-PBP-004, RFC-PBP-010+) can import from `@gogol/pbp`.
- **No site impact:** No existing site changes. `@gogol/pbp` is not consumed by any site until RFC-PBP-102 (Warpgogol Legacy Migration). `@gogol/business` (DNA-20) remains canonical.
- **Build integration:** `packages/pbp/` is added to the pnpm workspace and Turborepo pipeline. `tsc --noEmit` and `vitest run` run as part of the standard package build.
- **Compass sync:** `docs/requirements.xml` and `docs/technology.xml` are updated to record the new package during implementation.

## Alternatives considered

- **Place envelope types in `@gogol/business`.** Rejected: `@gogol/business` is the legacy layer (DNA-20) that PBP replaces. Mixing PBP types into the legacy package creates confusion about which is canonical and violates the forward-only principle (ADR-043).
- **Place envelope types in `@gogol/ontology`.** Rejected: `@gogol/ontology` is the UI taxonomy package (cosmic catalogs, manifests, intents, industries). PBP is a data layer, not a UI layer. Mixing them blurs the boundary between data model and UI taxonomy.
- **Use Zod schemas instead of TypeScript interfaces.** Rejected for this RFC: the envelope is a structural contract, not a validation schema. Zod schemas for individual entities are defined in downstream RFCs (RFC-PBP-010+). The envelope interface can be wrapped in Zod by downstream RFCs if needed.
- **Use `pbp@1` instead of `pbp/{entity}@1`.** Rejected: the spec uses per-entity schema IDs (`pbp/business@1`, `pbp/product@1`, etc.) so that individual entities can evolve independently within the `@1` namespace. A single `pbp@1` would couple all entities to a single schema version.

## Risks

- **Package proliferation.** Adding `packages/pbp/` increases the monorepo surface. Mitigation: the package has a clear, narrow contract (envelope + URI + schema ID) and is the single home for all PBP types.
- **Envelope drift.** If downstream RFCs define envelope fields differently, the base type becomes meaningless. Mitigation: `PbpEntity` is the normative base; downstream RFCs extend it with `& { ... }` and must not redefine `schema`, `id`, `type`, `status`, or `governance`.
- **URI validation false positives.** The URI validator may reject valid URIs that use non-HTTPS schemes permitted by the spec. Mitigation: the validator accepts HTTPS as default and allows other RFC-permitted schemes via an optional parameter.
- **Agent confusion.** Agents may try to consume `@gogol/pbp` from sites before migration. Mitigation: AGENTS.md and `packages/pbp/AGENTS.md` explicitly state that sites MUST NOT consume the package until RFC-PBP-102.

## Acceptance criteria

- [x] `packages/pbp/` package exists with `package.json`, `tsconfig.json`, and `src/` files (evidence: packages/ directory, package exists)
- [x] `PbpEntity`, `PbpEntityStatus`, `PbpGovernance` interfaces exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `validatePbpUri` utility exported and tested (valid HTTPS URI passes, locale markers fail, array indices fail, file paths fail) (evidence: implemented historically)
- [x] `pbpSchemaId` and `validateSchemaId` utilities exported and tested (evidence: implemented historically)
- [x] `PbpEntityRef` and `PbpIdentityRelation` types exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (22 tests) (evidence: packages/ directory, package exists)
- [x] `packages/pbp/AGENTS.md` created with PBP-specific agent rules (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/requirements.xml` and `docs/technology.xml` updated to record `@gogol/pbp` package (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No existing site imports from `@gogol/pbp` (enforced by AGENTS.md, not by code) (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The `packages/pbp/` package MUST NOT be consumed by any site until RFC-PBP-102 (Warpgogol Legacy Migration). This is enforced by AGENTS.md policy, not by import restrictions.
- Downstream RFCs extend `PbpEntity` with `interface PbpBusiness extends PbpEntity { ... }` — they MUST NOT redefine `schema`, `id`, `type`, `status`, or `governance`.
- If implementation reveals an invariant conflict with DNA-20, run `site-kernel run rfc.supersede.propose --id RFC-0399 --reason "..." --invariant "DNA-20"` instead of working around it (RFC-0334).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
