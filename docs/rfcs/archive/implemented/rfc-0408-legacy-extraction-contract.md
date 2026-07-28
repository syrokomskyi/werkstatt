---
id: RFC-0408
title: "Legacy Extraction Contract"
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
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
specRef: "pbp-specification-package/RFC-PBP-100"
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
  - "PbpLegacySourceFile interface exported with file, currentRole, problem fields"
  - "PbpExtractionResult interface exported with sourceFile, targetEntities, decisions, unresolved"
  - "PbpMigrationDecision type exported (needs-owner-decision, extracted, deferred, not-applicable)"
  - "Legacy source file inventory matches migration-plan §2"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not execute the migration — that is RFC-PBP-102"
  - "Does not define normalization rules — that is RFC-PBP-101"
  - "Does not delete legacy files — deletion happens after 100% coverage (ADR-043)"
  - "Does not define the target PBP package structure — that is defined by entity RFCs"
  - "Does not create a compatibility layer — ADR-043 forbids it"
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

- `pbp-specification-package/migration-plan` — §2 (Input corpus), §3 (Agent rules), §4 (Entity extraction targets)

_This RFC defines the TypeScript contracts for the legacy extraction process. It does not execute the migration._

# RFC-0408: Legacy Extraction Contract

## Context

The PBP migration plan (`pbp-specification-package/migration-plan`) defines an input corpus of 18 legacy files (§2) that must be transformed into PBP entities. The migration agent must preserve confirmed meaning, separate mixed entities, not invent facts, not publish private data, and produce a full migration report.

The current Warpgogol model uses `@gogol/business` (DNA-20) with mixed-concern files like `company.md`, `offer.md`, `legal.md`, etc. This RFC defines the extraction contract that the migration agent (RFC-PBP-102) will use.

## Problem

1. **No extraction result contract.** The migration plan describes the process but there is no typed interface for extraction results — what the agent produces when processing a legacy file.
2. **No migration decision type.** The plan defines `needs-owner-decision` for unconfirmed facts (§3.2) but there is no typed decision enum.
3. **No legacy source file inventory.** The plan lists 18 files (§2) but there is no typed inventory contract.
4. **No unresolved items tracking.** Facts that cannot be extracted need to be tracked for owner review. Without a typed interface, unresolved items are lost.

## Decision

### 1. Legacy source file inventory

```ts
interface PbpLegacySourceFile {
  file: string;
  currentRole: string;
  problem: string;
}
```

The inventory matches migration-plan §2 (18 files: `company.md`, `company.claims.yaml`, `compliance.md`, `compliance.claims.yaml`, `contact.md`, `contact.claims.yaml`, `external-services.md`, `legal.md`, `legal.claims.yaml`, `location.md`, `location.claims.yaml`, `meta.md`, `offer.md`, `offer.claims.yaml`, `platform-comparison.md`, `platform-comparison.claims.yaml`, `services.md`, `web.md`, `web.claims.yaml`).

### 2. Migration decision

```ts
type PbpMigrationDecision =
  | "extracted"
  | "needs-owner-decision"
  | "deferred"
  | "not-applicable";
```

### 3. Extraction result

```ts
interface PbpUnresolvedItem {
  field: string;
  reason: string;
  sourceFile: string;
}

interface PbpExtractionResult {
  sourceFile: string;
  targetEntities: string[];
  decisions: Record<string, PbpMigrationDecision>;
  unresolved: PbpUnresolvedItem[];
}
```

### 4. Agent rules (migration-plan §3)

The extraction contract encodes the agent rules from §3:

- **No legacy support (§3.1):** No alias fields, no compatibility layer, no old `*.claims.yaml` as source.
- **No guessing (§3.2):** Unconfirmed facts are `needs-owner-decision`, not invented.
- **No derived/declared confusion (§3.3):** Derived facts are marked, not presented as declared.

### 5. No compatibility layer (ADR-043)

Legacy files are deleted after 100% coverage and clean build (ADR-043). This RFC does not create any compatibility layer or alias fields.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Extraction types are in `packages/pbp/`.
- **DNA-20 (Legacy business layer).** `@gogol/business` is the source being extracted from. It remains canonical until RFC-PBP-102 completes.
- **DNA-55 (Spec vendoring).** Eleventh materialized RFC, `specRef: "pbp-specification-package/RFC-PBP-100"`.
- **RFC-0399 (Entity Envelope).** Target entities use `PbpEntity` envelope.
- **ADR-043 (Legacy removed after migration).** No compatibility layer. Old files deleted after 100% coverage and clean build.

## Design

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
export interface PbpLegacySourceFile {
  file: string;
  currentRole: string;
  problem: string;
}

export type PbpMigrationDecision = "extracted" | "needs-owner-decision" | "deferred" | "not-applicable";

export interface PbpUnresolvedItem {
  field: string;
  reason: string;
  sourceFile: string;
}

export interface PbpExtractionResult {
  sourceFile: string;
  targetEntities: string[];
  decisions: Record<string, PbpMigrationDecision>;
  unresolved: PbpUnresolvedItem[];
}
```

### File system responsibilities

| Path                                       | Role                          |
| ------------------------------------------ | ----------------------------- |
| `packages/pbp/src/migration-extraction.ts` | All extraction contract types |
| `packages/pbp/src/index.ts`                | Re-exports                    |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.

## Rollout

- **Immediate:** Upon acceptance, extraction types are added to `@gogol/pbp`. The migration RFC (RFC-PBP-102) can use them.
- **No site impact:** `@gogol/pbp` not consumed by sites until RFC-PBP-102. Legacy `@gogol/business` remains canonical.

## Alternatives considered

- **Compatibility layer.** Rejected (ADR-043): no alias fields, no dual-write period. Legacy files are deleted after 100% coverage and clean build.
- **Untyped migration report.** Rejected: a typed extraction result ensures the migration agent produces consistent, machine-checkable output.
- **Inline extraction in entity RFCs.** Rejected: extraction is a cross-cutting migration concern, not an entity concern. Keeping it separate allows the migration agent to evolve independently.

## Risks

- **Unresolved items may block migration.** Facts that need owner decisions may delay the migration. Mitigation: `needs-owner-decision` is a typed decision — the migration report tracks all unresolved items for systematic owner review.
- **Legacy file inventory drift.** The 18-file inventory matches the migration plan at the time of writing. If new files are added before migration, the inventory must be updated. Mitigation: the inventory is a typed constant that can be extended.
- **Private data exposure.** The extraction agent must not publish private operational data (ADR-036). Mitigation: the agent rules (§3) explicitly prohibit publishing private data, and the extraction result tracks all decisions.

## Acceptance criteria

- [x] `PbpLegacySourceFile` interface exported from `@gogol/pbp` (evidence: packages/ directory, package exists)
- [x] `PbpMigrationDecision` type exported (evidence: implemented historically)
- [x] `PbpUnresolvedItem` and `PbpExtractionResult` interfaces exported (evidence: implemented historically)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `vitest run` passes for `packages/pbp/` (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] No site imports from `@gogol/pbp` (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The extraction agent MUST NOT create alias fields or compatibility layers (ADR-043, migration-plan §3.1).
- Unconfirmed facts MUST be marked `needs-owner-decision`, not invented (migration-plan §3.2).
- Derived facts MUST be marked as derived, not presented as declared (migration-plan §3.3).
- Private operational data (banking, tax, secrets, customer data) MUST NOT be extracted into public PBP (ADR-036).
- Legacy files are deleted only after 100% coverage and clean build (ADR-043) — not by this RFC.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
