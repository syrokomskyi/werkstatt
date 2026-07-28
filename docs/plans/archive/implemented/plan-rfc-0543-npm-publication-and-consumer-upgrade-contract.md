---
rfcId: RFC-0543
planId: PLAN-RFC-0543-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/README.md
    - packages/forge/AGENTS.md
    - docs/technology.xml
---

# Implementation Plan: RFC-0543

## 1. Objectives

- [ ] Objective 1 — Complete `packages/forge/package.json` metadata (license, repository, description, keywords, homepage, bugs). Maps to acceptance criterion 1.
- [ ] Objective 2 — Source `VERSION` in `bin/cli.ts` from `package.json` at runtime. Maps to acceptance criterion 2.
- [ ] Objective 3 — Implement `forge.upgrade` command: sync skills, add missing binding defaults, update `forge.syncedVersion`, run doctor, emit nextSteps. Maps to acceptance criteria 3–5.
- [ ] Objective 4 — Add `forge.syncedVersion` to `forgeConfigSchema`; `forge.init` writes it on first init. Maps to acceptance criterion 6.
- [ ] Objective 5 — Enhance `prepublishOnly` script with metadata verification. Maps to acceptance criterion 7.
- [ ] Objective 6 — Document the create → IDE → bootstrap → upgrade flow in README.md and update AGENTS.md OS modules table. Maps to acceptance criteria 8–9.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/package.json` — add metadata fields (license, repository, description, keywords, homepage, bugs); enhance `prepublishOnly` script
- `packages/forge/bin/cli.ts` — replace hardcoded `VERSION = "0.1.0"` with runtime read from `package.json` via `import.meta.url` + `fileURLToPath`
- `packages/forge/src/config/forge-config.ts` — add optional `forge` section to `forgeConfigSchema` with `syncedVersion: z.string().nullable().default(null)`; update `ForgeConfig` interface; update `defaultForgeConfig` to include `forge: { syncedVersion: null }`
- `packages/forge/src/onboarding/init.ts` — write `forge.syncedVersion` (set to installed forge version) when creating a new `forge.yaml`
- `packages/forge/os/core/upgrade.ts` — new file: `runUpgrade` handler implementing the 7-step upgrade flow
- `packages/forge/os/core/core.module.ts` — register `forge.upgrade` command in `forgeCoreModule`
- `packages/forge/src/types.ts` — add `ForgeNextStep` type (if not already added by RFC-0542) and `UpgradeResult` interface

### 2.2 Configuration and data

- `forge.yaml` (consumer projects) — gains optional `forge.syncedVersion` field on init/upgrade
- `forge.yaml` (this monorepo) — unchanged (monorepo keeps site-kernel-backed bindings; `forge` section is optional and absent)

### 2.3 Documentation and specs

- `packages/forge/README.md` — document the create → IDE → bootstrap → upgrade flow; add `forge upgrade` to Quick start
- `packages/forge/AGENTS.md` — add `forge.upgrade` to the OS modules table for `forgeCoreModule`
- `docs/technology.xml` — update `pkg-forge` role description if command count changes

### 2.4 Validation and pipelines

- `pnpm --filter @wgogol/forge run build:check` — scoped typecheck for the forge package
- `pnpm --filter @wgogol/forge run test` — unit tests for upgrade handler, version sourcing, and prepublishOnly check
- `pnpm exec site-kernel run rfc.validate RFC-0543` — RFC validation

## 3. Step sequence

### Step 1. Add `forge.syncedVersion` to forge config schema

**Goal:** Extend `forgeConfigSchema` with an optional `forge` section containing `syncedVersion`.

**Agent actions:**

- Add `forge: z.object({ syncedVersion: z.string().nullable().default(null) }).optional()` to `forgeConfigSchema` in `packages/forge/src/config/forge-config.ts`
- Add `forge?: { syncedVersion: string | null }` to the `ForgeConfig` interface
- Update `defaultForgeConfig` to include `forge: { syncedVersion: null }` in the returned object
- Update `MODULE_CONTRACT`/`CHANGE_SUMMARY` scaffolding

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes

**Completion criterion:** `forgeConfigSchema` includes the optional `forge` section; `defaultForgeConfig` returns it; typecheck passes.

**Human review:** no

---

### Step 2. Source `VERSION` from `package.json` in `bin/cli.ts`

**Goal:** Replace the hardcoded `VERSION = "0.1.0"` constant with a runtime read from `package.json`.

**Agent actions:**

- In `packages/forge/bin/cli.ts`, replace `const VERSION = "0.1.0"` with a function that reads `package.json` relative to the module's location using `import.meta.url` → `fileURLToPath`, then walks up to the package root
- The path resolution must work in both source (`packages/forge/bin/cli.ts` → `packages/forge/package.json`) and compiled (`dist/bin/cli.js` → `package.json`) contexts — from `bin/`, the package root is one level up
- Verify `forge --version` prints the real version

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `forge --version` prints the version from `package.json` (manual check)

**Completion criterion:** `VERSION` is sourced from `package.json` at runtime; no hardcoded constant; `forge --version` prints the real version.

**Human review:** no

---

### Step 3. Complete `packages/forge/package.json` metadata

**Goal:** Add missing npm metadata fields to `packages/forge/package.json`.

**Agent actions:**

- Add `license: "MIT"` (already in README, not in package.json)
- Add `repository: { type: "git", url: "https://github.com/syrokomskyi/warpgogol-4.git", directory: "packages/forge" }`
- Add `description: "Framework for documenting and implementing ideas — RFC/ADR governance, skills, and project bootstrapping."`
- Add `keywords: ["rfc", "adr", "governance", "skills", "ai-agent", "documentation", "framework"]`
- Add `homepage: "https://github.com/syrokomskyi/warpgogol-4#readme"`
- Add `bugs: { url: "https://github.com/syrokomskyi/warpgogol-4/issues" }`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes (package.json is valid JSON)

**Completion criterion:** All six metadata fields present in `packages/forge/package.json`.

**Human review:** no

---

### Step 4. Implement `forge.upgrade` handler

**Goal:** Create the `runUpgrade` handler in `packages/forge/os/core/upgrade.ts` implementing the 7-step upgrade flow.

**Agent actions:**

- Create `packages/forge/os/core/upgrade.ts` with a `runUpgrade` function
- Step 1: Resolve forge root via `resolveForgeRoot`; read version from resolved `package.json`
- Step 2: Read `forge.syncedVersion` from the consumer's `forge.yaml` (via `loadForgeConfig`); if equal to installed version, return `status: "noop"` and exit 0; if absent/null, proceed with full upgrade
- Step 3: Sync `.agents/skills/` from the forge package's `skills/` directory (overwrite forge-owned copies); sync pack skills from `skillPacks` source dirs (reuse the sync logic from `init.ts` — extract or duplicate the skill-copy loop)
- Step 4: For each key in `FORGE_CLI_BINDING_DEFAULTS` (from RFC-0540, `packages/forge/src/config/forge-config.ts`) that is absent or `null` in the consumer's `forge.yaml` bindings, write the default; operator-set non-null values are never touched
- Step 5: Update `forge.syncedVersion` in `forge.yaml` to the installed version (read YAML, update the `forge.syncedVersion` field, write back)
- Step 6: Run `runDoctor` and include its report in the output
- Step 7: Emit `nextSteps` per RFC-0542 (`ForgeNextStep` type exists in `packages/forge/src/types.ts` — RFC-0542 is implemented)
- Support `--dry-run` flag: no files written; output describes what would change
- Support `--json` flag: output `UpgradeResult` as JSON
- Define `UpgradeResult` interface per the RFC's TypeScript contracts section
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- Unit test: `forge.upgrade --dry-run` writes no files
- Unit test: `forge.upgrade` with `syncedVersion: null` performs full sync
- Unit test: `forge.upgrade` with `syncedVersion` matching installed version returns `noop`
- Unit test: `forge.upgrade` never overwrites a non-null operator-set binding

**Completion criterion:** `runUpgrade` handler exists, passes typecheck, and all unit tests pass.

**Human review:** no

---

### Step 5. Register `forge.upgrade` in `forgeCoreModule`

**Goal:** Wire the `forge.upgrade` command into the forge CLI registry.

**Agent actions:**

- In `packages/forge/os/core/core.module.ts`, add a dynamic import for `runUpgrade` from `../../src/onboarding/upgrade.ts` (or `os/core/upgrade.ts` depending on placement)
- Register the `forge.upgrade` command with flags `--dry-run` (boolean) and `--json` (boolean, handled by CLI layer)
- Add a wrapper function following the same pattern as `initWrapper`, `doctorWrapper`, etc.
- Update `CHANGE_SUMMARY` scaffolding in `core.module.ts`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `forge upgrade --help` shows the command (if help is registry-driven per RFC-0542)

**Completion criterion:** `forge.upgrade` is registered in `forgeCoreModule`; typecheck passes; the command appears in the registry.

**Human review:** no

---

### Step 6. Write `forge.syncedVersion` in `forge.init`

**Goal:** When `forge.init` creates a new `forge.yaml`, set `forge.syncedVersion` to the installed forge version.

**Agent actions:**

- In `packages/forge/src/onboarding/init.ts`, after creating `defaultForgeConfig`, resolve the forge root via `resolveForgeRoot` and read the version from its `package.json`
- Set `config.forge.syncedVersion` to that version before writing `forge.yaml`
- If `forge.yaml` already exists (skip-with-warning), do not modify it — `forge.upgrade` is the path for existing configs

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- Unit test: `forge.init` in a clean directory produces `forge.yaml` with `forge.syncedVersion` set to the installed version

**Completion criterion:** `forge.init` writes `forge.syncedVersion` on first init; existing `forge.yaml` files are untouched.

**Human review:** no

---

### Step 7. Enhance `prepublishOnly` script

**Goal:** Extend the `prepublishOnly` script in `packages/forge/package.json` to verify metadata before publish.

**Agent actions:**

- Create a `scripts/publish-check.mjs` script (in `packages/forge/`) that verifies:
  - `license`, `repository`, `description`, `keywords` present in `package.json`
  - `dist/` exists and is fresh (check that `dist/` directory exists after `tsc`)
  - `README.md` exists and mentions `forge create`
  - `VERSION` in `bin/cli.ts` is not a hardcoded string literal (grep for `const VERSION = "` — should not find a hardcoded string)
  - `files` array includes `skills/`, `profiles/`, `dist/`
- Update `prepublishOnly` in `package.json` to: `pnpm run clean && pnpm run build && node scripts/publish-check.mjs`
- The script exits 1 on any check failure with a clear message

**Validation:**

- `node scripts/publish-check.mjs` passes after `pnpm run build`
- `pnpm --filter @wgogol/forge run build:check` passes

**Completion criterion:** `prepublishOnly` script runs the metadata check; it passes after a clean build; it fails if any metadata field is missing.

**Human review:** no

---

### Step 8. Write unit tests

**Goal:** Add unit tests for the new functionality.

**Agent actions:**

- Test `forge.upgrade` handler (`packages/forge/os/core/upgrade.ts`):
  - `--dry-run` writes no files
  - `syncedVersion: null` triggers full sync
  - `syncedVersion` matching installed version returns `noop`
  - Non-null operator-set bindings are never overwritten
  - Missing `forge.yaml` → refuses with pointer to `forge init`
  - `resolveForgeRoot` failure → refuses with "install @wgogol/forge first"
- Test `VERSION` sourcing:
  - `forge --version` prints the version from `package.json`, not a hardcoded constant
- Test `prepublishOnly` check (`scripts/publish-check.mjs`):
  - Passes after clean build with complete metadata
  - Fails if `license` is missing
  - Fails if `dist/` does not exist
- Test `forge.init` writes `forge.syncedVersion`:
  - Clean directory init produces `forge.yaml` with `forge.syncedVersion` set

**Validation:**

- `pnpm --filter @wgogol/forge run test` passes

**Completion criterion:** All unit tests pass; test coverage includes the key acceptance criteria.

**Human review:** no

---

### Step 9. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/forge/README.md`:
  - Add `forge upgrade` to Quick start section
  - Document the create → IDE → bootstrap → upgrade flow
  - Mention that `.agents/skills/` is forge-managed and local edits are not preserved across upgrades
- Update `packages/forge/AGENTS.md`:
  - Add `forge.upgrade` to the `forgeCoreModule` OS modules table
- Update `docs/technology.xml` if the `pkg-forge` role description or command count changes
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (do not hand-edit `docs/ecosystem.generated.yaml`)
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0543 --implementation-commit <sha>` (dry-run first, then without `--dry-run`)

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0543`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0543`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- `node packages/forge/scripts/publish-check.mjs` (after `pnpm run build`)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0543` in the subject line (RFC-0265 commit hygiene)
- Unit test outputs confirming upgrade handler behavior

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Skill copy drift — operator edits forge skill in `.agents/skills/` | Step 4: upgrade overwrites forge-owned copies; Step 9: README documents that `.agents/skills/` is forge-managed |
| Binding default churn — forge changes a default template | Step 4: upgrade only adds missing/null bindings, never overwrites non-null; doctor surfaces null bindings (RFC-0540) |
| Publication from the wrong branch | Step 7: `prepublishOnly` script verifies metadata before publish; CI runs the check |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0543 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
- RFC-0540 is implemented: `FORGE_CLI_BINDING_DEFAULTS` exists in `packages/forge/src/config/forge-config.ts` and is available for `forge.upgrade` step 4. No escalation needed.
