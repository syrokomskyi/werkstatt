---
rfcId: RFC-0356
planId: PLAN-RFC-0356-01
status: draft
owner: architecture
createdAt: 2026-07-10
updatedAt:
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-onboarding"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/knowledge-graph.xml
    - packages/os/site-kernel-handoff/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0356

> **Pilot plan** — RFC-0356 has `status: draft`. Implementation requires explicit architecture acceptance (`draft → accepted`) before any code changes begin (RFC-0224).
>
> **Cross-dependencies** — This plan assumes the following RFCs are accepted and implemented before RFC-0356 implementation begins:
>
> - **RFC-0364** (`@gogol/fingerprint`) — required for `platformSemanticHash` and semantic drift detection.
> - **RFC-0354** (Sternsystem registry, `system.pin.json`, `sternsystem.*` commands) — required for registry and pin operations.
> - **RFC-0355** (mission lifecycle, `MissionManifest`, `mission.open/close/abort`) — required for mission state machine and `mission.yaml` format.
> - **RFC-0362** (Werkstatt consistency primitives) — required for locks, idempotency records, and atomic staging.
>
> **Design decision confirmed** — `mission.validate` extends the existing `app.contract.full` command with a `--workpiece-dir` flag so the same canonical validator runs against both legacy `apps/<app>/` and mission `workpiece/` directories.

## 1. Objectives

- [ ] O1 — Define `MaterializationReport`, `ValidationReport`, `AuthoredDiff`, `ReconciliationReport`, and `BuildReport` Zod schemas in `@gogol/ontology` (acceptance: schemas defined; `--json` output stable)
- [ ] O2 — Implement `mission.materialize` that populates `missions/<id>/workpiece/` from a pinned Sternsystem, reuses RFC-0221 migration machinery, and generates runtime boilerplate (acceptance: command registered and tested)
- [ ] O3 — Extend `app.contract.full` with `--workpiece-dir` so `mission.validate` can run the canonical validator against a Werkstück (acceptance: `mission.validate` runs `app.contract.full` and a readable build)
- [ ] O4 — Implement `mission.preview`, `mission.build`, `mission.diff`, and `mission.reconcile` (acceptance: commands registered and tested)
- [ ] O5 — Implement `sternsystem.extract` that converts an existing `apps/<app>/` site into a data-only Sternsystem and removes the source app after successful materialization (acceptance: command registered and tested; pilot extraction completed)
- [ ] O6 — Enforce the RFC-0221 §4.1 version-compare matrix for materialization: downgrade refused, catch-up applies migrators, in-sync fast-paths (acceptance: version matrix enforced)
- [ ] O7 — Add or verify DNA-47 in `docs/architecture-dna.md` (acceptance: DNA-47 present)
- [ ] O8 — Pass the full validation suite without `apps/` pipeline regression (acceptance: `build:check` and `rfc.validate` pass)

## 2. Affected artifacts

### 2.1 Code and commands

**New schema file:**

- `packages/ontology/src/schemas/materialization.ts` — `MaterializationReportSchema`, `ValidationReportSchema`, `AuthoredDiffSchema`, `ReconciliationReportSchema`, `BuildReportSchema`
- `packages/ontology/src/schemas/index.ts` — re-export new schemas and inferred types

**New mission command handlers in `packages/os/site-kernel-handoff/src/mission/`:**

- `mission-materialize.ts` — `mission.materialize` handler
- `mission-validate.ts` — `mission.validate` handler
- `mission-preview.ts` — `mission.preview` handler
- `mission-build.ts` — `mission.build` handler
- `mission-diff.ts` — `mission.diff` handler
- `mission-reconcile.ts` — `mission.reconcile` handler
- `mission-io.ts` — extend RFC-0355's `mission-io.ts` with helpers for Werkstück paths, materialization status, and report writing

**Sternsystem extraction handler:**

- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` — `sternsystem.extract` handler (added to the Sternsystem module created by RFC-0354)

**Reused/adapted RFC-0221 machinery:**

- `packages/os/site-kernel-handoff/src/version-compare.ts` — `compareEcosystem` reused for pin-vs-platform comparison
- `packages/os/site-kernel-handoff/src/materialize.ts` — `applyMigratorChain`, `loadAuthoredSet`, `injectAuthoredSet` reused for data set migration and injection
- `packages/os/site-kernel-handoff/src/authored-set.ts` — data-only classifier reused for Sternsystem extraction (stripping runtime/config/generated files)

**Validation adaptation:**

- `packages/os/site-kernel-checks/src/contract-full.ts` — add `--workpiece-dir` flag; resolve app directory from flag when present, otherwise from `apps/<app>/`

**Runtime boilerplate generation:**

- `packages/os/site-kernel-codegen/src/app-boilerplate.ts` — extend generators to accept an optional `targetDirectory` (defaulting to current app) so they can write into a Werkstück
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/` — platform templates for `package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.jsonc`, `tools/kernel.config.ts`, route stubs
- `packages/os/site-kernel-onboarding/src/scaffold.ts` — reuse template-sync helpers for initial Werkstück skeleton

**Module registration:**

- `packages/os/site-kernel-handoff/src/index.ts` — extend `createMissionModule()` (from RFC-0355) to register the six materialization commands; extend `createSternsystemModule()` (from RFC-0354) to register `sternsystem.extract`
- `tools/kernel.config.ts` — ensure `createMissionModule()` and `createSternsystemModule()` are present in the modules list (handled by RFC-0354 and RFC-0355 plans; RFC-0356 adds no new module)

**New Site OS commands:**

- `mission.materialize` — workspace scope, `mutatesState: true`, requires `mission:<id>` and `system:<id>` locks
- `mission.validate` — workspace scope, `mutatesState: false` (reads Werkstück, writes evidence report)
- `mission.preview` — workspace scope, `mutatesState: false` (read-only dev server)
- `mission.build` — workspace scope, `mutatesState: true` (writes `distribution/`)
- `mission.diff` — workspace scope, `mutatesState: false` (writes evidence report only)
- `mission.reconcile` — workspace scope, `mutatesState: true`, requires `system:<id>` and `mission:<id>` locks
- `sternsystem.extract` — workspace scope, `mutatesState: true`, requires `registry` lock

### 2.2 Configuration and data

- `missions/<id>/workpiece/` — ephemeral mutable Werkstück (gitignored)
- `missions/<id>/distribution/` — ephemeral immutable local Distribution (gitignored)
- `missions/<id>/evidence/` — materialization, validation, build, diff, and reconciliation reports
- `systems/<id>/` — Sternsystem cache clone (gitignored, already configured by RFC-0354)
- `systems/registry.yaml` — fleet registry (already configured by RFC-0354)
- `apps/<app>/` — removed for the pilot after extraction validates

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0356-mission-materialization-from-pinned-sternsystem-bundles.md` — read-only reference (not modified by this plan)
- `docs/architecture-dna.md` — verify DNA-47 entry is present and matches the enhanced RFC text
- `docs/requirements.xml` — add mission materialization requirements
- `docs/technology.xml` — add materialization and extraction commands to the technology surface
- `docs/development-plan.xml` — add the `apps/` → Sternsystem migration milestone
- `docs/knowledge-graph.xml` — add relationships between mission, Werkstück, Distribution, Sternsystem, and Bordbuch
- `packages/os/site-kernel-handoff/AGENTS.md` — add mission materialization rules: reuse RFC-0221 machinery, generate full bootstrap, no `apps/` dependency, lock/idempotency required, reconciliation aborts on remote drift
- `AGENTS.md` (root) — add or update the "Mission materialization (RFC-0356)" section under Werkstatt architecture guidance

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/ontology run build:check` — schema compilation
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — handler compilation
- `pnpm --filter @gogol/site-kernel-handoff run test` — unit tests
- `pnpm --filter @gogol/site-kernel-checks run build:check` — contract-full adaptation compilation
- `pnpm --filter @gogol/site-kernel-codegen run build:check` — generator adaptation compilation
- `pnpm exec site-kernel run rfc.validate RFC-0356 --json` — RFC validation
- `pnpm exec site-kernel run mission.materialize --mission <id> --json` — smoke test
- `pnpm exec site-kernel run mission.validate --mission <id> --json` — smoke test
- `pnpm -s run build:check` — workspace-level build check (no `apps/` regression)
- No new pipeline placement — the commands are workspace-scoped and invoked manually; they do not join `build.check` or `apps-check` pipelines.

## 3. Step sequence

### Step 1. Define Zod schemas in `@gogol/ontology`

**Goal:** Create the machine-checkable contracts for all mission evidence reports.

**Agent actions:**

- Create `packages/ontology/src/schemas/materialization.ts` with the five schemas from RFC-0356 §Design → TypeScript contracts:
  - `MaterializationReportSchema` — includes `versionComparison` (verdict `in-sync` | `catch-up` | `refuse-downgrade`), `migratorChain`, `capabilityDiff`, `regeneration`, `materializedAt`
  - `ValidationReportSchema` — includes `contractFull` result, `build` result, `validatedAt`
  - `AuthoredDiffSchema` — includes `added`, `modified`, `removed` data paths
  - `ReconciliationReportSchema` — includes commit SHA, remote before/after SHAs, data diff hash, operation id
  - `BuildReportSchema` — includes distribution path, build manifest hash, `builtAt`
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42).
- Re-export from `packages/ontology/src/schemas/index.ts`.

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- Schemas match the RFC TypeScript contracts

**Completion criterion:** All five schemas are exported from `@gogol/ontology/schemas` and compile without errors.

**Human review:** no

---

### Step 2. Extend mission IO helpers

**Goal:** Add Werkstück-path and materialization-status helpers to the mission module.

**Prerequisite:** RFC-0355 implemented (mission manifest and lifecycle commands exist).

**Agent actions:**

- Extend `packages/os/site-kernel-handoff/src/mission/mission-io.ts` (created by RFC-0355) with:
  - `resolveWorkpieceDir(workspaceRoot, missionId)` → `missions/<id>/workpiece/`
  - `resolveDistributionDir(workspaceRoot, missionId)` → `missions/<id>/distribution/`
  - `resolveEvidenceDir(workspaceRoot, missionId)` → `missions/<id>/evidence/`
  - `resolveMissionId(input)` — parse `--mission <id>` flag
  - `assertMissionOpen(manifest)` — fail if state is not `open`
  - `assertMissionMaterialized(manifest)` — fail if `materializedAt` is unset
  - `assertMissionValidated(manifest)` — fail if `validatedAt` is unset
  - `writeEvidenceReport(workspaceRoot, missionId, filename, payload)` — serialize JSON with RFC-0081 generated marker
- Use `zod` schemas from `@gogol/ontology/schemas/materialization.ts` for report validation.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Unit tests for path resolution and assertion helpers pass

**Completion criterion:** Mission IO helpers can resolve Werkstück/Distribution/Evidence paths and validate mission state preconditions.

**Human review:** no

---

### Step 3. Implement `mission.materialize`

**Goal:** Populate the mission Werkstück from the Sternsystem's pinned data bundle.

**Prerequisite:** RFC-0354, RFC-0355, RFC-0362, and RFC-0364 implemented.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`:
  - Read `mission.yaml` via `readMissionManifest` from `mission-io.ts`.
  - Acquire RFC-0362 locks: `system:<systemId>` then `mission:<missionId>`.
  - Fetch the Sternsystem remote into `systems/<systemId>/` and read `system.pin.json`.
  - Build the catch-up report by reusing `compareEcosystem` from `version-compare.ts` with:
    - `sourceVersion` = pin's `platform.version`
    - `currentVersion` = current monorepo platform version
    - `sourcePackagesHash` = pin's `platformSemanticHash`
    - `currentPackagesHash` = current platform semantic hash via `@gogol/fingerprint`
  - If `--report-only`, return the catch-up report without writing files.
  - Refuse downgrade per RFC-0221 §4.1 (verdict `refuse-downgrade`).
  - If verdict is `catch-up`, resolve the migrator chain via `selectMigratorChain` and apply it with `applyMigratorChain`.
  - Stage the Werkstück: `missions/<id>/workpiece.staging-<operationId>/` using RFC-0362 atomic staging.
  - Copy the Sternsystem data set (content domains, assets, claims, credits, provenance, Bordbuch inputs) into the staging Werkstück using the data-only classifier from `authored-set.ts`.
  - Generate runtime boilerplate into the staging Werkstück:
    - `package.json` with workspace dependencies against the pinned platform
    - `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, `postcss.config.cjs`
    - `tools/kernel.config.ts` (mission-local command routing, reusing the workspace module list)
    - route stubs under `src/pages/`
    - `env.d.ts` and env schema stubs
  - Regenerate derived artifacts by calling the programmatic generators exported from `@gogol/site-kernel-codegen` (e.g., `runGenerateRoutes`, `runGenerateGlobalStyles`, `runGenerateScriptsOrchestrator`, `runGeneratePublicInfrastructure`, `runGenerateOverlayPages`) with a `KernelRuntimeContext` whose paths resolve to the staging Werkstück instead of `apps/<app>/`. The Werkstück's `package.json` declares the same workspace dependencies as a legacy app, so pnpm resolves packages through the root `node_modules/` and workspace symlinks without requiring a separate `pnpm install` in the mission directory.
  - Validate the staging shape: no forbidden Sternsystem-only paths leaked, every generated file has its RFC-0081 marker.
  - Atomically rename the staging directory to `workpiece/`.
  - Write `evidence/materialization-report.json`.
  - Update `mission.yaml` with `materializedAt` and `operationId`.
  - Release locks and write the completed RFC-0362 operation record.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Unit test: in-sync materialization creates a Werkstück with expected data paths and reports
- Unit test: downgrade refusal returns non-zero and does not write files
- Unit test: catch-up materialization applies a migrator chain and reports it
- Unit test: retry with the same operation id returns the completed operation record
- Unit test: lock contention returns a clear diagnostic

**Completion criterion:** `mission.materialize` can materialize a Werkstück from a pinned Sternsystem, apply migrators, generate boilerplate, and produce a materialization report.

**Human review:** no

---

### Step 4. Adapt `app.contract.full` for Werkstück validation

**Goal:** Allow the canonical full-contract validator to run against a mission Werkstück.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/contract-full.ts`:
  - Add `--workpiece-dir <path>` flag support.
  - When `--workpiece-dir` is provided, resolve the app directory from that path instead of `apps/<app>/`.
  - Keep `--app <name>` behavior unchanged for backward compatibility (legacy `apps/` sites remain valid until extraction).
  - Ensure all sub-validators that read app-relative paths use the resolved directory.
  - The output envelope still reports `app: <name>`; add `workpieceDir` to the data payload when the flag is used.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- Unit test: `app.contract.full --workpiece-dir <path>` resolves the same validators as `--app <name>`
- Unit test: missing `--workpiece-dir` and missing `--app` still fails with the existing error

**Completion criterion:** `app.contract.full` accepts `--workpiece-dir` and runs the full validator suite against the specified directory.

**Human review:** no

---

### Step 5. Implement `mission.validate`

**Goal:** Gate `mission.reconcile` and `mission.close` with a full-contract + readable build validation.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-validate.ts`:
  - Verify the mission is `open` and `materializedAt` is set.
  - Run `app.contract.full --workpiece-dir <workpiece>` and capture the result.
  - Run a readable build against the Werkstück (invoke `astro build` with `outDir` set to a temporary staging directory, not the canonical `distribution/`).
  - Collect route list, sitemap hash, and llms hashes from the readable build output.
  - Write `evidence/validation-report.json`.
  - Update `mission.yaml` with `validatedAt` only if the validation passes.
  - Return pass/fail with the validator summary.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Unit test: passing validation sets `validatedAt` in `mission.yaml`
- Unit test: failing validation leaves `validatedAt` unset and returns non-zero
- Unit test: validation report includes contract-full results and build summary

**Completion criterion:** `mission.validate` runs the full contract and readable build against the Werkstück and produces a validation report.

**Human review:** no

---

### Step 6. Implement `mission.preview`

**Goal:** Serve the current Werkstück for local review without producing a canonical artifact.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-preview.ts`:
  - Verify the mission is `open` and materialized.
  - Start a local Astro dev/preview server by running `astro dev` in the Werkstück directory with `cwd` set to `missions/<id>/workpiece/` and dependencies resolved through the workspace root.
  - The server uses the pinned platform worktree for dependencies (no independent `pnpm install` in the mission directory).
  - Do not write to the Sternsystem repo, do not publish a release, do not create durable artifacts.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Smoke test: `mission.preview --mission <id>` starts a server on the Werkstück

**Completion criterion:** `mission.preview` serves the Werkstück locally without side effects.

**Human review:** no

---

### Step 7. Implement `mission.build`

**Goal:** Produce an immutable local Distribution from the validated Werkstück.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-build.ts`:
  - Verify validation has passed (or run `mission.validate` preflight).
  - Stage the distribution: `missions/<id>/distribution.staging-<operationId>/` using RFC-0362 atomic staging.
  - Run the production build by invoking `astro build` with `cwd` set to `missions/<id>/workpiece/` and `outDir` set to `distribution.staging-<op>/dist/`. Dependencies resolve through the workspace root.
  - Write `distribution.staging-<op>/build-manifest.json` with build facts.
  - Atomically rename the staging directory to `distribution/`.
  - Write `evidence/build-report.json`.
  - Update `mission.yaml` with `builtAt`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Unit test: build produces `distribution/dist/` and `build-manifest.json`
- Unit test: a new build replaces the old distribution atomically, never mutates files in place

**Completion criterion:** `mission.build` produces an immutable local Distribution and a build report.

**Human review:** no

---

### Step 8. Implement `mission.diff`

**Goal:** Show the data-set diff between the Werkstück and the Sternsystem's pinned state.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-diff.ts`:
  - Read the Sternsystem data set from `systems/<id>/`.
  - Read the mission Werkstück data set from `missions/<id>/workpiece/`.
  - Compare data paths only (exclude generated runtime, derived files, `distribution/`, `node_modules/`, `.astro/`).
  - Classify per-file diff: added, modified, removed.
  - Write `evidence/authored-diff.json`.
  - Print a human summary: `N added, M modified, K removed`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Unit test: fresh materialization shows zero data diffs (excluding generated files)
- Unit test: edited Werkstück shows the expected added/modified/removed files

**Completion criterion:** `mission.diff` computes and reports the data-set diff between Werkstück and Sternsystem pin.

**Human review:** no

---

### Step 9. Implement `mission.reconcile`

**Goal:** Write validated Werkstück data changes back to the Sternsystem's git repo.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-reconcile.ts`:
  - Verify the mission is `open` and `validatedAt` is set.
  - Acquire RFC-0362 locks: `system:<systemId>` then `mission:<missionId>`.
  - Fetch the Sternsystem remote and verify no remote commits landed after materialization. If drift exists, abort with "re-materialize"; do not auto-merge or force-push.
  - Copy the data-set changes from the Werkstück back to `systems/<systemId>/` using the same data-only classifier.
  - Stage, commit, and push the changes in the cache clone.
  - Write `evidence/reconciliation-report.json` with commit SHA, remote before/after SHAs, data diff hash, and operation id.
  - Update `mission.yaml` with `reconciledAt` and `reconciliationCommit`.
  - Release locks and write the completed RFC-0362 operation record.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Unit test: reconcile commits and pushes data changes when validation passed and no remote drift
- Unit test: reconcile aborts without remote push when drift is detected
- Unit test: reconcile aborts when validation has not passed

**Completion criterion:** `mission.reconcile` writes validated data changes to the Sternsystem repo and aborts on remote drift.

**Human review:** no

---

### Step 10. Implement `sternsystem.extract`

**Goal:** Convert an existing `apps/<app>/` site into a data-only Sternsystem.

**Prerequisite:** RFC-0354 implemented (registry, pin commands, Sternsystem module).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts`:
  - Validate `apps/<app>/` exists and passes `app.contract.full`.
  - Create a new Sternsystem repo at the `--repo` URL (or local directory).
  - Use the amended `authored-set.ts` classifier to copy only Sternsystem-owned data paths from `apps/<app>/` into the repo.
  - Strip: generated files, scripts, runtime config, package manifests, Compass-generated regions, `dist/`, `node_modules/`, `packages/`.
  - Write `system.pin.json` with current platform version, commit, RFC head, and `platformSemanticHash` from `@gogol/fingerprint`.
  - Write initial `bordbuch/events.ndjson` with a hash-chained `pin-update` entry.
  - Commit and push the initial state.
  - Clone the repo into `systems/<id>/`.
  - Update `systems/registry.yaml` to `active` status, set `repo` and `pinnedPlatform`.
  - Open a verification mission, materialize, validate, and reconcile it.
  - Only after verification passes, remove `apps/<app>/` and update workspace discovery.
- Add `sternsystem.extract` to `createSternsystemModule()` in `packages/os/site-kernel-handoff/src/index.ts`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Unit test: extraction copies only data paths and writes a valid `system.pin.json`
- Unit test: extraction keeps the source app if materialization/validation fails
- Unit test: extraction removes the source app after successful validation and reconciliation

**Completion criterion:** `sternsystem.extract` produces a valid data-only Sternsystem and removes the source `apps/<app>/` after successful verification.

**Human review:** yes — removing an existing `apps/<app>/` directory changes the workspace topology and CI surface. The architecture role must approve the extraction and removal.

---

### Step 11. Register and wire commands

**Goal:** Make all new commands discoverable and executable via `pnpm exec site-kernel run`.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/src/index.ts`:
  - In `createMissionModule()`, register the six materialization commands with correct `scope`, `mutatesState`, and `lockScopes` metadata.
  - In `createSternsystemModule()`, register `sternsystem.extract`.
- Update `tools/kernel.config.ts`:
  - Add `MODULE_MAP` entries for each new command.
  - Add `CHANGE_SUMMARY` item: `RFC-0356: Register mission materialization and Sternsystem extraction commands.`

**Validation:**

- All new commands appear in `pnpm exec site-kernel run --help` (or equivalent command listing)
- `pnpm exec site-kernel run mission.list --json` still works (RFC-0355)
- `pnpm exec site-kernel run sternsystem.list --json` still works (RFC-0354)

**Completion criterion:** All RFC-0356 commands are registered and discoverable.

**Human review:** no

---

### Step 12. Update documentation

**Goal:** Synchronize AGENTS.md and Compass XML with the new materialization surface.

**Agent actions:**

- `packages/os/site-kernel-handoff/AGENTS.md` — add a "Mission materialization (RFC-0356)" section:
  - Materialization commands and their ownership
  - Reuse of RFC-0221 `compareEcosystem`, `applyMigratorChain`, `authored-set.ts`
  - Lock scope order (`system:*` before `mission:*`) and idempotency requirements from RFC-0362
  - Werkstück/Distribution/Evidence directory rules
  - Remote-drift abort rule for `mission.reconcile`
  - `sternsystem.extract` data-only classifier and source-app removal rule
- `AGENTS.md` (root) — add a "Mission materialization (RFC-0356)" section under Werkstatt architecture guidance:
  - Werkstück = mutable, non-canonical, disposable materialization
  - Distribution = immutable, non-canonical, disposable local build output
  - Extraction must end by removing `apps/<id>/`
  - Agents must not hand-assemble Werkstücke or deploy them directly
- Compass XML files (`docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`) — add mission materialization and Sternsystem extraction elements.

**Validation:**

- `pnpm exec site-kernel run compass.validate --json` passes
- `pnpm exec site-kernel run ecosystem.manifest.validate --json` passes
- `pnpm exec site-kernel run workspace.surface.validate --json` passes

**Completion criterion:** Documentation and Compass XML are synchronized.

**Human review:** no

---

### Step 13. Create test suite

**Goal:** Cover the new command handlers and the Werkstück contract path.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/mission-materialize.test.ts`:
  - Materialize from a fixture Sternsystem cache clone
  - Verify Werkstück contains data paths + generated boilerplate
  - Verify report schema validates
- Create `packages/os/site-kernel-handoff/src/tests/mission-validate.test.ts`:
  - Pass/fail validation flows
  - Verify `app.contract.full --workpiece-dir` integration
- Create `packages/os/site-kernel-handoff/src/tests/mission-build.test.ts`:
  - Distribution creation and atomic replacement
- Create `packages/os/site-kernel-handoff/src/tests/mission-diff.test.ts`:
  - Diff classification for added/modified/removed data paths
- Create `packages/os/site-kernel-handoff/src/tests/mission-reconcile.test.ts`:
  - Reconcile commits and pushes
  - Reconcile aborts on remote drift
- Create `packages/os/site-kernel-handoff/src/tests/sternsystem-extract.test.ts`:
  - Extract data-only bundle from a fixture app
  - Verify source app kept on failure, removed on success
- All filesystem tests use temp directories (`node:os.tmpdir()` + `fs.mkdtemp()`).

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test` passes

**Completion criterion:** All new test files pass and cover the materialization, validation, diff, reconcile, and extraction flows.

**Human review:** no

---

### Step 14. Validation suite and evidence

**Goal:** Run the full validation suite and emit verification evidence.

**Agent actions:**

- Run the required checks listed in §4.1.
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0356` (RFC-0330) and commit the generated `docs/rfcs/verification/rfc-0356.generated.json`.
- Update RFC-0356 acceptance-criteria checkboxes to reflect verified state.
- If the RFC is accepted, stamp `implementedAt` in the same commit as the evidence file.

**Validation:**

- All checks in §4.1 exit zero
- Evidence artifact is generated and committed

**Completion criterion:** All validation passes, evidence committed, acceptance criteria updated.

**Human review:** yes — architecture acceptance required to transition RFC-0356 from `draft` to `accepted` before implementation begins, and from `accepted` to `implemented` after.

---

### Step 15. Pilot extraction of `webgogol-com`

**Goal:** Execute the end-to-end pilot described in RFC-0356 §5.2.

**Prerequisite:** All previous steps implemented and validated; RFC-0356 is `accepted`.

**Agent actions:**

1. Register `webgogol-com` as a Sternsystem if not already registered (RFC-0354): `sternsystem.register --id webgogol-com --cosmicStar ... --repo git@github.com:webgogol/webgogol-com.git`.
2. Run `sternsystem.extract --app webgogol-com --repo git@github.com:webgogol/webgogol-com.git`.
3. Verify the extracted Sternsystem: `sternsystem.validate --id webgogol-com`.
4. Open a verification mission: `mission.open --system webgogol-com --brief "Pilot extraction verification"`.
5. Materialize: `mission.materialize --mission webgogol-com-m000001`.
6. Validate: `mission.validate --mission webgogol-com-m000001`.
7. Reconcile: `mission.reconcile --mission webgogol-com-m000001`.
8. Close: `mission.close --mission webgogol-com-m000001`.
9. Verify the Bordbuch has the expected entries.
10. Confirm `apps/webgogol-com/` is removed and no dual representation remains.

**Validation:**

- `sternsystem.validate --id webgogol-com` passes
- `mission.validate --mission webgogol-com-m000001` passes
- `apps/webgogol-com/` does not exist
- `pnpm -s run build:check` passes with no `apps/webgogol-com/` regression

**Completion criterion:** The pilot Sternsystem is extracted, verified, materialized, validated, reconciled, and closed; the source app is removed.

**Human review:** yes — this is a workspace-topology change and requires architecture approval before `apps/webgogol-com/` is removed.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0356 --json`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm exec site-kernel run mission.materialize --mission <id> --json` (smoke test)
- `pnpm exec site-kernel run mission.validate --mission <id> --json` (smoke test)
- `pnpm exec site-kernel run mission.diff --mission <id> --json` (smoke test)
- `pnpm exec site-kernel run sternsystem.validate --id webgogol-com --json` (pilot)
- `pnpm -s run build:check`
- `pnpm exec site-kernel run compass.validate --json`
- `pnpm exec site-kernel run ecosystem.manifest.validate --json`
- `pnpm exec site-kernel run workspace.surface.validate --json`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0356` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0356.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0356` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Mission-local bootstrap blocks `mission.validate` build step | Step 3 generates the full bootstrap before validation; Step 4 extends `app.contract.full` to run against the generated Werkstück |
| Migrator chain gap blocks catch-up materialization | Step 3 reuses `selectMigratorChain` and `migrator.validate`; upgrade missions require a complete chain |
| Mission Werkstück diverges from `apps/` build behavior | Step 3 uses the same pinned platform packages and the same `app.contract.full` pipeline; only the directory differs |
| Extraction loses data files | Step 10 reuses `authored-set.ts` and validates via `sternsystem.validate` and `mission.diff` |
| `mission.reconcile` pushes to the wrong remote | Step 9 reads the repo URL from `systems/registry.yaml` and aborts on remote drift |
| Lock/idempotency primitives not ready | Cross-dependency: RFC-0362 must be implemented first; Step 3 uses RFC-0362 helpers |
| `platformSemanticHash` not ready | Cross-dependency: RFC-0364 must be implemented first; Step 3 and Step 10 use `@gogol/fingerprint` |
| Pilot removal of `apps/webgogol-com/` breaks CI | Step 15 requires human review; workspace discovery and CI are updated as part of the extraction |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 (Sternsystem bundle contract), DNA-46 (mission lifecycle), DNA-47 (materialization), or DNA-51 (Werkstatt consistency), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0356 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the RFC-0221 `authored-set.ts` classifier cannot be safely narrowed to a data-only Sternsystem set without creating a parallel classifier, escalate rather than duplicating classification logic.
- If `app.contract.full` cannot be cleanly extended with `--workpiece-dir` without breaking the existing `apps/` pipeline, escalate to propose a dedicated `mission.contract.full` command instead.
- If the pilot extraction fails to validate and the root cause is incomplete platform templates, escalate to extend the generator templates rather than adding manual workarounds that depend on the source `apps/<app>/` directory.
