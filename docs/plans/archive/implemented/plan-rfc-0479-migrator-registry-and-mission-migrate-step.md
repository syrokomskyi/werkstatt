---
rfcId: RFC-0479
planId: PLAN-RFC-0479-01
status: draft
owner: architecture
createdAt: 2026-07-21
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-handoff"
    - "@gogol/ontology"
  services: []
  docs:
    - docs/COMMANDS.md
    - docs/requirements.xml
    - docs/technology.xml
    - AGENTS.md
---

# Implementation Plan: RFC-0479

## 1. Objectives

- [ ] O1 — New `Migrator` interface and `migratorRegistry` replace the old RFC-0221 SemVer-based migrator system (maps to acceptance: "Migrator interface and migratorRegistry implemented")
- [ ] O2 — `mission.migrate` command applies migrators in RFC-id order, updates `migratorCursor`, writes evidence, acquires locks, appends Bordbuch entry (maps to acceptance: "mission.migrate command implemented and registered" + lock + Bordbuch criteria)
- [ ] O3 — `migratorCursor` schema changes from `string` to `string[]` in both `systemPinSchema` and `handoffLockSchema` (maps to acceptance: "systemPinSchema updated" + "handoffLockSchema updated")
- [ ] O4 — `sternsystem.pin`, `sternsystem.extract`, `handoff.pack`, `handoff.absorb` updated to use the new array format (maps to acceptance: "sternsystem.pin and sternsystem.extract write migratorCursor as string[]" + "handoff.pack and handoff.absorb use new array format")
- [ ] O5 — Old migrator code deleted: `migrator-validate.ts`, old types, `applyMigratorChain`, `selectMigratorChain`, `CONTRACT_CHANGE_POINTS`, `validateMigratorContinuity` (maps to acceptance: "Old migrator.validate command and old migrator types/functions deleted")
- [ ] O6 — `migrator.registry.validate` command validates the new registry (maps to acceptance: "migrator.registry.validate checks migrator-RFC correspondence, id uniqueness, test coverage")
- [ ] O7 — Bootstrapping migrator `rfc-0479` with PBT + snapshot tests (maps to acceptance: "Bootstrapping migrator transforms migratorCursor" + PBT + snapshot criteria)
- [ ] O8 — Documentation updated: AGENTS.md, COMMANDS.md, Compass XML (maps to acceptance: "AGENTS.md documents" + "docs/COMMANDS.md updated" + "docs/requirements.xml and docs/technology.xml updated")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — rewrite: new `Migrator` interface, `migratorRegistry`, `migratorsToApply(cursor)`
- `packages/os/site-kernel-handoff/src/migrators/types.ts` — new: `Migrator`, `SternsystemData`, `MigrationContext`, `MigrationError`, `MigrationViolation`
- `packages/os/site-kernel-handoff/src/migrators/rfc-0479.ts` — new: bootstrapping migrator
- `packages/os/site-kernel-handoff/src/migrators/index.ts` — new: re-exports
- `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts` — new: `mission.migrate` command handler
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — register `mission.migrate` in module
- `packages/os/site-kernel-handoff/src/migrator-validate.ts` — **delete**
- `packages/os/site-kernel-handoff/src/handoff-absorb.ts` — update: use `migratorsToApply(cursor)` instead of `selectMigratorChain`
- `packages/os/site-kernel-handoff/src/handoff-pack.ts` — update: write `migratorCursor` as `string[]`
- `packages/os/site-kernel-handoff/src/materialize.ts` — **delete** `applyMigratorChain`
- `packages/os/site-kernel-handoff/src/types.ts` — **delete** old `Migrator`, `MigratorContext`, `ContractChangePoint` types
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts` — update: write `migratorCursor` as `string[]`
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` — update: write `migratorCursor` as `string[]`
- `packages/os/site-kernel-handoff/src/absorb-report.ts` — update: use new `migratorsToApply` instead of `selectMigratorChain`
- `packages/os/site-kernel-handoff/src/handoff.module.ts` — remove `migrator.validate` registration; add `migrator.registry.validate`
- `packages/ontology/src/operations/sternsystem.ts` — update `systemPinSchema.migratorCursor` to `z.array(z.string())`
- `packages/ontology/src/operations/handoff.ts` — update `handoffLockSchema.migratorCursor` to `z.array(z.string())`
- `packages/ontology/src/operations/mission.ts` — add `"mission-migrate"` to `bordbuchEntryKindSchema`
- `tools/kernel.config.ts` — register `mission.migrate` and `migrator.registry.validate`; remove `migrator.validate`

### 2.2 Configuration and data

- `system.pin.json` — `migratorCursor` format change from `"4.5.0"` to `["rfc-0479", ...]`
- `handoff-lock.json` — `migratorCursor` format change from `"4.5.0"` to `["rfc-0479", ...]`
- `missions/<id>/evidence/migration-report.json` — new evidence artifact

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0479-migrator-registry-and-mission-migrate-step.md` — read-only reference
- `AGENTS.md` — document `mission.migrate` step and migrator authoring guidance
- `docs/COMMANDS.md` — add `mission.migrate` and `migrator.registry.validate`; remove `migrator.validate`
- `docs/requirements.xml` — update `systemPinSchema` contract reference for `migratorCursor` type change
- `docs/technology.xml` — update migrator registry description from SemVer-based to RFC-id-based

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm exec werkstatt run rfc.validate RFC-0479 --json`
- `pnpm exec werkstatt run migrator.registry.validate` (new command)

## 3. Step sequence

### Step 1. Ontology schema changes

**Goal:** Change `migratorCursor` from SemVer string to `string[]` in both `systemPinSchema` and `handoffLockSchema`, and add `mission-migrate` Bordbuch entry kind.

**Agent actions:**

- In `packages/ontology/src/operations/sternsystem.ts`, change `migratorCursor: z.string().regex(semverRe, ...)` to `migratorCursor: z.array(z.string())`
- In `packages/ontology/src/operations/handoff.ts`, change `migratorCursor: z.string().regex(semverRe)` to `migratorCursor: z.array(z.string())`
- In `packages/ontology/src/operations/mission.ts`, add `"mission-migrate"` to `bordbuchEntryKindSchema` enum

**Validation:**

- `pnpm --filter @gogol/ontology build:check` passes

**Completion criterion:** Both schemas accept `string[]` for `migratorCursor`; `bordbuchEntryKindSchema` includes `mission-migrate`; `build:check` passes.

**Human review:** no

---

### Step 2. New migrator types and registry

**Goal:** Create the new `Migrator` interface, `SternsystemData`, `MigrationContext`, `MigrationError`, `MigrationViolation` types, and the new `migratorRegistry` with `migratorsToApply(cursor)` function.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/types.ts` with `Migrator`, `SternsystemData`, `MigrationContext`, `MigrationError`, `MigrationViolation`
- Rewrite `packages/os/site-kernel-handoff/src/migrators/registry.ts` with new `migratorRegistry: Migrator[]` (seeded with bootstrapping migrator) and `migratorsToApply(cursor: string[]): Migrator[]`
- Create `packages/os/site-kernel-handoff/src/migrators/index.ts` re-exporting types and registry
- Add `numericRfcId(id: string): number` helper (extracts numeric part from `rfc-XXXX`)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes (may have errors from old code — addressed in Step 5)

**Completion criterion:** New types and registry compile; `migratorsToApply` filters and sorts by RFC-id numeric.

**Human review:** no

---

### Step 3. Bootstrapping migrator

**Goal:** Implement the `rfc-0479` bootstrapping migrator that transforms old pin files from `migratorCursor: "4.5.0"` to `migratorCursor: ["rfc-0479"]`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0479.ts` with the bootstrapping migrator
- The migrator reads `system.pin.json` from `SternsystemData.rootPath`, detects string vs array `migratorCursor`, transforms string to `["rfc-0479"]`, writes back
- Register it in `migratorRegistry`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes

**Completion criterion:** Bootstrapping migrator handles both old (string) and new (array) cursor formats; is idempotent.

**Human review:** no

---

### Step 4. `mission.migrate` command

**Goal:** Implement the `mission.migrate` command handler with lock acquisition, Bordbuch entry, migration report, and failure modes.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts` with `runMissionMigrate`
- Register `mission.migrate` in `mission-materialization-commands.ts` (or `mission.module.ts`)
- Register `migrator.registry.validate` in `handoff.module.ts`
- Remove `migrator.validate` registration from `handoff.module.ts`
- Update `tools/kernel.config.ts` command descriptions
- Implement: read pin → filter registry → apply migrators → update cursor → write report → Bordbuch entry → locks

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm exec werkstatt run mission.migrate --mission <test-mission>` works on a fixture

**Completion criterion:** `mission.migrate` applies migrators, updates cursor, writes evidence, acquires locks, appends Bordbuch entry; all failure modes handled.

**Human review:** no

---

### Step 5. Delete old migrator code

**Goal:** Remove the old RFC-0221 migrator system forward-only.

**Agent actions:**

- Delete `packages/os/site-kernel-handoff/src/migrator-validate.ts`
- Delete `applyMigratorChain` from `materialize.ts`
- Delete old `Migrator`, `MigratorContext`, `ContractChangePoint` types from `types.ts`
- Delete `selectMigratorChain`, `CONTRACT_CHANGE_POINTS`, `validateMigratorContinuity` from old `registry.ts` (already rewritten in Step 2)
- Remove `migrator.validate` from `handoff.module.ts` and `index.ts` barrel exports
- Update `absorb-report.ts` to use `migratorsToApply` instead of `selectMigratorChain`
- Update `handoff-absorb.ts` to use new `migratorsToApply(cursor)` instead of `selectMigratorChain`
- Fix any remaining imports of deleted symbols

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes with no references to old migrator code

**Completion criterion:** No code references old `Migrator` type, `selectMigratorChain`, `applyMigratorChain`, `CONTRACT_CHANGE_POINTS`, `validateMigratorContinuity`, or `migrator.validate`.

**Human review:** no

---

### Step 6. Update `sternsystem.pin`, `sternsystem.extract`, `handoff.pack`

**Goal:** Update all commands that write `migratorCursor` to use the new `string[]` format.

**Agent actions:**

- In `sternsystem-pin.ts`, change `migratorCursor: platform` to `migratorCursor: migratorRegistry.map(m => m.id)` (all registry ids)
- In `sternsystem-extract.ts`, same change
- In `handoff-pack.ts`, change `migratorCursor: version` to `migratorCursor: migratorRegistry.map(m => m.id)`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes

**Completion criterion:** All three commands write `migratorCursor` as `string[]`; generated pin files pass `systemPinSchema.parse`.

**Human review:** no

---

### Step 7. Tests

**Goal:** PBT and snapshot tests for the bootstrapping migrator; unit tests for `migratorsToApply` and `mission.migrate`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0479.pbt.test.ts` — `fast-check` generates random pin files with string `migratorCursor`; apply migrator twice; assert idempotency
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0479.snapshot.test.ts` — real sanitized pin fixture; apply migrator; fix snapshot
- Create `packages/os/site-kernel-handoff/src/migrators/registry.test.ts` — test `migratorsToApply` filtering and ordering
- Create `packages/os/site-kernel-handoff/src/mission/mission-migrate.test.ts` — test command handler with mock mission

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes

**Completion criterion:** All tests pass; PBT idempotency invariant verified; snapshot fixed.

**Human review:** no

---

### Step 8. Documentation and Compass sync

**Goal:** Update all documentation to reflect the new migrator system.

**Agent actions:**

- Update `docs/COMMANDS.md` — add `mission.migrate` and `migrator.registry.validate`; remove `migrator.validate`
- Update `AGENTS.md` — document `mission.migrate` step in mission lifecycle and migrator authoring guidance
- Update `docs/requirements.xml` — update `systemPinSchema` contract reference for `migratorCursor` type change
- Update `docs/technology.xml` — update migrator registry description from SemVer-based to RFC-id-based
- Update `packages/os/site-kernel-handoff/AGENTS.md` — update validation section to reference `migrator.registry.validate` instead of `migrator.validate`

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0479 --json` passes
- `pnpm exec werkstatt run workspace.surface.validate` passes (if available)

**Completion criterion:** All documentation updated; no references to old `migrator.validate` command.

**Human review:** no

---

### Step 9. Final validation and evidence

**Goal:** Run all validation checks and emit verification evidence.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate RFC-0479 --json` — confirm pass
- Run `pnpm --filter @gogol/site-kernel-handoff build:check` — confirm pass
- Run `pnpm --filter @gogol/ontology build:check` — confirm pass
- Run `pnpm --filter @gogol/site-kernel-handoff test` — confirm pass
- Run `pnpm exec werkstatt run migrator.registry.validate` — confirm pass
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0479` (RFC-0476) to transition to implemented

**Validation:**

- All commands return exit code 0

**Completion criterion:** RFC-0479 status is `implemented`; all validation passes.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0479 --json`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec werkstatt run migrator.registry.validate`

### 4.2 Evidence artifacts

- `missions/<id>/evidence/migration-report.json` — migration evidence (produced at runtime)
- Commit messages referencing `RFC-0479` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Migrator not idempotent in practice | Step 7: PBT test enforces `f(f(x)) == f(x)` |
| Migrator registry grows large (100+ entries) | N/A — most Sternsystems have cursor close to current |
| Operator manually edits `migratorCursor` | N/A — pin file is in engineering surface (DNA-22) |
| Bootstrapping migrator fails on edge-case pin | Step 3: migrator handles both old (string) and new (array) formats; Step 7: snapshot test on real fixture |
| Migrator for superseded RFC becomes stale | N/A — registry is append-only; superseded migrators remain |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 (pin schema), DNA-46 (mission lifecycle), or DNA-47 (materialization), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0479 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the `handoffLockSchema` change reveals a conflict with RFC-0221's handoff contract that cannot be resolved by amending, run `rfc.supersede.propose` for RFC-0221.
