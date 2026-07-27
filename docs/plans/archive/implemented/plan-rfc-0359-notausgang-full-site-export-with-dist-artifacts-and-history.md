---
rfcId: RFC-0359
planId: PLAN-RFC-0359-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-handoff"
    - "@gogol/ontology"
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - packages/ontology/AGENTS.md
  note: >
    RFC-0359 packagesImpacted lists @gogol/site-kernel-deploy, but the RFC
    body places all Notausgang commands in @gogol/site-kernel-handoff and
    does not modify deploy. The deploy package is not in this plan's scope.
    The RFC frontmatter should be corrected during implementation.
---

# Implementation Plan: RFC-0359

> **Pilot plan** — RFC-0359 has `status: draft`. Implementation requires explicit architecture acceptance (`draft → accepted`) before any code changes begin (RFC-0224).

> **Upstream dependency chain** — RFC-0359 depends on four draft RFCs that are not yet implemented. Implementation of this plan cannot produce a working `notausgang.export` until these dependencies land:
>
> - **RFC-0355** (Bordbuch) — provides `bordbuch.validate` and the Bordbuch NDJSON format used in the export
> - **RFC-0357** (release discipline) — provides `release.prepare`/`release.publish` and release manifests
> - **RFC-0363** (artifact store) — provides `artifact.store.get` to restore dist from the release artifact
> - **RFC-0364** (semantic fingerprint) — provides `@gogol/fingerprint` for hash computation
>
> Steps 1–4 (contracts, schemas, module skeleton) can proceed independently. Steps 5–8 (export/validate handlers) require the dependency chain to be implemented first. The plan is structured so that the contract layer lands first and the handler layer is gated on dependencies.

## 1. Objectives

- [ ] Objective 1 — Zod schemas for `NotausgangManifest`, `IntegrationNulling`, `IntegrationManifest`, `IntegrationSecretLocation` defined in `@gogol/ontology` (maps to: "`NotausgangManifest`, `IntegrationNulling`, `IntegrationManifest`, `IntegrationSecretLocation` Zod schemas defined in `@gogol/ontology`")
- [ ] Objective 2 — `notausgang.export` command registered with atomic staging, progress reporting, and manifest-driven integration nulling (maps to: "`notausgang.export` command registered and tested" + atomic staging + progress + nulling criteria)
- [ ] Objective 3 — `notausgang.validate` command registered with full verification suite (maps to: "`notausgang.validate` command registered and tested" + all validate criteria)
- [ ] Objective 4 — `--json` output stable for both commands (maps to: "`--json` output stable for both commands")
- [ ] Objective 5 — Export package layout matches the RFC contract (maps to: "Export package includes: `site/`, `dist/`, `artifact-manifest.json`, `bordbuch/events.ndjson`, `system.pin.json`, `behavior-snapshots/`, `README.md`, `notausgang-manifest.json`" + "`site/` is data-only")
- [ ] Objective 6 — Pilot export of `webgogol-com` at `r000001` validates successfully (maps to: "Pilot: export `webgogol-com` at `r000001`, validate the export package")
- [ ] Objective 7 — `rfc.validate` passes (maps to: "`rfc.validate` passes on this file")

## 2. Affected artifacts

### 2.1 Code and commands

**New schemas (`@gogol/ontology`):**

- `packages/ontology/src/schemas/notausgang.ts` — `NotausgangManifestSchema`, `IntegrationNullingSchema`
- `packages/ontology/src/schemas/integration-manifest.ts` — `IntegrationManifestSchema`, `IntegrationSecretLocationSchema`
- `packages/ontology/src/schemas/index.ts` — barrel re-exports for both new schema files

**New module (`@gogol/site-kernel-handoff`):**

- `packages/os/site-kernel-handoff/src/notausgang/index.ts` — module entry, exports `runNotausgangExport`, `runNotausgangValidate`, `createNotausgangModule`
- `packages/os/site-kernel-handoff/src/notausgang/export.ts` — `notausgang.export` handler
- `packages/os/site-kernel-handoff/src/notausgang/validate.ts` — `notausgang.validate` handler
- `packages/os/site-kernel-handoff/src/notausgang/integration-nulling.ts` — manifest-driven nulling logic
- `packages/os/site-kernel-handoff/src/notausgang/site-partition.ts` — Notausgang-specific data-only site partition (filters `resolveAuthoredFiles` output to exclude runtime files)
- `packages/os/site-kernel-handoff/src/notausgang/atomic-staging.ts` — staging directory creation, atomic rename, cleanup-on-failure
- `packages/os/site-kernel-handoff/src/notausgang/progress.ts` — structured progress events to stderr
- `packages/os/site-kernel-handoff/src/notausgang/secret-scan.ts` — secondary pattern scan for API key patterns
- `packages/os/site-kernel-handoff/src/notausgang/templates/README.md.template.ts` — README template (English)
- `packages/os/site-kernel-handoff/src/notausgang/types.ts` — shared handler types

**Modified files:**

- `packages/os/site-kernel-handoff/src/index.ts` — import and re-export `createNotausgangModule`, add command registrations
- `packages/os/site-kernel-handoff/package.json` — add `@gogol/fingerprint` dependency (when RFC-0364 lands)

**Tests:**

- `packages/os/site-kernel-handoff/src/tests/notausgang-export.test.ts` — export handler tests
- `packages/os/site-kernel-handoff/src/tests/notausgang-validate.test.ts` — validate handler tests
- `packages/os/site-kernel-handoff/src/tests/notausgang-integration-nulling.test.ts` — nulling logic tests
- `packages/os/site-kernel-handoff/src/tests/notausgang-atomic-staging.test.ts` — staging lifecycle tests
- `packages/os/site-kernel-handoff/src/tests/notausgang-secret-scan.test.ts` — pattern scan tests
- `packages/os/site-kernel-handoff/src/tests/fixtures/notausgang/` — fixture export packages for validation tests

### 2.2 Configuration and data

- No `apps/*` configuration changes required — Notausgang is a workspace-level command
- `IntegrationManifest` is a per-Sternsystem data file (location: `src/content/site/integration-manifest.json` — single file, not language-scoped, since secret locations are not localized)
- Pilot requires a published release for `webgogol-com` at `r000001` (depends on RFC-0357 + RFC-0363 implementation)

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — DNA-50 already exists; verify text matches enhanced RFC (update if needed)
- `packages/os/site-kernel-handoff/AGENTS.md` — add Notausgang section documenting the new module, nulling policy, and atomic staging requirement
- `packages/ontology/AGENTS.md` — note new schema files if it lists schema inventory
- `docs/rfcs/rfc-0359-notausgang-full-site-export-with-dist-artifacts-and-history.md` — correct `packagesImpacted` (remove `@gogol/site-kernel-deploy` if confirmed not impacted)

### 2.4 Validation and pipelines

- `notausgang.export` and `notausgang.validate` are **not** added to any build pipeline — they are operator-invoked commands, not CI gates
- `pnpm --filter @gogol/site-kernel-handoff build:check` — TypeScript compilation
- `pnpm --filter @gogol/site-kernel-handoff test` — Vitest unit tests
- `pnpm exec site-kernel run rfc.validate RFC-0359 --json` — RFC validation

## 3. Step sequence

### Step 1. Land Zod schemas in `@gogol/ontology`

**Goal:** Define the contract types for the Notausgang manifest and integration manifest.

**Agent actions:**

- Create `packages/ontology/src/schemas/notausgang.ts` with `IntegrationNullingSchema` and `NotausgangManifestSchema` per RFC §1.1 and §Design/TypeScript contracts
- Create `packages/ontology/src/schemas/integration-manifest.ts` with `IntegrationSecretLocationSchema` and `IntegrationManifestSchema` per RFC §2.2
- Add re-exports to `packages/ontology/src/schemas/index.ts`
- Run `pnpm --filter @gogol/ontology build:check` to verify compilation

**Validation:**

- `pnpm --filter @gogol/ontology build:check` passes
- Schemas parse the example manifest from RFC §1.1

**Completion criterion:** Both schema files exist, compile, and are re-exported from `@gogol/ontology/schemas`

**Human review:** no

---

### Step 2. Create Notausgang module skeleton in `@gogol/site-kernel-handoff`

**Goal:** Establish the module structure and register stub commands.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/notausgang/` directory
- Create `types.ts` with shared handler types (`NotausgangExportData`, `NotausgangValidateData`)
- Create `index.ts` with `createNotausgangModule()` that registers `notausgang.export` and `notausgang.validate` as stub commands (throwing "not implemented" for now)
- Create `atomic-staging.ts` with `createStagingDir()`, `atomicRename()`, `cleanupStaging()` helpers
- Create `progress.ts` with `createProgressReporter()` that emits structured JSON to stderr
- Create `secret-scan.ts` with `scanForLiveKeys()` implementing the secondary pattern scan
- Create `integration-nulling.ts` stub
- Create `templates/README.md.template.ts` with the README template from RFC §4
- Modify `packages/os/site-kernel-handoff/src/index.ts` to import and re-export `createNotausgangModule`
- Run `pnpm --filter @gogol/site-kernel-handoff build:check`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm exec site-kernel run notausgang.export --help` shows the command (or at least does not crash on module load)

**Completion criterion:** Module directory exists, stub commands are registered, package compiles

**Human review:** no

---

### Step 3. Implement atomic staging and progress reporting

**Goal:** Complete the infrastructure helpers that the export handler depends on.

**Agent actions:**

- Implement `createStagingDir(outputPath)` — creates `<outputPath>.tmp-<timestamp>/` directory, returns path
- Implement `atomicRename(stagingPath, finalPath)` — POSIX atomic rename; on Windows, fail if target exists and is non-empty
- Implement `cleanupStaging(stagingPath)` — recursive delete with error handling
- Implement `createProgressReporter(stream)` — returns a function that emits `{"stage":"copying-dist","filesCopied":N,"totalFiles":M,"bytesCopied":B,"totalBytes":T}` to stderr every 500 files or 100 MB
- Write unit tests for staging lifecycle (create, rename, cleanup, cleanup-on-failure)
- Write unit tests for progress reporter (throttling, final emission)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes for new test files
- `pnpm --filter @gogol/site-kernel-handoff build:check` passes

**Completion criterion:** Staging and progress helpers are tested and compile

**Human review:** no

---

### Step 4. Implement integration nulling logic

**Goal:** Complete the manifest-driven nulling mechanism.

**Agent actions:**

- Implement `loadIntegrationManifest(systemDir)` — reads `src/content/site/integration-manifest.json`, parses with `IntegrationManifestSchema`, fails with clear error if missing
- Implement `nullIntegrations(manifest, siteDir, exceptions)` — for each integration in the manifest, null the listed secret locations; skip exceptions
- Implement `recordNullingResults(manifest, exceptions)` — returns the `IntegrationNulling` object for the export manifest
- Implement `verifyNulled(manifest, siteDir)` — for `notausgang.validate`: checks all listed secret locations are nulled
- Write unit tests with fixture manifests and fixture site directories
- Test edge cases: missing manifest (fail), missing secret file (warn), exception with reason, all-nulled, partial-nulling-failure

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes for nulling tests
- `pnpm --filter @gogol/site-kernel-handoff build:check` passes

**Completion criterion:** Nulling logic is tested, handles missing manifest, exceptions, and verification

**Human review:** no — but this is the security-critical path; code review is recommended

---

### Step 5. Implement `notausgang.export` handler

**Goal:** Complete the export command with all RFC steps (1–15 from §5.1).

> **Gated on dependencies:** This step requires `artifact.store.get` (RFC-0363), `@gogol/fingerprint` (RFC-0364), release manifests (RFC-0357), and Bordbuch NDJSON (RFC-0355). If these are not yet implemented, the handler can be written with interface stubs that throw "dependency not implemented" and this step is deferred.

**Agent actions:**

- Implement `runNotausgangExport(input, context)` following RFC §5.1 steps 1–15:
  1. Verify release is `published` (read release manifest)
  2. Create staging directory
  3. Restore artifact via `artifact.store.get` and verify hashes
  4. Copy authored site data into `staging/site/` — use a **Notausgang-specific partition** that starts from `resolveAuthoredFiles` but filters out `BOOTSTRAP_CONFIG` (`package.json`, `astro.config.mjs`, `postcss.config.cjs`) and `ROOT_CONFIG` (`package.json`, `tsconfig.json`, `content.config.ts`, `integration.shard.json`, `astro.config.mjs`, `postcss.config.cjs`, `wrangler.jsonc`, `env.d.ts`) and `src/pages/` and `tools/`. Only `src/content/`, `src/content/assets/`, `provenance/`, and `public/` non-generated assets travel. The existing `resolveAuthoredFiles` includes runtime files that Notausgang must NOT include
  5. Null integrations via `nullIntegrations()`
  6. Copy dist into `staging/dist/` with progress reporting
  7. Copy artifact manifest, Bordbuch, pin, behavior snapshots
  8. Write README from template
  9. Compute hashes via `@gogol/fingerprint`
  10. Write `notausgang-manifest.json`
  11. Atomic rename staging → output
  12. On any failure: cleanup staging, exit non-zero
- Support `--system`, `--release`, `--output`, `--keep-integration` (+ `--reason`), `--json` flags
- Write integration tests with a fixture release and fixture site

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes for export tests
- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `--json` output matches RFC §Output format

**Completion criterion:** Export handler produces a valid export package from a fixture release, with atomic staging, progress, nulling, and all required files

**Human review:** yes — security-critical (integration nulling). Code review by architecture role before stamping implemented

---

### Step 6. Implement `notausgang.validate` handler

**Goal:** Complete the validation command with all checks from RFC §5.2.

> **Gated on dependencies:** Requires `@gogol/fingerprint` for hash recomputation and Bordbuch validation logic from RFC-0355.

**Agent actions:**

- Implement `runNotausgangValidate(input, context)` with all checks:
  - Manifest integrity (parse, field completeness, schemaVersion)
  - Site directory present, no runtime files
  - Dist directory present
  - Bordbuch append-only verification (monotonic sequence, no gaps, no modifications)
  - Pin validation (platformVersion, platformSemanticHash match manifest)
  - Behavior snapshots present, parseable, schemaVersion checked
  - Artifact manifest hash match
  - Hash recomputation (distHash, siteHash, bordbuchHash via `@gogol/fingerprint`)
  - Integration nulling verification (manifest-based + pattern scan)
- Support `--path`, `--json` flags
- Write unit tests with valid and invalid fixture export packages
- Test each failure mode from RFC §Failure modes

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes for validate tests
- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `--json` output matches RFC §Output format

**Completion criterion:** Validate handler passes on a valid fixture, fails on each documented failure mode with the correct error message

**Human review:** yes — security-critical (live key scan). Code review by architecture role before stamping implemented

---

### Step 7. Register commands and update module exports

**Goal:** Wire the Notausgang module into the handoff package's public surface.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/src/index.ts`:
  - Import `createNotausgangModule` from `./notausgang/index.ts`
  - Export `createNotausgangModule`, `runNotausgangExport`, `runNotausgangValidate` and their data types
  - Register the Notausgang commands alongside existing handoff commands
- Verify command registration does not conflict with existing commands
- Run full package test suite

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes
- `pnpm exec site-kernel run notausgang.export --help` displays help
- `pnpm exec site-kernel run notausgang.validate --help` displays help

**Completion criterion:** Both commands are registered, discoverable via CLI, and the full test suite passes

**Human review:** no

---

### Step 8. Update documentation

**Goal:** Synchronize documentation with the new module.

**Agent actions:**

- Verify DNA-50 text in `docs/architecture-dna.md` matches the enhanced RFC; update if the text is stale
- Add a "Notausgang" section to `packages/os/site-kernel-handoff/AGENTS.md` documenting:
  - The module location and command surface
  - Integration nulling policy (null by default, flag exceptions with reason)
  - Atomic staging requirement
  - Dependency on `IntegrationManifest` for nulling
  - Relationship to `handoff.pack` (thin internal) and `client.export` (full platform)
- Correct RFC-0359 frontmatter `packagesImpacted` if `@gogol/site-kernel-deploy` is confirmed not impacted
- Update `packages/ontology/AGENTS.md` if it maintains a schema inventory

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0359 --json` passes
- Documentation review

**Completion criterion:** All documentation files updated, `rfc.validate` passes

**Human review:** no

---

### Step 9. Pilot export and validation

**Goal:** End-to-end verification with a real Sternsystem.

> **Gated on dependencies:** Requires a published release for `webgogol-com` at `r000001` (RFC-0357 + RFC-0363).

**Agent actions:**

- Ensure `webgogol-com` has a published release at `r000001`
- Run `pnpm exec site-kernel run notausgang.export --system webgogol-com --release webgogol-com-r000001 --output ../exports/webgogol-com-2026-07-09`
- Run `pnpm exec site-kernel run notausgang.validate --path ../exports/webgogol-com-2026-07-09`
- Verify the export package contains all required files
- Verify `site/` is data-only (no runtime files)
- Verify integrations are nulled
- Verify `--json` output is stable

**Validation:**

- `notausgang.export` succeeds with exit code 0
- `notausgang.validate` succeeds with exit code 0
- Export package layout matches RFC §1

**Completion criterion:** Pilot export validates successfully end-to-end

**Human review:** yes — operator verifies the export package manually (check for leaked secrets, verify dist is servable)

---

### Step 10. Final validation and evidence

**Goal:** Run the full validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0359 --json` — must pass
- Run `pnpm --filter @gogol/site-kernel-handoff build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel-handoff test` — must pass
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0359` (RFC-0330, if RFC-0359 has acceptance probes)
- Commit evidence file alongside the `implemented` status transition

**Validation:**

- All commands pass
- Evidence file committed

**Completion criterion:** All validation green, evidence file committed

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0359` — RFC mechanical validation
- `pnpm --filter @gogol/ontology build:check` — schema compilation
- `pnpm --filter @gogol/site-kernel-handoff build:check` — package compilation
- `pnpm --filter @gogol/site-kernel-handoff test` — unit and integration tests
- `pnpm exec site-kernel run notausgang.export --system webgogol-com --release webgogol-com-r000001 --output <path>` — pilot export
- `pnpm exec site-kernel run notausgang.validate --path <path>` — pilot validation
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0359` (RFC-0330, if acceptance probes declared)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0359.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0359` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Live integration key leaks into export | Step 4 (manifest-driven nulling) + Step 6 (pattern scan safety net in validate) + Step 9 (pilot manual check) |
| Dist artifacts are stale | Step 5 (export verifies distTreeHash from release manifest) |
| Export package is large | Step 3 (progress reporting) + Step 5 (atomic staging with cleanup) |
| Client cannot rebuild without platform | By design — README documents this (Step 2 template) |
| Bordbuch contains sensitive information | Step 6 (Bordbuch append-only verification) — Bordbuch payloads are guarded by RFC-0355 |
| Non-atomic export leaves partial state | Step 3 (atomic staging) + Step 5 (cleanup-on-failure) |
| Upstream dependencies not implemented | Steps 5–6 and 9 are explicitly gated; steps 1–4 can proceed independently |
| `IntegrationManifest` missing for a Sternsystem | Step 4 (nulling fails with clear error if manifest absent) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-50, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0359 --reason "..." --invariant "DNA-50"` instead of working around it (RFC-0334).
- If the `IntegrationManifest` location (`src/content/site/integration-manifest.json`) conflicts with an existing content schema or CMS-friendly content surface rule (RFC-0047), escalate via a new RFC rather than moving the file ad-hoc.
- If the dependency chain (RFC-0355/0357/0363/0364) reveals incompatible contracts during their implementation, do not patch this RFC — file a superseding RFC that reconciles the conflict.
- If the atomic staging approach is insufficient for Windows (rename fails on existing directory), escalate to a new RFC for cross-platform atomic export — do not silently fall back to non-atomic writes.
