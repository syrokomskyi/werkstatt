---
rfcId: RFC-0529
planId: PLAN-RFC-0529-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/share"
    - "@gogol/site-kernel-content"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-handoff"
    - "@gogol/ui"
    - "@gogol/pbp"
  services: []
  docs:
    - "packages/share/AGENTS.md"
    - "packages/os/site-kernel-content/AGENTS.md"
    - "packages/os/site-kernel-checks/AGENTS.md"
    - "packages/os/site-kernel-codegen/AGENTS.md"
---

# Implementation Plan: RFC-0529

## Prerequisite

This plan assumes RFC-0527 (content reference index) is already implemented. The index-based resolver (`resolveReferencesInString`, `resolveReferencesDeep`) and the content reference index (`content.ref-index.generate`) must exist before starting. If RFC-0527 is not implemented, stop and implement it first.

## 1. Objectives

- [ ] O1 — `content.ref-migrate` command converts all `{collection.file.field}` patterns to braceless `collection.file.field` in `.md` and `.yaml` files under `src/content/` (frontmatter + body) — maps to acceptance criterion 1, 2
- [ ] O2 — Migrator registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` with migrator-id `RFC-0529` — maps to acceptance criterion 10
- [ ] O3 — All 8 consumers updated to use index-based resolver instead of removed exports — maps to acceptance criteria 3-9
- [ ] O4 — Legacy files deleted: `@gogol/share/content-reference.ts`, `@gogol/site-kernel-content/content-reference.ts`, `@gogol/share/content/substitute-references-in-string.ts`, test file — maps to acceptance criteria 11-14
- [ ] O5 — Validators updated: `content.references.validate` (REF-05), `dist.content-references.validate` (DIST-REF-01, DIST-REF-02) — maps to acceptance criteria 15-16
- [ ] O6 — `content.references.validate` passes on all sites after migration — maps to acceptance criterion 17

## 2. Affected artifacts

### 2.1 Code and commands

**New command:**

- `content.ref-migrate` in `packages/os/site-kernel-codegen/src/` — scans `src/content/**/*.md` and `src/content/**/*.yaml`, replaces `{collection.file.field}` with braceless `collection.file.field`

**New migrator:**

- `packages/os/site-kernel-handoff/src/migrators/rfc-0529.ts` — migrator function
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — register `rfc0529Migrator`

**Updated consumers (8 files):**

- `packages/os/site-kernel-content/src/semantic-loader.ts` — replace `substituteContentReferences` import with `resolveReferencesInString`
- `packages/ui/src/sections/markdown/prose-pipeline.ts` — replace `substituteContentReferences` with `resolveReferencesInString`
- `packages/ui/src/components/section-body/rich/section-rich.astro` — replace `substituteContentReferences` with `resolveReferencesInString`
- `packages/ui/src/content-assets.ts` — pass credit YAML through `resolveReferencesDeep` before `creditByTarget`
- `packages/pbp/src/semantic-model.ts` — replace `substituteContentReferencesInData` with `resolveReferencesDeep`
- `packages/share/src/astro/page-handler/semantic.ts` — replace `substituteContentReferencesInData` with `resolveReferencesDeep`
- `packages/share/src/astro/content.ts` — replace `substituteContentReferencesInData` with `resolveReferencesDeep`
- `packages/os/site-kernel-codegen/src/material-metadata-write.ts` — add `resolveReferencesDeep` (via RFC-0528)

**Updated validators (2 files):**

- `packages/os/site-kernel-checks/src/content-references.ts` — scan for braceless patterns + REF-05 for residual braces
- `packages/os/site-kernel-checks/src/dist-content-references.ts` — DIST-REF-01 (braceless index match) + DIST-REF-02 (brace residual)

**Deleted files (4):**

- `packages/share/src/content-reference.ts`
- `packages/os/site-kernel-content/src/content-reference.ts`
- `packages/share/src/content/substitute-references-in-string.ts`
- `packages/share/src/tests/substitute-references-in-string.test.ts`

**Updated barrel/index files (2):**

- `packages/share/src/index.ts` — remove deprecated re-export of `content-reference.ts` (lines 90-91)
- `packages/os/site-kernel-content/src/index.ts` — remove re-export of `substituteContentReferences` (line 46)

### 2.2 Configuration and data

- All `src/content/**/*.md` and `src/content/**/*.yaml` files across all sites — brace references migrated to braceless

### 2.3 Documentation and specs

- `packages/share/AGENTS.md` — update `@gogol/share/content-reference` subpath entry (removed)
- `packages/os/site-kernel-content/AGENTS.md` — remove `content-reference.ts` from module table
- `packages/os/site-kernel-checks/AGENTS.md` — update `content-references.ts` and `dist-content-references.ts` descriptions
- `packages/os/site-kernel-codegen/AGENTS.md` — add `content.ref-migrate` to command table

### 2.4 Validation and pipelines

- `content.ref-migrate` — new command in `@gogol/site-kernel-codegen`, registered in `tools/kernel.config.ts`
- `content.references.validate` — updated, runs in `sites-check-author` pipeline
- `dist.content-references.validate` — updated, runs in `sites-check-postbuild` pipeline
- `migrator.registry.validate` — must pass after registering RFC-0529 migrator

## 3. Step sequence

### Step 1. Implement `content.ref-migrate` command

**Goal:** Create the migration command that converts brace-delimited references to braceless syntax in content files.

**Agent actions:**

- Create `packages/os/site-kernel-codegen/src/content-ref-migrate.ts` implementing `runContentRefMigrate(input, context)`
- Scan `src/content/**/*.md` and `src/content/**/*.yaml` files
- For each `.md` file: parse frontmatter (YAML) and markdown body separately
- For frontmatter string values: find `{collection.file.field}` patterns (regex `\{([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+)\}`), remove braces. If the entire string value is the reference, also remove surrounding quotes (YAML plain scalar). If embedded in a larger string, keep surrounding text and quotes.
- For markdown body text: find brace patterns, remove braces, preserve surrounding text
- For `.yaml` files: process all string values with the same frontmatter logic
- Write file back only if changes were made (idempotent)
- Register command in `tools/kernel.config.ts` and the codegen module
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- Manual test: run `content.ref-migrate` on a fixture with brace references, verify output is braceless; run again, verify no changes (idempotent)

**Completion criterion:** `content.ref-migrate` command exists, is registered, passes build:check, and is idempotent on fixtures

**Human review:** no

---

### Step 2. Register RFC-0529 migrator

**Goal:** Register the content reference migration as a migrator in the RFC-0479 registry.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0529.ts` exporting `rfc0529Migrator: Migrator`
- The migrator function applies the same brace-removal logic as `content.ref-migrate` to the site's `src/content/` directory
- Add `rfc0529Migrator` to the `migratorRegistry` array in `packages/os/site-kernel-handoff/src/migrators/registry.ts`
- Add `CHANGE_SUMMARY` entry: `RFC-0529: register rfc-0529 content migrator (brace to braceless reference syntax)`
- Create a snapshot test in `packages/os/site-kernel-handoff/src/migrators/` verifying idempotency: `f(f(x)) === f(x)`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec werkstatt run migrator.registry.validate`

**Completion criterion:** Migrator registered, `migrator.registry.validate` passes, idempotency test passes

**Human review:** no

---

### Step 3. Run migration via `mission.migrate` on all sites

**Goal:** Migrate all existing content files from brace syntax to braceless through the canonical migrator path.

**Agent actions:**

- For each site in the fleet: open a mission, run `mission.migrate` which applies the RFC-0529 migrator (registered in Step 2)
- The migrator applies brace-removal to `src/content/**/*.md` and `src/content/**/*.yaml` (frontmatter + body)
- `migratorCursor` in `system.pin.json` is updated with `RFC-0529` after each site's migration
- After migration, verify no file under `src/content/` contains `{` followed by a valid `collection.file.field` pattern
- The `content.ref-migrate` codegen command remains available for manual/ad-hoc execution but is NOT the canonical migration path

**Validation:**

- `grep -r '{[a-z][a-z-]*\.[a-z0-9-/]*\.[a-zA-Z0-9_.-]*}' src/content/` returns no matches across all sites
- Each site's `system.pin.json` has `RFC-0529` in `migratorCursor`

**Completion criterion:** Zero brace-delimited content references remain in any site's `src/content/` directory; all sites have `RFC-0529` in `migratorCursor`

**Human review:** no

---

### Step 4. Update `semantic-loader.ts` consumer

**Goal:** Replace filesystem-based `substituteContentReferences` with index-based `resolveReferencesInString`.

**Agent actions:**

- In `packages/os/site-kernel-content/src/semantic-loader.ts`: replace `import { substituteContentReferences } from "./content-reference.ts"` with import of `resolveReferencesInString` from the RFC-0527 module
- Update all call sites that use `substituteContentReferences` to use `resolveReferencesInString` with the content reference index
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel-content run build:check`

**Completion criterion:** `semantic-loader.ts` no longer imports from `./content-reference.ts`, uses `resolveReferencesInString` instead

**Human review:** no

---

### Step 5. Update `prose-pipeline.ts` and `section-rich.astro` consumers

**Goal:** Replace Astro-based `substituteContentReferences` with index-based `resolveReferencesInString` in UI consumers.

**Agent actions:**

- In `packages/ui/src/sections/markdown/prose-pipeline.ts`: remove `substituteContentReferences` from `@gogol/share` import, add `resolveReferencesInString` from the RFC-0527 module. Update call site at line 108.
- In `packages/ui/src/components/section-body/rich/section-rich.astro`: remove `substituteContentReferences` from `@gogol/share` import (line 21), add `resolveReferencesInString`. Update call site.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` in `prose-pipeline.ts`

**Validation:**

- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** Both files use `resolveReferencesInString` instead of `substituteContentReferences`

**Human review:** no

---

### Step 6. Update `content-assets.ts`, `pbp/semantic-model.ts`, `share/astro/page-handler/semantic.ts`, `share/astro/content.ts` consumers

**Goal:** Replace `substituteContentReferencesInData` with `resolveReferencesDeep` in all data-structure consumers.

**Agent actions:**

- In `packages/ui/src/content-assets.ts`: add `resolveReferencesDeep` call on credit YAML data before passing to `creditByTarget`
- In `packages/pbp/src/semantic-model.ts` (line 33): replace `import { substituteContentReferencesInData } from "@gogol/share/content-reference"` with `resolveReferencesDeep` from the RFC-0527 module. Update call site.
- In `packages/share/src/astro/page-handler/semantic.ts` (line 33): replace `import { substituteContentReferencesInData } from "../../content-reference.ts"` with `resolveReferencesDeep`. Update call site.
- In `packages/share/src/astro/content.ts` (line 18): replace `import { substituteContentReferencesInData } from "../content-reference.ts"` with `resolveReferencesDeep`. Update call site.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` where applicable

**Validation:**

- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/pbp run build:check`
- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** All 4 files use `resolveReferencesDeep` instead of `substituteContentReferencesInData`

**Human review:** no

---

### Step 7. Update `material-metadata-write.ts` consumer

**Goal:** Add `resolveReferencesDeep` to the material metadata writer (via RFC-0528).

**Agent actions:**

- In `packages/os/site-kernel-codegen/src/material-metadata-write.ts`: add `resolveReferencesDeep` call on credit YAML data before using it to write IPTC/XMP metadata
- This step depends on RFC-0528 being implemented; if RFC-0528 is not yet implemented, skip this step and note it as deferred

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`

**Completion criterion:** `material-metadata-write.ts` passes credit YAML through `resolveReferencesDeep` (if RFC-0528 is implemented)

**Human review:** no

---

### Step 8. Update `content.references.validate` validator

**Goal:** Update the author-time validator to scan for braceless patterns and flag residual braces.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/content-references.ts`:
  - Change `REFERENCE_PATTERN` to scan for braceless `collection.file.field` patterns (not brace-delimited)
  - Load the content reference index from the generated file (produced by `content.ref-index.generate` in `build.prepare`, e.g. `src/content-ref-index.generated.json`). The validator runs in `sites-check-author` which executes after `build.prepare`, so the index file is available.
  - Validate each braceless pattern against the index → REF-01/02/03 on failure
  - Add REF-04 warning for ambiguous patterns
  - Add REF-05 error for residual `{...}` brace tokens (new diagnostic)
  - Keep the RFC-0138 advisory for array-index references
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- Run `content.references.validate` on a test site with known references

**Completion criterion:** Validator scans for braceless patterns, validates against index, reports REF-05 for residual braces

**Human review:** no

---

### Step 9. Update `dist.content-references.validate` validator

**Goal:** Update the post-build validator to detect both braceless residuals and brace residuals.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/dist-content-references.ts`:
  - Keep the existing `{...}` brace token scan → rename diagnostic to `DIST-REF-02`
  - Add braceless scan: load the content reference index, scan HTML for `collection.file.field` patterns that exactly match an index entry → `DIST-REF-01` diagnostic
  - Only flag braceless patterns that match a known index entry (reduces false positives)
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- Run `dist.content-references.validate` on a test site's `dist/` directory

**Completion criterion:** Validator reports DIST-REF-02 for brace tokens and DIST-REF-01 for unresolved braceless patterns matching the index

**Human review:** no

---

### Step 10. Delete legacy files and update barrel exports

**Goal:** Remove all legacy resolver code and update barrel re-exports.

**Agent actions:**

- Delete `packages/share/src/content-reference.ts`
- Delete `packages/os/site-kernel-content/src/content-reference.ts`
- Delete `packages/share/src/content/substitute-references-in-string.ts`
- Delete `packages/share/src/tests/substitute-references-in-string.test.ts`
- In `packages/share/src/index.ts`: remove lines 90-91 (deprecated re-export of `content-reference.ts`)
- In `packages/os/site-kernel-content/src/index.ts`: remove line 46 (re-export of `substituteContentReferences`)
- Verify no remaining imports of deleted modules exist: `grep -r "content-reference" packages/ --include="*.ts" --include="*.astro"`

**Validation:**

- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-content run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/pbp run build:check`
- Full monorepo build: `pnpm run build:check`

**Completion criterion:** All 4 files deleted, barrel exports updated, no remaining imports of deleted modules, full monorepo build passes

**Human review:** no

---

### Step 11. Update AGENTS.md files

**Goal:** Synchronize package-level AGENTS.md files with the new module structure.

**Agent actions:**

- `packages/share/AGENTS.md`: update the `@gogol/share/content-reference` subpath entry — mark as removed, or remove the row
- `packages/os/site-kernel-content/AGENTS.md`: remove `content-reference.ts` from the module table
- `packages/os/site-kernel-checks/AGENTS.md`: update `content-references.ts` and `dist-content-references.ts` descriptions to reflect braceless scanning + REF-05/DIST-REF-02
- `packages/os/site-kernel-codegen/AGENTS.md`: add `content.ref-migrate` to the command table

**Validation:**

- Review each AGENTS.md file against the actual code state

**Completion criterion:** All 4 AGENTS.md files updated to reflect the new module structure

**Human review:** no

---

### Step 12. Final validation and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run full validation suite, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0529`
- Run `pnpm exec werkstatt run content.references.validate` on all sites — confirm zero unresolved references and zero residual braces
- Run `pnpm exec werkstatt run migrator.registry.validate`
- Run full monorepo `pnpm run build:check`
- Check off every acceptance criterion in the RFC with inline `(evidence: <file:line>, <test-or-command>)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0529 --implementation-commit <sha> --dry-run` first, then without `--dry-run`
- Run `fo-doc-audit` to sync documentation surfaces

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0529`
- All acceptance criteria verified with evidence

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; documentation synced

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0529`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-content run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/pbp run build:check`
- `pnpm exec werkstatt run migrator.registry.validate`
- `pnpm exec werkstatt run content.references.validate` (on all sites)
- `pnpm exec werkstatt run dist.content-references.validate` (on all sites with dist/)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0529` in the subject line (RFC-0265 commit hygiene)
- Idempotency test for `content.ref-migrate` (fixture-based)
- Idempotency test for RFC-0529 migrator (`f(f(x)) === f(x)`)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Missed files during migration | Step 3 runs `content.ref-migrate` on all sites; Step 8 adds REF-05 diagnostic that catches any residual braces |
| Astro component breakage | Steps 4-6 update all consumers before Step 10 deletes legacy code; build:check after each step |
| Mixed-string false positives | Step 8 adds REF-04 warning for ambiguous patterns; index-based matching in Step 9 reduces false positives |
| YAML plain scalar edge cases | Migration regex restricts characters to YAML-safe set; no additional mitigation needed |
| Sync/async mismatch | Prerequisite check: RFC-0527 must align `resolveReferencesDeep` to async before this plan starts |
| Additional consumer breakage (pbp, astro/page-handler, astro/content) | Step 6 updates all 3 consumers in the same change; build:check after each |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0529 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If RFC-0527 is not yet implemented, stop and implement it first — this plan cannot proceed without the index-based resolver.
- If RFC-0528 is not yet implemented, Step 7 (material-metadata-write.ts) blocks stamping RFC-0529 as `implemented`. All three RFCs (0527, 0528, 0529) are designed as a block — RFC-0529 cannot be stamped `implemented` until Step 7 is complete.
