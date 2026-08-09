---
rfcId: RFC-0790
planId: PLAN-RFC-0790-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/architecture-dna.md
    - AGENTS.md
    - packages/werkstatt/AGENTS.md
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0790

## 1. Objectives

- [ ] O1 — Define `systemConfigSchema`, `systemStateSchema`, `deploymentStaticConfigSchema`, `servicesRegistrySchema` in `@warpgogol/werkstatt/schemas` (acceptance criteria 1-2)
- [ ] O2 — Migrate data: extract services, create per-system config/state files in cache clones, delete `systems/registry.yaml` (criteria 13-18)
- [ ] O3 — Implement `discoverSystems()`, `readSystemConfig()`, `readSystemState()`, `writeSystemState()`, `resolveCacheClonePath()` and remove old `readRegistry`/`writeRegistry`/`findEntry`/`resolveCachePath` (criteria 3-5)
- [ ] O4 — Register `sternsystem.discover` command and update `sternsystem.validate`, `sternsystem.register`, `sternsystem.list` (criteria 6-8)
- [ ] O5 — Update mission commands to use convention-based path resolution and remove `registry` lock (criteria 9-10)
- [ ] O6 — Update leitstand, release, bordbuch, notausgang, dns, evidence, handoff, nachweis, subdomain commands (criteria 11-12)
- [ ] O7 — Update `werkstatt-site` consumers (criteria 3-5 for site package)
- [ ] O8 — Update tests (all packages)
- [ ] O9 — Amend DNA-1, DNA-44, DNA-45 and update `AGENTS.md` (criteria 19-20)
- [ ] O10 — Pass `rfc.validate`, `build:check`, tests, review, and stamp implemented (criterion 21)

## 2. Affected artifacts

### 2.1 Code and commands

**`packages/werkstatt/src/schemas/`**
- `sternsystem.ts` — add `systemConfigSchema`, `systemStateSchema`, `servicesRegistrySchema`; remove `fleetRegistryEntrySchema`, `fleetRegistrySchema`
- `leitstand.ts` — replace `deploymentConfigSchema` with `deploymentStaticConfigSchema` (without `lastPropagated`)
- `index.ts` — export new schemas, remove old exports

**`packages/werkstatt/src/sternsystem/`**
- `registry-io.ts` — add `discoverSystems`, `readSystemConfig`, `readSystemState`, `writeSystemState`, `resolveCacheClonePath`, `readServicesRegistry`; remove `readRegistry`, `writeRegistry`, `findEntry`, `findEntryByStar`, `resolveCachePath`, `registryExists`, `resolveRegistryPath`; change `resolveMirrors` signature to accept `SystemConfig`
- `sternsystem-discover.ts` — **new file**: `sternsystem.discover` command handler
- `sternsystem-register.ts`, `sternsystem-validate.ts`, `sternsystem-list.ts`, `sternsystem-sync.ts`, `sternsystem-pin.ts`, `sternsystem-extract.ts`, `sternsystem-status.ts` — update to use new IO helpers

**`packages/werkstatt/src/mission/`** — `mission-open.ts`, `mission-close.ts`, `mission-abort.ts`, `mission-materialize.ts`, `mission-materialization-commands.ts`, `mission-migrate.ts`

**`packages/werkstatt/src/release/`** — `release-commands.ts`

**`packages/werkstatt/src/leitstand/`** — `leitstand-commands.ts`, `service-deploy.ts`

**`packages/werkstatt/src/bordbuch/`** — `bordbuch-io.ts`, `bordbuch-commit.ts`, `bordbuch-commit-helper.ts`, `bordbuch-generate.ts`

**`packages/werkstatt/src/notausgang/`** — `notausgang-commands.ts`

**`packages/werkstatt/src/dns/`** — `dns-record-delete.ts`, `dns-record-list.ts`, `dns-record-upsert.ts`, `dns-record-validate.ts`

**`packages/werkstatt/src/evidence/`** — `evidence-fetch.ts`, `evidence-sync.ts`

**`packages/werkstatt/src/handoff/`** — `handoff-absorb.ts`, `surface-contract.ts`, `bundle-io.ts`, `index.ts`

**`packages/werkstatt/src/nachweis/`** — `nachweis-io.ts`

**`packages/werkstatt/src/subdomain/`** — `subdomain-list.ts`, `subdomain-register.ts`, `subdomain-validate.ts`, `subdomain-helpers.ts`

**`packages/werkstatt/src/kernel/`** — `site-workspace-resolver.ts`

**`packages/werkstatt/src/werkstatt/`** — `werkstatt-commit.ts`

**`packages/werkstatt-site/src/`**
- `domain/ontology/operations/index.ts` — update re-exports
- `domain/studio-gate/auth.ts` — read `system-config.yaml` instead of `fleetRegistrySchema.parse()`
- `checks/analytics-matomo.ts` — read from `services/registry.yaml`
- `checks/audit/validators/analytics-config.ts` — read from `services/registry.yaml`
- `checks/audit/validators/helpers.ts` — update `MATOMO_REGISTRY_PATH`

**`tools/kernel.config.ts`** — register `sternsystem.discover` command

**`packages/werkstatt/src/tests-handoff/helpers/registry-builder.ts`** — update to build `system-config.yaml` and `system-state.yaml`

**Migration script** — `scripts/migrate-registry-to-convention.mts` (temporary, deleted after migration)

### 2.2 Configuration and data

- `systems/registry.yaml` — **deleted** (after extraction)
- `services/registry.yaml` — **created** (extracted `services[]`)
- `systems/axiom-suppressions.yaml` — **moved** to `../systems-cache/<id>/axiom-suppressions.yaml`
- `../systems-cache/<id>/system-config.yaml` — **created** per system
- `../systems-cache/<id>/system-state.yaml` — **created** per system
- `systems/methodologies.md` — remains unchanged

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — amend DNA-1, DNA-44, DNA-45
- `AGENTS.md` (root) — update "Monorepo layout", "External mirror sync", DNA-1 references
- `packages/werkstatt/AGENTS.md` — update if entry points change
- `packages/werkstatt-site/AGENTS.md` — update if re-exports change

### 2.4 Validation and pipelines

- `sternsystem.validate` remains in `build.check` and `mission.validate` — scans `../systems-cache/`
- `sternsystem.discover` joins command registry (ad-hoc query, no pipeline)
- CI workflows may need update if they reference `systems/registry.yaml`

## 3. Step sequence

### Step 1. Define new Zod schemas

**Goal:** Add `systemConfigSchema`, `systemStateSchema`, `deploymentStaticConfigSchema`, `servicesRegistrySchema` to `@warpgogol/werkstatt/schemas`.

**Agent actions:**

- In `packages/werkstatt/src/schemas/leitstand.ts`: add `deploymentStaticConfigSchema` (adapter + channels only, no `lastPropagated`).
- In `packages/werkstatt/src/schemas/sternsystem.ts`: add `systemConfigSchema` (using `deploymentStaticConfigSchema`), `systemStateSchema` (with `currentMission`, `lastRelease`, `lastPropagated` including `dev`/`alt`/`main`), `servicesRegistrySchema` (schemaVersion + services array).
- In `packages/werkstatt/src/schemas/index.ts`: export new schemas and types.
- Keep old schemas (`fleetRegistryEntrySchema`, `fleetRegistrySchema`, `deploymentConfigSchema`) temporarily — the migration script (Step 2) needs them to parse the existing `registry.yaml`.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** New schemas are defined and exported. Old schemas still exist. Package compiles.

**Human review:** no

---

### Step 2. Data migration via script

**Goal:** Extract services, create per-system config/state files in cache clones, delete `systems/registry.yaml`.

**Agent actions:**

- Create `scripts/migrate-registry-to-convention.mts` — a standalone TypeScript script that:
  1. Reads `systems/registry.yaml`, parses with `fleetRegistrySchema` (old schema, still exists from Step 1).
  2. Extracts `services[]` into `services/registry.yaml` (validated with `servicesRegistrySchema`).
  3. For each system entry:
     - Verifies `mirrors[0].path` matches `../systems-cache/<id>/`. If not, logs a warning and skips (manual intervention needed).
     - Creates `system-config.yaml` with static fields (id, cosmicStar, mirrors, pinnedPlatform, status, registeredAt, deployment without lastPropagated, cloudflareZoneId, owner, notes).
     - Creates `system-state.yaml` with runtime fields (currentMission, lastRelease, lastPropagated with dev/alt/main).
     - Moves `systems/axiom-suppressions.yaml` to `../systems-cache/<id>/axiom-suppressions.yaml`.
     - Commits config/state files to cache clone git repo.
  4. Deletes `systems/registry.yaml`.
- Run the script: `npx tsx scripts/migrate-registry-to-convention.mts`.
- Verify files exist in cache clones.
- Delete the migration script after successful migration.

**Validation:**

- `services/registry.yaml` exists and contains all service entries
- `../systems-cache/<id>/system-config.yaml` exists for each system
- `../systems-cache/<id>/system-state.yaml` exists for each system
- `systems/registry.yaml` is deleted
- `systems/axiom-suppressions.yaml` is moved

**Completion criterion:** All per-system config/state files exist in cache clones. `services/registry.yaml` is created. `systems/registry.yaml` is deleted. Migration script is deleted.

**Human review:** yes — operator must verify the data migration is correct. Inspect generated `system-config.yaml` and `system-state.yaml` files before proceeding.

---

### Step 3. Replace IO helpers (add new, remove old)

**Goal:** Replace `registry-io.ts` functions. Add new convention-based helpers and remove old registry-based functions. This will break compilation — subsequent steps fix call sites.

**Agent actions:**

- In `packages/werkstatt/src/sternsystem/registry-io.ts`:
  - Add `resolveCacheClonePath(workspaceRoot: string, systemId: string): string` — returns `path.resolve(workspaceRoot, "..", "systems-cache", systemId)`.
  - Add `readSystemConfig(workspaceRoot: string, systemId: string): Promise<SystemConfig>` — reads `../systems-cache/<id>/system-config.yaml`, validates with `systemConfigSchema`.
  - Add `readSystemState(workspaceRoot: string, systemId: string): Promise<SystemState>` — reads `../systems-cache/<id>/system-state.yaml`. Returns fresh state if file missing.
  - Add `writeSystemState(workspaceRoot: string, systemId: string, state: SystemState): Promise<void>` — writes via `atomicWriteFile`, auto-commits to cache clone git.
  - Add `discoverSystems(workspaceRoot: string): Promise<{ systems: SystemConfig[]; errors: Array<{ id: string; error: string }> }>` — scans `../systems-cache/`, collects errors per-system (does not throw on single bad config).
  - Add `readServicesRegistry(workspaceRoot: string): Promise<ServicesRegistry>` — reads `services/registry.yaml`.
  - Change `resolveMirrors` signature to accept `SystemConfig` instead of `FleetRegistryEntry`.
  - **Remove** `readRegistry`, `writeRegistry`, `findEntry`, `findEntryByStar`, `resolveCachePath`, `registryExists`, `resolveRegistryPath`.
  - Keep `resolveMirrorPath`, `inferMirrorProtocol`, `isGitAccessible`, `hasAppsCollision`.
- In `packages/werkstatt/src/schemas/sternsystem.ts`: **remove** `fleetRegistryEntrySchema`, `fleetRegistrySchema`.
- In `packages/werkstatt/src/schemas/leitstand.ts`: **remove** old `deploymentConfigSchema` (replaced by `deploymentStaticConfigSchema`).
- In `packages/werkstatt/src/schemas/index.ts`: remove old exports.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY`.
- **Expected state:** `pnpm --filter @warpgogol/werkstatt run build:check` fails with many TypeScript errors — this is expected. Subsequent steps fix them.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — expected to fail (call sites not yet updated)

**Completion criterion:** New IO helpers are implemented. Old functions and schemas are removed. Compilation is broken (expected).

**Human review:** no

---

### Step 4. Register `sternsystem.discover` and update sternsystem commands

**Goal:** Add `sternsystem.discover` command and update `sternsystem.register`, `sternsystem.validate`, `sternsystem.list`, `sternsystem.sync`, `sternsystem.pin`, `sternsystem.extract`, `sternsystem.status`.

**Agent actions:**

- Create `packages/werkstatt/src/sternsystem/sternsystem-discover.ts` with `runSternsystemDiscover` handler.
- Register `sternsystem.discover` in `tools/kernel.config.ts`.
- Update `sternsystem-register.ts`: create cache clone dir + `system-config.yaml` + `git init` if absent. Remove `registry` lock.
- Update `sternsystem-validate.ts`: iterate `discoverSystems()`.
- Update `sternsystem-list.ts`: read from `discoverSystems()`.
- Update `sternsystem-sync.ts`: read mirror topology from `system-config.yaml`.
- Update `sternsystem-pin.ts`: write pin to cache clone, update `system-config.yaml`.
- Update `sternsystem-extract.ts`: resolve cache clone from convention path. Remove `registry` lock.
- Update `sternsystem-status.ts`: read from `system-state.yaml`.
- Export `runSternsystemDiscover` from `packages/werkstatt/src/sternsystem/index.ts`.
- Run `pnpm --filter @warpgogol/werkstatt run build:check` and fix TypeScript errors in sternsystem module.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — sternsystem module errors resolved (other modules may still fail)

**Completion criterion:** All sternsystem commands compile. `sternsystem.discover` is registered.

**Human review:** no

---

### Step 5. Update mission commands

**Goal:** Update `mission.open`, `mission.close`, `mission.abort`, `mission.materialize`, `mission.reconcile`, `mission-materialization-commands`, `mission-migrate`.

**Agent actions:**

- In `mission-open.ts`: replace registry IO with `readSystemConfig`/`readSystemState`/`writeSystemState`. Replace `resolveCachePath` with `resolveCacheClonePath`. Remove `registry` lock.
- In `mission-close.ts`: same pattern. Write `currentMission: null` to `system-state.yaml`. Update `sternsystem.pin` call.
- In `mission-abort.ts`: same pattern. Remove `registry` lock.
- In `mission-materialize.ts`, `mission-materialization-commands.ts`, `mission-migrate.ts`: replace `resolveCachePath` with `resolveCacheClonePath`.
- Run `pnpm --filter @warpgogol/werkstatt run build:check` and fix TypeScript errors in mission module.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — mission module errors resolved

**Completion criterion:** All mission commands compile. `registry` lock is removed from all mission commands.

**Human review:** no

---

### Step 6. Update remaining commands (compile-driven sweep)

**Goal:** Update all remaining `@warpgogol/werkstatt` commands that reference old registry functions or types.

**Agent actions:**

- `release-commands.ts`: write `lastRelease` to `system-state.yaml`.
- `leitstand-commands.ts`: read deployment channels from `system-config.yaml`. Write `lastPropagated` to `system-state.yaml`.
- `service-deploy.ts`: read from `services/registry.yaml`.
- `bordbuch-io.ts`, `bordbuch-commit.ts`, `bordbuch-commit-helper.ts`, `bordbuch-generate.ts`: resolve cache clone from convention path.
- `notausgang-commands.ts`: resolve cache clone from convention path.
- `dns-record-*.ts`: read from cache clone.
- `evidence-fetch.ts`, `evidence-sync.ts`: resolve cache clone from convention path.
- `handoff-absorb.ts`, `surface-contract.ts`, `bundle-io.ts`, `index.ts`: resolve cache clone from convention path.
- `nachweis-io.ts`: resolve cache clone from convention path.
- `subdomain-*.ts`, `subdomain-helpers.ts`: read from `services/registry.yaml`.
- `kernel/site-workspace-resolver.ts`: resolve cache clone from convention path.
- `werkstatt/werkstatt-commit.ts`: update `commitWerkstattSideEffects` to not commit registry changes.
- Run `pnpm --filter @warpgogol/werkstatt run build:check` and fix all remaining TypeScript errors iteratively until zero errors.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes with zero errors

**Completion criterion:** `@warpgogol/werkstatt` compiles without referencing `readRegistry`, `writeRegistry`, `findEntry`, `FleetRegistry`, `FleetRegistryEntry`, or `resolveCachePath`.

**Human review:** no

---

### Step 7. Update `werkstatt-site` consumers

**Goal:** Update all `werkstatt-site` files that import fleet registry schemas or read `systems/registry.yaml`.

**Agent actions:**

- `domain/ontology/operations/index.ts`: update re-exports — remove `fleetRegistrySchema`, `fleetRegistryEntrySchema`; add `systemConfigSchema`, `systemStateSchema`, `servicesRegistrySchema`.
- `domain/studio-gate/auth.ts`: replace `fleetRegistrySchema.parse()` with `systemConfigSchema.parse()` reading from `../systems-cache/<id>/system-config.yaml`.
- `checks/analytics-matomo.ts`: update `validateMatomoFleetRegistry` to read from `services/registry.yaml`.
- `checks/audit/validators/analytics-config.ts`: update `loadMatomoFleetRegistry` to read from `services/registry.yaml`.
- `checks/audit/validators/helpers.ts`: update `MATOMO_REGISTRY_PATH` to `services/registry.yaml`.
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` and fix all TypeScript errors iteratively until zero errors.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes with zero errors

**Completion criterion:** `werkstatt-site` compiles without referencing `fleetRegistrySchema` or `fleetRegistryEntrySchema`.

**Human review:** no

---

### Step 8. Update tests

**Goal:** Update all test files that use old schemas, types, or IO functions.

**Agent actions:**

- `resolve-mirrors.test.ts`: update test objects from `FleetRegistryEntry` to `SystemConfig`.
- `mirror-validate.test.ts`, `plugin-validate.test.ts`: update test objects.
- `tests-handoff/helpers/registry-builder.ts`: update to build `system-config.yaml` and `system-state.yaml`.
- `tests-handoff/release-state-validate.test.ts`, `bordbuch-commit.test.ts`, `evidence-sync-fetch.test.ts`, `nachweis-commands.test.ts`: update test setup.
- `bordbuch-commit-helper.test.ts`, `bordbuch-kind-migration.test.ts`, `bordbuch-repair.test.ts`: update test setup.
- `kernel/tests/site-workspace-resolver.test.ts`: update test setup.
- `validate/plugin-validate.test.ts`: update test setup.
- `domain/ontology/tests/sternsystem-owner.test.ts`: update to test `systemConfigSchema` owner field.
- `checks/tests/service-validate-0751.test.ts`: update to read from `services/registry.yaml`.
- Run `pnpm --filter @warpgogol/werkstatt run test` and fix failures.
- Run `pnpm --filter @warpgogol/werkstatt-site run test` and fix failures.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes

**Completion criterion:** All tests pass with the new schema and IO helpers.

**Human review:** no

---

### Step 9. Update documentation

**Goal:** Amend DNA entries and update AGENTS.md files.

**Agent actions:**

- In `docs/architecture-dna.md`:
  - DNA-1: replace "registered in `systems/registry.yaml`" with "discovered via convention-based discovery from `../systems-cache/<id>/system-config.yaml`".
  - DNA-44: add `system-config.yaml` and `system-state.yaml` to the bundle description.
  - DNA-45: replace the entire entry — fleet registry is replaced by convention-based discovery. `system-config.yaml` (static) and `system-state.yaml` (runtime) live in cache clones. `services/registry.yaml` holds service entries.
- In `AGENTS.md` (root):
  - "Monorepo layout" section: remove `systems/registry.yaml` as fleet registry. Document `services/registry.yaml` and convention-based discovery.
  - "External mirror sync" section: update to say mirrors are declared in `system-config.yaml` in the cache clone.
  - Any other references to `systems/registry.yaml`.
- In `packages/werkstatt/AGENTS.md`: update if entry points change.
- In `packages/werkstatt-site/AGENTS.md`: update if re-exports change.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0790` passes
- `pnpm exec werkstatt run dna.registry.validate` passes

**Completion criterion:** All documentation artifacts in scope are updated. DNA entries reflect the new architecture.

**Human review:** yes — operator should review DNA amendments before stamping implemented.

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0790 --implementation-commit <sha>` (run `--dry-run` first, then without).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0790` passes with zero errors.
- `pnpm --filter @warpgogol/werkstatt run build:check` passes.
- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes.
- `pnpm --filter @warpgogol/werkstatt run test` passes.
- `pnpm --filter @warpgogol/werkstatt-site run test` passes.
- `pnpm exec werkstatt run sternsystem.discover --json` returns all systems.
- `pnpm exec werkstatt run sternsystem.validate` passes.
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0790`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run sternsystem.discover --json` (manual verification)
- `pnpm exec werkstatt run sternsystem.validate` (manual verification)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0790` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0790.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0790` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Discovery performance at scale | Step 3: `readSystemConfig(id)` reads single file without scanning |
| No central fleet view | Step 4: `sternsystem.discover --json` provides on-demand view |
| Migration data loss risk | Step 2: migration script verifies each system before deleting registry |
| Agent confusion | Step 9: AGENTS.md updated with specific sections |
| State files must be committed to cache clone git | Step 3: `writeSystemState` auto-commits to cache clone git |
| `sternsystem.list` requires cache clones | Step 4: `sternsystem.list` reads from `discoverSystems()`; Step 9: documented |
| `fleet/` directory unaffected | Step 9: acknowledged in documentation |
| External mirror exposure of operational metadata | Step 9: documented in AGENTS.md — operator keeps external mirrors private |
| Non-convention cache clone paths | Step 2: migration script verifies `mirrors[0].path` matches convention |
| `werkstatt-site` coupling | Step 7: compile-driven sweep catches all consumers |
| `discoverSystems()` error handling | Step 3: returns `{ systems, errors }` — does not throw on single bad config |
| Compilation broken between Steps 3-6 | Expected — compile-driven approach catches all call sites. `build:check` run after each step shows progress. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1, DNA-44, DNA-45, DNA-46, or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0790 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the data migration (Step 2) fails for any system, stop and ask the operator for guidance. Do not delete `systems/registry.yaml` until all systems are successfully migrated.
- If `sternsystem.validate` finds zero systems after migration (empty `../systems-cache/`), stop and verify cache clone checkout before proceeding.
