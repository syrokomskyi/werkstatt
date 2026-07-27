---
rfcId: RFC-0374
planId: PLAN-RFC-0374-01
status: draft
owner: architecture
createdAt: 2026-07-11
updatedAt:
scope:
  apps:
    - webgogol-com
    - nicaragua-projekt
    - check-webgogol-com
  packages:
    - "@gogol/forge"
    - "@gogol/site-kernel"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
    - "@gogol/ontology"
  services: []
  docs:
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/source-markup.xml
    - docs/knowledge-graph.xml
    - AGENTS.md
    - packages/AGENTS.md
---

# Implementation Plan: RFC-0374

## 1. Objectives

- [ ] O1 — Create `@gogol/forge` package with ForgeModule types, skill registry, validators, onboarding (maps to acceptance: package exists, ForgeModule defined, no site-kernel imports)
- [ ] O2 — Migrate 17 skills to `packages/forge/skills/` with standardized frontmatter (maps to acceptance: 17 skills relocated, forge.skill.validate passes)
- [ ] O3 — Create 3 new meta skills: skill-create, port-to-forge, forge-bootstrap (maps to acceptance: 3 meta skills created)
- [ ] O4 — Migrate 28+ generic governance commands to forge OS modules (maps to acceptance: commands register from @gogol/forge)
- [ ] O5 — Update all kernel.config.ts files and codegen template to import forge modules (maps to acceptance: kernel.config.ts imports forge, template updated)
- [ ] O6 — Run forge.init to sync skills to .agents/skills/ (maps to acceptance: .agents/skills/ contains generated copies)
- [ ] O7 — Update AGENTS.md and docs/_.xml Compass files (maps to acceptance: AGENTS.md updated, docs/_.xml updated)
- [ ] O8 — Validate: rfc.validate, build.check, forge.skill.validate all pass (maps to acceptance: pipelines pass, rfc.validate passes)

## 2. Affected artifacts

### 2.1 Code and commands

**New package: `packages/forge/`**

- `packages/forge/package.json` — package declaration (`@gogol/forge`)
- `packages/forge/tsconfig.json` — TypeScript config (strict, extends root)
- `packages/forge/turbo.json` — Turborepo config
- `packages/forge/src/index.ts` — public exports
- `packages/forge/src/forge-module.ts` — ForgeModule, ForgeModuleRegistry, ForgeCommandDefinition, ForgePipelineStep interfaces
- `packages/forge/src/skill-schema.ts` — Zod frontmatter schema (skillFrontmatterSchema)
- `packages/forge/src/registry.ts` — ForgeSkillEntry[] registry
- `packages/forge/src/validators/skill-validate.ts` — forge.skill.validate handler
- `packages/forge/src/validators/port-validate.ts` — forge.port.validate handler
- `packages/forge/src/onboarding/init.ts` — forge.init handler
- `packages/forge/src/onboarding/scaffold.ts` — forge.port.scaffold handler
- `packages/forge/os/rfc/rfc.module.ts` — forgeRfcModule (migrated from `packages/os/site-kernel/src/rfc/rfc.module.ts`)
- `packages/forge/os/workflow/workflow.module.ts` — forgeWorkflowModule (migrated from `packages/os/site-kernel/src/workflow/workflow.module.ts`)
- `packages/forge/os/naming/naming.module.ts` — forgeNamingModule (migrated `naming.convention.lint` from `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts`)
- `packages/forge/os/compass/compass.module.ts` — forgeCompassModule (migrated 12 compass commands from `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` and `packages/os/site-kernel/src/templates/wire/tools/modules/check.module.template.ts`)
- `packages/forge/os/werkstatt/werkstatt.module.ts` — forgeWerkstattModule (migrated from `packages/os/site-kernel-handoff/src/werkstatt/index.ts`)

**Modified: `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`**

- Remove 8 compass command entries from ALL_COMMANDS (compass.inventory, compass.validate, compass.changesummary.validate, compass.changesummary.tidy, compass.audit.plan, compass.audit.record, compass.audit.baseline, compass.audit.validate)
- Add comment pointer: `// Migrated to @gogol/forge — see packages/forge/os/compass/`

**Modified: `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts`**

- Remove `naming.convention.lint` entry from ALL_COMMANDS
- Add comment pointer: `// Migrated to @gogol/forge — see packages/forge/os/naming/`
- Keep 7 remaining naming commands (naming.pages.lint, naming.suffixes.lint, naming.layouts.lint, naming.components.lint, naming.styles.lint, naming.content.lint, naming.policy.validate)

**Modified: `packages/os/site-kernel/src/templates/wire/tools/modules/check.module.template.ts`**

- Remove 4 compass command registrations (compass.annotate, compass.clear, compass.markup.migrate, compass.invariant.add)
- Add comment pointer for migrated commands

**Modified: `packages/os/site-kernel/src/rfc/rfc.module.ts`**

- Delete or convert to re-export from forge (if any external code imports rfcModule from site-kernel directly)

**Modified: `packages/os/site-kernel/src/workflow/workflow.module.ts`**

- Delete or convert to re-export from forge

**Modified: `packages/os/site-kernel-handoff/src/werkstatt/index.ts`**

- Delete `createWerkstattModule` or convert to re-export from forge
- Keep non-module exports (lock.ts, operation.ts, atomic.ts) — they are used by handoff

**Modified: `apps/webgogol-com/tools/kernel.config.ts`**

- Replace `rfcModule` import from `@gogol/site-kernel` with `forgeRfcModule` from `@gogol/forge`
- Add `forgeCompassModule`, `forgeNamingModule`, `forgeWorkflowModule`, `forgeWerkstattModule` imports from `@gogol/forge`
- Add forge modules to `modules[]` array

**Modified: `apps/nicaragua-projekt/tools/kernel.config.ts`**

- Same changes as webgogol-com

**Modified: `apps/check-webgogol-com/tools/kernel.config.ts`**

- Same changes as webgogol-com

**Modified: `packages/os/site-kernel/src/templates/wire/tools/kernel.config.template.ts`**

- Replace `rfcModule` import with forge modules
- Add forge modules to template `modules[]` array

### 2.2 Configuration and data

- `packages/forge/skills/wg/*/SKILL.md` — 10 WG governance skills (source of truth)
- `packages/forge/skills/shared/*/SKILL.md` — 7 general-purpose skills (source of truth)
- `packages/forge/skills/meta/*/SKILL.md` — 3 new meta skills (source of truth)
- `.agents/skills/<name>/SKILL.md` — 20 generated copies (synced via forge.init)
- `PREFERENCES.md` — remains at repo root (forge.init creates if missing)

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add forge package to monorepo layout, update skills section
- `packages/AGENTS.md` — add forge package rules
- `docs/technology.xml` — declare `@gogol/forge` package
- `docs/development-plan.xml` — add forge workflow (skill lifecycle, port-to-forge)
- `docs/source-markup.xml` — add forge source files requiring Compass scaffolding
- `docs/knowledge-graph.xml` — add forge package relationships
- RFC-0374 itself — read-only reference (status: accepted)

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `forge.skill.validate`
- `pnpm exec site-kernel run rfc.validate RFC-0374` — must pass
- `pnpm --filter @gogol/forge run build:check` — must pass
- `pnpm --filter @gogol/site-kernel run build:check` — must pass after rfc/workflow module removal
- `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass after ALL_COMMANDS changes
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — must pass after werkstatt module changes
- `pnpm --filter <app> run build:check` for each app — must pass after kernel.config.ts changes

## 3. Step sequence

### Step 1. Create forge package scaffold and type contracts

**Goal:** Establish the `@gogol/forge` package with TypeScript types, package.json, and build config.

**Agent actions:**

- Create `packages/forge/package.json` with `name: "@gogol/forge"`, `type: "module"`, dependencies on `zod`, `@gogol/ontology`, `@gogol/fingerprint`, `@gogol/share`
- Create `packages/forge/tsconfig.json` extending root tsconfig
- Create `packages/forge/turbo.json` with build:check task
- Create `packages/forge/src/forge-module.ts` with ForgeModule, ForgeModuleRegistry, ForgeCommandDefinition, ForgePipelineStep interfaces
- Create `packages/forge/src/skill-schema.ts` with Zod skillFrontmatterSchema
- Create `packages/forge/src/index.ts` exporting public types
- Add `@gogol/forge` to `pnpm-workspace.yaml` if not auto-discovered

**Validation:**

- `pnpm --filter @gogol/forge run build:check` passes
- No import from `@gogol/site-kernel` in any `packages/forge/src/` file

**Completion criterion:** `@gogol/forge` package builds and exports ForgeModule types

**Human review:** no

---

### Step 2. Migrate 17 skills to forge with standardized frontmatter

**Goal:** Move all 17 existing skills from `.agents/skills/` to `packages/forge/skills/{wg,shared,meta}/` with standardized frontmatter.

**Agent actions:**

- For each of 10 wg skills: copy from `.agents/skills/<name>/` to `packages/forge/skills/wg/<name>/`
- For each of 7 shared skills: copy from `.agents/skills/<name>/` to `packages/forge/skills/shared/<name>/`
- For each SKILL.md: add standardized frontmatter (name, description, invocation, category, concerns, dependsOn, languagePolicy: ref(PREFERENCES.md))
- For each SKILL.md body: replace detailed language policy prose blocks with canonical "Read PREFERENCES.md at the repository root…" instruction
- Update cross-references between skills to forge-relative paths
- Create `packages/forge/src/registry.ts` with ForgeSkillEntry[] listing all 17 skills
- Preserve all existing behavioral instructions in SKILL.md bodies — only frontmatter and language policy block change

**Validation:**

- `packages/forge/src/registry.ts` lists 17 skills and matches files on disk
- Each SKILL.md frontmatter parses against skillFrontmatterSchema

**Completion criterion:** 17 skills relocated to `packages/forge/skills/` with standardized frontmatter

**Human review:** no

---

### Step 3. Create 3 new meta skills

**Goal:** Create skill-create, port-to-forge, forge-bootstrap meta skills in forge.

**Agent actions:**

- Create `packages/forge/skills/meta/skill-create/SKILL.md` — interactive skill that calls `forge.port.scaffold --type skill`
- Create `packages/forge/skills/meta/port-to-forge/SKILL.md` — interactive skill for porting patterns
- Create `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — interactive skill for first-time deployment, calls `forge.init`
- Add 3 meta skills to `packages/forge/src/registry.ts`

**Validation:**

- registry.ts lists 20 skills total (17 + 3)
- Each new SKILL.md frontmatter parses against skillFrontmatterSchema

**Completion criterion:** 3 meta skills created and registered

**Human review:** no

---

### Step 4. Implement forge validators and onboarding commands

**Goal:** Create forge.skill.validate, forge.port.validate, forge.init, forge.port.scaffold command handlers.

**Agent actions:**

- Create `packages/forge/src/validators/skill-validate.ts` — scans ~20 SKILL.md files, checks SKILL-01..SKILL-10 invariants
- Create `packages/forge/src/validators/port-validate.ts` — checks ported skills/commands for project-specific imports
- Create `packages/forge/src/onboarding/init.ts` — forge.init: creates PREFERENCES.md, copies skills to .agents/skills/, creates docs/rfcs/ and docs/adrs/, registers modules in kernel.config.ts, copies rfc-0000-template.md
- Create `packages/forge/src/onboarding/scaffold.ts` — forge.port.scaffold: generates skeleton skill or command
- Export all 4 commands from `packages/forge/src/index.ts`

**Validation:**

- `forge.skill.validate` runs and passes on all 20 skills
- `forge.init --aiLanguage en --documentationLanguage en` works on a clean temp directory
- `forge.port.scaffold --name test-skill --type skill --category shared` creates a valid skeleton

**Completion criterion:** 4 forge OS commands implemented and functional

**Human review:** no

---

### Step 5. Migrate RFC command module to forge

**Goal:** Move rfc.* commands (15 commands) from site-kernel to forge.

**Agent actions:**

- Copy `packages/os/site-kernel/src/rfc/` handler implementations to `packages/forge/os/rfc/`
- Create `packages/forge/os/rfc/rfc.module.ts` exporting `forgeRfcModule: ForgeModule`
- Update imports in handlers: use `@gogol/ontology/operations` for schemas, `@gogol/fingerprint` for hashing, `@gogol/share` for fs helpers
- Delete `packages/os/site-kernel/src/rfc/rfc.module.ts` (or convert to re-export from forge for backward compat during transition)
- Remove `rfcModule` export from `packages/os/site-kernel/src/index.ts`
- Update `packages/os/site-kernel/src/templates/wire/tools/kernel.config.template.ts`: replace `rfcModule` import with `forgeRfcModule` from `@gogol/forge`

**Validation:**

- `pnpm --filter @gogol/forge run build:check` passes
- `pnpm --filter @gogol/site-kernel run build:check` passes (no broken imports)
- `pnpm exec site-kernel run rfc.validate` still works (command registered from forge)

**Completion criterion:** 15 rfc.* commands register from forgeRfcModule

**Human review:** no

---

### Step 6. Migrate workflow command module to forge

**Goal:** Move workflow.* commands (3 commands) from site-kernel to forge.

**Agent actions:**

- Copy `packages/os/site-kernel/src/workflow/` handler implementations to `packages/forge/os/workflow/`
- Create `packages/forge/os/workflow/workflow.module.ts` exporting `forgeWorkflowModule: ForgeModule`
- Delete `packages/os/site-kernel/src/workflow/workflow.module.ts`
- Remove `workflowModule` export from `packages/os/site-kernel/src/index.ts`

**Validation:**

- `pnpm --filter @gogol/forge run build:check` passes
- `pnpm --filter @gogol/site-kernel run build:check` passes

**Completion criterion:** 3 workflow.* commands register from forgeWorkflowModule

**Human review:** no

---

### Step 7. Migrate naming.convention.lint to forge

**Goal:** Move `naming.convention.lint` from site-kernel-checks to forge.

**Agent actions:**

- Copy `naming.convention.lint` handler from `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts` to `packages/forge/os/naming/naming.module.ts`
- Create `forgeNamingModule: ForgeModule` registering only `naming.convention.lint`
- Remove `naming.convention.lint` entry from `ALL_COMMANDS` in `07-structure-naming.ts`
- Add comment pointer: `// naming.convention.lint migrated to @gogol/forge — see packages/forge/os/naming/`
- Keep 7 remaining naming commands in `ALL_COMMANDS` unchanged

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `naming.convention.lint` still works (registered from forgeNamingModule)

**Completion criterion:** `naming.convention.lint` registers from forgeNamingModule; 7 naming commands stay in site-kernel-checks

**Human review:** no

---

### Step 8. Migrate compass commands to forge

**Goal:** Move all 12 compass commands to forge.

**Agent actions:**

- Copy 8 compass command handlers from `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` to `packages/forge/os/compass/compass.module.ts`
- Copy 4 compass command handlers (compass.annotate, compass.clear, compass.markup.migrate, compass.invariant.add) from `packages/os/site-kernel/src/templates/wire/tools/modules/check.module.template.ts` to `packages/forge/os/compass/compass.module.ts`
- Create `forgeCompassModule: ForgeModule` registering all 12 compass commands
- Remove 8 compass entries from `ALL_COMMANDS` in `04-content-quality.ts`
- Add comment pointer in `04-content-quality.ts`: `// compass.* migrated to @gogol/forge — see packages/forge/os/compass/`
- Remove 4 compass registrations from `check.module.template.ts`
- Add comment pointer in `check.module.template.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm --filter @gogol/site-kernel run build:check` passes
- All 12 compass commands still work (registered from forgeCompassModule)

**Completion criterion:** 12 compass.* commands register from forgeCompassModule

**Human review:** no

---

### Step 9. Migrate werkstatt commands to forge

**Goal:** Move werkstatt.* commands (3 commands: lock.status, lock.recover, operation.validate) from site-kernel-handoff to forge.

**Agent actions:**

- Copy werkstatt command handlers from `packages/os/site-kernel-handoff/src/werkstatt/` to `packages/forge/os/werkstatt/`
- Create `packages/forge/os/werkstatt/werkstatt.module.ts` exporting `forgeWerkstattModule: ForgeModule`
- Update handler imports: use `@gogol/ontology/operations` for werkstatt schemas
- Delete `createWerkstattModule` from `packages/os/site-kernel-handoff/src/werkstatt/index.ts`
- Remove `createWerkstattModule` export from `packages/os/site-kernel-handoff/src/index.ts`
- Keep non-module exports (lock.ts, operation.ts, atomic.ts) in site-kernel-handoff — they are used by handoff machinery

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- 3 werkstatt.* commands still work (registered from forgeWerkstattModule)

**Completion criterion:** 3 werkstatt.* commands register from forgeWerkstattModule

**Human review:** no

---

### Step 10. Update all kernel.config.ts files

**Goal:** Update all 3 app kernel.config.ts files and the codegen template to import forge modules.

**Agent actions:**

- In `apps/webgogol-com/tools/kernel.config.ts`:
  - Replace `import { rfcModule } from "@gogol/site-kernel"` with `import { forgeRfcModule, forgeWorkflowModule, forgeCompassModule, forgeNamingModule, forgeWerkstattModule } from "@gogol/forge"`
  - Add forge modules to `modules[]` array (after checkModule, before createOnboardingModule)
  - Remove `rfcModule` from modules[]
- In `apps/nicaragua-projekt/tools/kernel.config.ts`: same changes
- In `apps/check-webgogol-com/tools/kernel.config.ts`: same changes
- In `packages/os/site-kernel/src/templates/wire/tools/kernel.config.template.ts`: same changes

**Validation:**

- `pnpm --filter webgogol-com run build:check` passes
- `pnpm --filter nicaragua-projekt run build:check` passes
- `pnpm --filter check-webgogol-com run build:check` passes
- `pnpm exec site-kernel run rfc.command-lifecycle.validate` passes (all commands still registered)

**Completion criterion:** All kernel.config.ts files import forge modules; all apps build

**Human review:** no

---

### Step 11. Run forge.init to sync skills

**Goal:** Copy 20 forge skills from `packages/forge/skills/` to `.agents/skills/` for IDE discovery.

**Agent actions:**

- Run `pnpm exec site-kernel run forge.init`
- Verify `.agents/skills/<name>/SKILL.md` exists for all 20 forge skills
- Verify `.agents/skills/` still contains 32 third-party skills untouched

**Validation:**

- `forge.skill.validate` passes and confirms .agents/skills/ copies match forge registry

**Completion criterion:** .agents/skills/ contains generated copies of all 20 forge skills

**Human review:** no

---

### Step 12. Update AGENTS.md files

**Goal:** Update root and packages/ AGENTS.md to reference forge.

**Agent actions:**

- In `AGENTS.md` (root): add `@gogol/forge` to monorepo layout description; update skills section to mention forge as source of truth
- In `packages/AGENTS.md`: add forge package rules (skills, OS modules, validators, onboarding)

**Validation:**

- AGENTS.md files are consistent with new package topology

**Completion criterion:** AGENTS.md (root and packages/) updated

**Human review:** no

---

### Step 13. Update docs/*.xml Compass files

**Goal:** Synchronize Compass XML files with new package topology.

**Agent actions:**

- In `docs/technology.xml`: declare `@gogol/forge` package with its dependencies
- In `docs/development-plan.xml`: add forge workflow (skill lifecycle, port-to-forge, forge.init)
- In `docs/source-markup.xml`: add forge source files requiring Compass scaffolding (MODULE_CONTRACT, MODULE_MAP)
- In `docs/knowledge-graph.xml`: add forge package relationships (forge → ontology, forge → fingerprint, forge → share)

**Validation:**

- `pnpm exec site-kernel run compass.validate` passes
- `pnpm exec site-kernel run ecosystem.manifest.validate` passes (if available)

**Completion criterion:** docs/*.xml Compass files updated and validated

**Human review:** no

---

### Step 14. Add forge.skill.validate to PACKAGES_CHECK_PIPELINE

**Goal:** Wire forge.skill.validate into the CI pipeline.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/pipelines/packages-check.ts`: add `forge.skill.validate` to `PACKAGES_CHECK_PIPELINE`

**Validation:**

- `pnpm exec site-kernel run packages.check` passes and includes forge.skill.validate

**Completion criterion:** forge.skill.validate runs in PACKAGES_CHECK_PIPELINE

**Human review:** no

---

### Step 15. Final validation and evidence

**Goal:** Run all validation checks and emit verification evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0374`
- Run `pnpm exec site-kernel run rfc.command-lifecycle.validate`
- Run `pnpm --filter @gogol/forge run build:check`
- Run `pnpm --filter @gogol/site-kernel run build:check`
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check`
- Run `pnpm --filter webgogol-com run build:check`
- Run `pnpm --filter nicaragua-projekt run build:check`
- Run `pnpm --filter check-webgogol-com run build:check`
- Run `pnpm exec site-kernel run forge.skill.validate`
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0374` (RFC-0330)
- Commit evidence file

**Validation:**

- All commands exit 0
- Verification evidence file generated at `docs/rfcs/verification/rfc-0374.generated.json`

**Completion criterion:** All validation passes; evidence file committed

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0374`
- `pnpm --filter @gogol/forge run build:check`
- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter webgogol-com run build:check`
- `pnpm --filter nicaragua-projekt run build:check`
- `pnpm --filter check-webgogol-com run build:check`
- `pnpm exec site-kernel run rfc.command-lifecycle.validate`
- `pnpm exec site-kernel run forge.skill.validate`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0374` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0374.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0374` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Command migration breakage (28+ commands change import paths) | Steps 5-9 migrate one module at a time; Step 10 updates all consumers; Step 15 validates all apps |
| Skill discovery via copy (drift risk) | Step 11 syncs via forge.init; Step 14 adds forge.skill.validate to pipeline for continuous enforcement |
| Frontmatter migration effort (17 skills) | Step 2 uses forge.port.scaffold for frontmatter generation; one-time migration |
| Ontology dependency | Step 1 declares @gogol/ontology as forge dependency; acceptable per RFC risk analysis |
| Pipeline integration (command names unchanged) | Steps 5-9 preserve all command names; pipelines reference names not modules |
| ForgeModule type drift | Step 1 defines ForgeModule with structural compatibility; Step 15 validates build passes |
| Direct imports from site-kernel | Step 10 updates all kernel.config.ts; Step 15 build:check catches missed imports |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-2, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0374 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `workflowModule` or `createWerkstattModule` are found to be imported by code outside `kernel.config.ts` (services, other packages), escalate — the migration plan assumed they were only consumed by kernel.config.ts.
- If `compass.*` commands are found registered outside `ALL_COMMANDS` and `check.module.template.ts`, escalate — the migration plan assumed these were the only two registration sites.
