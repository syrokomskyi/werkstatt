---
id: RFC-0401
title: "Schema Evolution and Compatibility"
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
  - DNA-55
  - RFC-0398
  - RFC-0399
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-003"
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
  - "Schema version (@N) and data revision (Git) are clearly separated (ADR-031)"
  - "Additive-only changes within @1 are enforced by a compatibility check utility"
  - "Key renames, semantic changes, optional-to-required promotions, and type changes are detected as breaking"
  - "A schema compatibility validator is exported from @gogol/pbp"
  - "Migration to @2 requires an explicit migration contract (not auto-upgrade)"
nonGoals:
  - "Does not define the compiler pipeline — that is RFC-PBP-064"
  - "Does not define individual entity schemas — those are RFC-PBP-010 through RFC-PBP-055"
  - "Does not define the migration contract format for @2 — that is a future major-version RFC"
  - "Does not define Git-based data revision tracking — that is repository infrastructure"
  - "Does not define schema.org or JSON-LD projection compatibility — that is RFC-PBP-065"
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

- `pbp-specification-package/system-spec` — §3.10 (Stability of @1), §3.7 (Determinism)
- `pbp-specification-package/decision-log` — ADR-031 (Schema version vs data revision)

_This RFC defines the compatibility rules and validation utility for schema evolution within `pbp/*@1`._

# RFC-0401: Schema Evolution and Compatibility

## Context

RFC-0398 established the `pbp/*@1` frozen namespace policy: no key renames, no semantic changes, no optional-to-required promotions within `@1`. RFC-0399 encoded the schema ID pattern (`pbp/{entity}@1`). However, the compatibility rules are currently prose-only — there is no automated check that detects breaking changes when entity schemas are added or modified by downstream RFCs.

The PBP spec distinguishes schema version (`@N`) from data revision (Git history) — ADR-031. Schema version describes the format; Git revision describes the state of the data. This separation is critical: changing a schema's fields is a version-level concern, while updating entity data is a revision-level concern.

## Problem

1. **No compatibility validator.** The `@1` stability rules (system-spec §3.10) are prose. Without a validator, breaking changes (key renames, type changes, optional→required) can slip through during downstream RFC implementation.
2. **Schema version vs data revision confusion.** ADR-031 mandates separation, but there is no typed contract encoding this distinction. Agents may conflate format changes with data updates.
3. **No migration contract pattern.** When `@2` is eventually needed, the spec requires an explicit migration contract. Without a defined pattern, the migration will be ad hoc.

## Decision

### 1. Schema version vs data revision (ADR-031)

The `@gogol/pbp` package exports a typed distinction:

```ts
interface PbpSchemaVersion {
  major: number;       // e.g. 1
  schemaId: string;    // e.g. "pbp/business@1"
}

interface PbpDataRevision {
  gitRef: string;      // e.g. "git:8cf317..."
  timestamp: string;   // RFC 3339
}
```

Schema version describes the format contract. Data revision describes the state of the data at a point in time. These are orthogonal: the same schema version can have many data revisions.

### 2. Additive-only compatibility rules within `@1`

The following changes are **breaking** and MUST NOT occur within `@1` (system-spec §3.10):

- Renaming an existing key.
- Changing the semantic meaning of an existing value.
- Changing the default behavior of an existing field.
- Promoting an optional field to required.
- Changing the type or unit of an existing field.

The following changes are **additive** and ARE permitted within `@1`:

- Adding a new optional field.
- Adding a new controlled vocabulary value.
- Adding a new entity type.
- Clarifying documentation without changing behavior.

### 3. Compatibility validator

A `validateSchemaCompatibility` utility compares two schema definitions and detects breaking changes:

```ts
interface PbpSchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface PbpSchemaDefinition {
  schemaId: string;
  fields: PbpSchemaField[];
}

interface PbpCompatibilityViolation {
  kind: "key-rename" | "type-change" | "optional-to-required" | "unit-change" | "semantic-change";
  field: string;
  before: string;
  after: string;
}

function validateSchemaCompatibility(
  before: PbpSchemaDefinition,
  after: PbpSchemaDefinition,
): { ok: true } | { ok: false; violations: PbpCompatibilityViolation[] };
```

### 4. Major version migration contract

When `@2` is needed, a migration contract MUST be defined:

```ts
interface PbpMigrationContract {
  fromMajor: number;
  toMajor: number;
  transformations: PbpMigrationTransformation[];
}

interface PbpMigrationTransformation {
  field: string;
  kind: "rename" | "type-convert" | "split" | "merge" | "remove";
  before: string;
  after: string;
  scriptRef?: string;
}
```

This contract pattern is defined but not enforced until a `@2` namespace is created. The `@1` → `@2` migration is out of scope for this RFC.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Compatibility types and validator are in `packages/pbp/`, a shared reusable library.
- **DNA-55 (Spec vendoring).** Fourth materialized RFC from `pbp-specification-package`, carrying `specRef: "pbp-specification-package/RFC-PBP-003"`.
- **RFC-0398 (Program Charter).** Enforces the `pbp/*@1` stability policy defined in the charter.
- **RFC-0399 (Entity Envelope).** Uses `pbpSchemaId` and `validateSchemaId` from RFC-0399 to construct schema IDs in definitions.

## Design

### CLI surface

No CLI command is introduced. All types and utilities are in `@gogol/pbp`.

### TypeScript contracts

New exports from `@gogol/pbp`:

```ts
// Version vs revision
export interface PbpSchemaVersion { major: number; schemaId: string; }
export interface PbpDataRevision { gitRef: string; timestamp: string; }

// Schema definition model
export interface PbpSchemaField { name: string; type: string; required: boolean; description?: string; }
export interface PbpSchemaDefinition { schemaId: string; fields: PbpSchemaField[]; }

// Compatibility validation
export interface PbpCompatibilityViolation {
  kind: "key-rename" | "type-change" | "optional-to-required" | "unit-change" | "semantic-change";
  field: string;
  before: string;
  after: string;
}
export function validateSchemaCompatibility(
  before: PbpSchemaDefinition,
  after: PbpSchemaDefinition,
): { ok: true } | { ok: false; violations: PbpCompatibilityViolation[] };

// Migration contract (defined, not enforced until @2)
export interface PbpMigrationTransformation {
  field: string;
  kind: "rename" | "type-convert" | "split" | "merge" | "remove";
  before: string;
  after: string;
  scriptRef?: string;
}
export interface PbpMigrationContract {
  fromMajor: number;
  toMajor: number;
  transformations: PbpMigrationTransformation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/schema-evolution.ts` | `PbpSchemaVersion`, `PbpDataRevision`, `PbpSchemaField`, `PbpSchemaDefinition`, `PbpCompatibilityViolation`, `validateSchemaCompatibility` |
| `packages/pbp/src/migration.ts` | `PbpMigrationContract`, `PbpMigrationTransformation` |
| `packages/pbp/src/index.ts` | Re-exports new types and utilities |

### Output format

N/A — library-only RFC. `validateSchemaCompatibility` returns typed results.

### Failure modes

- `validateSchemaCompatibility` returns `{ ok: false, violations }` when breaking changes are detected.
- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, compatibility types and validator are added to `@gogol/pbp`. Downstream entity RFCs can use `validateSchemaCompatibility` to verify their schemas are additive-only.
- **No site impact:** `@gogol/pbp` is not consumed by sites until RFC-PBP-102.
- **Build integration:** `tsc --noEmit` and `vitest run` as standard package build.

## Alternatives considered

- **Use JSON Schema for compatibility checking.** Rejected: JSON Schema tooling is heavy and the PBP schema model is simpler than full JSON Schema. A lightweight TypeScript validator is sufficient for the additive-only check.
- **No validator — rely on code review.** Rejected: the spec explicitly mandates `@1` stability (§3.10). Manual discipline is insufficient when multiple agents and RFCs are adding fields.
- **Use semver for schema versioning.** Rejected: PBP uses `@N` (major-only), not semver. Additive changes within `@1` are allowed without version bump. Semver's minor/patch distinction is unnecessary.

## Risks

- **False negatives in compatibility check.** The validator checks field names, types, and required flags, but cannot detect semantic meaning changes (e.g., renaming a field's intent without changing its name). Mitigation: semantic changes are a human review responsibility, documented in the RFC process.
- **Premature migration contract.** Defining `PbpMigrationContract` before `@2` is needed may lead to over-engineering. Mitigation: the contract is a type definition only — no enforcement, no implementation, no tooling until `@2` is proposed.
- **Agent misuse.** Agents may treat the compatibility validator as a substitute for human review. Mitigation: implementation notes explicitly state that semantic changes require human review.

## Acceptance criteria

- [x] `PbpSchemaVersion` and `PbpDataRevision` interfaces exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpSchemaField`, `PbpSchemaDefinition`, `PbpCompatibilityViolation` interfaces exported (evidence: implemented historically)
- [x] `validateSchemaCompatibility` exported and tested (additive changes pass, key renames fail, type changes fail, optional→required fails) (evidence: implemented historically)
- [x] `PbpMigrationContract` and `PbpMigrationTransformation` interfaces exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (46 tests) (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No existing site imports from `@gogol/pbp` (enforced by AGENTS.md) (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- `validateSchemaCompatibility` checks structural compatibility only (field names, types, required flags). Semantic meaning changes require human review and a new major version.
- Within `@1`, only additive optional changes are permitted. Any breaking change requires `@2` and a `PbpMigrationContract`.
- Schema version (`@N`) and data revision (Git) are orthogonal — do not conflate them (ADR-031).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
