---
rfcId: RFC-0493
planId: PLAN-RFC-0493-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-checks"
    - "@gogol/share"
  services: []
  docs:
    - docs/policies/generated-file-governance.md
    - AGENTS.md
    - docs/verification-plan.xml
    - docs/rfcs/archive/implemented/rfc-0376-migrate-generated-artifacts-and-project-configs-from-json-to-yaml.md
---

# Implementation Plan: RFC-0493

## 1. Objectives

- [ ] Objective 1 — YAML quoting policy documented in `generated-file-governance.md` and referenced from root `AGENTS.md` (maps to acceptance criteria 1–2)
- [ ] Objective 2 — `yaml.parse.validate` command implemented with `YAML-PARSE-01` and `YAML-PARSE-02` diagnostics (maps to acceptance criteria 3–6)
- [ ] Objective 3 — `yaml.parse.validate` wired into `SITES_BUILD_PREPARE_PIPELINE` and `PACKAGES_CHECK_PIPELINE` (maps to acceptance criteria 7–8)
- [ ] Objective 4 — Red/green test coverage for both diagnostic rules (maps to acceptance criterion 9)
- [ ] Objective 5 — `eslint-plugin-yml` integrated with `yml/plain-scalar: ["error", "always"]` in flat config (maps to acceptance criteria 10–12)
- [ ] Objective 6 — RFC-0376 `amendedBy` backreference added (maps to acceptance criterion 13)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/yaml-parse-validate.ts` — new file, `runYamlParseValidate` function
- `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` — register `YAML-PARSE-01`, `YAML-PARSE-02`
- `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` — add `yaml.parse.validate` entry
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — add `{ command: "yaml.parse.validate" }` after `yaml.contract.lint` (line 17)
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `{ command: "yaml.parse.validate" }` as standalone step
- `packages/os/site-kernel-checks/src/tests/yaml-parse-validate.test.ts` — new test file, red/green fixtures
- `eslint.config.js` — add YAML config block with `language: "yml/yaml"` and `yml/plain-scalar` rule
- `package.json` — add `eslint-plugin-yml` to `devDependencies`, add `lint:yaml` script

### 2.2 Configuration and data

- `yaml-contract.whitelist.yaml` — no change (parse validation does not use the whitelist)
- `.prettierrc.mjs` — no change (already correct: `singleQuote: false`, `parser: "yaml"`)

### 2.3 Documentation and specs

- `docs/policies/generated-file-governance.md` — add "YAML quoting policy (RFC-0493)" section after "YAML-only contract" section
- `AGENTS.md` (root) — add reference to YAML quoting policy in "Generated-file governance" section
- `docs/verification-plan.xml` — add `yaml.parse.validate` to `SITES_BUILD_PREPARE_PIPELINE` and `PACKAGES_CHECK_PIPELINE` step lists
- `docs/rfcs/archive/implemented/rfc-0376-migrate-generated-artifacts-and-project-configs-from-json-to-yaml.md` — add `RFC-0493` to `amendedBy` frontmatter field

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` — new step after `yaml.contract.lint`
- `PACKAGES_CHECK_PIPELINE` — new standalone step
- CI lint step — `lint:yaml` runs alongside `lint:packages`

## 3. Step sequence

### Step 1. Register diagnostic rules

**Goal:** Register `YAML-PARSE-01` and `YAML-PARSE-02` in the diagnostic rule registry.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`.
- Add `YAML-PARSE-01` rule entry (error, "YAML file failed to parse", command: `yaml.parse.validate`) after the `YAML-CONTRACT-05` entry.
- Add `YAML-PARSE-02` rule entry (error, "YAML file has duplicate mapping key", command: `yaml.parse.validate`).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build` — compiles without errors.

**Completion criterion:** `YAML-PARSE-01` and `YAML-PARSE-02` are registered in `core-infra.ts` and the package compiles.

**Human review:** no

---

### Step 2. Implement `yaml.parse.validate` command

**Goal:** Create the `runYamlParseValidate` function that parse-checks all `.yaml` files.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/yaml-parse-validate.ts`.
- Import `parse as yamlParse` from `yaml`, `collectFiles` from `@gogol/share/fs`, `diagnosticsResult` from `./result-helpers.ts`.
- Define a reduced `EXCLUDE_DIRS` set (same as `yaml.contract.lint` but without `packages`, `missions`, `systems`).
- Implement `runYamlParseValidate`:
  - Collect all `.yaml` files via `collectFiles` with the reduced exclude set.
  - For each file: read content, call `yamlParse(raw, { uniqueKeys: true })` in a try/catch.
  - On parse error: push `YAML-PARSE-01` diagnostic with error message and line number from the `YAMLParseError`.
  - On duplicate key: push `YAML-PARSE-02` diagnostic with key name and line number.
  - Return `diagnosticsResult("yaml.parse.validate", diagnostics)`.
- Add MODULE_CONTRACT and CHANGE_SUMMARY Compass scaffolding at the top of the file.
- Add command entry to `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`:
  ```ts
  {
    name: "yaml.parse.validate",
    description: "RFC-0493: parse-check all .yaml files. YAML-PARSE-01: parse error. YAML-PARSE-02: duplicate mapping key.",
    scope: "workspace",
    flags: {},
    reads: ["**/*.yaml"],
    execute: runYamlParseValidate,
  },
  ```

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build` — compiles without errors.
- `pnpm exec werkstatt run yaml.parse.validate --json` — runs without KERNEL-FLAG errors.

**Completion criterion:** `yaml.parse.validate` command is registered and executable; running it produces a `diagnosticsResult` JSON shape.

**Human review:** no

---

### Step 3. Write tests

**Goal:** Red/green fixture coverage for `YAML-PARSE-01` and `YAML-PARSE-02`.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/yaml-parse-validate.test.ts`.
- Follow the pattern from `yaml-contract-lint.test.ts`: `mkdtemp`, `writeFile`, `ctx(root)`, `runYamlParseValidate`.
- Red case 1: `.yaml` file with syntax error (bad indentation) → `YAML-PARSE-01`, exit code 1.
- Red case 2: `.yaml` file with duplicate mapping key (`key: a\nkey: b`) → `YAML-PARSE-02`, exit code 1.
- Green case: valid `.yaml` file with no errors → exit code 0.
- Edge case: empty `.yaml` file → exit code 0 (no diagnostic).
- Add MODULE_CONTRACT Compass scaffolding.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks test -- --grep yaml-parse` — all tests pass.

**Completion criterion:** All 4 test cases pass (2 red, 1 green, 1 edge case).

**Human review:** no

---

### Step 4. Wire pipeline steps

**Goal:** Add `yaml.parse.validate` to `SITES_BUILD_PREPARE_PIPELINE` and `PACKAGES_CHECK_PIPELINE`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`: add `{ command: "yaml.parse.validate" }` immediately after `{ command: "yaml.contract.lint" }` (line 17), with comment `// RFC-0493: parse-check all .yaml files after extension contract`.
- In `packages/os/site-kernel-checks/src/pipelines/packages-check.ts`: add `{ command: "yaml.parse.validate" }` as a standalone step (e.g., after `command.reads.validate` at the end), with comment `// RFC-0493: parse-check all .yaml files`.
- Add CHANGE_SUMMARY entries to both pipeline files.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build` — compiles without errors.
- `pnpm exec werkstatt run yaml.parse.validate` — exits 0 on current repository (all existing `.yaml` files parse cleanly).

**Completion criterion:** `yaml.parse.validate` appears in both pipeline definitions; running it on the current repo produces zero diagnostics.

**Human review:** no

---

### Step 5. Add YAML quoting policy to documentation

**Goal:** Document the quoting policy in `generated-file-governance.md` and reference it from root `AGENTS.md`.

**Agent actions:**

- Add "YAML quoting policy (RFC-0493)" section to `docs/policies/generated-file-governance.md` after the "YAML-only contract" section (after line 89).
- Include: decision algorithm (4 steps), quick reference table, YAML 1.2 note, generated YAML guidance.
- Add a reference line in root `AGENTS.md` in the "Generated-file governance" section pointing to the new policy section.

**Validation:**

- `pnpm exec werkstatt run compass.validate` — no Compass drift on edited files.

**Completion criterion:** `generated-file-governance.md` has the quoting policy section; root `AGENTS.md` references it.

**Human review:** no

---

### Step 6. Integrate `eslint-plugin-yml`

**Goal:** Add ESLint YAML quoting enforcement with auto-fix.

**Agent actions:**

- Add `eslint-plugin-yml` to root `package.json` `devDependencies` (latest version supporting flat config).
- Add `lint:yaml` script to `package.json`: `"lint:yaml": "eslint --config eslint.config.js **/*.yaml"`.
- Update `eslint.config.js`: add YAML config block with `language: "yml/yaml"`, `plugins: { yml: eslintPluginYml }`, `rules: { "yml/plain-scalar": ["error", "always"] }`.
- Run `pnpm install` to install the new devDependency.
- Run `pnpm lint:yaml --fix` to auto-fix existing YAML files (remove unnecessary quotes).
- Run `pnpm format` to normalize any remaining style differences.
- Commit the auto-fix changes in a **separate commit** from the config changes.

**Validation:**

- `pnpm lint:yaml` — exits 0 (zero violations after auto-fix).
- `pnpm format:check` — zero formatting drift.

**Completion criterion:** `eslint-plugin-yml` is installed, `lint:yaml` script works, `pnpm lint:yaml` exits 0.

**Human review:** no

---

### Step 7. Add `amendedBy` backreference to RFC-0376

**Goal:** Fix the V-19 referential integrity warning by adding `RFC-0493` to RFC-0376's `amendedBy` field.

**Agent actions:**

- Open `docs/rfcs/archive/implemented/rfc-0376-migrate-generated-artifacts-and-project-configs-from-json-to-yaml.md`.
- Add `RFC-0493` to the `amendedBy` frontmatter field.

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0493` — V-19 warning is resolved (0 violations).

**Completion criterion:** `rfc.validate RFC-0493` reports 0 violations (V-19 backreference fixed).

**Human review:** no

---

### Step 8. Synchronize Compass and ecosystem artifacts

**Goal:** Update `docs/verification-plan.xml` and regenerate ecosystem manifest.

**Agent actions:**

- Update `docs/verification-plan.xml` to include `yaml.parse.validate` in the `SITES_BUILD_PREPARE_PIPELINE` and `PACKAGES_CHECK_PIPELINE` step lists.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- Verify `docs/ecosystem.generated.yaml` reflects the new command.

**Validation:**

- `pnpm exec werkstatt run ecosystem.manifest.validate` — no drift.
- `pnpm exec werkstatt run workspace.surface.validate` — no drift.

**Completion criterion:** `verification-plan.xml` updated; ecosystem manifest regenerated and validated.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and request human operator to stamp the RFC as implemented.

**Agent actions:**

- Verify root `AGENTS.md` references the YAML quoting policy (Step 5).
- Verify `docs/verification-plan.xml` includes `yaml.parse.validate` (Step 8).
- Verify `docs/architecture-dna.md` — no new DNA invariant introduced (no change needed).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if pipeline topology changed.
- Check off all 13 acceptance criteria in the RFC. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **DO NOT stamp RFC or plan status as `implemented`** — request the human operator to run `rfc.implement.stamp --id RFC-0493 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate RFC-0493` — 0 violations.
- `pnpm --filter @gogol/site-kernel-checks build:check` — pipeline passes with new step.
- `pnpm --filter @gogol/site-kernel-checks test` — all tests pass.
- `pnpm lint:yaml` — zero violations.
- `pnpm format:check` — zero formatting drift.
- `pnpm exec werkstatt run yaml.parse.validate` — zero parse errors.
- Every file in `scope.docs` is either updated or documented as not-applicable.

**Completion criterion:** All documentation artifacts in scope are updated; all 13 acceptance criteria checked off; agent has requested the human operator to perform the `accepted → implemented` transition.

**Human review:** yes — the `accepted → implemented` transition requires human architecture review (RFC-0224). The operator verifies remaining runtime acceptance criteria and runs `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0493` — 0 violations (V-19 resolved by Step 7)
- `pnpm --filter @gogol/site-kernel-checks build:check` — pipeline passes with new `yaml.parse.validate` step
- `pnpm --filter @gogol/site-kernel-checks test` — all red/green tests pass
- `pnpm lint:yaml` — zero ESLint violations after auto-fix
- `pnpm format:check` — zero Prettier drift
- `pnpm exec werkstatt run yaml.parse.validate` — zero parse errors on current repo
- `pnpm exec werkstatt run ecosystem.manifest.validate` — no ecosystem drift

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0493.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)
- Commit messages referencing `RFC-0493` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Existing YAML files may have parse errors | Step 4 validation runs `yaml.parse.validate` on current repo before pipeline wiring; errors fixed before pipeline activation |
| Existing YAML files may have unnecessary quotes | Step 6 runs `pnpm lint:yaml --fix` in a separate commit before enabling `error` severity |
| `eslint-plugin-yml` adds a new devDependency | Step 6 installs and verifies compatibility with ESLint 10.x flat config |
| Mission workpiece YAML files validated by `yaml.parse.validate` | Step 4 confirms `missions` is NOT in the reduced exclude set — intentional, catches agent-authored errors early |

## 6. Escalation triggers

- If `yaml.parse.validate` surfaces a large number (>20) of parse errors on the current repository, pause and fix all errors before proceeding to Step 4 (pipeline wiring). Do not suppress or skip validation.
- If `eslint-plugin-yml` is incompatible with ESLint 10.x flat config, use `eslint-plugin-yml/flat` import path instead. If still incompatible, escalate to the operator.
- If implementation reveals an invariant conflict with any DNA item, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0493 --reason "..." --invariant "DNA-N"` instead of working around it.
