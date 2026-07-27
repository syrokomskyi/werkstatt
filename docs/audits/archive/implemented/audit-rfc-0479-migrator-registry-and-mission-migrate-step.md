---
rfcId: RFC-0479
auditId: AUDIT-RFC-0479-01
date: 2026-07-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0479

## Verdict: Needs revision

The RFC introduces a well-designed migrator system but has critical ecosystem-fit gaps: it proposes new types and files in `packages/os/site-kernel-handoff/src/migrators/` without acknowledging or addressing the existing SemVer-based `Migrator` type, `MIGRATORS` registry, `selectMigratorChain`, `migrator.validate` command, and `CONTRACT_CHANGE_POINTS` ledger already living in that exact directory. It also changes commands and schemas established by RFC-0356 and RFC-0221 without declaring `amends`, and leaves `handoffLockSchema.migratorCursor` unaddressed despite proposing a format change for `systemPinSchema.migratorCursor`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0479 --json` returns 0 violations.

## Axis A — Structural completeness

1. **`MigrationViolation` type undefined.** The `MissionMigrateResult` interface (line 258) declares `violations: MigrationViolation[]` but `MigrationViolation` is never defined anywhere in the RFC. The `MigrationError` class (line 211) is defined, but `MigrationViolation` is a separate type used in the result envelope. Either define it or reuse `MigrationError` fields.

2. **Lifecycle diagram uses non-existent command `mission.release.prepare`.** Line 132: `mission.validate → mission.release.prepare → mission.reconcile`. There is no `mission.release.prepare` command in the kernel. The existing command is `release.prepare`. If this is a new command proposed by RFC-0480, it should not appear in this RFC's lifecycle diagram without noting the cross-RFC dependency. If it's a typo for `release.prepare`, correct it.

## Axis B — DNA alignment

1. **DNA-47 modification not declared via `amends`.** The RFC moves migration responsibility out of `mission.materialize` (line 159: "mission.materialize no longer needs to handle catch-up migration"). `mission.materialize` was established by RFC-0356, which established DNA-47. The `commands.changed: [mission.materialize]` acknowledges the command change, but `amends: []` is empty. Per the audit's axis-B rule: "If it changes a DNA invariant, it must supersede the establishing RFC — not amend it." However, this RFC doesn't change DNA-47's invariant text (which says "reuses RFC-0221 migration machinery where appropriate") — it refines which step applies it. This is a contract change to RFC-0356's command behavior, so `amends: [RFC-0356]` is the correct declaration.

2. **DNA-44 pin schema change not in `satisfies`.** The RFC changes `migratorCursor` from `string` to `string[]` in `systemPinSchema` (line 264). DNA-44 (Sternsystem bundle contract) defines the pin file. The RFC is in `related: [DNA-44]` but not `satisfies: [DNA-44]`. Since the RFC directly modifies the pin schema contract, DNA-44 should be in `satisfies` (the RFC "extends" the invariant by changing its shape).

3. **RFC-0221 migrator registry replacement not declared.** The existing `Migrator` type and `MIGRATORS` registry in `packages/os/site-kernel-handoff/src/types.ts` and `migrators/registry.ts` were established by RFC-0221. RFC-0479 proposes a completely new `Migrator` interface (different fields, different `transform` signature) in the same directory. This is a replacement of RFC-0221's migrator system, but `amends` doesn't include RFC-0221 and `supersedes` is empty. The RFC must declare its relationship to RFC-0221's migrator registry.

## Axis C — Ecosystem fit

1. **Existing migrator code not acknowledged.** `packages/os/site-kernel-handoff/src/migrators/registry.ts` already exists with `MIGRATORS` (empty array), `selectMigratorChain(cursor, current)`, `CONTRACT_CHANGE_POINTS`, and `validateMigratorContinuity()`. The existing `Migrator` type (`types.ts:33-47`) uses `AuthoredSet` (Map<string, string>) and SemVer-based `fromVersion`/`toVersion` with `rfc`/`status`/`appliesTo`/`description` fields. The RFC proposes a new `Migrator` with `id`/`fromVersion`/`toVersion`/`transform(data: SternsystemData)` — a different interface and different transform signature. The RFC must explicitly state what happens to the old type, old registry, and old `selectMigratorChain` function.

2. **`migrator.validate` command not addressed.** The existing `migrator.validate` command (`migrator-validate.ts`, registered in kernel) checks `validateMigratorContinuity()` over `CONTRACT_CHANGE_POINTS`. The RFC proposes `migrator.registry.validate` — a different command with different validation logic. `commands.removed: []` is empty. If `migrator.validate` is being replaced, it should be in `commands.removed` and the RFC should state the replacement. If both coexist, the RFC should explain the division of responsibility.

3. **`handoffLockSchema.migratorCursor` not addressed.** `packages/ontology/src/operations/handoff.ts:63` defines `migratorCursor: z.string().regex(semverRe)` in `handoffLockSchema`. The RFC changes `systemPinSchema.migratorCursor` to `string[]` but doesn't mention `handoffLockSchema`. `handoff.pack` (line 163 of `handoff-pack.ts`) writes `migratorCursor: version` (string). `handoff.absorb` reads `lock.migratorCursor` and passes it to `selectMigratorChain`. If the pin changes to `string[]` but the handoff lock remains `string`, the two contracts are inconsistent. The RFC must either change both or explain why the handoff lock retains the old format.

4. **Compass sync not identified.** The RFC changes `systemPinSchema` in `@gogol/ontology/operations` — a shared package contract. Root AGENTS.md Compass document duties require identifying which `docs/*.xml` files need synchronization. The file system responsibilities table (line 284) lists `packages/ontology/src/operations/sternsystem.ts` but no `docs/*.xml` files.

5. **`sternsystem.pin` and `sternsystem.extract` not in `commands.changed`.** Both `sternsystem-pin.ts:102` and `sternsystem-extract.ts:111` write `migratorCursor: platform` (a SemVer string). After the schema changes to `string[]`, these commands must write the new format. They are not listed in `commands.changed`.

## Axis D — Forward-only compliance

1. **Old migrator code path not explicitly removed.** The RFC proposes new files (`migrators/types.ts`, `migrators/registry.ts`, `migrators/rfc-0479.ts`, `migrators/index.ts`) but the old `migrators/registry.ts` already exists with different content. The RFC doesn't say "delete `CONTRACT_CHANGE_POINTS`, `validateMigratorContinuity`, `selectMigratorChain`, old `Migrator` type." Forward-only discipline requires deletion of replaced code paths, not parallel coexistence. The RFC must be explicit about what is removed.

## Axis E — Agent-facing policy

No issues. The status gate is correct ("Agents MAY implement this RFC only after it is accepted"). Implementation notes reference RFC-0476 (`rfc.implement.stamp`) and RFC-0334 (supersede escalation). No self-authorizing language detected.

## Axis F — Pragmatism

1. **`MigrationViolation` type undefined** (see Axis A).

2. **`SternsystemData` abstraction change not justified.** The existing migrator system operates on `AuthoredSet` (Map<string, string>) — an in-memory representation. The RFC proposes `SternsystemData` with `rootPath` and `dataPaths` — a filesystem-based representation. The RFC doesn't explain why the abstraction changes from in-memory to filesystem-based, or what benefits this provides. The existing `applyMigratorChain` in `materialize.ts` works on `AuthoredSet`; the new `transform(data: SternsystemData)` works on filesystem paths. This is a fundamental shift in the migrator contract.

3. **Cross-RFC dependency on `versionBump` not noted.** `migrator.registry.validate` checks "Every RFC with `versionBump: minor` and `status: implemented` has a corresponding migrator." The `versionBump` field is proposed by RFC-0478, which is still `draft`. If RFC-0478 is not accepted, this validation rule cannot function. The RFC should note this hard dependency.

4. **"Historical equivalent" is vague.** `migrator.registry.validate` checks migrator ids against "an existing RFC with `versionBump: minor` (or a historical equivalent)." The "historical equivalent" is undefined — what counts? Pre-cutoff RFCs without `versionBump`? The validation rule needs a precise definition.

## Axis G — Blind spots

1. **`sternsystem.pin` initial `migratorCursor` value unspecified.** After the schema changes to `string[]`, what does `sternsystem.pin` write for a new Sternsystem? Currently it writes `migratorCursor: platform` (the version string). The RFC doesn't specify the new initial value. Options: `[]` (no migrators applied), `["rfc-0479"]` (bootstrapping migrator applied), or all current migrator ids (system is up-to-date). This is a critical gap — without this, `sternsystem.pin` behavior is undefined after the schema change.

2. **`handoffLockSchema` blind spot** (see Axis C).

3. **Bootstrapping migrator cursor value semantics.** The RFC says the bootstrapping migrator transforms `migratorCursor: "4.5.0"` to `["rfc-0479"]`. But `"4.5.0"` is a SemVer that doesn't carry migrator-id information. The transformation loses the history of which migrators were applied at that platform version. The RFC's nonGoal "Does not implement migrators for past breaking changes" makes this intentional, but the design should explicitly state: "existing systems get a fresh cursor with only the bootstrapping migrator; all past breaking changes are considered already applied."

4. **Concurrent `mission.migrate` execution.** What happens if two `mission.migrate` commands run concurrently on the same mission? The RFC mentions idempotency and restart semantics but not concurrent execution protection. RFC-0362 locks should be acquired, but the RFC doesn't mention lock acquisition.

5. **Bordbuch entry for migration not specified.** The architectural fit section (line 158) says "Bordbuch records migration events" but the `BordbuchEntryKind` enum (RFC-0355) has no `migration` kind. The RFC doesn't propose adding one. Either add a new Bordbuch entry kind or clarify how migration events are recorded (e.g., as `operator-note` or a new kind).

## Questions for the author

1. What happens to the existing `Migrator` type, `MIGRATORS` registry, `selectMigratorChain`, `CONTRACT_CHANGE_POINTS`, `validateMigratorContinuity`, and `migrator.validate` command? Are they deleted (forward-only) or do they coexist with the new system? If deleted, should this RFC `amends: [RFC-0221]` or `supersedes: [RFC-0221]`?

2. Does `handoffLockSchema.migratorCursor` also change from `string` to `string[]`? If not, how do `handoff.pack` and `handoff.absorb` interact with the new pin format when producing/consuming `handoff-lock.json`?

3. What initial `migratorCursor` value does `sternsystem.pin` write for a new Sternsystem after the schema change? And what does `sternsystem.extract` write for the initial pin?

4. Should `amends: [RFC-0356]` be declared, given that `mission.materialize` behavior changes (no longer applies migrators) and `mission.reconcile` is listed in `commands.changed`?
