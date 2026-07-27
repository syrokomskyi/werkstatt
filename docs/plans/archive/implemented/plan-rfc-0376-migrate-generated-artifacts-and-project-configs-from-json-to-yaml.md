---
rfcId: RFC-0376
planId: PLAN-RFC-0376-01
status: draft
owner: architecture
createdAt: 2026-07-12
updatedAt:
scope:
  apps:
    - apps/*
  packages:
    - "@gogol/site-kernel"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-onboarding"
    - "@gogol/ui"
    - "@gogol/share"
  services:
    - services/*
  docs:
    - docs/architecture-dna.md
    - packages/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0376

## 1. Objectives

- [ ] O1 — `yaml.contract.lint` command registered, added to `APPS_BUILD_PREPARE_PIPELINE`, passes with zero violations — maps to acceptance criteria [yaml.contract.lint registered], [yaml.contract.lint passes]
- [ ] O2 — `buildGeneratedJsonAdvisory` and its types removed from `generated-marker.ts`; `json.generated.marker.validate` command removed — maps to [buildGeneratedJsonAdvisory removed], [json.generated.marker.validate removed]
- [ ] O3 — `loadGeneratedManifest()` uses `yaml.parse()` instead of `JSON.parse()` — maps to [loadGeneratedManifest uses yaml.parse]
- [ ] O4 — All generators write `.generated.yaml` using `yaml.stringify()` + `buildGeneratedHeader()`; all readers parse `.yaml` — maps to [generators write .generated.yaml], [readers parse .yaml]
- [ ] O5 — All project config files renamed from `.json` to `.yaml`; `github-deploy.template.yml` renamed to `.yaml` — maps to [project configs renamed], [github-deploy.template.yml renamed]
- [ ] O6 — `readYamlFile<T>()` helper added to `@gogol/share/fs`; `workspace-write-boundary.ts` outputs updated; onboarding templates updated — maps to [readYamlFile added], [workspace-write-boundary updated], [onboarding templates updated]
- [ ] O7 — DNA-18 text updated in `docs/architecture-dna.md`; AGENTS.md documents YAML-only contract — maps to [DNA-18 updated], [AGENTS.md documents contract]
- [ ] O8 — `yaml-contract.whitelist.yaml` exists at repository root — maps to [whitelist exists]

## 2. Affected artifacts

### 2.1 Code and commands

**New files:**

- `packages/os/site-kernel-checks/src/yaml-contract-lint.ts` — `yaml.contract.lint` command implementation
- `packages/os/site-kernel-checks/src/command-tables/39-yaml-contract.ts` — command table entry
- `yaml-contract.whitelist.yaml` — repository root whitelist

**Deleted files:**

- `packages/os/site-kernel-checks/src/json-generated-marker.ts` — removed command module
- `packages/os/site-kernel-checks/src/command-tables/35-json-generated-marker.ts` — removed command table entry

**Modified files — generators (write path .json → .yaml, JSON.stringify → yaml.stringify + buildGeneratedHeader):**

- `packages/os/site-kernel/src/command-manifest.ts`
- `packages/os/site-kernel/src/rfc/dna-trace.ts`
- `packages/os/site-kernel/src/rfc/decision-log.ts`
- `packages/os/site-kernel/src/rfc/verification-evidence.ts`
- `packages/os/site-kernel/src/pipeline-budgets.ts`
- `packages/os/site-kernel-checks/src/ecosystem/manifest-commands.ts`
- `packages/os/site-kernel-checks/src/maintenance-debt-queue.ts`
- `packages/os/site-kernel-checks/src/compass-audit.ts`
- `packages/os/site-kernel-checks/src/registry.ts` (uni.registry.build)
- `packages/os/site-kernel-checks/src/image-variants.ts`
- `packages/os/site-kernel-checks/src/video-variants.ts`
- `packages/os/site-kernel-checks/src/live-variants.ts`
- `packages/os/site-kernel-checks/src/surface/generate.ts`
- `packages/os/site-kernel-checks/src/surface-demand.ts`
- `packages/os/site-kernel-checks/src/surface-breaker.ts`
- `packages/os/site-kernel-checks/src/pseo-visibility.ts`
- `packages/os/site-kernel-checks/src/pseo-governance.ts`
- `packages/os/site-kernel-checks/src/pseo-proof.ts`
- `packages/os/site-kernel-checks/src/entitlements.ts`
- `packages/os/site-kernel-checks/src/site-bordbuch.ts`
- `packages/os/site-kernel-checks/src/agent-knowledge.ts`
- `packages/os/site-kernel-checks/src/agent-manifest.ts`
- `packages/os/site-kernel-checks/src/agent-openapi.ts`
- `packages/os/site-kernel-checks/src/content-plan.ts`
- `packages/os/site-kernel-checks/src/feed.ts`
- `packages/os/site-kernel-checks/src/source-monitor.ts`
- `packages/os/site-kernel-checks/src/public-surface/*.ts`
- `packages/os/site-kernel-checks/src/cms.ts`
- `packages/os/site-kernel-checks/src/fonts.ts`
- `packages/os/site-kernel-checks/src/archetype/registry-build.ts`
- `packages/os/site-kernel-checks/src/preview-images.ts`
- `packages/os/site-kernel-checks/src/props-types.ts`
- `packages/os/site-kernel-checks/src/agents.ts`
- `packages/os/site-kernel-checks/src/docs-commands.ts`
- `packages/os/site-kernel-checks/src/material-credits.ts`

**Modified files — readers (read path .json → .yaml, JSON.parse → yaml.parse):**

- `packages/ui/src/generated-manifest-loader.ts`
- `packages/ui/src/image-provider-init.ts`
- `packages/ui/src/video-manifest.ts`
- `packages/os/site-kernel-checks/src/video-media.ts`
- `packages/os/site-kernel-checks/src/video-fallback.ts`
- `packages/os/site-kernel-checks/src/registry.ts` (uni.registry.validate reader)
- `packages/os/site-kernel-checks/src/command-manifest.ts` (validator reader)

**Modified files — infrastructure:**

- `packages/os/site-kernel/src/generated-marker.ts` — remove `buildGeneratedJsonAdvisory`, `GeneratedJsonAdvisory`, `GeneratedJsonAdvisoryInput`
- `packages/os/site-kernel/src/index.ts` — remove exports of removed functions
- `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` — update all `outputs` paths
- `packages/os/site-kernel-checks/src/module.ts` — register `yaml.contract.lint`, add to `APPS_BUILD_PREPARE_PIPELINE`; remove `json.generated.marker.validate` registration and pipeline reference
- `packages/os/site-kernel-checks/src/command-tables/index.ts` — add `YAML_CONTRACT_COMMANDS`, remove `JSON_GENERATED_MARKER_COMMANDS`
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — remove `json.generated.marker.validate` from pipeline
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — add `yaml.contract.lint`
- `packages/os/site-kernel-checks/src/dedup-helper-lint.ts` — add `readYamlFile` to `RESERVED_HELPERS`
- `packages/share/src/fs/index.ts` — add `readYamlFile<T>()`
- `packages/os/site-kernel-checks/src/ecosystem/manifest.ts` — switch `readJsonFile` to `readYamlFile` for non-whitelisted reads

**Modified files — onboarding templates:**

- `packages/os/site-kernel-onboarding/src/templates/runtime/gitignore.template` — `.generated.json` → `.generated.yaml`
- `packages/os/site-kernel-onboarding/src/templates/runtime/github-deploy.template.yml` → rename to `.yaml`

**Renamed files — project configs:**

- `fleet/fleet.sites.json` → `fleet/fleet.sites.yaml`
- `fleet/killswitch.state.json` → `fleet/killswitch.state.yaml`
- `fleet/fleet.plan.generated.json` → `fleet/fleet.plan.generated.yaml`
- `fleet/fleet.status.generated.json` → `fleet/fleet.status.generated.yaml`
- `services/*/service.config.json` → `services/*/service.config.yaml`
- `apps/webgogol-com/integration.shard.json` → `apps/webgogol-com/integration.shard.yaml`
- `apps/webgogol-com/provenance/amend/amend-001.json` → `apps/webgogol-com/provenance/amend/amend-001.yaml`
- `apps/webgogol-com/behavior.snapshot.generated.json` → `apps/webgogol-com/behavior.snapshot.generated.yaml`
- `apps/webgogol-com/src/surface/states/*.state.json` → `*.state.yaml`
- `apps/webgogol-com/src/surface/states/pointer.json` → `pointer.yaml`
- `apps/webgogol-com/src/surface/visibility/*.json` → `*.yaml`
- `apps/webgogol-com/src/surface/*.generated.json` → `*.generated.yaml`
- `services/fleet-probe-runner/targets.generated.json` → `targets.generated.yaml`
- `uni.registry.json` → `uni.registry.yaml`

### 2.2 Configuration and data

- `yaml-contract.whitelist.yaml` — new root config file
- `docs/architecture-dna.md` — DNA-18 text update (`uni.registry.json` → `uni.registry.yaml`)

### 2.3 Documentation and specs

- `AGENTS.md` (root) — document YAML-only contract and whitelist
- `packages/AGENTS.md` — add `readYamlFile` to shared helpers catalog
- `docs/rfcs/rfc-0376-*.md` — read-only reference (accepted status)
- `docs/audits/audit-rfc-0376-*.md` — audit report (reference)

### 2.4 Validation and pipelines

- `APPS_BUILD_PREPARE_PIPELINE` — add `yaml.contract.lint`
- `packages-check` pipeline — remove `json.generated.marker.validate`
- `pnpm exec site-kernel run rfc.validate RFC-0376 --json`
- `pnpm exec site-kernel run yaml.contract.lint --json`
- `pnpm exec site-kernel run packages-check.run --json`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/share build:check`
- `pnpm --filter @gogol/ui build:check`

## 3. Step sequence

### Step 1. Add `readYamlFile` helper to `@gogol/share/fs`

**Goal:** Provide the canonical YAML read helper before any callers switch.

**Agent actions:**

- Add `readYamlFile<T>(path: string): Promise<T>` to `packages/share/src/fs/index.ts` using `import { parse as yamlParse } from "yaml"`
- Add `readYamlFile` to `RESERVED_HELPERS` in `packages/os/site-kernel-checks/src/dedup-helper-lint.ts`
- Add `readYamlFile` to the shared helpers catalog in `packages/AGENTS.md`

**Validation:**

- `pnpm --filter @gogol/share build:check` passes
- `pnpm --filter @gogol/site-kernel-checks build:check` passes

**Completion criterion:** `readYamlFile` exported from `@gogol/share/fs` and registered in `dedup-helper-lint`

**Human review:** no

---

### Step 2. Create `yaml-contract.whitelist.yaml`

**Goal:** Establish the whitelist before the lint command references it.

**Agent actions:**

- Create `yaml-contract.whitelist.yaml` at repository root with the categorized whitelist from RFC-0376 §9

**Validation:**

- File exists and is valid YAML (`yaml.parse` succeeds)

**Completion criterion:** `yaml-contract.whitelist.yaml` exists at repository root

**Human review:** no

---

### Step 3. Implement `yaml.contract.lint` command

**Goal:** Create the enforcement command before migrating any files. The command is registered but **not** added to `APPS_BUILD_PREPARE_PIPELINE` yet — pipeline inclusion is deferred to Step 13 to avoid false failures during migration.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/yaml-contract-lint.ts` implementing YAML-CONTRACT-01..04 rules
- Create `packages/os/site-kernel-checks/src/command-tables/39-yaml-contract.ts` with command definition
- Add `YAML_CONTRACT_COMMANDS` to `command-tables/index.ts`
- Register command in `module.ts` — **do NOT** add to `APPS_BUILD_PREPARE_PIPELINE` yet
- Use `collectFiles` from `@gogol/share/fs` for repository scanning

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check` passes
- `pnpm exec site-kernel run yaml.contract.lint --json` runs (will fail with violations until migration completes — that's expected)

**Completion criterion:** `yaml.contract.lint` command registered and runnable; **not** yet in `APPS_BUILD_PREPARE_PIPELINE`

**Human review:** no

**Commit:** `feat: RFC-0376 add yaml.contract.lint command (not yet in pipeline)`

---

### Step 4. Remove `buildGeneratedJsonAdvisory` and `json.generated.marker.validate`

**Goal:** Eliminate the JSON-specific advisory mechanism and the now-dead validation command.

**Agent actions:**

- Remove `buildGeneratedJsonAdvisory`, `GeneratedJsonAdvisory`, `GeneratedJsonAdvisoryInput` from `packages/os/site-kernel/src/generated-marker.ts`
- Remove their exports from `packages/os/site-kernel/src/index.ts`
- Delete `packages/os/site-kernel-checks/src/json-generated-marker.ts`
- Delete `packages/os/site-kernel-checks/src/command-tables/35-json-generated-marker.ts`
- Remove `JSON_GENERATED_MARKER_COMMANDS` from `command-tables/index.ts`
- Remove `json.generated.marker.validate` from `packages-check.ts` pipeline
- Remove `json.generated.marker.validate` from `module.ts` registration
- Update all callers that imported `buildGeneratedJsonAdvisory` (28 files in site-kernel-checks) — replace with `buildGeneratedHeader` calls

**Validation:**

- `pnpm --filter @gogol/site-kernel build:check` passes
- `pnpm --filter @gogol/site-kernel-checks build:check` passes

**Completion criterion:** No references to `buildGeneratedJsonAdvisory` or `json.generated.marker.validate` remain in the codebase

**Human review:** no

---

### Step 5. Update `loadGeneratedManifest()` and Astro glob paths

**Goal:** Switch the build-time manifest loader from JSON to YAML.

**Agent actions:**

- Update `packages/ui/src/generated-manifest-loader.ts`: `JSON.parse` → `yaml.parse`, `//` strip → `#` strip, import `parse as yamlParse` from `"yaml"`
- Update `packages/ui/src/image-provider-init.ts`: glob path `.generated.json` → `.generated.yaml`
- Update `packages/ui/src/video-manifest.ts`: glob path `.generated.json` → `.generated.yaml`

**Validation:**

- `pnpm --filter @gogol/ui build:check` passes

**Completion criterion:** `loadGeneratedManifest` uses `yaml.parse`, glob paths reference `.generated.yaml`

**Human review:** no

---

### Step 6. Migrate all generators (write path)

**Goal:** Switch all generator outputs from `.generated.json` to `.generated.yaml`.

**Agent actions:**

- For each generator file listed in §2.1 "Modified files — generators":
  - Replace `JSON.stringify(…, null, 2)` with `yaml.stringify(…)`
  - Replace `buildGeneratedJsonAdvisory({ … })` spread with `buildGeneratedHeader({ filePath: "….generated.yaml", … })` prefix
  - Change output file extension from `.json` to `.yaml`
- Update `packages/os/site-kernel-checks/src/workspace-write-boundary.ts`: all `outputs` paths `.generated.json` → `.generated.yaml`

**Validation:**

- `pnpm --filter @gogol/site-kernel build:check` passes
- `pnpm --filter @gogol/site-kernel-checks build:check` passes

**Completion criterion:** All generators write `.generated.yaml` using `yaml.stringify()` + `buildGeneratedHeader()`

**Human review:** no

---

### Step 7. Migrate all readers (read path)

**Goal:** Switch all reader code from `JSON.parse` to `yaml.parse` for migrated files.

**Agent actions:**

- For each reader file listed in §2.1 "Modified files — readers":
  - Replace `JSON.parse(await readFile(path, "utf-8"))` with `yaml.parse(await readFile(path, "utf-8"))` or `readYamlFile(path)`
  - Change read path constants from `.json` to `.yaml`
- Switch `readJsonFile` calls for Category B/C files to `readYamlFile` in `ecosystem/manifest.ts` and other callers

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check` passes

**Completion criterion:** All readers parse `.yaml` using `yaml.parse()` or `readYamlFile()`

**Human review:** no

---

### Step 8. Rename project config and state files

**Goal:** Migrate Category C files from `.json` to `.yaml`.

**Agent actions:**

- Rename all files listed in §2.1 "Renamed files — project configs"
- Update all code references to these file paths
- Rename `github-deploy.template.yml` → `github-deploy.template.yaml`; update CI workflow references

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check` passes

**Completion criterion:** No `.json` Category B/C files remain outside the whitelist; no `.yml` files exist

**Human review:** no

---

### Step 9. Delete stale `.generated.json` files and regenerate

**Goal:** Remove old `.json` artifacts and produce fresh `.generated.yaml` outputs.

**Agent actions:**

- Delete all `.generated.json` files from the repository
- Run `pnpm exec site-kernel run command.manifest.generate` to produce `.generated.yaml`
- Run `pnpm exec site-kernel run gitattributes.generate` to update `.gitattributes`
- Run `pnpm exec site-kernel run uni.registry.build` to produce `uni.registry.yaml`

**Validation:**

- No `.generated.json` files exist in the repository (outside `node_modules/`, `dist/`, `.git/`)

**Completion criterion:** All generated artifacts are `.generated.yaml`; stale `.json` files deleted

**Human review:** no

---

### Step 10. Update onboarding templates

**Goal:** Ensure new apps scaffolded from templates use `.yaml` from day one.

**Agent actions:**

- Update `packages/os/site-kernel-onboarding/src/templates/runtime/gitignore.template`: `.generated.json` → `.generated.yaml`
- Rename `github-deploy.template.yml` → `github-deploy.template.yaml` in onboarding templates
- Update any other onboarding template references to `.json` generated files

**Validation:**

- `pnpm --filter @gogol/site-kernel-onboarding build:check` passes

**Completion criterion:** Onboarding templates reference `.yaml` extensions

**Human review:** no

---

### Step 11. Update DNA-18 text and AGENTS.md

**Goal:** Synchronize architectural documentation with the new file format contract.

**Agent actions:**

- Update `docs/architecture-dna.md` DNA-18 entry: `uni.registry.json` → `uni.registry.yaml`
- Update root `AGENTS.md`: document the YAML-only contract, whitelist, and `yaml.contract.lint` rules
- Update `packages/AGENTS.md`: add `readYamlFile` to shared helpers catalog

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0376 --json` passes

**Completion criterion:** DNA-18 text references `uni.registry.yaml`; AGENTS.md documents YAML-only contract

**Human review:** no

**Commit:** `docs: RFC-0376 update DNA-18 and AGENTS.md for YAML contract`

---

### Step 12. Update `amendedBy` in all 11 amended RFCs

**Goal:** Sync `amendedBy` lists to eliminate V-19 warnings and complete the Compass sync.

**Agent actions:**

- For each RFC in RFC-0376's `amends` list (RFC-0081, RFC-0023, RFC-0336, RFC-0204, RFC-0210, RFC-0234, RFC-0266, RFC-0268, RFC-0329, RFC-0330, RFC-0331):
  - Read the RFC file's frontmatter
  - Add `RFC-0376` to its `amendedBy` list (create the list if absent)
- Run `pnpm exec site-kernel run rfc.validate RFC-0376 --json` — V-19 warnings should be gone

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0376 --json` passes with zero V-19 warnings

**Completion criterion:** All 11 amended RFCs list `RFC-0376` in `amendedBy`; V-19 warnings eliminated

**Human review:** no

**Commit:** `rfc: RFC-0376 sync amendedBy in 11 amended RFCs`

---

### Step 13. Add `yaml.contract.lint` to `APPS_BUILD_PREPARE_PIPELINE`

**Goal:** Activate the enforcement command in the build pipeline after all migrations are complete.

**Agent actions:**

- Add `yaml.contract.lint` to `APPS_BUILD_PREPARE_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`
- Verify `pnpm exec site-kernel run yaml.contract.lint --json` passes with zero violations

**Validation:**

- `pnpm exec site-kernel run yaml.contract.lint --json` exits with code 0

**Completion criterion:** `yaml.contract.lint` is in `APPS_BUILD_PREPARE_PIPELINE` and passes with zero violations

**Human review:** no

**Commit:** `feat: RFC-0376 add yaml.contract.lint to build.prepare pipeline`

---

### Step 14. Add unit tests for `yaml.contract.lint` and `readYamlFile`

**Goal:** Add test coverage for new logic.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/yaml-contract-lint.test.ts`:
  - Test YAML-CONTRACT-01: non-whitelist `.json` file → error
  - Test YAML-CONTRACT-01: whitelisted `.json` file → pass
  - Test YAML-CONTRACT-02: `.yml` file → error
  - Test YAML-CONTRACT-03: `.generated.json` file → error
  - Test YAML-CONTRACT-04: missing whitelist → error
  - Test clean repository → pass
- Create `packages/share/src/tests/read-yaml-file.test.ts`:
  - Test `readYamlFile` parses valid YAML
  - Test `readYamlFile` throws on invalid YAML
  - Test `readYamlFile` returns typed object

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks test` passes
- `pnpm --filter @gogol/share test` passes

**Completion criterion:** Unit tests pass for both `yaml.contract.lint` and `readYamlFile`

**Human review:** no

**Commit:** `test: RFC-0376 add unit tests for yaml.contract.lint and readYamlFile`

---

### Step 15. Run full validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm exec site-kernel run yaml.contract.lint --json` — must pass with zero violations
- Run `pnpm exec site-kernel run packages-check.run --json` — must pass
- Run `pnpm exec site-kernel run rfc.validate RFC-0376 --json` — must pass (zero V-19 warnings)
- Run `pnpm --filter @gogol/site-kernel-checks test` — must pass
- Run `pnpm --filter @gogol/share build:check` — must pass
- Run `pnpm --filter @gogol/ui build:check` — must pass

**Validation:**

- All commands exit with code 0

**Completion criterion:** All validation commands pass; `yaml.contract.lint` reports zero violations; zero V-19 warnings

**Human review:** no

**Commit:** no commit (validation only)

---

### Step 16. Emit verification evidence

**Goal:** Produce the RFC-0330 verification evidence artifact.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0376`
- Commit the generated evidence file

**Validation:**

- Evidence file exists at `docs/rfcs/verification/rfc-0376.generated.yaml`

**Completion criterion:** Verification evidence emitted and committed

**Human review:** no

**Commit:** `evidence: RFC-0376 verification evidence`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0376 --json` (zero V-19 warnings after Step 12)
- `pnpm exec site-kernel run yaml.contract.lint --json` (zero violations after Step 13)
- `pnpm exec site-kernel run packages-check.run --json`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-checks test` (includes new unit tests from Step 14)
- `pnpm --filter @gogol/share build:check`
- `pnpm --filter @gogol/share test` (includes new unit tests from Step 14)
- `pnpm --filter @gogol/ui build:check`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0376`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0376.generated.yaml` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0376` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| YAML parsing strictness | Step 6 uses `yaml.stringify()` for all generated output — valid YAML by construction |
| Large generated files expand | Step 9 regenerates with `yaml.stringify()` block-style; `linguist-generated=true` in `.gitattributes` mitigates diff noise |
| External consumers of `service.config.json` | Step 8 verifies all deployment goes through `pnpm` scripts and Wrangler |
| `yaml` library version compatibility | Step 1 verifies `yaml` is already in `pnpm-lock.yaml`; no version change needed |
| Whitelist drift | Step 3 implements `yaml.contract.lint` which forces conscious decisions about new JSON files |
| Migration window false positives | Step 3 registers `yaml.contract.lint` but does NOT add it to `APPS_BUILD_PREPARE_PIPELINE`; Step 13 adds it only after Step 9 completes all migrations |

## 6. Escalation triggers

- If implementation reveals that a whitelisted JSON file (e.g., `tsconfig.json`) is actually consumed as Category B/C by a Site OS command, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0376 --reason "..." --invariant "DNA-N"` instead of working around it.
- If a generator cannot use `yaml.stringify()` (e.g., produces non-object output like arrays or scalars), escalate before deviating from the RFC's `yaml.stringify()` + `buildGeneratedHeader()` pattern.
