---
rfcId: RFC-0357
planId: PLAN-RFC-0357-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel-deploy"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel"
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/technology.xml
    - docs/development-plan.xml
    - packages/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0357

> **Pilot plan** — RFC-0357 has `status: draft`. Implementation requires explicit architecture acceptance (`draft → accepted`) before any code changes begin (RFC-0224).

> **Sequential dependency** — This plan assumes RFC-0362 (consistency primitives), RFC-0363 (artifact store), and RFC-0364 (semantic fingerprint) are implemented first. Their packages and APIs are referenced as prerequisites. No stubs are created.

## 1. Objectives

- [ ] Objective 1 — `ReleaseManifest`, `ReleaseBehaviorSnapshot`, and `BehaviorSnapshotDiff` Zod schemas defined in `@gogol/ontology` (maps to: "`ReleaseManifest`, `ReleaseBehaviorSnapshot`, and `BehaviorSnapshotDiff` Zod schemas defined in `@gogol/ontology`")
- [ ] Objective 2 — `behavior.snapshot.capture` and `behavior.snapshot.diff` commands registered and tested (maps to: "`behavior.snapshot.capture` command registered and tested" + "`behavior.snapshot.diff` command registered and tested")
- [ ] Objective 3 — `release.prepare`, `release.publish`, `release.validate`, `release.list`, and `release.rollback` commands registered and tested (maps to the five release command acceptance criteria)
- [ ] Objective 4 — `--json` output stable for all seven commands (maps to: "`--json` output stable for all seven commands")
- [ ] Objective 5 — Behavior snapshot reuses RFC-0269 schema; no second dialect exists (maps to: "Behavior snapshot reuses the RFC-0269 schema; no second route/sitemap-only snapshot dialect exists")
- [ ] Objective 6 — Snapshot diff gate enforces all fields and `release.publish` refuses on `fail` (maps to: "Snapshot diff gate enforces all fields" + "`release.publish` refuses if snapshot diff verdict is `fail`")
- [ ] Objective 7 — `release.publish` enforces all three discipline gates and stores artifact before registry update (maps to: "`release.publish` enforces all three discipline gates" + "`release.publish` stores the production dist in RFC-0363 artifact storage before updating registry `lastRelease`" + "`release.publish` appends `release-published` entry to Bordbuch and updates registry `lastRelease`")
- [ ] Objective 8 — Release IDs follow `<system-id>-r<NNNNNN>` format (maps to: "Release IDs follow `<system-id>-r<NNNNNN>` format")
- [ ] Objective 9 — `rfc.validate` passes on RFC-0357 (maps to: "`rfc.validate` passes on this file")
- [ ] Objective 10 — Advisory `quality-report.json` exists for passport scores and optimization metrics without acting as a hard release gate (maps to: "Advisory `quality-report.json` exists for passport scores and optimization metrics without acting as a hard release gate")
- [ ] Objective 11 — Pilot: prepare and publish a release for `warpgogol-com` after pilot mission closes (maps to: "Pilot: prepare and publish a release for `warpgogol-com` after pilot mission closes")

## 2. Affected artifacts

### 2.1 Code and commands

**New schema file:**

- `packages/ontology/src/schemas/release.ts` — Zod schemas: `ReleaseStateSchema`, `ReleaseManifestSchema`, `ReleaseArtifactRefSchema`, `ReleaseBehaviorSnapshotSchema`, `BehaviorSnapshotDifferenceSchema`, `BehaviorSnapshotDiffSchema`
- `packages/ontology/src/schemas/index.ts` — re-export release schemas and types

**New command modules in `@gogol/site-kernel-handoff`:**

- `packages/os/site-kernel-handoff/src/behavior-snapshot/capture.ts` — `behavior.snapshot.capture` handler
- `packages/os/site-kernel-handoff/src/behavior-snapshot/diff.ts` — `behavior.snapshot.diff` handler
- `packages/os/site-kernel-handoff/src/behavior-snapshot/index.ts` — barrel export
- `packages/os/site-kernel-handoff/src/release/prepare.ts` — `release.prepare` handler
- `packages/os/site-kernel-handoff/src/release/publish.ts` — `release.publish` handler
- `packages/os/site-kernel-handoff/src/release/validate.ts` — `release.validate` handler
- `packages/os/site-kernel-handoff/src/release/list.ts` — `release.list` handler
- `packages/os/site-kernel-handoff/src/release/rollback.ts` — `release.rollback` handler
- `packages/os/site-kernel-handoff/src/release/index.ts` — barrel export
- `packages/os/site-kernel-handoff/src/release/release-io.ts` — shared helpers: read/write `release.yaml`, compute hashes, validate manifest
- `packages/os/site-kernel-handoff/src/release/release-ids.ts` — release ID allocation, format validation, sequence derivation

**Updated files in `@gogol/site-kernel-handoff`:**

- `packages/os/site-kernel-handoff/src/index.ts` — add `createReleaseModule()` and export new handlers/types
- `packages/os/site-kernel-handoff/AGENTS.md` — add release and behavior-snapshot module documentation
- `packages/os/site-kernel-handoff/package.json` — add `@gogol/fingerprint: workspace:*` dependency (if not already present from RFC-0364)

**New test files:**

- `packages/os/site-kernel-handoff/src/tests/behavior-snapshot-diff.test.ts` — diff logic tests (pass/fail verdicts, field coverage)
- `packages/os/site-kernel-handoff/src/tests/behavior-snapshot-capture.test.ts` — capture wrapper tests
- `packages/os/site-kernel-handoff/src/tests/release-prepare.test.ts` — prepare handler tests
- `packages/os/site-kernel-handoff/src/tests/release-publish.test.ts` — publish handler tests (discipline gates, artifact store, Bordbuch append)
- `packages/os/site-kernel-handoff/src/tests/release-validate.test.ts` — validate handler tests
- `packages/os/site-kernel-handoff/src/tests/release-list.test.ts` — list handler tests
- `packages/os/site-kernel-handoff/src/tests/release-rollback.test.ts` — rollback handler tests
- `packages/os/site-kernel-handoff/src/tests/release-ids.test.ts` — ID format and sequence allocation tests
- `packages/os/site-kernel-handoff/src/tests/fixtures/` — fixture behavior snapshots for diff tests (pass-case, fail-case, route-removed, sitemap-changed)

**Registry wiring:**

- `packages/os/site-kernel/src/registry.ts` — no change needed (registry is generic; commands registered via module)
- `tools/kernel.config.ts` (per app) — import and register `createReleaseModule()` if not auto-registered

### 2.2 Configuration and data

- `releases/` directory — gitignored local release workspace (add to root `.gitignore` if not already present)
- `systems/registry.yaml` — `lastRelease` field updated by `release.publish` and `release.rollback`
- No new biome files, ontology catalogs, or blueprints

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — DNA-48 already present (verified); no change needed
- `docs/technology.xml` — register release commands and behavior snapshot capture/diff in the command surface
- `docs/development-plan.xml` — reference release discipline pipeline placement
- `packages/AGENTS.md` — update `@gogol/site-kernel-handoff` ownership description to include release and behavior-snapshot modules
- `packages/os/site-kernel-handoff/AGENTS.md` — add release module scope, rules, and validation commands
- `AGENTS.md` (root) — reference release discipline in the Werkstatt operations section (if one exists)

### 2.4 Validation and pipelines

- No new pipeline steps — release commands are operator-invoked, not pipeline-automated
- `pnpm --filter @gogol/ontology run build:check` — schema compilation
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — package compilation
- `pnpm --filter @gogol/site-kernel-handoff run test` — unit tests
- `pnpm exec site-kernel run rfc.validate RFC-0357 --json` — RFC validation

## 3. Step sequence

### Step 1. Define release and behavior snapshot Zod schemas

**Goal:** Create the ontology schema file that defines the release manifest, behavior snapshot wrapper, and diff types.

**Prerequisites:** RFC-0364 implemented (`@gogol/fingerprint` package exists for hash governance). RFC-0269 behavior snapshot schema exists in `packages/os/site-kernel-checks/src/behavior-snapshot.ts`.

**Agent actions:**

- Create `packages/ontology/src/schemas/release.ts`
- Define `ReleaseStateSchema = z.enum(["prepared", "published", "rolled-back"])`
- Define `ReleaseArtifactRefSchema` with `store`, `algorithm`, `digest`, `uri`, `manifestHash` fields per RFC §1.3
- Define `ReleaseManifestSchema` with all fields from RFC §1.3, including regex-validated `releaseId`, `systemId`, `missionId`
- Define `ReleaseBehaviorSnapshotSchema` wrapping the RFC-0269 `BehaviorSnapshot` — import the `BehaviorSnapshot` interface from `@gogol/site-kernel-checks` or re-declare a compatible schema in ontology (see Step 1 note below)
- Define `BehaviorSnapshotDifferenceSchema` and `BehaviorSnapshotDiffSchema`
- Export all schemas and inferred types
- Update `packages/ontology/src/schemas/index.ts` to re-export release schemas and types

**Step 1 note — BehaviorSnapshot schema location:** The RFC-0269 `BehaviorSnapshot` interface is currently in `packages/os/site-kernel-checks/src/behavior-snapshot.ts` as a TypeScript interface, not a Zod schema. The release schema needs to reference it. Two options: (a) extract a `BehaviorSnapshotSchema` Zod schema into `@gogol/ontology` and have `site-kernel-checks` import it, or (b) define the wrapper schema in ontology with `behaviorSnapshot: z.unknown()` and validate at runtime. Option (a) is cleaner and aligns with the RFC's intent to reuse the RFC-0269 schema. Prefer option (a) if feasible without breaking existing code; otherwise use (b) with a runtime validation helper.

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- `pnpm exec site-kernel run rfc.validate RFC-0357 --json` passes

**Completion criterion:** `release.ts` exists, all schemas exported from `@gogol/ontology/schemas`, TypeScript compiles, RFC validation passes.

**Human review:** No

---

### Step 2. Implement `behavior.snapshot.capture` command

**Goal:** Create the low-level snapshot capture wrapper that produces a `ReleaseBehaviorSnapshot` from a dist directory.

**Prerequisites:** Step 1 complete. RFC-0269 behavior snapshot generator exists in `packages/os/site-kernel-checks/src/behavior-snapshot.ts`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/behavior-snapshot/capture.ts`
- Implement `runBehaviorSnapshotCapture` handler:
  - Read `--dist`, `--system`, `--build-kind`, `--release` flags
  - Call the existing RFC-0269 snapshot extraction logic (import `extractRouteBehavior` and related functions from `@gogol/site-kernel-checks`)
  - Wrap the result in a `ReleaseBehaviorSnapshot` with `schemaVersion: "1.0.0"`, `systemId`, `releaseId`, `buildKind`, `capturedAt`, and `behaviorSnapshotHash` (computed via `@gogol/fingerprint` `stableJsonHash`)
  - Write the wrapper to stdout or `--json` envelope
- Create `packages/os/site-kernel-handoff/src/behavior-snapshot/index.ts` barrel export
- Register the command in `createReleaseModule()` (or a separate `createBehaviorSnapshotModule()` — prefer one module for all seven commands)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm exec site-kernel run behavior.snapshot.capture --dist <test-dist> --system test --build-kind readable --json` returns a valid `ReleaseBehaviorSnapshot`

**Completion criterion:** Command registered, callable via `site-kernel run`, returns valid `--json` envelope with `ReleaseBehaviorSnapshot` shape.

**Human review:** No

---

### Step 3. Implement `behavior.snapshot.diff` command

**Goal:** Create the diff command that compares two behavior snapshots and produces a pass/fail verdict.

**Prerequisites:** Step 2 complete.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/behavior-snapshot/diff.ts`
- Implement `runBehaviorSnapshotDiff` handler:
  - Read `--baseline` and `--candidate` file paths
  - Parse both as `ReleaseBehaviorSnapshot` using the Zod schema
  - Compare structural facts per RFC §3.1:
    - Route records: same route set and same per-route structural metadata (title, metaDescription, canonical, hreflang, og, twitter, jsonld, breadcrumbDepth, robotsMeta, inSitemap, hasMarkdownTwin)
    - JSON-LD records: same graph shape after deterministic normalization
    - Discovery membership: same sitemap, llms, markdown twin, robots membership
    - Headers/redirects: same normalized `_headers` and `_redirects` facts
    - Route count: same count
  - Produce `BehaviorSnapshotDiff` with `verdict: "pass" | "fail"` and `differences: BehaviorSnapshotDifference[]`
  - Return `--json` envelope with `status: "pass"` when verdict is pass, `status: "fail"` when verdict is fail
- Create test fixtures: `tests/fixtures/snapshot-pass.json`, `tests/fixtures/snapshot-route-removed.json`, `tests/fixtures/snapshot-sitemap-changed.json`
- Write `packages/os/site-kernel-handoff/src/tests/behavior-snapshot-diff.test.ts` — test pass case, route-removed case, sitemap-changed case, headers-changed case

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run test` passes (diff tests green)
- `pnpm exec site-kernel run behavior.snapshot.diff --baseline <pass-fixture> --candidate <pass-fixture> --json` returns `verdict: "pass"`
- `pnpm exec site-kernel run behavior.snapshot.diff --baseline <pass-fixture> --candidate <route-removed-fixture> --json` returns `verdict: "fail"` with differences

**Completion criterion:** Diff command registered, all diff test cases pass, `--json` output matches RFC §6.6 format.

**Human review:** No

---

### Step 4. Implement release ID allocation and I/O helpers

**Goal:** Create the shared helpers for release ID format validation, sequence allocation, and manifest read/write.

**Prerequisites:** Step 1 complete. RFC-0362 implemented (lock primitives available).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/release/release-ids.ts`
  - `RELEASE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/`
  - `SYSTEM_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/`
  - `MISSION_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$/`
  - `allocateReleaseId(systemId, registry, bordbuch)` — derives next sequence number from existing releases and Bordbuch entries, returns `<system-id>-r<NNNNNN>`, throws on exhaustion (999999)
  - `validateReleaseId(id)` — regex check
- Create `packages/os/site-kernel-handoff/src/release/release-io.ts`
  - `readReleaseManifest(releaseDir)` — read and parse `release.yaml`, validate with `ReleaseManifestSchema`
  - `writeReleaseManifest(releaseDir, manifest)` — serialize and write `release.yaml`
  - `computeDistTreeHash(distDir)` — use `@gogol/fingerprint` `fingerprintTree` with byte mode
  - `computeSiteContentHash(workpieceDir)` — use `@gogol/fingerprint` `fingerprintTree` with semantic mode
  - `computeSnapshotHash(snapshot)` — use `@gogol/fingerprint` `stableJsonHash`
- Write `packages/os/site-kernel-handoff/src/tests/release-ids.test.ts` — ID format validation, sequence allocation, exhaustion error

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run test` passes (ID tests green)

**Completion criterion:** ID allocation and I/O helpers implemented, tested, TypeScript compiles.

**Human review:** No

---

### Step 5. Implement `release.prepare` command

**Goal:** Create the prepare handler that produces a staged release candidate with production build, behavior snapshots, and diff.

**Prerequisites:** Steps 2, 3, 4 complete. RFC-0362 implemented (locks and staging). RFC-0364 implemented (`@gogol/fingerprint`).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/release/prepare.ts`
- Implement `runReleasePrepare` handler per RFC §6.1:
  1. Read `--mission` flag, verify mission has passed validation (read mission manifest and validation report)
  2. Acquire RFC-0362 `system:<system-id>` and `release:<release-id>` locks
  3. Allocate release sequence number via `allocateReleaseId`
  4. Create `releases/<release-id>.staging-<operationId>/`
  5. Run production build (`astro build` with production config) on the mission Werkstück
  6. Capture production behavior snapshot via `behavior.snapshot.capture` on the production dist
  7. Copy readable behavior snapshot from the mission's validation report
  8. Run `behavior.snapshot.diff` between readable and production snapshots
  9. Copy `validation-report.json` and `materialization-report.json` from the mission
  10. Compute `siteContentHash`, `distTreeHash`, snapshot hashes, and advisory `qualityReportHash`
  11. Write `quality-report.json` with advisory quality scores (passport scores, bundle sizes, image weights) — NOT a release gate
  12. Write `release.yaml` with state `prepared` and `artifact: null`
  13. If snapshot diff fails, report differences and exit non-zero without renaming staging directory
  14. Atomically rename staging directory to `releases/<release-id>/`
- Handle idempotent retry: if the same operation id is retried, return the existing release candidate
- Write `packages/os/site-kernel-handoff/src/tests/release-prepare.test.ts` — test prepare with mock mission, verify manifest fields, verify staging directory rename, verify diff failure blocks rename

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run test` passes (prepare tests green)

**Completion criterion:** `release.prepare` command registered, produces a valid release directory with manifest, snapshots, and diff. Diff failure blocks the release.

**Human review:** No

---

### Step 6. Implement `release.publish` command

**Goal:** Create the publish handler that finalizes a release with discipline gates, artifact storage, Bordbuch append, and registry update.

**Prerequisites:** Step 5 complete. RFC-0363 implemented (artifact store). RFC-0362 implemented (atomic multi-write). RFC-0355 implemented (Bordbuch append).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/release/publish.ts`
- Implement `runReleasePublish` handler per RFC §6.2:
  1. Read `--release` flag, verify release is `prepared`
  2. Run discipline gates (RFC §4):
     - `migrator.validate` (RFC-0221) — fail blocks publish
     - Version-compare check — `refuse-downgrade` blocks publish
     - `bordbuch.validate` (RFC-0355) — fail blocks publish
  3. Verify `snapshotDiffVerdict` is `pass`
  4. Store production `dist/` through `artifact.store.put` (RFC-0363) — record artifact reference
  5. Update `release.yaml`: state → `published`, `publishedAt`, `artifact`, `distArtifactHash`
  6. Append `release-published` entry to Bordbuch (RFC-0355 `bordbuch.append`)
  7. Update `systems/registry.yaml` `lastRelease` to the release id
  8. All three writes (manifest, Bordbuch, registry) happen in one RFC-0362 atomic operation
  9. Fleet propagation is left to RFC-0358 — not a precondition
- Write `packages/os/site-kernel-handoff/src/tests/release-publish.test.ts` — test publish with prepared release, verify gates, verify artifact store put, verify Bordbuch append, verify registry update, test gate failure cases (migrator fail, version-compare refuse, Bordbuch fail, diff fail)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run test` passes (publish tests green)

**Completion criterion:** `release.publish` command registered, enforces all gates, stores artifact, appends Bordbuch, updates registry. Gate failures block publish with correct error messages.

**Human review:** No

---

### Step 7. Implement `release.validate`, `release.list`, and `release.rollback` commands

**Goal:** Create the remaining three release commands.

**Prerequisites:** Step 6 complete.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/release/validate.ts`
  - Implement `runReleaseValidate` per RFC §6.3:
    - Manifest integrity (parse, field completeness via `ReleaseManifestSchema`)
    - RFC-0269 behavior snapshot present and parseable
    - Production build artifact present in local `dist/` or retrievable from RFC-0363
    - `distArtifactHash`, `distTreeHash`, `siteContentHash`, snapshot hashes match referenced files
    - Snapshot diff verdict is `pass`
    - Migrator and version-compare verdicts are green
- Create `packages/os/site-kernel-handoff/src/release/list.ts`
  - Implement `runReleaseList` per RFC §6.4:
    - Scan `releases/` directory, optionally filtered by `--system`
    - Return list of release summaries (id, systemId, state, createdAt, publishedAt)
- Create `packages/os/site-kernel-handoff/src/release/rollback.ts`
  - Implement `runReleaseRollback` per RFC §6.7:
    1. Verify release is `published`
    2. Append `release-rolled-back` entry to Bordbuch
    3. Update `release.yaml` state to `rolled-back`
    4. Trigger fleet rollback via RFC-0358 (propagation not a precondition for state transition)
    5. Artifact remains in RFC-0363 store for audit
- Write tests for all three commands
- Create `packages/os/site-kernel-handoff/src/release/index.ts` barrel export

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff run test` passes (all release tests green)

**Completion criterion:** All seven commands registered, callable, and tested. `--json` output stable for all.

**Human review:** No

---

### Step 8. Register commands in the kernel module

**Goal:** Wire all seven commands into a `createReleaseModule()` and ensure it is registered in the kernel.

**Prerequisites:** Step 7 complete.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/src/index.ts`:
  - Add `createReleaseModule()` returning a `KernelModule` with all seven commands registered:
    - `release.prepare` (mutatesState: true)
    - `release.publish` (mutatesState: true)
    - `release.validate`
    - `release.list`
    - `release.rollback` (mutatesState: true)
    - `behavior.snapshot.capture`
    - `behavior.snapshot.diff`
  - Export all new handler functions and types
- Verify the module is imported and registered in the app's `tools/kernel.config.ts` (or auto-registered if the kernel auto-discovers modules)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm exec site-kernel run release.list --json` returns a valid (possibly empty) list
- All seven commands appear in `pnpm exec site-kernel run --help` or equivalent command listing

**Completion criterion:** All seven commands registered and callable via `site-kernel run`.

**Human review:** No

---

### Step 9. Update documentation

**Goal:** Synchronize AGENTS.md, Compass XML, and ownership tables.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/AGENTS.md`:
  - Add "Release module" section documenting the seven commands, their scope, and validation rules
  - Add "Behavior snapshot module" section documenting capture and diff
  - Document the `releases/` directory as gitignored local cache
  - Document the dependency on RFC-0362/0363/0364
- Edit `packages/AGENTS.md` — update `@gogol/site-kernel-handoff` ownership description to include release and behavior-snapshot modules
- Edit `docs/technology.xml` — register the seven new commands in the command surface
- Edit `docs/development-plan.xml` — reference release discipline as an operator-involved workflow (not pipeline-automated)
- Edit root `AGENTS.md` — add release discipline reference in the Werkstatt operations section (if applicable)
- Verify `docs/architecture-dna.md` DNA-48 entry is current (already present, no change expected)

**Validation:**

- `pnpm exec site-kernel run compass.validate --json` passes
- `pnpm exec site-kernel run ecosystem.manifest.validate --json` passes
- `pnpm exec site-kernel run workspace.surface.validate --json` passes

**Completion criterion:** All documentation files updated, Compass validation passes, ecosystem manifest is fresh.

**Human review:** No

---

### Step 10. Final validation and evidence

**Goal:** Run the full validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0357 --json` — verify pass
- Run `pnpm --filter @gogol/ontology run build:check` — verify pass
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check` — verify pass
- Run `pnpm --filter @gogol/site-kernel-handoff run test` — verify all tests pass
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0357` (RFC-0330) — emit verification evidence
- Update RFC-0357 acceptance criteria checkboxes to reflect verified state
- Verify `releases/` is in `.gitignore`

**Validation:**

- `rfc.validate RFC-0357` passes
- All affected `build:check` passes
- All unit tests pass
- Verification evidence file emitted

**Completion criterion:** All validation passes, evidence artifact committed, acceptance criteria checkboxes updated.

**Human review:** Yes — architecture acceptance required to transition RFC from `draft` to `accepted` before implementation begins (RFC-0224). After implementation, architecture review required to transition from `accepted` to `implemented`.

---

### Step 11. Pilot: prepare and publish a release for `warpgogol-com`

**Goal:** Exercise the full release flow end-to-end on the reference Sternsystem.

**Prerequisites:** Step 10 complete. RFC-0355 (mission lifecycle) and RFC-0356 (materialization) implemented. A pilot mission for `warpgogol-com` has been opened, materialized, validated, and closed.

**Agent actions:**

- Run `pnpm exec site-kernel run release.prepare --mission <pilot-mission-id> --semver 1.0.0 --json` — verify a release candidate is produced in `releases/warpgogol-com-r000001/`
- Verify `release.yaml` has state `prepared`, `snapshotDiffVerdict: "pass"`, and all hash fields populated
- Run `pnpm exec site-kernel run release.validate --release warpgogol-com-r000001 --json` — verify pass
- Run `pnpm exec site-kernel run release.publish --release warpgogol-com-r000001 --json` — verify state transitions to `published`, Bordbuch entry appended, registry `lastRelease` updated
- Run `pnpm exec site-kernel run release.list --system warpgogol-com --json` — verify the release appears
- Run `pnpm exec site-kernel run release.rollback --release warpgogol-com-r000001 --json` — verify state transitions to `rolled-back` (optional, only if rollback is safe for the pilot)

**Validation:**

- `release.prepare` produces a valid release candidate with `snapshotDiffVerdict: "pass"`
- `release.publish` transitions to `published` with all gates green
- `release.validate` passes on the published release
- `release.list` shows the release

**Completion criterion:** Pilot release for `warpgogol-com` is prepared, published, validated, and listed. Bordbuch has `release-published` entry. Registry `lastRelease` is updated.

**Human review:** Yes — operator must verify the pilot does not disrupt the live `warpgogol-com` deployment. Fleet propagation (RFC-0358) is separate but must be coordinated.

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0357 --json`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run compass.validate --json`
- `pnpm exec site-kernel run ecosystem.manifest.validate --json`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0357` (RFC-0330)
- Pilot: `release.prepare` + `release.publish` + `release.validate` + `release.list` for `warpgogol-com` (Step 11)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0357.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0357` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Production build differs structurally from readable build | Step 3: diff command catches all structural fields; Step 5: prepare blocks on diff failure |
| Snapshot capture misses a structural fact | Step 3: diff tests cover routes, JSON-LD, discovery, headers, redirects, route count; reuses RFC-0269 schema |
| Release artifact is large (dist/ with images) | Step 6: artifact stored via RFC-0363 content-addressed store, not in git; `releases/` is gitignored |
| `release.publish` triggers fleet propagation that fails | Step 6: propagation is not a precondition; release is `published` but not deployed; RFC-0358 handles retry |
| Bordbuch append fails during release.publish | Step 6: RFC-0362 atomic operation ensures manifest, Bordbuch, and registry either all complete or leave recoverable state |
| Partial build failure leaves incomplete snapshot | Step 5: production build completeness check before snapshot capture; staging directory not renamed on failure |
| Sequence number race condition | Step 4: allocation under RFC-0362 `system:<id>` lock; Step 5: prepare acquires lock before allocation |
| BehaviorSnapshot schema location mismatch | Step 1: note documents two options; prefer extracting Zod schema to ontology |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0357 --reason "..." --invariant "DNA-48"` instead of working around it.
- If the RFC-0269 `BehaviorSnapshot` interface cannot be reused as-is (e.g., missing fields needed for release diff), escalate via `rfc.supersede.propose` with `--reason "RFC-0269 behavior snapshot insufficient for release diff"`.
- If RFC-0362/0363/0364 are not yet implemented and blocking progress, do not stub — wait for the dependency wave to land first (per the sequential decision).
- If the production build produces a structurally different output by design (e.g., a route intentionally excluded only in production), escalate to update the RFC's allowed-differences list (§3.2) before proceeding.
