---
rfcId: RFC-0354
planId: PLAN-RFC-0354-01
status: reviewed
owner: architecture
createdAt: 2026-07-09
updatedAt: 2026-07-09
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel"
    - "@gogol/fingerprint"
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/knowledge-graph.xml
    - .gitignore
    - packages/os/site-kernel-handoff/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0354

> **Prerequisites:** RFC-0364 (`@gogol/fingerprint`) is implemented before this plan starts. RFC-0362 (Werkstatt consistency) is accepted but not implemented — transitional atomic writes are used until it lands.

## 1. Objectives

- [ ] Objective 1 — Define `SystemPin`, `FleetRegistryEntry`, `FleetRegistry` Zod schemas in `@gogol/ontology` (acceptance criteria 1, 9)
- [ ] Objective 2 — Implement `sternsystem.register` and `sternsystem.list` commands in `@gogol/site-kernel-handoff` (acceptance criteria 2, 3, 6)
- [ ] Objective 3 — Implement `sternsystem.validate` command enforcing registry invariants, bundle contract, pin coherence, and apps/ collision refusal (acceptance criteria 4, 6, 9, 10)
- [ ] Objective 4 — Implement `sternsystem.pin` command with refuse-downgrade gate (acceptance criteria 5, 6, 11)
- [ ] Objective 5 — Create `systems/registry.yaml` and update `.gitignore` with new Werkstatt directory entries (acceptance criteria 7, 8)
- [ ] Objective 6 — Verify DNA-44 and DNA-45 are present in `docs/architecture-dna.md` (acceptance criterion 14)
- [ ] Objective 7 — Pass `build:check` and `rfc.validate` with no regression (acceptance criteria 15, 16)

**Out of scope for this plan (gated by other RFCs):**

- Pilot extraction of `webgogol-com` and `apps/` removal — depends on RFC-0356 (materialization, accepted, not implemented). The pilot registration (metadata-only) is in scope; extraction/materialization is not.
- Lock/idempotency/atomic-staging primitives — depends on RFC-0362 (Werkstatt consistency, accepted, not implemented). Transitional temp-file-then-rename atomic writes are used until RFC-0362 lands.

## 2. Affected artifacts

### 2.1 Code and commands

- **`packages/ontology/src/schemas/sternsystem.ts`** — new file: `SystemPinSchema`, `FleetRegistryEntrySchema`, `FleetRegistrySchema` Zod schemas.
- **`packages/ontology/src/schemas/index.ts`** — barrel re-exports for the three new schemas and their inferred types.
- **`packages/os/site-kernel-handoff/src/sternsystem/`** — new directory:
  - `registry-io.ts` — read/write/parse `systems/registry.yaml` using `FleetRegistrySchema`; canonical key order; temp-file-then-rename.
  - `sternsystem-register.ts` — `runSternsystemRegister` handler.
  - `sternsystem-list.ts` — `runSternsystemList` handler.
  - `sternsystem-validate.ts` — `runSternsystemValidate` handler.
  - `sternsystem-pin.ts` — `runSternsystemPin` handler.
  - `bundle-contract.ts` — independent forbidden-path scanner based on §1.2 list.
- **`packages/os/site-kernel-handoff/src/bundle-io.ts`** — extract `highestRfcId` and `snapshotCapabilities` here as shared helpers (consumed by both `handoff-pack.ts` and `sternsystem-pin.ts`).
- **`packages/os/site-kernel-handoff/src/handoff-pack.ts`** — update imports to use `highestRfcId` and `snapshotCapabilities` from `bundle-io.ts`.
- **`packages/os/site-kernel-handoff/src/index.ts`** — add `createSternsystemModule()` and export handlers/types.
- **`packages/os/site-kernel-handoff/package.json`** — add `@gogol/fingerprint` as workspace dependency.
- **`tools/kernel.config.ts`** — register `createSternsystemModule()` in the `modules` array; add `MODULE_MAP` entries and `CHANGE_SUMMARY` item.
- **Site OS commands (4 new):**
  - `sternsystem.register` — workspace scope, `mutatesState: true`
  - `sternsystem.list` — workspace scope, read-only
  - `sternsystem.validate` — workspace scope, read-only
  - `sternsystem.pin` — workspace scope, `mutatesState: true`

### 2.2 Configuration and data

- **`systems/registry.yaml`** — new tracked file: `schemaVersion: "1.0.0"`, `systems: []` (empty initial state).
- **`.gitignore`** (root) — new entries: `systems/*`, `!systems/registry.yaml`, `missions/`, `releases/`, `agents/`, `.werkstatt/`.
- **`fleet/fleet.sites.json`** — not modified; superseded by `systems/registry.yaml` but kept for pilot deploy runner until fleet propagation (RFC-0358) lands.

### 2.3 Documentation and specs

- **`docs/architecture-dna.md`** — verify DNA-44 and DNA-45 entries are present (they already exist at lines 185–191 as of exploration). No new entry needed; confirm and check the box.
- **`packages/os/site-kernel-handoff/AGENTS.md`** — add Sternsystem scope section: bundle contract rules, registry invariants, pin semantics, cross-RFC dependencies on RFC-0362/RFC-0364, deviation from RFC §7.1 (no pin at registration).
- **Root `AGENTS.md`** — add Sternsystem section under the existing architecture guidance: durable site unit, fleet registry, version pin, `apps/` removal direction.
- **Compass XML files** (`docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`) — synchronize to reflect the Sternsystem bundle contract, fleet registry, and version pin as new architectural elements.
- **RFC file** — read-only reference; not modified by this plan.

### 2.4 Validation and pipelines

- **`pnpm --filter @gogol/ontology build:check`** — type-check new schemas.
- **`pnpm --filter @gogol/site-kernel-handoff build:check`** — type-check new command handlers.
- **`pnpm --filter @gogol/site-kernel-handoff test`** — vitest unit tests for registry IO, validate, pin, bundle contract, and register.
- **`pnpm exec site-kernel run rfc.validate --id RFC-0354`** — RFC validation.
- **`pnpm -s run build:check`** — workspace-level build check (no `apps/` pipeline regression).
- No new pipeline wiring — the four commands are workspace-scoped and invoked manually; they do not join `build.check` or `build.prepare` at this stage. Future wiring is a follow-up after RFC-0356.

## 3. Step sequence

### Step 1. Zod schemas in `@gogol/ontology`

**Goal:** Define the machine-checkable contracts for `SystemPin`, `FleetRegistryEntry`, and `FleetRegistry` so all downstream code imports from a single schema source.

**Agent actions:**

- Create `packages/ontology/src/schemas/sternsystem.ts` with:
  - `SystemPinSchema` per RFC §3.1:
    - `schemaVersion`: `z.string().regex(/^\d+\.\d+\.\d+$/)`.
    - `systemId`: `z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)`.
    - `cosmicStar`: `z.string()` (not `starNameSchema` — allows parse-then-report in validate; enforced by `sternsystem.validate` as `REG-03`).
    - `pinnedAt`: `z.string().datetime()`.
    - `platform`: `z.object({ version, commit, rfcHead, platformSemanticHash })` — `version` is semver regex, `commit` is `z.string().min(7)`, `rfcHead` is `/^RFC-\d{4}$/`, `platformSemanticHash` is `z.string().min(1)`.
    - `migratorCursor`: `z.string().regex(/^\d+\.\d+\.\d+$/)`.
    - `capabilities`: `z.array(handoffCapabilitySchema)` — **reuse `handoffCapabilitySchema`** from `handoff.ts` (includes `id` field, which is the diff key for capability comparisons).
  - `FleetRegistryEntrySchema` per RFC §2.1:
    - `id`: `z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)`.
    - `cosmicStar`: `z.string()` (not `starNameSchema` — same reasoning as above).
    - `repo`: `z.string().min(1)`.
    - `pinnedPlatform`: `z.string().regex(/^\d+\.\d+\.\d+$/)`.
    - `currentMission`: `z.string().nullable()`.
    - `lastRelease`: `z.string().nullable()`.
    - `status`: `z.enum(["registered", "active", "paused", "archived"])`.
    - `registeredAt`: `z.string().datetime()`.
    - `notes`: `z.string().default("")`.
  - `FleetRegistrySchema`: `z.object({ schemaVersion: z.string(), systems: z.array(FleetRegistryEntrySchema) })`.
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks to the new file.
- Update `packages/ontology/src/schemas/index.ts` to re-export the three schemas and their inferred types.

**Validation:**

- `pnpm --filter @gogol/ontology build:check` passes.

**Completion criterion:** `SystemPinSchema`, `FleetRegistryEntrySchema`, `FleetRegistrySchema` are exported from `@gogol/ontology/schemas` and the package type-checks.

**Human review:** no

---

### Step 2. Registry infrastructure and `.gitignore`

**Goal:** Create the `systems/registry.yaml` file and add `.gitignore` entries for Werkstatt directories so that cache clones and ephemeral working directories are never committed.

**Agent actions:**

- Create `systems/registry.yaml` with:
  ```yaml
  schemaVersion: "1.0.0"
  systems: []
  ```
- Add to root `.gitignore` (after the existing `apps/*` generated entries):
  ```
  # RFC-0354: Werkstatt Sternsystem directories
  systems/*
  !systems/registry.yaml
  missions/
  releases/
  agents/
  .werkstatt/
  ```
- Verify `systems/registry.yaml` is tracked (not gitignored) by running `git status systems/registry.yaml`.

**Validation:**

- `git check-ignore systems/registry.yaml` returns non-zero (not ignored).
- `git check-ignore systems/webgogol-com/` returns zero (ignored).

**Completion criterion:** `systems/registry.yaml` exists, is tracked, and all Werkstatt ephemeral directories are gitignored.

**Human review:** no

---

### Step 3. `sternsystem.register` and `sternsystem.list` commands

**Goal:** Implement the two low-risk commands that create and read registry entries. These do not touch bundle validation or pin semantics.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts`:
  - `readRegistry(workspaceRoot): Promise<FleetRegistry>` — parse `systems/registry.yaml` with `FleetRegistrySchema.parse()` (strict — fails on corrupt registry).
  - `writeRegistry(workspaceRoot, registry): Promise<void>` — serialize to YAML with **canonical key order** (id, cosmicStar, repo, pinnedPlatform, currentMission, lastRelease, status, registeredAt, notes), using **temp-file-then-rename** for atomicity (transitional pattern until RFC-0362).
  - `findEntry(registry, id): FleetRegistryEntry | undefined`.
  - `findByCosmicStar(registry, star): FleetRegistryEntry | undefined` — checks only `active`, `registered`, and `paused` systems (stricter than RFC §2.3 literal text; only `archived` frees a star).
- Create `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts`:
  - `runSternsystemRegister(input, context)` handler.
  - Reads `--id`, `--cosmicStar`, `--repo`, optional `--platform` (defaults to current monorepo version via `resolveCurrentEcosystem`), optional `--notes` (defaults to `""`).
  - Validates:
    - `id` is kebab-case (`/^[a-z0-9]+(-[a-z0-9]+)*$/`).
    - `id` does not already exist in the registry.
    - `id` does not match an existing `apps/<id>/` directory — error: `[sternsystem.register] id '<id>' matches existing apps/<id>/ — extract to a Sternsystem first (RFC-0356 materialization)`.
    - `cosmicStar` exists in `StarCatalog` via `StarCatalog.includes(star)` (array membership, not Zod enum).
    - `cosmicStar` not in use by an `active`, `registered`, or `paused` system.
    - `repo` URL is valid format (SSH or HTTPS regex only — no network reachability check).
  - Clones repo into `systems/<id>/` if the repo exists and is reachable (**best-effort** — logs warning on failure, registration succeeds without clone).
  - Does NOT create `systems/<id>/` directory if clone is skipped (directory appears only on successful clone).
  - Does NOT write `system.pin.json` — pinning is `sternsystem.pin`'s job (deviation from RFC §7.1; deliberate scope separation).
  - Appends entry with `status: "registered"`, `currentMission: null`, `lastRelease: null`, `registeredAt: new Date().toISOString()`, `pinnedPlatform` (from `--platform` or current monorepo version), `notes` (from `--notes` or `""`).
  - Writes updated registry via `writeRegistry` (temp-file-then-rename).
  - Returns standard `{ command, status, data, summary }` envelope.
- Create `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-list.ts`:
  - `runSternsystemList(input, context)` handler.
  - Reads registry with strict `.parse()` (fails on corrupt registry with message pointing to `sternsystem.validate`).
  - Without `--json`: prints **formatted table** with aligned columns (id, cosmicStar, repo, pinnedPlatform, currentMission, lastRelease, status, registeredAt).
  - With `--json`: returns standard `{ command, status, data: { systems: [...], count: N }, summary }` envelope.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes.
- Manual smoke test: `pnpm exec site-kernel run sternsystem.list --json` returns `{ systems: [], count: 0 }`.

**Completion criterion:** Both commands are registered, type-check, and produce correct JSON output for an empty registry.

**Human review:** yes — **RFC-0362 dependency.** The RFC's architectural fit section says "Registry, cache, and pin mutations use scoped locks, idempotency records, and atomic writes" from RFC-0362 (Werkstatt consistency, accepted, not implemented). Until RFC-0362 lands, `writeRegistry` uses a simple atomic write (`fs.writeFile` to a temp file + rename). This is a transitional pattern. When RFC-0362 is implemented, `writeRegistry` must be upgraded to use scoped locks and idempotency records. Flag this as a known tech-debt item in the AGENTS.md update.

---

### Step 4. `sternsystem.validate` command

**Goal:** Implement the validator that enforces all registry invariants (§2.3), the bundle contract (§1.2), pin coherence (§3), and apps/ collision refusal (§6.4).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/sternsystem/bundle-contract.ts`:
  - `scanBundleContract(cacheDir): Promise<{ violations: string[] }>` — walks `systems/<id>/` and checks for forbidden paths.
  - **Independent forbidden-path check** based on the §1.2 list (not reusing `authored-set.ts` partition logic — Sternsystem bundle has different layout and stricter exclusions).
  - Forbidden paths: `dist/`, `packages/`, `package.json`, `pnpm-lock.yaml`, `astro.config.*`, `wrangler.*`, `tsconfig.*`, `postcss.config.*`, `src/pages/**`, `src/styles/**`, `src/scripts/**`, `tools/**`, any `*.generated.*` file.
  - **Skips:** `.git/` (cache implementation metadata, not Sternsystem data), `node_modules/` (transient dev artifact).
  - **Flags:** `dist/` as `BUNDLE-01` (stale build output — should not persist in cache clone).
  - **Full tree walk** — each file checked against forbidden patterns, each violation reported separately with the offending path.
- Create `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts`:
  - `runSternsystemValidate(input, context)` handler.
  - If `--id` is provided, validates only that system; otherwise validates all.
  - **Registry parse:** `FleetRegistrySchema.safeParse()` — on failure, report `REG-00` (registry parse failure) and stop iteration (cannot check individual systems without a parsed registry).
  - **Registry invariants** (per system):
    - `REG-01`: duplicate id.
    - `REG-02`: duplicate cosmicStar (among `active`, `registered`, `paused` — same scope as `register`).
    - `REG-03`: cosmicStar not in `StarCatalog`.
    - `REG-04`: invalid repo URL format.
    - `REG-05`: invalid semver `pinnedPlatform`.
  - **Bundle contract:** scan `systems/<id>/` for forbidden paths (only if cache clone exists). If cache clone is absent for a `registered` system, skip with `SKIP-01` diagnostic (not a failure — valid lifecycle state). If absent for an `active` system, report as a violation.
  - **Pin file** (if cache clone exists and `system.pin.json` is present):
    - `PIN-01`: `SystemPinSchema.safeParse()` failure (lenient parse — report structured violation, don't crash).
    - `PIN-02`: `platform.version` does not match registry `pinnedPlatform`.
    - `PIN-03`: `platformSemanticHash` is the zero-hash placeholder (`sha256:000...`).
    - `PIN-04`: pin `systemId` does not match registry entry `id`.
    - `PIN-05`: pin `cosmicStar` does not match registry entry `cosmicStar`.
    - `PIN-06`: `migratorCursor` is ahead of `platform.version` (semver — behind is valid, ahead is a violation).
  - **Apps/ collision:** `APPS-01` — `apps/<id>/` directory exists for a `registered` or `active` system (error for both statuses).
  - **Collects all violations**, then exits non-zero. `--json` output: `{ validated: N, violations: [{ rule, system, message }] }`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes.
- Unit test: empty registry → 0 violations.
- Unit test: fixture with duplicate id → REG-01 violation.

**Completion criterion:** `sternsystem.validate` enforces all registry invariants, bundle contract, pin coherence, and apps/ collision; returns structured violations with rule ids.

**Human review:** no

---

### Step 5. `sternsystem.pin` command

**Goal:** Implement the pin command that writes or updates `system.pin.json` with refuse-downgrade enforcement.

**Agent actions:**

- Add `@gogol/fingerprint` as a workspace dependency in `packages/os/site-kernel-handoff/package.json` (RFC-0364 is implemented first — `@gogol/fingerprint` is available).
- Extract `highestRfcId` and `snapshotCapabilities` from `handoff-pack.ts` to `bundle-io.ts` (shared helpers alongside `resolveCurrentEcosystem` and `resolvePackagesHash`). Update `handoff-pack.ts` to import from `bundle-io.ts`.
- Create `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts`:
  - `runSternsystemPin(input, context)` handler.
  - Reads `--id` (required), optional `--platform` (defaults to current monorepo version from `resolveCurrentEcosystem`).
  - Reads registry with strict `.parse()` (fails on corrupt registry with message pointing to `sternsystem.validate`).
  - Validates: system is registered (exists in registry), cache clone exists at `systems/<id>/` (fails if absent).
  - If `system.pin.json` already exists, parse with strict `SystemPinSchema.parse()` (fails on invalid pin — operator deletes and re-pins, no `--force`).
  - **Refuse-downgrade:** compare requested `--platform` against existing pin's `platform.version` using `compareSemver` (semver only — hash is for drift detection, not version ordering). If requested < current, fail.
  - Resolve pin facts:
    - `version`: from `--platform` or `resolveCurrentEcosystem().version`.
    - `commit`: from `resolveCurrentEcosystem().commit`.
    - `rfcHead`: from `highestRfcId(workspaceRoot)` (reused from `bundle-io.ts` — highest RFC file number).
    - `platformSemanticHash`: from `@gogol/fingerprint` — full RFC-0364 §4 scope (packages, integrations, services, root manifest, RFCs, Compass XML, templates), delegated to the fingerprint package.
    - `capabilities`: from `snapshotCapabilities(workspaceRoot)` (reused from `bundle-io.ts` — conservative whole-registry snapshot).
    - `migratorCursor`: reset to `platform.version` (not preserved from old pin).
    - `systemId`: the `--id` value (cross-checked against registry entry — guaranteed to match since system must be registered).
    - `cosmicStar`: from the registry entry's `cosmicStar`.
    - `pinnedAt`: `new Date().toISOString()`.
  - Write `system.pin.json` into `systems/<id>/system.pin.json` using **temp-file-then-rename** for atomicity. Does NOT auto-commit to the Sternsystem's git repo — logs next-step hint: "Pin written to `systems/<id>/system.pin.json` — commit it to the Sternsystem repo."
  - Update registry entry's `pinnedPlatform` to match the new pin (**write sequence:** pin file first, then registry — if registry write fails after pin succeeds, `PIN-02` catches the mismatch on next validate).
  - Does NOT transition registry status (status transition to `active` is materialization's job per RFC-0356).
  - Returns standard envelope with pin summary.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes.
- Unit test: pin writes correct `system.pin.json`.
- Unit test: refuse-downgrade when requested platform < current pin.

**Completion criterion:** `sternsystem.pin` writes valid `system.pin.json` with full fingerprint, refuses downgrades, updates registry `pinnedPlatform`, does not auto-commit or transition status.

**Human review:** no (RFC-0364 is implemented first, so `platformSemanticHash` is available from `@gogol/fingerprint`).

---

### Step 6. Command module registration

**Goal:** Wire the four new commands into the workspace kernel configuration so they are discoverable via `pnpm exec site-kernel run`.

**Agent actions:**

- Add `createSternsystemModule()` to `packages/os/site-kernel-handoff/src/index.ts`:
  - Module name: `"sternsystem"`, version: `"0.1.0"`.
  - Register all four commands with `scope: "workspace"`, `supportsAllApps: false`.
  - `sternsystem.register` and `sternsystem.pin` have `mutatesState: true`.
- Update `tools/kernel.config.ts`:
  - Import `createSternsystemModule` from `@gogol/site-kernel-handoff`.
  - Add `createSternsystemModule()` to the `modules` array.
  - Add `MODULE_MAP` entries: `sternsystem.register`, `sternsystem.list`, `sternsystem.validate`, `sternsystem.pin`.
  - Add `CHANGE_SUMMARY` item: `RFC-0354: Register sternsystem module for fleet registry commands.`

**Validation:**

- `pnpm exec site-kernel run sternsystem.list --json` works from the workspace root.
- All four commands appear in `pnpm exec site-kernel run --help` (or equivalent command listing).

**Completion criterion:** All four commands are registered, discoverable, and executable from the workspace root.

**Human review:** no

---

### Step 7. Tests

**Goal:** Add unit tests covering registry IO, validate invariants, pin semantics, and bundle contract scanning.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/sternsystem-registry-io.test.ts`:
  - Round-trip: write registry → read registry → deep-equal.
  - Parse: valid registry passes `FleetRegistrySchema`; invalid (bad semver, bad id, unknown status) fails.
  - Canonical key order: written YAML has keys in documented order.
  - Atomic write: temp file is cleaned up after rename.
- Create `packages/os/site-kernel-handoff/src/tests/sternsystem-validate.test.ts`:
  - Empty registry → 0 violations.
  - Duplicate id → REG-01.
  - Duplicate cosmicStar (both active) → REG-02.
  - Duplicate cosmicStar (one paused, one active) → REG-02 (paused stars not reusable).
  - cosmicStar reused after archived → no REG-02.
  - Invalid cosmicStar (not in StarCatalog) → REG-03.
  - Apps/ collision (registered + active) → APPS-01.
  - Absent cache clone for registered system → SKIP-01 (not a failure).
  - Absent cache clone for active system → violation.
  - Forbidden path (`dist/`) in cache clone → BUNDLE-01.
  - `node_modules/` in cache clone → no BUNDLE-01 (skipped).
  - `.git/` in cache clone → no BUNDLE-01 (skipped).
  - Pin version mismatch → PIN-02.
  - Pin systemId mismatch → PIN-04.
  - Pin cosmicStar mismatch → PIN-05.
  - Pin migratorCursor ahead of platform.version → PIN-06.
  - Corrupt registry → REG-00, iteration stops.
  - Multiple violations → all collected, exit non-zero.
- Create `packages/os/site-kernel-handoff/src/tests/sternsystem-pin.test.ts`:
  - Pin writes valid `system.pin.json` with correct fields.
  - Refuse-downgrade: existing pin at 4.6.0, request 4.5.0 → error.
  - Pin updates registry `pinnedPlatform`.
  - Pin resets `migratorCursor` to `platform.version`.
  - Pin does not transition registry status.
  - Pin fails on absent cache clone.
  - Pin fails on corrupt existing pin (strict parse).
- Create `packages/os/site-kernel-handoff/src/tests/sternsystem-register.test.ts`:
  - Register adds entry to registry with correct defaults.
  - Register fails on duplicate id.
  - Register fails on cosmicStar not in StarCatalog.
  - Register fails on cosmicStar in use by active/registered/paused system.
  - Register fails on apps/ collision.
  - Register fails on invalid repo URL format.
  - Register does not write `system.pin.json`.
  - Register does not create `systems/<id>/` on failed clone.
- Add property-based test for `FleetRegistrySchema` round-trip (DNA-41, RFC-0347): generate random valid entries, parse, serialize, re-parse, verify equality.
- All filesystem-touching tests use temp directories (`node:os.tmpdir()` + `fs.mkdtemp()`), following the existing `materialize.test.ts` / `authored-set.test.ts` pattern.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes.
- `pnpm --filter @gogol/site-kernel-handoff build:check` passes.

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 8. Documentation updates

**Goal:** Synchronize AGENTS.md files, Compass XML, and verify DNA entries.

**Agent actions:**

- **`docs/architecture-dna.md`:** Verify DNA-44 (Sternsystem bundle contract) and DNA-45 (Fleet registry) are present and correctly reference RFC-0354. They already exist at lines 185–191 as of exploration — confirm no edit needed and check the acceptance criterion box.
- **`packages/os/site-kernel-handoff/AGENTS.md`:** Add a "Sternsystem scope" section documenting:
  - The four commands and their ownership.
  - Bundle contract rules (§1.2 forbidden paths; `.git/` and `node_modules/` skipped in cache clone; `dist/` flagged).
  - Registry invariants (§2.3; cosmicStar uniqueness across active/registered/paused — stricter than RFC §2.3 literal text).
  - Pin semantics (§3) and refuse-downgrade (semver only).
  - Pin-to-registry coherence checks: PIN-01 through PIN-06.
  - Cross-RFC dependencies: RFC-0362 (locks/idempotency — transitional temp-file-then-rename atomic write), RFC-0364 (platformSemanticHash via `@gogol/fingerprint`), RFC-0356 (materialization/extraction — gates pilot and apps/ removal).
  - Deviation from RFC §7.1: `sternsystem.register` does not write `system.pin.json` — pinning is `sternsystem.pin`'s job.
  - Compass terminology requirement (RFC-0353).
- **Root `AGENTS.md`:** Add a "Sternsystem contract (RFC-0354)" section under the existing architecture guidance, covering:
  - Sternsystem = durable data-only site bundle in its own git repo.
  - `systems/registry.yaml` = fleet registry (tracked).
  - `systems/<id>/` = gitignored cache clone.
  - `system.pin.json` = version pin.
  - `apps/` removal direction (no new apps, no dual representation).
  - Agent policy: new sites are Sternsystems only; `sternsystem.validate` fails on apps/ collision.
- **Compass XML synchronization:** Update affected `docs/*.xml` files to reflect the new Sternsystem architectural elements:
  - `docs/requirements.xml` — add Sternsystem bundle contract and fleet registry requirements.
  - `docs/technology.xml` — add `systems/registry.yaml`, `system.pin.json`, and the four commands to the technology surface.
  - `docs/development-plan.xml` — note the migration wave from `apps/` to Sternsystems.
  - `docs/knowledge-graph.xml` — add nodes for Sternsystem, fleet registry, version pin, and their relationships to RFC-0221, DNA-44, DNA-45.

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0354` passes.
- `pnpm -s run build:check` passes (no documentation lint regression).

**Completion criterion:** All documentation files are updated and synchronized with the new architectural elements.

**Human review:** yes — Compass XML synchronization should be reviewed by the architecture role to ensure the semantic layer accurately reflects the Sternsystem contract without over-specifying future RFC waves (0355–0359).

---

### Step 9. Validation suite

**Goal:** Run the full validation suite to confirm no regressions and RFC acceptance criteria are met.

**Agent actions:**

- Run each command in sequence and confirm pass:
  1. `pnpm --filter @gogol/ontology build:check`
  2. `pnpm --filter @gogol/site-kernel-handoff build:check`
  3. `pnpm --filter @gogol/site-kernel-handoff test`
  4. `pnpm exec site-kernel run sternsystem.list --json` (smoke test)
  5. `pnpm exec site-kernel run sternsystem.validate --json` (smoke test on empty registry)
  6. `pnpm exec site-kernel run rfc.validate --id RFC-0354`
  7. `pnpm -s run build:check`
- Verify all acceptance criteria checkboxes that are in scope for this plan:
  - [x] Zod schemas defined
  - [x] `sternsystem.register` registered and tested
  - [x] `sternsystem.list` registered and tested
  - [x] `sternsystem.validate` registered and tested
  - [x] `sternsystem.pin` registered and tested
  - [x] `--json` output stable for all four commands
  - [x] `systems/registry.yaml` created
  - [x] `.gitignore` updated
  - [x] `sternsystem.validate` enforces all invariants and bundle contract
  - [x] `sternsystem.validate` refuses dual representation
  - [x] `sternsystem.pin` refuses downgrade
  - [ ] Pilot: `webgogol-com` registered, extracted, materialized, and removed from `apps/` — **out of scope (depends on RFC-0356)**
  - [ ] `apps/` directory removed after full migration — **out of scope (depends on RFC-0356)**
  - [x] DNA-44 and DNA-45 present in `docs/architecture-dna.md`
  - [x] `pnpm -s run build:check` passes
  - [x] `rfc.validate` passes

**Validation:**

- All commands listed above exit zero.

**Completion criterion:** All in-scope acceptance criteria are checked; out-of-scope criteria are clearly marked with their blocking RFC dependency; RFC stamped `implemented`.

**Human review:** no

---

### Step 10. Evidence emission

**Goal:** Emit the RFC-0330 verification evidence artifact and commit it alongside the `implemented` status transition.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0354` (RFC-0330, implemented).
- Commit the generated evidence file `docs/rfcs/verification/rfc-0354.generated.json` in the same commit as the `implemented` status stamp.
- Reference `RFC-0354` in the commit subject line (RFC-0265 commit hygiene).

**Validation:**

- `rfc.verification.emit` exits zero and produces the evidence file.
- Evidence file is committed.

**Completion criterion:** Evidence artifact is generated and committed.

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run rfc.validate --id RFC-0354`
- `pnpm exec site-kernel run sternsystem.list --json` (smoke test)
- `pnpm exec site-kernel run sternsystem.validate --json` (smoke test)
- `pnpm -s run build:check`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0354` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0354.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0354` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Sternsystem data contract drifts from RFC-0221 authored/derived partition | Step 4 uses an independent forbidden-path scanner based on the §1.2 list, not reusing `authored-set.ts` partition logic (Sternsystem bundle has different layout and stricter exclusions). |
| Registry grows large and `sternsystem.list` becomes slow | Not a near-term risk; the registry is a single YAML file. Step 3 reads it in one pass. |
| Cache clone becomes stale vs the Sternsystem's remote repo | Step 3 `sternsystem.register` clones on registration; future materialization (RFC-0356) always fetches before operating. The cache is gitignored and disposable. |
| `apps/` removal breaks old commands | Out of scope for this plan. The `apps/` removal is gated by RFC-0356 and the pilot extraction step. `sternsystem.validate` (Step 4) detects apps/ collision but does not remove `apps/`. |
| cosmicStar uniqueness prevents reuse after archiving | Step 3 `findByCosmicStar` checks `active`, `registered`, and `paused` systems; `archived` systems' stars are reusable. |
| **Cross-RFC: `platformSemanticHash` requires RFC-0364** | RFC-0364 is implemented first. `@gogol/fingerprint` is available as a workspace dependency. Step 5 delegates the full §4 scope to the fingerprint package. |
| **Cross-RFC: lock/idempotency primitives require RFC-0362 (not implemented)** | Steps 3 and 5 use transitional temp-file-then-rename atomic writes. Step 8 AGENTS.md update documents this as tech-debt to be resolved when RFC-0362 lands. |
| **Pilot extraction depends on RFC-0356 (not implemented)** | Steps 9–10 clearly mark pilot extraction and `apps/` removal as out of scope. The plan delivers command infrastructure only. |
| **Deviation from RFC §7.1: `register` does not write pin** | Step 3 deliberately separates registration (metadata) from pinning (provenance). Documented in Step 8 AGENTS.md update. `sternsystem.pin` is the dedicated pin command. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 (monorepo boundary), DNA-4 (canonical content), DNA-6 (kebab-case), or DNA-17 (uni manifest), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0354 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the `platformSemanticHash` requirement cannot be satisfied via `@gogol/fingerprint` (e.g., the package's API doesn't match the RFC-0364 §4 scope), escalate via `rfc.supersede.propose` to amend the pin schema rather than silently using a raw hash.
- If the bundle contract scanner discovers that the RFC-0221 `authored-set.ts` partition is incompatible with the stricter Sternsystem data-only ownership, escalate rather than creating a parallel classifier — the RFC explicitly says "do not invent a parallel classifier."

## 7. Grilling decisions log

The following 51 decisions were resolved during the grilling session and are reflected in the steps above:

1. **Q1 — `SystemPin.capabilities` shape:** Reuse `handoffCapabilitySchema` (with `id` field) from `@gogol/ontology/schemas/handoff.ts`.
2. **Q2 — Registry YAML key order:** Enforce canonical key order in `writeRegistry` (id, cosmicStar, repo, pinnedPlatform, currentMission, lastRelease, status, registeredAt, notes).
3. **Q3 — `sternsystem.register` clone behavior:** Best-effort clone — registration is metadata-first; clone failure logs warning, registration succeeds.
4. **Q4 — `sternsystem.validate` absent cache clone:** Skip with `SKIP-01` diagnostic for `registered` systems (not a failure); violation for `active` systems.
5. **Q5 — Apps/ collision check scope:** Apply to `active` and `registered` systems only.
6. **Q6 — `sternsystem.pin` auto-commit:** Write the file only, do not auto-commit to the Sternsystem's git repo; log a next-step hint.
7. **Q7 — Refuse-downgrade comparison basis:** Semver only — `platformSemanticHash` is for drift detection, not version ordering.
8. **Q8 — `sternsystem.pin` status transition:** Leave status unchanged — `active` is set by materialization (RFC-0356), not by pinning.
9. **Q9 — Bundle contract scanner strategy:** Independent forbidden-path check based on the §1.2 list, not reusing `authored-set.ts` partition logic.
10. **Q10 — `cosmicStar` in registry schema:** Use `z.string()` in schema, enforce via `sternsystem.validate` as `REG-03` (allows parse-then-report).
11. **Q11 — `sternsystem.register` cosmicStar validation:** Validate via `StarCatalog.includes(star)` (array membership, not Zod enum).
12. **Q12 — Repo URL validation:** Format validation only (SSH/HTTPS regex), no network reachability check.
13. **Q13 — `sternsystem.list` output format:** Formatted table for human-readable, JSON envelope for `--json`.
14. **Q14 — `sternsystem.validate` violation collection:** Collect all violations, then exit non-zero (not fail-fast).
15. **Q15 — `platformSemanticHash` computation scope:** Full RFC-0364 §4 scope, delegated to `@gogol/fingerprint`.
16. **Q16 — `rfcHead` computation:** Reuse existing `highestRfcId` (highest RFC file number, not highest implemented).
17. **Q17 — `highestRfcId` extraction:** Extract to `bundle-io.ts` as a shared helper.
18. **Q18 — Capabilities snapshot:** Reuse conservative whole-registry snapshot from `handoff-pack.ts`; extract `snapshotCapabilities` to `bundle-io.ts`.
19. **Q19 — `sternsystem.pin` commit resolution:** Use `resolveCurrentEcosystem` for both `version` (default platform) and `commit`.
20. **Q20 — `migratorCursor` on re-pin:** Reset to `platform.version` on every pin write.
21. **Q21 — `sternsystem.register` `pinnedPlatform` default:** Populate with current monorepo version (from `resolveCurrentEcosystem`).
22. **Q22 — `sternsystem.register` pin write:** Do not write `system.pin.json` at registration time (deviation from RFC §7.1; deliberate scope separation).
23. **Q23 — `sternsystem.validate` pin validation depth:** Add `PIN-03` (platformSemanticHash placeholder check) and commit format check beyond the three RFC §7.3 checks.
24. **Q24 — Pipeline wiring:** Manual-only for now; future wiring as a follow-up after RFC-0356.
25. **Q25 — `fleet/fleet.sites.json`:** Leave untouched; migration to `systems/registry.yaml` deferred to RFC-0358.
26. **Q26 — Apps/ collision error message:** Guide the user — mention RFC-0356 extraction as the path forward.
27. **Q27 — `APPS-01` for `registered` systems:** Error for both `registered` and `active` (not warning for `registered`).
28. **Q28 — Pin file parse in validate:** Lenient `safeParse` with structured `PIN-01` violation (not strict crash).
29. **Q29 — Registry parse in validate:** `safeParse` with `REG-00` on failure, then stop iteration.
30. **Q30 — `sternsystem.register` registry parse:** Strict `.parse()` — fails on corrupt registry, points to `sternsystem.validate`.
31. **Q31 — `sternsystem.list` registry parse:** Strict `.parse()` — same as register.
32. **Q32 — `sternsystem.pin` parse strategy:** Strict `.parse()` for both registry and existing pin file; no `--force`, operator deletes invalid pin and re-pins.
33. **Q33 — cosmicStar uniqueness check scope:** Reject for `active`, `registered`, and `paused` (stricter than RFC §2.3 literal text; only `archived` frees a star).
34. **Q34 — `REG-02` scope consistency:** Same scope as Q33 — `active`, `registered`, `paused`.
35. **Q35 — `sternsystem.register` `--notes` flag:** Accept optional `--notes` flag, defaults to `""`.
36. **Q36 — Test strategy:** Temp directories (`node:os.tmpdir()` + `fs.mkdtemp()`), following existing `materialize.test.ts` pattern.
37. **Q37 — `@gogol/fingerprint` dependency:** Add as workspace dependency in `@gogol/site-kernel-handoff/package.json`.
38. **Q38 — `BUNDLE-01` check depth:** Full tree walk — each file checked against forbidden patterns, each violation reported separately.
39. **Q39 — `.git/` in cache clone:** Skip — cache implementation metadata, not Sternsystem data.
40. **Q40 — `node_modules/` and `dist/` in cache clone:** Flag `dist/` as `BUNDLE-01`; skip `node_modules/` (transient dev artifact).
41. **Q41 — `sternsystem.register` directory creation:** Leave `systems/<id>/` absent if clone is skipped (no placeholder directory).
42. **Q42 — `sternsystem.pin` `systemId`:** Write `--id` value; add `PIN-04` validator check (pin `systemId` matches registry `id`).
43. **Q43 — Pin `cosmicStar` coherence:** Add `PIN-05` (pin `cosmicStar` matches registry `cosmicStar`).
44. **Q44 — `sternsystem.pin` write sequence:** Pin file first, then registry; recoverable inconsistency caught by `PIN-02`; transitional until RFC-0362.
45. **Q45 — Registry write atomicity:** Temp-file-then-rename in `writeRegistry` (shared by `register` and `pin`).
46. **Q46 — Pin file write atomicity:** Temp-file-then-rename for `system.pin.json` as well.
47. **Q47 — `migratorCursor` validation:** Add `PIN-06` — `migratorCursor` must not be ahead of `platform.version` (behind is valid).
48. **Q48 — Capabilities validation in validate:** Do not validate against current `uni.registry.json` — capabilities are a point-in-time snapshot.
49. **Q49 — `pinnedAt` timestamp validation:** No semantic checks — schema `.datetime()` only.
50. **Q50 — `registeredAt` timestamp validation:** No semantic checks — schema `.datetime()` only.
51. **Q51 — `amendedBy` sync:** Handled by `rfc.validate` — no separate plan step.
