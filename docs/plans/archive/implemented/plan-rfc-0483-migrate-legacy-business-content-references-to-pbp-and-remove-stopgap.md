---
rfcId: RFC-0483
planId: PLAN-RFC-0483-01
status: draft
owner: architecture
createdAt: 2026-07-22
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel-codegen"
  services: []
  docs:
    - docs/rfcs/rfc-0483-migrate-legacy-business-content-references-to-pbp-and-remove-stopgap.md
    - docs/authoring/site-composition.md
---

# Implementation Plan: RFC-0483

## 1. Objectives

- [ ] O1 — Update `content.config.template.ts` to remove the `business` collection definition — maps to acceptance criterion "business collection is removed from content.config.ts"
- [ ] O2 — Create `rfc-0483` migrator that replaces all 60 `{business.*}` reference patterns with `{business-profile.*}` equivalents — maps to acceptance criterion "All 329 {business.\*} references are replaced"
- [ ] O3 — Migrator creates missing `de/` PBP entities by copying from `uk/` equivalents — maps to acceptance criteria for de/ entities
- [ ] O4 — Migrator populates `presentation.*` fields on `de/` PBP entities from legacy `business/de/*.md` data — maps to acceptance criteria for presentation fields
- [ ] O5 — Migrator removes `business` collection from workpiece `content.config.ts` and deletes `src/content/business/` directory — maps to acceptance criteria for directory deletion and collection removal
- [ ] O6 — Register migrator in `migratorRegistry` — maps to acceptance criterion "Migrator registered"
- [ ] O7 — Write PBT idempotency test (`f(f(x)) == f(x)`) — maps to acceptance criterion "Migrator is idempotent"
- [ ] O8 — Write snapshot test covering all 60 reference patterns — maps to acceptance criterion "Migrator has a snapshot test"
- [ ] O9 — Update `docs/authoring/site-composition.md` to reference `business-profile/` instead of `business/` — maps to acceptance criterion for site-composition update
- [ ] O10 — Pass `build:check`, `test`, `migrator.registry.validate`, and `rfc.validate` — maps to acceptance criterion "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts` — **Edit** — remove `business` collection definition (lines 77-85) and `business,` from collections export
- `packages/os/site-kernel-handoff/src/migrators/yaml-utils.ts` — **Create** — shared YAML helpers extracted from `rfc-0481.ts` (parseFrontmatter, serializeFrontmatter, parseSimpleYaml, etc.)
- `packages/os/site-kernel-handoff/src/migrators/rfc-0481.ts` — **Edit** — import YAML helpers from `yaml-utils.ts` instead of defining them locally
- `packages/os/site-kernel-handoff/src/migrators/rfc-0483.ts` — **Create** — migrator implementation
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — **Edit** — add `rfc0483Migrator` to `migratorRegistry` array
- `packages/os/site-kernel-handoff/src/migrators/rfc-0483.pbt.test.ts` — **Create** — PBT idempotency test
- `packages/os/site-kernel-handoff/src/migrators/rfc-0483.snapshot.test.ts` — **Create** — snapshot test reading from canonical `systems/warpgogol-com/src/content/`

### 2.2 Configuration and data

- `systems/warpgogol-com/src/content.config.ts` — **Regenerate** — via `routes.generate` after template update (removes broken `@gogol/business` import and `...businessCollections` spread)
- Workpiece `src/content.config.ts` — **Migrator edit** — removes local `business` collection definition
- Workpiece `src/content/business/` — **Migrator delete** — entire directory
- Workpiece `src/content/business-profile/de/**` — **Migrator create/edit** — new PBP entities + presentation fields
- Workpiece `src/content/**/*.md` — **Migrator edit** — 329 `{business.*}` → `{business-profile.*}` replacements

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0483-migrate-legacy-business-content-references-to-pbp-and-remove-stopgap.md` — read-only reference (accepted)
- `docs/authoring/site-composition.md` — **Edit** — update `src/content/business/` references to `src/content/business-profile/` and `src/content/people/` (lines 136, 159, 188, 448)
- `systems/warpgogol-com/AGENTS.md` — **Post-mission** — regenerate via `agents.generate` after `mission.reconcile` (see Post-mission steps below)
- `systems/warpgogol-com/src/content/AGENTS.md` — **Post-mission** — regenerate via `agents.generate` after `mission.reconcile`
- No `docs/*.xml` Compass sync needed (verified by grep — no references to `business` content collection)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-handoff build:check` — scoped tsc
- `pnpm --filter @gogol/site-kernel-handoff test` — vitest including new tests
- `pnpm --filter @gogol/site-kernel-codegen build:check` — scoped tsc for template change
- `pnpm exec werkstatt run migrator.registry.validate` — registry validation
- `pnpm exec werkstatt run rfc.validate RFC-0483` — RFC validation

## 3. Step sequence

### Step 1. Update content.config.template.ts — remove business collection

**Goal:** Remove the `business` collection definition from the codegen template so `routes.generate` no longer emits it.

**Agent actions:**

- Edit `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts`
- Remove the `business` collection definition block (lines 77-85: comment + `const business = defineCollection(...)`)
- Remove `business,` from the `export const collections` object
- Remove the `import { businessCollections } from "@gogol/business/astro"` line if present (the template uses a local definition, not an import — verify)

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen build:check` passes (tsc --noEmit)

**Completion criterion:** Template file has no `business` collection definition, tsc passes.

**Human review:** no

---

### Step 2. Regenerate canonical warpgogol-com content.config.ts

**Goal:** Regenerate `systems/warpgogol-com/src/content.config.ts` from the updated template to remove the broken `@gogol/business` import.

**Agent actions:**

- Run `pnpm exec werkstatt run routes.generate --site warpgogol-com`
- Verify the regenerated file no longer contains `business` collection or `@gogol/business` import
- Verify it still contains `...pbpCollections`, `system`, `pages`, `prose`, `site`, `navigation`, `people`, `...faq`

**Validation:**

- `pnpm --filter warpgogol-com exec astro check` passes (scoped typecheck)

**Completion criterion:** `systems/warpgogol-com/src/content.config.ts` has no `business` collection or `@gogol/business` import.

**Human review:** no

---

### Step 3. Extract YAML helpers and create migrator implementation

**Goal:** Extract shared YAML helpers to `yaml-utils.ts`, update `rfc-0481.ts` to import from it, then create `rfc-0483.ts` with the migrator.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/yaml-utils.ts`
  - Move `parseFrontmatter`, `parseSimpleYaml`, `parseYamlBlock`, `getIndent`, `stripQuotes`, `serializeFrontmatter`, `serializeObject`, `needsQuoting`, `yamlValue`, `escapeYamlString` from `rfc-0481.ts`
  - Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding
  - Export all functions
- Edit `packages/os/site-kernel-handoff/src/migrators/rfc-0481.ts`
  - Remove local definitions of the extracted helpers
  - Import from `./yaml-utils.ts`
  - Verify existing tests still pass
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0483.ts`
  - Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding
  - Import `Migrator`, `SternsystemData`, `MigrationContext`, `MigrationError` from `./types.ts`
  - Import YAML helpers from `./yaml-utils.ts`
  - Import `readLocalesSafe` from `rfc-0481.ts` (or extract to `yaml-utils.ts` if cleaner)
  - Implement the mapping table as a `const REFERENCE_MAPPINGS: Record<string, string>` with all 60 entries
- Implement `transform(data, ctx)`:
  1. Read locales from `system.md` (reuse `readLocalesSafe` pattern from rfc-0481.ts)
  2. Scan all `.md` files under `src/content/` for `{business.*}` references (excluding fenced code blocks, inline code, HTML comments)
  3. For each reference, look up in `REFERENCE_MAPPINGS` — throw `MigrationError` if no mapping found
  4. Replace all references and write updated files
  5. For each locale (especially `de/`): create missing PBP entities by copying from `uk/` equivalents
  6. Read legacy `business/{lang}/*.md` files and populate `presentation.*` fields on corresponding PBP entities
  7. Remove `business` collection from `content.config.ts` (remove `business,` from collections export and the `const business = defineCollection(...)` block)
  8. Delete `src/content/business/` directory (fail-safe: only if no `{business.*}` references remain in any `.md` file)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes (tsc --noEmit)
- `pnpm --filter @gogol/site-kernel-handoff test` passes (existing rfc-0481 tests still pass after yaml-utils extraction)

**Completion criterion:** `yaml-utils.ts` exists, `rfc-0481.ts` imports from it, `rfc-0483.ts` exists and exports `rfc0483Migrator`, tsc + existing tests pass.

**Human review:** no

---

### Step 4. Register migrator in registry

**Goal:** Add `rfc0483Migrator` to `migratorRegistry` in `registry.ts`.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/migrators/registry.ts`
- Import `rfc0483Migrator` from `./rfc-0483.ts`
- Add to `migratorRegistry` array after `rfc0481Migrator` (ordered by RFC-id numeric)
- Add `CHANGE_SUMMARY` entry: `RFC-0483: register rfc-0483 content migrator (reference migration + stopgap removal)`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm exec werkstatt run migrator.registry.validate` passes

**Completion criterion:** `migratorRegistry` includes `rfc0483Migrator`, registry validation passes.

**Human review:** no

---

### Step 5. Write PBT idempotency test

**Goal:** Create `rfc-0483.pbt.test.ts` proving `f(f(x)) == f(x)`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0483.pbt.test.ts`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding
- Use `fast-check` to generate random workpiece states with:
  - Random `{business.*}` references from the 60 known patterns in `.md` files
  - Random `business/{lang}/*.md` legacy files with valid frontmatter
  - Existing `business-profile/{lang}/` with some PBP entities
- Create temp directory with system.md, business/, business-profile/, content.config.ts, and .md files with references
- Run migrator twice, assert:
  - All output files are identical between first and second run
  - No `{business.*}` references remain after first run
  - `business/` directory is deleted after first run
  - Second run is a no-op (no errors, no file changes)
- Follow the pattern from `rfc-0481.pbt.test.ts` (temp dir, `withTempWorkpiece` helper)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes (including new PBT test)

**Completion criterion:** PBT test passes, idempotency proven for random inputs.

**Human review:** no

---

### Step 6. Write snapshot test

**Goal:** Create `rfc-0483.snapshot.test.ts` that reads real content from `systems/warpgogol-com/src/content/`, runs the migrator, and verifies correct output.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0483.snapshot.test.ts`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding
- Read real content from `systems/warpgogol-com/src/content/` at test time:
  - Copy `business/de/` and `business/uk/` with all legacy files
  - Copy `business-profile/uk/` with all PBP entities
  - Copy `business-profile/de/` with existing entities (business.md, organization/legal-identity.md, organization/brand.md, web.md, company.md, contact.md, location.md)
  - Copy `.md` files from `pages/de/`, `prose/de/`, `funnel/de/` that contain `{business.*}` references
  - Copy `content.config.ts` with local `business` collection definition
  - Create temp workpiece from this real data
- Run migrator on temp workpiece
- Verify:
  - No `{business.*}` references remain in any `.md` file (grep assertion)
  - All 60 unique `{business.*}` patterns have been replaced (verify by checking that `{business-profile.*}` references now exist for each mapping)
  - `de/contact/general-email.md` created with `schema: pbp/contact-point@1`
  - `de/places/backnang.md` created
  - `de/web/primary.md` created (replacing old `de/web.md`)
  - `de/offerings/*.md` created (6 files)
  - `de/catalog/*.md` created (7 files)
  - `de/policies/*.md` created (11 files)
  - `de/documents/*.md` created (4 files)
  - `de/organization/legal-identity.md` has `presentation.tax.*` fields
  - `de/business.md` has `presentation.externalServices.chatbotPlatform` field
  - `business/` directory deleted
  - `content.config.ts` has no `business` collection
  - Old-format `de/web.md`, `de/company.md`, `de/contact.md`, `de/location.md` deleted
  - Second run is a no-op (idempotent)
- Verify `MigrationError` is thrown when an unmapped `{business.unknown}` reference is present

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff test` passes (including snapshot test)

**Completion criterion:** Snapshot test passes, all 60 patterns verified, idempotency on real data confirmed.

**Human review:** no

---

### Step 7. Update docs/authoring/site-composition.md

**Goal:** Update hand-maintained documentation to reference `business-profile/` instead of `business/`.

**Agent actions:**

- Edit `docs/authoring/site-composition.md`
- Line 136: update `src/content/business/<lang>/assets/` → `src/content/business-profile/<lang>/assets/`
- Line 159: update `src/content/business/**` → `src/content/people/**` (author references for people records)
- Line 188: update `src/content/business/<lang>/people/<slug>.md` → `src/content/people/<lang>/<slug>.md`
- Line 448: update `src/content/business/{lang}/assets/**` → `src/content/business-profile/{lang}/assets/**`
- Search for any other references to `src/content/business/` in the file and update them

**Validation:**

- `grep -rn "src/content/business/" docs/authoring/site-composition.md` returns no results (excluding `business-profile/`)

**Completion criterion:** No stale `src/content/business/` references in site-composition.md.

**Human review:** no

---

### Step 8. Run full validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm --filter @gogol/site-kernel-codegen build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff test`
- Run `pnpm exec werkstatt run migrator.registry.validate`
- Run `pnpm exec werkstatt run rfc.validate RFC-0483`
- Fix any failures

**Validation:**

- All commands exit 0

**Completion criterion:** All 5 commands pass.

**Human review:** no

---

### Step 9. Stamp implemented and commit

**Goal:** Transition RFC to `implemented` and commit all changes.

**Agent actions:**

- Set `status: implemented` and `implementedAt: 2026-07-22` in RFC frontmatter
- Check all acceptance criteria checkboxes with evidence
- Run `pnpm exec werkstatt run rfc.validate RFC-0483` to confirm
- Commit all files: template edit, migrator, registry edit, tests, RFC status change, site-composition update
- Commit message: `feat(rfc-0483): implement legacy business content reference migrator and stopgap removal`

**Validation:**

- `rfc.validate` passes with `status: implemented`

**Completion criterion:** RFC is `implemented`, all changes committed.

**Human review:** no

---

## Post-mission steps (operator actions after mission.reconcile)

After `mission.reconcile` transfers the workpiece commits to the canonical system (including the deletion of `src/content/business/`), the operator should:

1. Run `pnpm exec werkstatt run agents.generate --site warpgogol-com` to regenerate `systems/warpgogol-com/AGENTS.md` and `systems/warpgogol-com/src/content/AGENTS.md`
2. Verify no stale `src/content/business/` references remain in GENERATED files
3. Commit the regenerated AGENTS.md files

These steps cannot be performed during implementation because the canonical `src/content/business/` directory still exists until mission reconcile transfers the deletion.

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @gogol/site-kernel-codegen build:check` — tsc --noEmit (template change)
- `pnpm --filter @gogol/site-kernel-handoff build:check` — tsc --noEmit (migrator code)
- `pnpm --filter @gogol/site-kernel-handoff test` — vitest (PBT + snapshot)
- `pnpm exec werkstatt run migrator.registry.validate` — registry validation
- `pnpm exec werkstatt run rfc.validate RFC-0483` — RFC validation

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0483` in the subject line (RFC-0265 commit hygiene)
- PBT test output proving idempotency
- Snapshot test output showing all 60 reference patterns correctly mapped
- `rfc.validate` output showing status: pass

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Mapping table completeness (60 patterns) | Step 6 snapshot test covers all 60 patterns; `MigrationError` for unmapped patterns is the fail-safe |
| Agent misinterpretation risk | Step 3 migrator throws `MigrationError` for unmapped patterns; Step 8 validation catches unresolved references |
| de/ translation quality | Migrator copies uk/ files to de/ locations; operator reviews during "operator edits" step (not agent-automated) |
| Content reference path depth (nested PBP paths) | Step 6 snapshot test verifies nested paths like `organization/legal-identity` resolve correctly |
| Meta dates distribution | Step 6 snapshot test verifies per-document `presentation.dates.*` fields |
| Template regeneration re-adding business collection | Step 1 removes business collection from template; Step 2 regenerates canonical file |
| False positives in code blocks/comments | Step 3 migrator skips fenced code blocks, inline code, and HTML comments |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0483 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the content.config.template.ts change reveals that other sites depend on the `business` collection, assess whether a separate RFC is needed for multi-site migration.
- If the migrator cannot handle the `content.config.ts` GENERATED marker (RFC-0081 regenerate-on-marker semantics), assess whether the template change alone is sufficient and the migrator should skip `content.config.ts` edits.
