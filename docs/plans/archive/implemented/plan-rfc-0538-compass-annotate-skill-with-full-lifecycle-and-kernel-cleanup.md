---
rfcId: RFC-0538
planId: PLAN-RFC-0538-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-checks"
    - "@wgogol/forge"
  services: []
  docs:
    - docs/COMMANDS.md
    - docs/architecture-dna.md
    - packages/os/site-kernel-codegen/README.md
    - packages/os/site-kernel-codegen/AGENTS.md
    - packages/os/site-kernel-checks/README.md
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/os/site-kernel-checks/docs/compass-operations.md
---

# Implementation Plan: RFC-0538

## 1. Objectives

- [ ] Objective 1 — Create `fo-compass-annotate` Forge skill with full lifecycle (generate, update, audit, risk, validate, cleanup) — maps to acceptance criteria [1–11]
- [ ] Objective 2 — Add `compass.summary.trim` kernel command (rename + cap raise) and update `compass.changesummary.validate` cap — maps to acceptance criteria [12, 13, 29, 30]
- [ ] Objective 3 — Remove 4 obsolete kernel commands and clean up all references — maps to acceptance criteria [14–18, 31–34]
- [ ] Objective 4 — Extend `forge/bindings@1` schema with `compass` section and update `forge.yaml` — maps to acceptance criteria [19, 32]
- [ ] Objective 5 — Update `forge-bootstrap` and `fo-fix` skills — maps to acceptance criteria [20, 21, 35]
- [ ] Objective 6 — Synchronize all documentation and DNA-42 — maps to acceptance criteria [22–28, 36, 37]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — extend `forgeBindingsSchema` with optional `compass` section
- `packages/forge/src/tests/forge-config.test.ts` — add test for `compass` binding resolution
- `packages/forge/os/compass/compass.module.ts` — remove 4 command registrations, add `compass.summary.trim`
- `packages/os/site-kernel-codegen/src/compass-annotate.ts` — **delete**
- `packages/os/site-kernel-codegen/src/compass-clear.ts` — **delete**
- `packages/os/site-kernel-codegen/src/compass-markup-migrate.ts` — **delete**
- `packages/os/site-kernel-codegen/src/compass-invariant-add.ts` — **delete**
- `packages/os/site-kernel-codegen/src/index.ts` — remove 4 exports (lines 58–64)
- `packages/os/site-kernel-checks/src/compass-change-summary.ts` — rename to `compass-summary-trim.ts`, change command name to `compass.summary.trim`, raise cap from 3 unprotected to 30 total, update fix hints
- `packages/os/site-kernel-checks/src/compass.ts` — update fix hints (line 237: `compass.markup.migrate` → `fo-compass-annotate` skill)
- `packages/os/site-kernel-checks/src/pipelines/standard-compass.ts` — remove `compass.markup.migrate` and `compass.annotate` steps
- `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` — no compass commands here (they're in `extraCommands`), verify no stale imports
- `forge.yaml` — add `compass.fileExtensions` and `compass.testPatterns` bindings

### 2.2 Configuration and data

- `forge.yaml` — new `bindings.compass` section
- `.agents/skills/fo-compass-annotate/SKILL.md` — new skill definition
- `.agents/skills/fo-compass-annotate/templates/header-prompt.md` — LLM prompt template
- `.agents/skills/fo-compass-annotate/templates/audit-prompt.md` — semantic audit prompt
- `.agents/skills/fo-compass-annotate/templates/header-format.md` — canonical format reference
- `.agents/skills/fo-compass-annotate/reference/risk-patterns.md` — deterministic risk patterns
- `.agents/skills/fo-compass-annotate/reference/comment-styles.md` — extension → comment style mapping
- `.agents/skills/fo-compass-annotate/reference/learned-principles.md` — operator preferences

### 2.3 Documentation and specs

- `docs/COMMANDS.md` — regenerate (remove 4 commands, rename tidy→trim)
- `docs/architecture-dna.md` — update DNA-42 enforcement command list
- `packages/os/site-kernel-codegen/README.md` — remove 4 command docs
- `packages/os/site-kernel-codegen/AGENTS.md` — remove 4 command docs
- `packages/os/site-kernel-checks/README.md` — remove wiring examples for 4 commands
- `packages/os/site-kernel-checks/AGENTS.md` — remove `compass.annotate` example
- `packages/os/site-kernel-checks/docs/compass-operations.md` — remove 4 command docs, update tidy→trim
- `.agents/skills/forge-bootstrap/SKILL.md` — add project detection step
- `.agents/skills/fo-fix/SKILL.md` — add step 4.5 (compass header update)

### 2.4 Validation and pipelines

- `STANDARD_COMPASS_PIPELINE` — remove `compass.markup.migrate` and `compass.annotate` steps
- `forge.skill.validate` — must pass on `fo-compass-annotate` skill
- `rfc.validate` — must pass on RFC-0538
- `build:check` — must pass on all 3 affected packages

## 3. Step sequence

### Step 1. Extend `forge/bindings@1` schema with `compass` section

**Goal:** Add optional `compass` binding section to the Zod schema so `loadForgeConfig` recognizes `fileExtensions` and `testPatterns`.

**Agent actions:**

- Edit `packages/forge/src/config/forge-config.ts`: add `compass: z.object({ fileExtensions: z.array(z.string()).optional(), testPatterns: z.array(z.string()).optional() }).optional()` to `forgeBindingsSchema`.
- Update `ForgeBindings` interface to include the `compass` field.
- Add test in `packages/forge/src/tests/forge-config.test.ts`: verify `resolveBinding(config, "compass.fileExtensions")` returns the array.
- Add test: verify config with `compass` section passes `forgeBindingsSchema.safeParse`.

**Validation:**

- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge test`

**Completion criterion:** `forgeBindingsSchema` accepts a config with `compass.fileExtensions` and `compass.testPatterns`; `resolveBinding` returns the values; tests pass.

**Human review:** no

---

### Step 2. Add `compass.summary.trim` kernel command (rename + cap raise)

**Goal:** Rename `compass.changesummary.tidy` to `compass.summary.trim`, raise cap from 3 unprotected to 30 total, update fix hints.

**Agent actions:**

- Rename `packages/os/site-kernel-checks/src/compass-change-summary.ts` to `compass-summary-trim.ts`.
- Update command name from `compass.changesummary.tidy` to `compass.summary.trim` in the handler.
- Change `MAX_UNPROTECTED_ITEMS = 3` to `MAX_TOTAL_ITEMS = 30` and update the cap logic from `unprotectedCount > 3` to `totalItems > 30`.
- Update the fallback item text from `"Tidied by compass.changesummary.tidy; ..."` to `"Tidied by compass.summary.trim; ..."`.
- Update `compass.changesummary.validate` (COMPASS-CS-02) cap from 3 unprotected to 30 total to match.
- Update fix hints in `compass-change-summary.ts` (now `compass-summary-trim.ts`): change `"run compass.changesummary.tidy"` to `"run compass.summary.trim"`.
- Update all imports referencing the old filename.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks test`

**Completion criterion:** `compass.summary.trim` command registered with 30-total cap; `compass.changesummary.validate` uses same 30-total cap; fix hints reference `compass.summary.trim`; tests pass.

**Human review:** no

---

### Step 3. Remove 4 obsolete kernel commands

**Goal:** Delete `compass.annotate`, `compass.clear`, `compass.markup.migrate`, `compass.invariant.add` and clean up all references.

**Agent actions:**

- Delete `packages/os/site-kernel-codegen/src/compass-annotate.ts`.
- Delete `packages/os/site-kernel-codegen/src/compass-clear.ts`.
- Delete `packages/os/site-kernel-codegen/src/compass-markup-migrate.ts`.
- Delete `packages/os/site-kernel-codegen/src/compass-invariant-add.ts`.
- Edit `packages/os/site-kernel-codegen/src/index.ts`: remove 4 exports (lines 58–64).
- Edit `packages/forge/os/compass/compass.module.ts`: remove registrations for 4 commands; add `compass.summary.trim` registration.
- Edit `packages/os/site-kernel-checks/src/pipelines/standard-compass.ts`: remove `compass.markup.migrate` and `compass.annotate` steps.
- Edit `packages/os/site-kernel-checks/src/compass.ts`: update fix hint at line 237 from `"run compass.markup.migrate"` to `"run fo-compass-annotate skill"`.
- Check for any remaining imports of the deleted files and fix them.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @wgogol/forge run build:check`
- `grep -r "compass.annotate\|compass.clear\|compass.markup.migrate\|compass.invariant.add\|compass.changesummary.tidy" packages/ --include="*.ts"` — verify no stale references in source

**Completion criterion:** 4 source files deleted; 0 imports of deleted modules; 0 command registrations for removed commands; `STANDARD_COMPASS_PIPELINE` has 3 steps (inventory, validate, changesummary.validate); all 3 packages pass `build:check`.

**Human review:** no

---

### Step 4. Create `fo-compass-annotate` Forge skill

**Goal:** Create the skill directory structure with `SKILL.md`, templates, and reference files.

**Agent actions:**

- Create `.agents/skills/fo-compass-annotate/SKILL.md` with frontmatter (`name`, `description`, `invocation: user`, `category: fo`, `concerns: content-mutation`, `bindings` referencing `forge.yaml bindings.compass.*`).
- Write pipeline steps in `SKILL.md`: discover files, per-file processing (generate/update/audit/risk), batch-end validation, cleanup, report.
- Create `.agents/skills/fo-compass-annotate/templates/header-prompt.md` — LLM prompt for header generation.
- Create `.agents/skills/fo-compass-annotate/templates/audit-prompt.md` — LLM prompt for semantic audit.
- Create `.agents/skills/fo-compass-annotate/templates/header-format.md` — canonical MODULE_CONTRACT + CHANGE_SUMMARY format.
- Create `.agents/skills/fo-compass-annotate/reference/risk-patterns.md` — deterministic risk patterns (sign, crypto, vault, migrate, publish, etc.).
- Create `.agents/skills/fo-compass-annotate/reference/comment-styles.md` — extension → comment style mapping table.
- Create `.agents/skills/fo-compass-annotate/reference/learned-principles.md` — empty starter for operator preferences.

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --skill fo-compass-annotate`

**Completion criterion:** Skill directory exists with all 7 files; `forge.skill.validate` passes.

**Human review:** no

---

### Step 5. Update `forge.yaml` with compass bindings

**Goal:** Add the `compass` binding section to the repo's `forge.yaml`.

**Agent actions:**

- Edit `forge.yaml`: add `compass:` section under `bindings:` with `fileExtensions: [".ts", ".astro"]` and `testPatterns: ["*.test.ts", "*.spec.ts", "**/test/**", "**/tests/**"]`.

**Validation:**

- `pnpm exec werkstatt run forge.doctor` — bindings check passes

**Completion criterion:** `forge.yaml` has `bindings.compass.fileExtensions` and `bindings.compass.testPatterns`; `forge.doctor` passes.

**Human review:** no

---

### Step 6. Update `forge-bootstrap` skill

**Goal:** Add project detection step to `forge-bootstrap`.

**Agent actions:**

- Edit `.agents/skills/forge-bootstrap/SKILL.md`: add new step between Language selection (step 1) and Verify prerequisites (step 2): "Project detection — scan for package.json, tsconfig.json, Cargo.toml, etc. Determine stack. Show detected profile, ask operator to confirm. Propose `compass.fileExtensions` and `compass.testPatterns` based on confirmed profile."

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --skill forge-bootstrap`

**Completion criterion:** `forge-bootstrap` SKILL.md has project detection step; `forge.skill.validate` passes.

**Human review:** no

---

### Step 7. Update `fo-fix` skill with step 4.5

**Goal:** Add compass header update step to the `fo-fix` pipeline.

**Agent actions:**

- Edit `.agents/skills/fo-fix/SKILL.md`: add step 4.5 between step 4 (Commit the fixes) and step 5 (Documentation audit): "Step 4.5: Update Compass headers — invoke `fo-compass-annotate` for files changed in the current session. Separate commit: `compass: update headers for changed files`."

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --skill fo-fix`

**Completion criterion:** `fo-fix` SKILL.md has step 4.5; `forge.skill.validate` passes.

**Human review:** no

---

### Step 8. Update documentation

**Goal:** Synchronize all documentation surfaces with the command removals, rename, and new skill.

**Agent actions:**

- Update `docs/COMMANDS.md`: remove entries for `compass.annotate`, `compass.clear`, `compass.markup.migrate`, `compass.invariant.add`, `compass.changesummary.tidy`; add entry for `compass.summary.trim`; update `compass.changesummary.validate` description (cap changed to 30 total).
- Update `docs/architecture-dna.md`: DNA-42 enforcement command list — remove `compass.markup.migrate`, `compass.changesummary.tidy`, `compass.invariant.add`; add `compass.summary.trim` and `fo-compass-annotate` skill.
- Update `packages/os/site-kernel-codegen/README.md`: remove 4 command rows from the table, remove usage examples, remove wiring example.
- Update `packages/os/site-kernel-codegen/AGENTS.md`: remove 4 command rows from the table.
- Update `packages/os/site-kernel-checks/README.md`: remove wiring examples for 4 removed commands.
- Update `packages/os/site-kernel-checks/AGENTS.md`: remove `compass.annotate` from example code.
- Update `packages/os/site-kernel-checks/docs/compass-operations.md`: remove 4 command docs, update `compass.changesummary.tidy` references to `compass.summary.trim`, update cap description.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.

**Validation:**

- `grep -r "compass.annotate\|compass.clear\|compass.markup.migrate\|compass.invariant.add\|compass.changesummary.tidy" docs/ packages/os/ --include="*.md"` — verify no stale references in docs (except archived RFCs)

**Completion criterion:** All 7 doc files updated; 0 stale references to removed/renamed commands in non-archived docs.

**Human review:** no

---

### Step 9. Final validation and stamp

**Goal:** Run all validation checks, verify acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0538`.
- Run `pnpm --filter @gogol/site-kernel-codegen run build:check`.
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`.
- Run `pnpm --filter @wgogol/forge run build:check`.
- Run `pnpm exec werkstatt run forge.skill.validate` (all skills).
- Check off every acceptance criterion in the RFC with `[x]` and inline `(evidence: ...)` annotations.
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0538` (RFC-0330).
- Commit evidence file.
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0538 --implementation-commit <sha>`.

**Validation:**

- `git status` — clean
- `rfc.validate` — zero errors
- All 3 packages pass `build:check`
- `forge.skill.validate` — passes

**Completion criterion:** All acceptance criteria marked `[x]` with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; `git status` clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0538`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @gogol/site-kernel-codegen test`
- `pnpm --filter @gogol/site-kernel-checks test`
- `pnpm --filter @wgogol/forge test`
- `pnpm exec werkstatt run forge.skill.validate`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0538` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0538.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0538` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| LLM quality variance | Step 4: skill templates constrain output; batch-end `compass.validate` + autorretry |
| Skill portability | Step 5: `forge.yaml` bindings for extensions; comment-style defaults in reference file |
| Pipeline integration surprise | Step 7: separate commit for header updates, visible in git log |
| `compass.summary.trim` cap change | Step 2: forward-only, no backward compatibility for layer A |
| `compass.changesummary.validate` cap change | Step 2: cap aligned to 30 total, fix hint updated to reference `compass.summary.trim` |
| Removed commands break existing scripts | Step 3: forward-only policy; all references cleaned in same RFC |
| `forge/bindings@1` schema extension | Step 1: Zod schema updated before `forge.yaml` is modified |
| `compass.validate` TODO(compass) sentinel check | Step 3: fix hint updated to reference skill; skill replaces sentinels on first run |
| Performance: skill scan cost | Step 4: `--changed` and `--file` flags limit scan scope |
| Concurrent execution | Step 4: batch-end validate + autorretry catches conflicts; not a regression |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-42, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0538 --reason "..." --invariant "DNA-42"` instead of working around it.
- If the `forge/bindings@1` schema cannot be extended without a major version bump, create a superseding RFC for `forge/bindings@2`.
- **Migrator note:** RFC-0538 declares `versionBump: minor` which under RFC-0478 (currently `draft`, not implemented) would require a migrator. Since RFC-0478 is not yet active, no migrator is registered in this plan. When RFC-0478 is implemented, a migrator may need to be registered for RFC-0538 to handle the `compass.changesummary.tidy` → `compass.summary.trim` rename in any site configs or scripts that reference the old command name.
