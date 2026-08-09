---
rfcId: RFC-0546
planId: PLAN-RFC-0546-01
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
    - AGENTS.md
    - packages/forge/skills/meta/forge-bootstrap/SKILL.md
---

# Implementation Plan: RFC-0546

## 1. Objectives

- [ ] Objective 1 — Remove `forge.init` CLI registration while keeping `runInit()` as internal primitive — maps to acceptance criterion [forge.init removed from forgeCoreModule]
- [ ] Objective 2 — Create migration-adapter infrastructure (types + registry) — maps to acceptance criteria [interfaces defined, registry exists]
- [ ] Objective 3 — Implement `node-typescript-pnpm` and `phaser-pnpm` adapters — maps to acceptance criteria [node adapter, phaser adapter]
- [ ] Objective 4 — Redesign `forge-bootstrap` SKILL.md transplant mode with adapter-driven flow — maps to acceptance criterion [SKILL.md redesigned]
- [ ] Objective 5 — Extend `forge.yaml` schema with optional `migrationAdapters` field — maps to acceptance criterion [schema includes migrationAdapters]
- [ ] Objective 6 — Replace all `forge.init` references across documentation and source files — maps to acceptance criteria [README, AGENTS.md, forge-config.ts, upgrade.ts, cli.ts, doctor.ts]
- [ ] Objective 7 — Unit tests for adapters, registry, conflict resolution, forge-protected files — maps to acceptance criterion [unit tests cover]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/migration-adapters/types.ts` — MigrationAdapter, AdapterAnalysis, MigrationResult, Conflict interfaces (NEW)
- `packages/forge/src/migration-adapters/registry.ts` — adapter registry with built-in + discovered adapters (NEW)
- `packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts` — Node/TS/pnpm adapter (NEW)
- `packages/forge/src/migration-adapters/phaser-pnpm/index.ts` — Phaser/pnpm adapter (NEW)
- `packages/forge/src/migration-adapters/index.ts` — barrel export for migration-adapters (NEW)
- `packages/forge/os/core/core.module.ts` — remove `forge.init` registration (MODIFY)
- `packages/forge/src/config/forge-config.ts` — add `migrationAdapters` to schema, fix error messages (MODIFY)
- `packages/forge/src/onboarding/doctor.ts` — replace "run 'forge init'" messages with "run 'forge create'", add migration-adapter registry check (MODIFY)
- `packages/forge/src/onboarding/upgrade.ts` — fix comment and error/nextSteps messages (MODIFY)
- `packages/forge/bin/cli.ts` — remove `forge.init` from IDE recommendation condition (MODIFY)
- `packages/forge/src/index.ts` — export migration-adapter types and registry (MODIFY)

### 2.2 Configuration and data

- `packages/forge/src/config/forge-config.ts` — `forgeConfigSchema` extended with optional `migrationAdapters: z.array(...).optional()`
- `forge.yaml` schema extension — additive, no existing files break

### 2.3 Documentation and specs

- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — transplant mode redesigned with adapter-driven flow (MODIFY)
- `packages/forge/README.md` — remove `forge init` from Quick start and Lifecycle (MODIFY)
- `packages/forge/AGENTS.md` — remove all `forge.init` references across OS modules table, Skills, forge.yaml, Stack profiles, Bindings, Output contract sections (MODIFY)
- `AGENTS.md` (root) — update §Forge project configuration, §Package ownership, §Agent skills (MODIFY)

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate` — must pass on RFC-0546
- `pnpm --filter @warpgogol/forge run build:check` — typecheck must pass
- `pnpm --filter @warpgogol/forge run test` — unit tests must pass
- `pnpm exec werkstatt run forge.skill.validate` — must pass on redesigned forge-bootstrap skill

## 3. Step sequence

### Step 1. Create migration-adapter type contracts

**Goal:** Define the `MigrationAdapter`, `AdapterAnalysis`, `MigrationResult`, and `Conflict` interfaces.

**Agent actions:**

- Create `packages/forge/src/migration-adapters/types.ts` with the four interfaces from RFC-0546 §Design
- Create `packages/forge/src/migration-adapters/index.ts` barrel export
- Export types from `packages/forge/src/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `MigrationAdapter`, `AdapterAnalysis`, `MigrationResult`, and `Conflict` interfaces are defined and exported from `@warpgogol/forge`

**Human review:** no

---

### Step 2. Extend forge.yaml schema with migrationAdapters

**Goal:** Add optional `migrationAdapters` field to `forgeConfigSchema`.

**Agent actions:**

- Add `migrationAdapters: z.array(z.object({ id: z.string(), module: z.string().optional() })).optional()` to `forgeConfigSchema` in `packages/forge/src/config/forge-config.ts`
- Add corresponding field to `ForgeConfig` interface
- Update `defaultForgeConfig` if needed (field is optional, so default is undefined)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Existing `forge.yaml` files without `migrationAdapters` still pass validation

**Completion criterion:** `forgeConfigSchema` includes optional `migrationAdapters` field; existing `forge.yaml` files validate unchanged

**Human review:** no

---

### Step 3. Implement node-typescript-pnpm adapter

**Goal:** Implement the Node/TS/pnpm migration adapter with detect, analyze, migrate, and postSetup phases.

**Agent actions:**

- Create `packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts`
- `detect(sourceDir)`: check for `package.json` + `tsconfig.json` + pnpm lockfile (`pnpm-lock.yaml`)
- `analyze(sourceDir)`: read `package.json` scripts, derive `typecheck` from `scripts.build:check` or `tsc --noEmit`, `test` from `scripts.test`, `scopedBuild` from `scripts.build`. Derive `appName` from `package.json` name. Placement: `apps/<appName>/`. Exclude patterns: `node_modules/`, `dist/`, `.next/`, `.cache/`, `.turbo/`
- `migrate(sourceDir, targetDir, analysis)`: copy all files excluding patterns and forge-protected files. Return `MigrationResult` with filesCopied, filesSkipped, conflicts
- `postSetup(targetDir, analysis)`: update `pnpm-workspace.yaml` (add `apps/<appName>`), update `turbo.json` (add workspace to pipeline), run `pnpm install`, init git if needed

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `node-typescript-pnpm` adapter implements all four phases with correct detection and binding derivation

**Human review:** no

---

### Step 4. Implement phaser-pnpm adapter

**Goal:** Implement the Phaser/pnpm migration adapter.

**Agent actions:**

- Create `packages/forge/src/migration-adapters/phaser-pnpm/index.ts`
- `detect(sourceDir)`: check for `package.json` with `phaser` in dependencies or devDependencies
- `analyze(sourceDir)`: same as node-typescript-pnpm but with Phaser-specific bindings
- `migrate(sourceDir, targetDir, analysis)`: same copy logic with forge-protected file enforcement
- `postSetup(targetDir, analysis)`: same workspace update logic

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `phaser-pnpm` adapter implements all four phases with correct Phaser detection

**Human review:** no

---

### Step 5. Create migration-adapter registry

**Goal:** Implement the adapter registry with built-in adapter discovery and `forge.yaml` `migrationAdapters` support. Depends on Steps 3-4 (imports built-in adapters).

**Agent actions:**

- Create `packages/forge/src/migration-adapters/registry.ts`
- Import `node-typescript-pnpm` and `phaser-pnpm` adapters as built-in adapters
- Implement `getAdapters(config?: ForgeConfig): MigrationAdapter[]` — returns built-in adapters + any discovered from `forge.yaml` `migrationAdapters` config (dynamic `import()` for external modules)
- Implement `detectAdapter(sourceDir: string, config?: ForgeConfig): MigrationAdapter | null` — iterates registry, calls `detect()` on each, returns first match or null

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** Registry exists with `getAdapters()` and `detectAdapter()` functions, supports built-in + config-discovered adapters

**Human review:** no

---

### Step 6. Remove forge.init CLI registration

**Goal:** Remove `forge.init` from `forgeCoreModule` registration while keeping `runInit()` as an internal function.

**Agent actions:**

- Remove the `forge.init` `registry.registerCommand()` block from `packages/forge/os/core/core.module.ts` (lines 168-182)
- Remove the `initWrapper` function (lines 48-69) — it's no longer needed
- Keep the `runInit` import — `forge.create` still calls it
- Remove `forge.init` from the `initWrapper` nextSteps in `forge.create` if referenced

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `forge --help` does not list `forge.init`

**Completion criterion:** `forge.init` is not registered as a CLI command; `runInit()` remains in `src/onboarding/init.ts`

**Human review:** no

---

### Step 7. Redesign forge-bootstrap SKILL.md transplant mode

**Goal:** Replace the current transplant mode steps 4-7 with the adapter-driven migration flow.

**Agent actions:**

- Edit `packages/forge/skills/meta/forge-bootstrap/SKILL.md` §4 (Transplant interview)
- Replace steps 4-7 with: detect adapter → analyze → migrate → post-setup → fill forge.yaml → write PREFERENCES.md → emit next steps
- Add failure modes for: no adapter match, multiple adapter match, interrupted migration, concurrent execution
- Update §6 (Report) with migration summary format from RFC-0546 §Output format

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate` passes on the redesigned skill

**Completion criterion:** SKILL.md transplant mode follows adapter-driven flow (detect → analyze → migrate → post-setup)

**Human review:** no

---

### Step 8. Replace all forge.init references in documentation and source

**Goal:** Replace all `forge.init` references with `forge.create` / `runInit()` across all affected files.

**Agent actions:**

- `packages/forge/README.md`: remove `forge init` from Quick start (line 20) and Lifecycle (line 64); document `forge create` + `/forge-bootstrap` as the only path
- `packages/forge/AGENTS.md`: update OS modules table (line 16), Skills section (line 34), forge.yaml section (line 64), Stack profiles section (line 72), Bindings contract section (line 84), Output contract section (lines 94, 98)
- `AGENTS.md` (root): update §Forge project configuration (line 30), §Package ownership (line 397), §Agent skills (line 424)
- `packages/forge/src/config/forge-config.ts`: update error messages at lines 262, 280 to say "Run 'forge create'"
- `packages/forge/src/onboarding/upgrade.ts`: update comment (line 8) and error/nextSteps messages (lines 211-213)
- `packages/forge/bin/cli.ts`: remove `forge.init` from IDE recommendation condition (line 293)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `grep -r "forge.init\|forge init" packages/forge/README.md packages/forge/AGENTS.md AGENTS.md packages/forge/src/config/forge-config.ts packages/forge/src/onboarding/upgrade.ts packages/forge/bin/cli.ts` returns zero matches (excluding CHANGE_SUMMARY comments which are historical)

**Completion criterion:** Zero `forge.init` references in user-facing documentation and error messages across all listed files

**Human review:** no

---

### Step 9. Update forge.doctor messages and add migration-adapter check

**Goal:** Replace all "run 'forge init'" suggestions in doctor.ts and add a migration-adapter registry health check.

**Agent actions:**

- Update all 9 "run 'forge init'" suggestion messages in `packages/forge/src/onboarding/doctor.ts` to "run 'forge create'"
- Add a new `DoctorCheck` for migration-adapter registry health: validates `migrationAdapters` config if present (checks that referenced adapter modules exist)
- Update the stale knowledge files check message (line 258) and pack skills check message (line 332) that reference `forge init`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm --filter @warpgogol/forge run test` passes

**Completion criterion:** `forge.doctor` has zero "forge init" suggestions; migration-adapter registry check exists

**Human review:** no

---

### Step 10. Write unit tests

**Goal:** Comprehensive unit tests for migration adapters, registry, conflict resolution, and forge-protected file enforcement.

**Agent actions:**

- Create `packages/forge/src/tests/migration-adapters/types.test.ts` — interface compliance
- Create `packages/forge/src/tests/migration-adapters/registry.test.ts` — registry discovery, detectAdapter
- Create `packages/forge/src/tests/migration-adapters/node-typescript-pnpm.test.ts` — detect, analyze, migrate, postSetup
- Create `packages/forge/src/tests/migration-adapters/phaser-pnpm.test.ts` — detect, analyze, migrate, postSetup
- Create `packages/forge/src/tests/migration-adapters/conflict-resolution.test.ts` — forge-protected file enforcement, conflict handling
- Test fixtures: minimal `package.json` + `tsconfig.json` for Node/TS, `package.json` with phaser dep for Phaser

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes

**Completion criterion:** All test files pass; coverage includes detect/analyze/migrate/postSetup for both adapters, registry discovery, conflict resolution, forge-protected file enforcement

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify all `scope.docs` files are updated — check each path against `git diff`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (forge.init removed)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0546 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate` passes on RFC-0546
- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm --filter @warpgogol/forge run test` passes
- `pnpm exec werkstatt run forge.skill.validate` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate` — must pass on RFC-0546
- `pnpm --filter @warpgogol/forge run build:check` — typecheck must pass
- `pnpm --filter @warpgogol/forge run test` — unit tests must pass
- `pnpm exec werkstatt run forge.skill.validate` — must pass on redesigned forge-bootstrap skill

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0546` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Breaking change for `forge init` users | Step 6 removes CLI registration; Step 8 documents `forge create` + `/forge-bootstrap` as replacement |
| Adapter false positives | Step 7 (SKILL.md) requires operator confirmation before migration proceeds; multiple matches trigger explicit choice |
| Large project migration performance | Step 4-5 adapters use exclude patterns to filter build artifacts |
| Git history preservation edge cases | Step 7 (SKILL.md) warns and continues if git history preservation fails |
| Agent misinterpretation | Step 6 removes `forge.init` from `--help`; Step 7 guardrails refuse without matched adapter |
| Schema extension risk | Step 2 makes `migrationAdapters` optional with default empty array; Step 9 adds doctor check |
| Interrupted migration | Step 4-5 `migrate()` is idempotent (skip existing files); documented in failure modes |
| Concurrent execution | Step 7 (SKILL.md) documents that concurrent transplant on same project is not supported |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0546 --reason "..." --invariant "DNA-54"` instead of working around it.
- If the `forge.yaml` schema extension breaks existing validation, do not weaken the schema — investigate whether `migrationAdapters` needs a different shape or a separate schema version.
