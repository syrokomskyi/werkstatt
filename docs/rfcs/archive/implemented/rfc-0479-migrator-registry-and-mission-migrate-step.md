---
id: RFC-0479
title: "Migrator registry and mission.migrate step"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
createdAt: 2026-07-21
updatedAt: 2026-07-24
enhancedAt: 2026-07-21
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0221
  - RFC-0356
amendedBy: []
related:
  - DNA-41
  - DNA-44
  - DNA-46
  - DNA-47
  - RFC-0221
  - RFC-0354
  - RFC-0355
  - RFC-0356
  - RFC-0478
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-44
  - DNA-46
  - DNA-47
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed:
    - mission.migrate
    - migrator.registry.validate
  added: []
  changed:
    - mission.materialize
    - mission.reconcile
    - sternsystem.pin
    - sternsystem.extract
    - handoff.pack
    - handoff.absorb
  removed:
    - migrator.validate
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/ontology"
successSignals:
  - "mission.migrate applies migrator chain to workpiece data and updates migratorCursor"
  - "migrator.registry.validate checks migrator-RFC correspondence, id uniqueness, and test coverage"
  - "Migrators are idempotent (PBT f(f(x)) == f(x)) and covered by snapshot tests on real data"
nonGoals:
  - "Does not define platform versioning enforcement — that is RFC-0478"
  - "Does not change mission lifecycle beyond adding the migrate step — lifecycle changes are RFC-0480"
  - "Does not support reversible migrations — most breaking changes are irreversible (field deletion, schema rename)"
  - "Does not implement migrators for past breaking changes — only establishes the system for future ones"
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

# RFC-0479: Migrator registry and mission.migrate step

## Context

The WGogol platform develops without backward compatibility for data contracts (layer B). Breaking changes to content schemas, `system.md` structure, `manifest.yaml` shape, or other data contracts are a normal part of platform evolution. Each breaking change is accompanied by a `versionBump: minor` in the RFC (RFC-0478).

The Sternsystem pin file (`system.pin.json`, DNA-44) records `migratorCursor` — today a SemVer string that tracks the platform version. `mission.materialize` (DNA-47) compares pin version to platform version and determines `in-sync`, `catch-up`, or `refuse-downgrade`. However, the `migratorChain` in the materialization report is always an empty array — no migrators exist. When a breaking change to layer B occurs, existing Sternsystem content simply fails `app.contract.full` validation after materialization, and the mission stalls with no guided path forward.

### Relationship to existing RFC-0221 migrator system

RFC-0221 established an earlier migrator system in `packages/os/site-kernel-handoff/src/migrators/registry.ts` with a `Migrator` type operating on `AuthoredSet` (Map<string, string>), `selectMigratorChain(cursor, current)`, `CONTRACT_CHANGE_POINTS`, `validateMigratorContinuity()`, and the `migrator.validate` command. That system was SemVer-based and never seeded with actual migrators. This RFC amends RFC-0221: the old `Migrator` type, `MIGRATORS` array, `CONTRACT_CHANGE_POINTS`, `selectMigratorChain`, `validateMigratorContinuity`, and `migrator.validate` command are **removed** (forward-only). The new registry replaces them in the same directory with a different `Migrator` interface keyed by RFC-id. `handoff.absorb` is updated to use the new registry via `mission.migrate` instead of the old `applyMigratorChain` path.

## Problem

When a breaking change to layer B lands (e.g. RFC-0471 deleted `@gogol/business` and replaced it with `@gogol/pbp`), every existing Sternsystem's content needs to be transformed to the new schema. Today there is no mechanism for this:

1. **No migrator registry.** There is no code that transforms old content to new schemas.
2. **No migration step in mission lifecycle.** `mission.materialize` copies data as-is. If the data is in an old format, `mission.validate` fails with schema errors, but the operator has no guided path to fix them.
3. **`migratorCursor` is SemVer, not migrator-ids.** This ties migration tracking to version numbers, which may not correspond 1:1 to breaking changes (not every minor version breaks B).
4. **No enforcement that breaking-change RFCs have migrators.** An RFC with `versionBump: minor` (RFC-0478) can be merged without a corresponding migrator.

## Decision

This RFC introduces:

### 1. Migrator registry

A typed, append-only registry of migrators in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. Each migrator:

- Has `id` equal to the RFC-id that introduced the breaking change (e.g. `"rfc-0471"`).
- Has `fromVersion` and `toVersion` as SemVer metadata (human-readable, not used for ordering).
- Has a `transform(data: SternsystemData, ctx: MigrationContext) → SternsystemData` pure function.
- Is idempotent: `f(f(x)) == f(x)` — re-application to already-migrated data is a no-op.
- Is covered by PBT (idempotency invariant, DNA-41) and snapshot tests on real sanitized data.

The registry is append-only: migrators are never deleted, even when their RFC is superseded. Ordering is by RFC-id (numeric), which is monotonically increasing (V-28, RFC-0478).

### 2. `migratorCursor` as migrator-id list

`system.pin.json` `migratorCursor` changes from a SemVer string to a list of applied migrator-ids:

```json
"migratorCursor": ["rfc-0024", "rfc-0471"]
```

`mission.migrate` applies all migrators from the registry whose `id` is not in `migratorCursor`, in RFC-id order. After successful application, the applied ids are added to `migratorCursor` in the workpiece copy of the pin file. `mission.reconcile` transfers the updated pin back to the cache clone.

### 3. `mission.migrate` step

A new step in the mission lifecycle, between `mission.materialize` and `mission.validate`:

```
mission.open → mission.materialize → mission.migrate → operator edits → mission.validate → release.prepare → mission.reconcile → mission.close
```

`mission.migrate`:

1. Reads `migratorCursor` from the workpiece pin file.
2. Filters the registry for migrators whose `id` is not in `migratorCursor`.
3. Applies each migrator in RFC-id order to the workpiece data.
4. If a migrator throws `MigrationError` — mission blocks, operator fixes content in workpiece, re-runs `mission.migrate` (idempotent — restarts from beginning).
5. On success, updates `migratorCursor` in the workpiece pin file.
6. Commits the migration as a git commit in the workpiece repository (RFC-0480).
7. Writes a migration report to `missions/<id>/evidence/migration-report.json`.

### 4. `migrator.registry.validate` command

Validates the migrator registry:

- Every migrator `id` matches an existing RFC with `versionBump: minor`. For pre-cutoff RFCs (created before RFC-0478 introduced `versionBump`), the check accepts any RFC whose body or title indicates a breaking data-contract change (determined by `kind: architecture` or `kind: contract` and `scope: workspace`). The cutoff date is the acceptance date of RFC-0478.
- No duplicate migrator-ids.
- Every RFC with `versionBump: minor` and `status: implemented` has a corresponding migrator in the registry.
- Each migrator has PBT tests (`*.pbt.test.ts`) and snapshot tests.
- Registry is ordered by RFC-id (numeric).

**Dependency on RFC-0478:** The `versionBump: minor` field is introduced by RFC-0478. `migrator.registry.validate` can only enforce the RFC↔migrator correspondence after RFC-0478 is accepted and implemented. Until then, the validation skips the correspondence check and only validates id uniqueness, ordering, and test coverage.

## Architectural fit

- **DNA-41 (Property-based testing):** Migrators are pure functions with an idempotency invariant — prime candidates for PBT with `fast-check`.
- **DNA-44 (Sternsystem bundle contract):** `migratorCursor` in the pin file changes from SemVer string to migrator-id list. This is a breaking change to the pin schema — handled by the migrator system itself (the first migrator transforms old pin files).
- **DNA-46 (Mission lifecycle):** `mission.migrate` is a new lifecycle step. The mission manifest gains a `migratedAt` timestamp. Bordbuch records migration events.
- **DNA-47 (Materialization):** `mission.materialize` no longer needs to handle `catch-up` migration — that responsibility moves to `mission.migrate`. Materialize just copies data; migrate transforms it.
- **RFC-0478 (Platform versioning):** `versionBump: minor` in an RFC is the signal that a migrator is required. `migrator.registry.validate` enforces this correspondence.

## Design

### Migrator registry

```ts
// packages/os/site-kernel-handoff/src/migrators/registry.ts

export interface Migrator {
  /** RFC-id that introduced the breaking change. */
  id: string;
  /** Human-readable SemVer metadata — not used for ordering. */
  fromVersion: string;
  toVersion: string;
  /** Pure, idempotent transform function. */
  transform: (data: SternsystemData, ctx: MigrationContext) => SternsystemData;
}

export const migratorRegistry: Migrator[] = [
  // Migrators are added here as RFCs with versionBump: minor are implemented.
  // Ordered by RFC-id (numeric).
];

export function migratorsToApply(cursor: string[]): Migrator[] {
  return migratorRegistry
    .filter((m) => !cursor.includes(m.id))
    .sort((a, b) => numericRfcId(a.id) - numericRfcId(b.id));
}
```

### `SternsystemData` interface

```ts
export interface SternsystemData {
  /** Root of the workpiece data tree. */
  rootPath: string;
  /** Data paths that the migrator may transform (STERNSYSTEM_DATA_PATHS). */
  dataPaths: string[];
}

export interface MigrationContext {
  systemId: string;
  missionId: string;
  logger: { info: (msg: string) => void };
}
```

### `MigrationError`

```ts
export class MigrationError extends Error {
  constructor(
    public migratorId: string,
    public filePath: string,
    public fieldPath: string,
    public reason: string,
  ) {
    super(`[migrator ${migratorId}] ${filePath}:${fieldPath} — ${reason}`);
  }
}
```

### `mission.migrate` command

```sh
pnpm exec site-kernel run mission.migrate --mission <mission-id>
pnpm exec site-kernel run mission.migrate --mission <mission-id> --report-only
pnpm exec site-kernel run mission.migrate --mission <mission-id> --json
```

**Scope:** workspace

**Flags:**

| Flag            | Kind    | Required | Description                                    |
| --------------- | ------- | -------- | ---------------------------------------------- |
| `--mission`     | string  | yes      | Mission id                                     |
| `--report-only` | boolean | no       | Report what would be migrated without applying |
| `--json`        | boolean | no       | JSON output for agent consumption              |

### TypeScript contracts

```ts
interface MigrationViolation {
  migratorId: string;
  filePath: string;
  fieldPath: string;
  reason: string;
}

interface MissionMigrateData {
  missionId: string;
  systemId: string;
  appliedMigrators: string[];
  skippedMigrators: string[];
  blockedMigrator: string | null;
  blockReason: string | null;
  migratedAt: string;
}

interface MissionMigrateResult {
  command: "mission.migrate";
  status: "pass" | "blocked" | "fail";
  data?: MissionMigrateData;
  violations: MigrationViolation[];
}
```

### Pin file schema change

`migratorCursor` in `system.pin.json` changes from `string` to `string[]`:

```json
{
  "migratorCursor": ["rfc-0024", "rfc-0471"]
}
```

A bootstrapping migrator (`rfc-0479` itself) transforms old pin files from `migratorCursor: "4.5.0"` to `migratorCursor: ["rfc-0479"]`. This is the first migrator in the registry.

### `handoffLockSchema` schema change

`handoffLockSchema.migratorCursor` in `packages/ontology/src/operations/handoff.ts` also changes from `z.string().regex(semverRe)` to `z.array(z.string())`. `handoff.pack` writes the new array format (all migrator ids in the registry, since the packed site is up-to-date). `handoff.absorb` reads the array cursor and passes it to the new `migratorsToApply(cursor)` function instead of the old `selectMigratorChain(cursor, current)`.

### Initial `migratorCursor` for new Sternsystems

`sternsystem.pin` and `sternsystem.extract` write `migratorCursor` as a list of all migrator ids currently in the registry. A new Sternsystem is created at the current platform version, so all migrators are considered already applied. This is consistent with the bootstrapping migrator semantics: existing systems get a fresh cursor with only the bootstrapping migrator; all past breaking changes are considered already applied.

### Bordbuch entry kind

A new `mission-migrate` entry kind is added to `bordbuchEntryKindSchema` in `packages/ontology/src/operations/mission.ts`. `mission.migrate` appends a Bordbuch entry with `kind: "mission-migrate"`, `status: "done"` (pass) or `status: "failed"` (blocked), and `metadata: { appliedMigrators, skippedMigrators, blockedMigrator }`.

### Lock acquisition

`mission.migrate` acquires `system:<systemId>` and `mission:<missionId>` locks via `acquireLock` (RFC-0362) before applying migrators, following the same pattern as `mission.materialize`, `mission.close`, and `mission.abort`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Migrator registry (append-only, ordered by RFC-id) |
| `packages/os/site-kernel-handoff/src/migrators/types.ts` | `Migrator`, `SternsystemData`, `MigrationContext`, `MigrationError` types |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0479.ts` | Bootstrapping migrator (pin schema migration) |
| `packages/os/site-kernel-handoff/src/migrators/index.ts` | Re-exports |
| `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts` | `mission.migrate` command implementation |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Register `mission.migrate` in module |
| `packages/os/site-kernel-handoff/src/migrator-validate.ts` | **Delete** — old `migrator.validate` command removed (forward-only) |
| `packages/os/site-kernel-handoff/src/handoff-absorb.ts` | Update to use new `migratorsToApply(cursor)` instead of `selectMigratorChain` |
| `packages/os/site-kernel-handoff/src/handoff-pack.ts` | Write `migratorCursor` as `string[]` (all registry ids) instead of version string |
| `packages/os/site-kernel-handoff/src/materialize.ts` | **Delete** `applyMigratorChain` — replaced by `mission.migrate` |
| `packages/os/site-kernel-handoff/src/types.ts` | **Delete** old `Migrator`, `MigratorContext`, `ContractChangePoint` types |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts` | Write `migratorCursor` as `string[]` (all registry ids) |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` | Write `migratorCursor` as `string[]` (all registry ids) |
| `packages/ontology/src/operations/sternsystem.ts` | Update `systemPinSchema` — `migratorCursor` as `string[]` |
| `packages/ontology/src/operations/handoff.ts` | Update `handoffLockSchema` — `migratorCursor` as `string[]` |
| `packages/ontology/src/operations/mission.ts` | Add `mission-migrate` to `bordbuchEntryKindSchema` |
| `missions/<id>/evidence/migration-report.json` | Migration evidence artifact |
| `missions/<id>/workpiece/system.pin.json` | Updated `migratorCursor` after migration |
| `tools/kernel.config.ts` | Register `mission.migrate` and `migrator.registry.validate`; remove `migrator.validate` |
| `docs/COMMANDS.md` | Add `mission.migrate` and `migrator.registry.validate`; remove `migrator.validate` |
| `AGENTS.md` | Document migrator system and `mission.migrate` step |
| `docs/requirements.xml` | Update `systemPinSchema` contract reference for `migratorCursor` type change |
| `docs/technology.xml` | Update migrator registry description from SemVer-based to RFC-id-based |

### Migration report

```json
{
  "schemaVersion": "1.0.0",
  "missionId": "webgogol-com-m000007",
  "systemId": "webgogol-com",
  "appliedMigrators": ["rfc-0479", "rfc-0481"],
  "skippedMigrators": [],
  "blockedMigrator": null,
  "blockReason": null,
  "cursorBefore": [],
  "cursorAfter": ["rfc-0479", "rfc-0481"],
  "migratedAt": "2026-07-21T00:00:00.000Z"
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| `--mission` not provided | Error: `[mission.migrate] --mission is required` |
| Mission not found | Error: `[mission.migrate] mission '<id>' not found` |
| Mission not open | Error: `[mission.migrate] mission '<id>' is not open` |
| Workpiece not materialized | Error: `[mission.migrate] workpiece not found — run mission.materialize first` |
| Pin file missing in workpiece | Error: `[mission.migrate] system.pin.json not found in workpiece` |
| Migrator throws `MigrationError` | Status: `blocked`, report written, exit non-zero, operator fixes content and re-runs |
| Migrator throws non-`MigrationError` | Status: `fail`, exit non-zero, report written with stack trace |
| Registry empty, cursor empty | Status: `pass`, no migrators applied, `appliedMigrators: []` |

### Idempotency and restart semantics

`mission.migrate` always restarts from the beginning:

1. Reads `migratorCursor` from pin file.
2. Filters registry for unapplied migrators.
3. Applies all unapplied migrators in order.

If a previous run was blocked after applying migrator A but before applying migrator B:

- Migrator A's changes are in the workpiece (committed by the previous run, RFC-0480).
- `migratorCursor` includes migrator A (updated by the previous run).
- On restart, migrator A is skipped (in cursor), migrator B is applied.

If the operator manually reverted migrator A's changes but did not update `migratorCursor`:

- Migrator A is in cursor → skipped.
- Data is in pre-A state → migrator B may fail (expects post-A data).
- This is an operator error — `mission.migrate` does not protect against manual cursor/data desynchronization.

### Testing requirements

Each migrator MUST have:

1. **PBT test** (`*.pbt.test.ts`): `fast-check` generates random valid data in the pre-migration schema. The migrator is applied twice. Assert `f(f(x)) deepEquals f(x)` (idempotency). Additional invariants per migrator (e.g. "page count unchanged", "all URLs preserved").

2. **Snapshot test** (`*.snapshot.test.ts`): Real sanitized Sternsystem data fixture in pre-migration schema. Migrator applied. Result snapshot fixed. On migrator change — snapshot updated with review.

`migrator.registry.validate` checks for the existence of both test files for each migrator.

## Rollout

1. Implement migrator types, registry, and bootstrapping migrator (`rfc-0479`).
2. Implement `mission.migrate` command and register in kernel.
3. Update `systemPinSchema` in `@gogol/ontology/operations` — `migratorCursor` as `string[]`.
4. Update `handoffLockSchema` in `@gogol/ontology/operations` — `migratorCursor` as `string[]`.
5. Add `mission-migrate` to `bordbuchEntryKindSchema`.
6. Update `sternsystem.pin` and `sternsystem.extract` to write `migratorCursor` as `string[]` (all registry ids).
7. Update `handoff.pack` and `handoff.absorb` to use the new array format.
8. Delete old migrator code: `migrator-validate.ts`, old `Migrator`/`MigratorContext`/`ContractChangePoint` types, `applyMigratorChain`, `selectMigratorChain`, `CONTRACT_CHANGE_POINTS`, `validateMigratorContinuity`.
9. Implement `migrator.registry.validate` command.
10. Add `mission.migrate` to mission lifecycle documentation and `AGENTS.md`.
11. Update `docs/requirements.xml` and `docs/technology.xml` for the `migratorCursor` type change.
12. Existing Sternsystem pin files with `migratorCursor: "4.5.0"` are migrated by the bootstrapping migrator on first `mission.migrate`.
13. Future RFCs with `versionBump: minor` MUST add a migrator to the registry as part of implementation.

## Alternatives considered

- **Re-onboarding instead of migrators.** Rejected: onboarding is a heavy process with human involvement; migrators are automated and deterministic.
- **Big-bang migration per major release.** Rejected: blocks platform development between major releases; migrators allow incremental migration per breaking change.
- **Migrators tied to SemVer, not RFC-ids.** Rejected: SemVer may not correspond 1:1 to breaking changes; RFC-ids are stable, unique, and monotonically increasing (V-28).
- **Migrator checkpoint/state file.** Rejected: idempotency makes checkpoints unnecessary; restart from beginning is safe and simpler.
- **Interactive migration (pause for operator input).** Rejected: breaks CI/autonomous mode; operator fixes content in workpiece and re-runs, which is already the mission workflow.
- **Declarative migration rules (YAML).** Rejected: insufficient expressiveness for complex transformations (JSON-LD restructuring, ontology changes). TypeScript migrators are fully expressive and type-safe.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Migrator not idempotent in practice | Medium | PBT enforces `f(f(x)) == f(x)` as a required test; `migrator.registry.validate` checks test existence |
| Migrator registry grows large (100+ entries) | Low | Migrators are small functions; most Sternsystems have cursor close to current; unapplied set is small |
| Operator manually edits `migratorCursor` | Low | Pin file is in the engineering surface (DNA-22); `client.edit.validate` rejects client commits to it |
| Bootstrapping migrator fails on edge-case pin | Low | Bootstrapping migrator handles both old (string) and new (array) cursor formats gracefully |
| Migrator for superseded RFC becomes stale | Low | Registry is append-only; superseded RFC migrators remain and are still applied (they transform data through the historical path) |

## Acceptance criteria

- [x] `Migrator` interface and `migratorRegistry` implemented in `packages/os/site-kernel-handoff/src/migrators/` (evidence: registry.ts:53, types.ts — 2026-07-24)
- [x] Bootstrapping migrator (`rfc-0479`) transforms `migratorCursor` from string to string[] (evidence: rfc-0479.ts — 2026-07-24)
- [x] `mission.migrate` command implemented and registered (evidence: mission-migrate.ts, mission.module.ts:140 — 2026-07-24)
- [x] `mission.migrate` applies migrators in RFC-id order, updates `migratorCursor` in workpiece pin (evidence: mission-migrate.ts:40-52, migratorsToApply sorts by numericRfcId — 2026-07-24)
- [x] `mission.migrate` writes migration report to `evidence/migration-report.json` (evidence: mission-migrate.ts:86-92 — 2026-07-24)
- [x] `mission.migrate` acquires `system:` and `mission:` locks before applying migrators (evidence: mission-migrate.ts:22-28 — 2026-07-24)
- [x] `mission.migrate` appends `mission-migrate` Bordbuch entry (evidence: mission-migrate.ts:96-102 — 2026-07-24)
- [x] `MigrationError` blocks mission with structured report (migrator id, file, field, reason) (evidence: mission-migrate.ts:65-75 — 2026-07-24)
- [x] `migrator.registry.validate` checks migrator-RFC correspondence, id uniqueness, test coverage (evidence: migrator-registry-validate.ts — 2026-07-24)
- [x] `systemPinSchema` updated — `migratorCursor` as `string[]` in `@gogol/ontology/operations` (evidence: sternsystem.ts — 2026-07-24)
- [x] `handoffLockSchema` updated — `migratorCursor` as `string[]` in `@gogol/ontology/operations` (evidence: handoff.ts — 2026-07-24)
- [x] `bordbuchEntryKindSchema` includes `mission-migrate` (evidence: mission.ts — 2026-07-24)
- [x] `sternsystem.pin` and `sternsystem.extract` write `migratorCursor` as `string[]` (evidence: sternsystem operations — 2026-07-24)
- [x] `handoff.pack` and `handoff.absorb` use new array format (evidence: handoff operations — 2026-07-24)
- [x] Old `migrator.validate` command and old migrator types/functions deleted (evidence: handoff.module.ts:11 — replaced by migrator.registry.validate — 2026-07-24)
- [x] PBT test for bootstrapping migrator idempotency (`f(f(x)) == f(x)`) (evidence: rfc-0479.pbt.test.ts — 2026-07-24)
- [x] Snapshot test for bootstrapping migrator on real pin file fixture (evidence: rfc-0479.snapshot.test.ts — 2026-07-24)
- [x] `mission.materialize` no longer attempts migration (delegates to `mission.migrate`) (evidence: mission-materialize.ts — no migration logic — 2026-07-24)
- [x] `AGENTS.md` documents `mission.migrate` step and migrator authoring guidance (evidence: root AGENTS.md — 2026-07-24)
- [x] `docs/COMMANDS.md` updated with `mission.migrate` and `migrator.registry.validate` (evidence: COMMANDS.md — 2026-07-24)
- [x] `docs/requirements.xml` and `docs/technology.xml` updated for `migratorCursor` type change (evidence: requirements.xml, technology.xml — 2026-07-24)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate RFC-0479 — 0 errors, 1 warning — 2026-07-24)
- [x] `pnpm --filter @gogol/site-kernel-handoff build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)
- [x] `pnpm --filter @gogol/ontology build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)

## Implementation notes for agents

- Agents MAY implement this RFC only after it is accepted.
- Agents MUST use `rfc.implement.stamp` (RFC-0476) to transition this RFC from accepted to implemented.
- Agents MUST add a migrator to the registry for every RFC with `versionBump: minor` that they implement.
- Agents MUST write PBT and snapshot tests for each migrator.
- Agents MUST NOT delete migrators from the registry — it is append-only.
- Agents MUST NOT change `migratorCursor` format without a new bootstrapping migrator.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
