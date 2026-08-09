---
rfcId: RFC-0540
planId: PLAN-RFC-0540-01
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
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0540

## 1. Objectives

- [ ] O1 — Export `FORGE_CLI_BINDING_DEFAULTS` and make `defaultForgeConfig` package-manager-aware — maps to acceptance criterion 1
- [ ] O2 — `forge.init` writes non-null forge-CLI bindings and null stack bindings per the matrix — maps to acceptance criterion 2
- [ ] O3 — `forge.doctor` emits `defaultable-binding-null` notices in `--json` output — maps to acceptance criterion 3
- [ ] O4 — `forge.doctor` does NOT emit notices for non-null bindings — maps to acceptance criterion 4
- [ ] O5 — Existing `forge.yaml` files are never modified by `forge.init` — maps to acceptance criterion 5
- [ ] O6 — Unit tests cover pm-runner derivation (pnpm/npm/yarn/bun/none/unknown) and doctor notice — maps to acceptance criterion 6
- [ ] O7 — `packages/forge/AGENTS.md` bindings section updated — maps to acceptance criterion 7
- [ ] O8 — `rfc.validate` passes on RFC-0540 — maps to acceptance criterion 8

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — add `implementStamp` field to `forgeBindingsSchema` and `ForgeBindings` interface; add `ForgeCliBindingDefault` interface, `FORGE_CLI_BINDING_DEFAULTS` constant, `PM_RUNNER_MAP`, `resolvePmRunner(pm)` function; change `defaultForgeConfig(projectName: string)` → `defaultForgeConfig(projectName: string, packageManager?: string)`
- `packages/forge/src/index.ts` — re-export `FORGE_CLI_BINDING_DEFAULTS`, `ForgeCliBindingDefault`, `resolvePmRunner`, `PM_RUNNER_MAP`
- `packages/forge/src/onboarding/init.ts` — pass `config.project.packageManager` to `defaultForgeConfig` when creating new `forge.yaml`
- `packages/forge/src/onboarding/doctor.ts` — add `defaultable-binding-null` notice generation in `validateBindings()`; add `notices` field to `BindingValidation` interface; emit suggestions
- `packages/forge/src/tests/forge-config.test.ts` — add tests for `FORGE_CLI_BINDING_DEFAULTS`, `resolvePmRunner`, `defaultForgeConfig` with package manager parameter
- `packages/forge/src/tests/doctor-autonomy.test.ts` (or new `doctor-bindings.test.ts`) — add tests for `defaultable-binding-null` notice and non-null silence
- `packages/forge/src/tests/init-bindings.test.ts` (new) — integration test: `runInit` produces correct `forge.yaml` binding matrix

### 2.2 Configuration and data

- `forge.yaml` (consumer projects) — receives defaults on init (runtime, not a source file to edit)
- `forge.yaml` (this monorepo) — unchanged

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update bindings section: change "forge.init writes default bindings (all commands `null`)" to reflect forge-CLI-backed defaults
- RFC-0540 file — read-only reference, not modified during implementation

### 2.4 Validation and pipelines

- `pnpm --filter @wgogol/forge run build:check` — scoped typecheck
- `pnpm --filter @wgogol/forge run test` — vitest run
- `pnpm exec werkstatt run rfc.validate RFC-0540 --json` — RFC validation

## 3. Step sequence

### Step 1. Add `FORGE_CLI_BINDING_DEFAULTS` and pm-runner mapping

**Goal:** Add the binding default matrix and package-manager-to-runner resolver to forge-config.ts.

**Agent actions:**

- Add `implementStamp: z.string().nullable().default(null)` to `forgeBindingsSchema.commands` and `ForgeBindings.commands` interface (schema gap: skills already require `commands.implementStamp` but schema lacks the field)
- Add `FORGE_CLI_BINDING_DEFAULTS: ForgeCliBindingDefault[]` constant with 4 entries (validateRfc, validateAdr, implementStamp, specValidate) — templates without pm prefix (pm prefix prepended at init time)
- Add `PM_RUNNER_MAP: Record<string, string>` mapping: `pnpm → "pnpm exec"`, `npm → "npx"`, `yarn → "yarn exec"`, `bun → "bunx"`, `none → "npx"`
- Add `resolvePmRunner(pm: string): string` function — returns `PM_RUNNER_MAP[pm] ?? "npx"` (fallback for unknown)
- Add `applyCliBindingDefaults(pm: string): Record<string, string | null>` helper — returns the commands object with forge-CLI bindings resolved and stack bindings null

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes

**Completion criterion:** `implementStamp` field added to schema; `FORGE_CLI_BINDING_DEFAULTS`, `PM_RUNNER_MAP`, `resolvePmRunner`, and `applyCliBindingDefaults` are exported from `forge-config.ts` and re-exported from `src/index.ts`; typecheck passes.

**Human review:** no

---

### Step 2. Make `defaultForgeConfig` package-manager-aware

**Goal:** Change `defaultForgeConfig` to accept an optional package manager and apply the CLI binding defaults.

**Agent actions:**

- Change signature: `defaultForgeConfig(projectName: string, packageManager?: string): ForgeConfig`
- Default `packageManager` to `"pnpm"` if not provided (backward compat for existing callers)
- In the `bindings.commands` section, replace the four null forge-CLI bindings with values from `applyCliBindingDefaults(packageManager)`:
  - `validateRfc: "<pm> exec forge rfc.validate {id} --json"`
  - `validateAdr: "<pm> exec forge adr.validate {id} --json"`
  - `implementStamp: "<pm> exec forge rfc.implement.stamp --id {id} --implementation-commit {commit}"`
  - `specValidate: "<pm> exec forge spec.validate --spec={id} --json"`
- Keep `typecheck`, `test`, `scopedBuild` as `null`
- Add `CHANGE_SUMMARY` entry for RFC-0540

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- Existing `forge-config.test.ts` tests still pass (default pnpm produces correct bindings)

**Completion criterion:** `defaultForgeConfig("test", "pnpm")` produces non-null forge-CLI bindings and null stack bindings; `defaultForgeConfig("test", "npm")` produces `npx`-prefixed bindings; `defaultForgeConfig("test")` defaults to pnpm.

**Human review:** no

---

### Step 3. Update `forge.init` to pass package manager

**Goal:** Ensure `forge.init` passes the detected/configured package manager to `defaultForgeConfig`.

**Agent actions:**

- In `init.ts` line 89, change `defaultForgeConfig(projectName)` to `defaultForgeConfig(projectName, config.project.packageManager)`
- If `detection?.profile` set the stack, the package manager is already in `config.project.packageManager` (set by `defaultForgeConfig` default or detection)
- Add `CHANGE_SUMMARY` entry for RFC-0540

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes

**Completion criterion:** `forge.init` in a clean directory produces a `forge.yaml` with non-null forge-CLI bindings matching the package manager.

**Human review:** no

---

### Step 4. Add `defaultable-binding-null` notice to `forge.doctor`

**Goal:** Extend the doctor's binding validation to emit notices for null forge-CLI bindings.

**Agent actions:**

- In `doctor.ts`, add `notices: BindingNotice[]` to `BindingValidation` interface:
  ```ts
  interface BindingNotice { key: string; rule: string; suggestion: string; }
  ```
- Import `FORGE_CLI_BINDING_DEFAULTS` from `forge-config.ts`
- In `validateBindings()`, after the existing command-key loop, add:
  - For each entry in `FORGE_CLI_BINDING_DEFAULTS`, if the resolved binding is `null`, push a notice: `{ key, rule: "defaultable-binding-null", suggestion: <pm> + " " + template }`
  - The `<pm>` prefix is derived from `config.project.packageManager` via `resolvePmRunner`
- Non-null bindings produce no notice (operator overrides respected)
- Include `notices` in the `bindings` field of the doctor's JSON output
- Add `CHANGE_SUMMARY` entry for RFC-0540

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- Doctor JSON output includes `bindings.notices` array

**Completion criterion:** `forge.doctor --json` on a project with null forge-CLI bindings emits `defaultable-binding-null` notices with suggestions; on a project with non-null forge-CLI bindings, emits zero notices.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Add test coverage for pm-runner derivation, CLI binding defaults, and doctor notices.

**Agent actions:**

- In `forge-config.test.ts`:
  - Test `resolvePmRunner("pnpm")` → `"pnpm exec"`, `"npm"` → `"npx"`, `"yarn"` → `"yarn exec"`, `"bun"` → `"bunx"`, `"none"` → `"npx"`, `"unknown"` → `"npx"`
  - Test `defaultForgeConfig("test", "pnpm")` produces non-null `validateRfc` with `pnpm exec` prefix and null `typecheck`
  - Test `defaultForgeConfig("test", "npm")` produces `npx`-prefixed bindings
  - Test `defaultForgeConfig("test", "bun")` produces `bunx`-prefixed bindings
  - Test `defaultForgeConfig("test")` (no pm) defaults to pnpm
  - Test `FORGE_CLI_BINDING_DEFAULTS` has 4 entries with correct keys
  - Test `forgeBindingsSchema` accepts config with `implementStamp` field
- In new `init-bindings.test.ts`:
  - Integration test: `runInit` in temp dir produces `forge.yaml` with non-null `validateRfc`, `validateAdr`, `implementStamp`, `specValidate` and null `typecheck`, `test`, `scopedBuild`
  - Test: `runInit` with `packageManager: npm` produces `npx`-prefixed bindings in `forge.yaml`
- In `doctor-autonomy.test.ts` or new `doctor-bindings.test.ts`:
  - Test doctor emits `defaultable-binding-null` notice for null `validateRfc` with correct suggestion
  - Test doctor does NOT emit notice when `validateRfc` is non-null (operator override)
  - Test doctor emits notices for all 4 forge-CLI bindings when all are null
  - Test doctor emits zero notices when all 4 are non-null

**Validation:**

- `pnpm --filter @wgogol/forge run test` passes

**Completion criterion:** All new tests pass; test count increased by ≥10 tests covering pm-runner (6 cases), CLI binding defaults (4 entries), doctor notices (4 cases), and init integration (2 cases).

**Human review:** no

---

### Step 6. Update `packages/forge/AGENTS.md`

**Goal:** Update the bindings section to reflect the new default behavior.

**Agent actions:**

- In `packages/forge/AGENTS.md` § Bindings contract, change:
  - `forge.init writes default bindings (all commands null, default paths)` → `forge.init writes forge-CLI-backed defaults for commands forge provides (validateRfc, validateAdr, implementStamp, specValidate) and null for stack-dependent commands (typecheck, test, scopedBuild). The package manager from forge.yaml determines the runner prefix.`
- Add note about `forge.doctor` `defaultable-binding-null` notice

**Validation:**

- Visual review — the AGENTS.md change accurately describes the implemented behavior

**Completion criterion:** `packages/forge/AGENTS.md` bindings section describes forge-CLI-backed defaults and the doctor notice.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria, stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @wgogol/forge run build:check` — must pass
- Run `pnpm --filter @wgogol/forge run test` — must pass
- Run `pnpm exec werkstatt run rfc.validate RFC-0540 --json` — must pass
- Verify each acceptance criterion in RFC-0540:
  1. `FORGE_CLI_BINDING_DEFAULTS` exported; `defaultForgeConfig` accepts pm — check export and signature
  2. `forge.init` in clean dir produces correct matrix — verify via test or manual check
  3. `forge.doctor` emits notices in `--json` — verify via test
  4. `forge.doctor` silent on non-null — verify via test
  5. Existing `forge.yaml` never modified — verify init.ts skip-with-warning logic unchanged
  6. Unit tests cover pm-runner (pnpm/npm/yarn/bun/none/unknown) and doctor notice — verify test file
  7. `packages/forge/AGENTS.md` updated — verify git diff
  8. `rfc.validate` passes — already verified above
- Mark each criterion `[x]` with inline `(evidence: <file:line>, <test-or-command>)`
- Stamp the RFC: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0540 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate RFC-0540 --json` — pass
- `pnpm --filter @wgogol/forge run build:check` — pass
- `pnpm --filter @wgogol/forge run test` — pass

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; git status clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0540 --json`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0540` in the subject line (RFC-0265 commit hygiene)
- Inline `(evidence: ...)` annotations on each acceptance criterion (V-27)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Template drift — forge CLI command renamed | Step 1: `FORGE_CLI_BINDING_DEFAULTS` is the single point of update; doctor notice (Step 4) surfaces null bindings in consumer configs |
| Package-manager detection wrong | Step 1: `resolvePmRunner` falls back to `npx` for unknown; Step 5: tests cover all 6 cases including unknown |
| Agent misinterpretation — defaulting typecheck | Step 2: only forge-CLI bindings are defaulted; `typecheck`/`test`/`scopedBuild` stay null; RFC implementation notes explicitly forbid this |
| False-positive doctor notice | Step 4: notice is advisory (not error); Step 5: test confirms non-null bindings produce no notice |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0540 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
