---
rfcId: RFC-0470
planId: PLAN-RFC-0470-01
status: draft
owner: architecture
createdAt: 2026-07-20
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/business"
    - "@gogol/pbp"
    - "@gogol/share"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-onboarding"
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/AGENTS.md
    - packages/pbp/AGENTS.md
---

# Implementation Plan: RFC-0470

## 1. Objectives

- [ ] Objective 1 — Move `recordClaimsSchema`, `claimAnnotationSchema`, `PERSON_AFFILIATIONS` from `@gogol/business/schemas` to `@gogol/share/schemas` (maps to acceptance: "recordClaimsSchema and claimAnnotationSchema moved" + "PERSON_AFFILIATIONS moved")
- [ ] Objective 2 — Move `buildPageSemanticModel` from `@gogol/business` to `@gogol/pbp` (maps to acceptance: "buildPageSemanticModel moved to @gogol/pbp")
- [ ] Objective 3 — Update all 7 `@gogol/site-kernel-checks` files to import from `@gogol/share/schemas` instead of `@gogol/business/schemas` (maps to acceptance: "All 7 site-kernel-checks files updated")
- [ ] Objective 4 — Update `content-business.ts` to remove `getBusinessSchema` import, use `pbpSchemaById` only (maps to acceptance: "content-business.ts updated")
- [ ] Objective 5 — Replace `businessCollections` with `pbpCollections` in codegen and onboarding templates (maps to acceptance: "businessCollections replaced in templates")
- [ ] Objective 6 — Update `packages/AGENTS.md` and `packages/pbp/AGENTS.md` to reflect migration (maps to acceptance: "packages/AGENTS.md updated" + "packages/pbp/AGENTS.md updated")

**Out of scope for this plan (preconditions for deletion, not covered here):**

- Migration of 329 content references (`{business.*}`) in page prose and frontmatter
- Creation of separate FAQ and people content collections
- Deletion of `packages/business/` directory
- Deletion of `systems/warpgogol-com/src/content/business/` directory
- Removal of `@gogol/business` from `package.json` dependencies
- DNA-20 supersession in `docs/architecture-dna.md`
- Git tag `pbp-legacy-deleted`

These remain as a follow-up execution phase after content migration is complete.

## 2. Affected artifacts

### 2.1 Code and commands

**New files:**

- `packages/share/src/schemas/claims.ts` — `claimAnnotationSchema`, `recordClaimsSchema`, `ClaimAnnotation`, `RecordClaims` (copied from `packages/business/src/schemas/claims.ts`)
- `packages/share/src/schemas/person.ts` — `PERSON_AFFILIATIONS`, `PersonAffiliation` (copied from `packages/business/src/schemas/person.ts`)
- `packages/pbp/src/semantic-model.ts` — `buildPageSemanticModel` (moved from `packages/business/src/semantic-model.ts`)

**Modified files:**

- `packages/share/src/schemas/index.ts` — re-export claims and person schemas
- `packages/os/site-kernel-checks/src/content-claims.ts` — change import from `@gogol/business/schemas` to `@gogol/share/schemas`
- `packages/os/site-kernel-checks/src/content-derived.ts` — same
- `packages/os/site-kernel-checks/src/comparative-claims.ts` — same
- `packages/os/site-kernel-checks/src/content-freshness.ts` — same
- `packages/os/site-kernel-checks/src/content-plan.ts` — same
- `packages/os/site-kernel-checks/src/content-source-binding.ts` — same
- `packages/os/site-kernel-checks/src/source-monitor.ts` — same
- `packages/os/site-kernel-checks/src/people.ts` — change `PERSON_AFFILIATIONS` import to `@gogol/share/schemas`
- `packages/os/site-kernel-checks/src/content-business.ts` — remove `getBusinessSchema` import, use `pbpSchemaById` only
- `packages/pbp/src/semantic-profile.ts` — export `buildPageSemanticModel` from local `./semantic-model.ts` instead of re-export from `@gogol/business`
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts` — replace `businessCollections` with `pbpCollections`
- `packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts` — replace `businessCollections` with `pbpCollections`
- `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` — update `content.business.validate` description

**NOT modified (out of scope):**

- `systems/warpgogol-com/src/content.config.ts` — still uses `businessCollections` until content references are migrated
- `systems/warpgogol-com/src/pages/*.astro` — still import from `@gogol/business` until content references are migrated
- `packages/business/` — NOT deleted in this plan phase

### 2.2 Configuration and data

- `packages/share/package.json` — no new dependencies needed (zod already present)
- `packages/pbp/package.json` — may need `@gogol/site-kernel-content` if not already a dependency (for `emitPipelineLogEvent`)

### 2.3 Documentation and specs

- `packages/AGENTS.md` — update `@gogol/business` row to note migration in progress, update `@gogol/pbp` row
- `packages/pbp/AGENTS.md` — update critical rule to note migration in progress
- `packages/share/AGENTS.md` — add claims and person schemas to the schemas entry point description

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/share run build:check` — verify new schemas compile
- `pnpm --filter @gogol/pbp run build:check` — verify `buildPageSemanticModel` compiles in new location
- `pnpm --filter @gogol/pbp run test` — verify PBP tests pass
- `pnpm --filter @gogol/business run test` — verify business tests still pass (package not deleted yet)
- `pnpm --filter @gogol/site-kernel-checks run build:check` — verify updated imports compile
- `pnpm -r run test` — full test suite

## 3. Step sequence

### Step 1. Copy claims schema to @gogol/share/schemas

**Goal:** Move `recordClaimsSchema` and `claimAnnotationSchema` from `@gogol/business/schemas` to `@gogol/share/schemas`.

**Agent actions:**

- Copy `packages/business/src/schemas/claims.ts` to `packages/share/src/schemas/claims.ts`
- Update `packages/share/src/schemas/index.ts` to re-export `claimAnnotationSchema`, `recordClaimsSchema`, `ClaimAnnotation`, `RecordClaims`
- Verify no import from `@gogol/business` remains in the new file

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `packages/share/src/schemas/claims.ts` exists and exports `recordClaimsSchema`, `claimAnnotationSchema`, `ClaimAnnotation`, `RecordClaims`. `@gogol/share/schemas` re-exports them.

**Human review:** no

---

### Step 2. Copy PERSON_AFFILIATIONS to @gogol/share/schemas

**Goal:** Move `PERSON_AFFILIATIONS` and `PersonAffiliation` from `@gogol/business/schemas` to `@gogol/share/schemas`.

**Agent actions:**

- Create `packages/share/src/schemas/person.ts` with `PERSON_AFFILIATIONS` constant and `PersonAffiliation` type
- Update `packages/share/src/schemas/index.ts` to re-export them
- Do NOT copy the full `personSchema` — only the affiliation vocabulary (the full schema is business-layer specific)

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `packages/share/src/schemas/person.ts` exists and exports `PERSON_AFFILIATIONS`, `PersonAffiliation`. `@gogol/share/schemas` re-exports them.

**Human review:** no

---

### Step 3. Update @gogol/site-kernel-checks imports

**Goal:** Switch all 8 files in `@gogol/site-kernel-checks` from `@gogol/business/schemas` to `@gogol/share/schemas`.

**Agent actions:**

- Update `content-claims.ts`: `import { recordClaimsSchema, type ClaimAnnotation } from "@gogol/share/schemas"`
- Update `content-derived.ts`: `import { recordClaimsSchema } from "@gogol/share/schemas"`
- Update `comparative-claims.ts`: `import { recordClaimsSchema } from "@gogol/share/schemas"`
- Update `content-freshness.ts`: `import { recordClaimsSchema } from "@gogol/share/schemas"`
- Update `content-plan.ts`: `import { recordClaimsSchema } from "@gogol/share/schemas"`
- Update `content-source-binding.ts`: `import { recordClaimsSchema } from "@gogol/share/schemas"`
- Update `source-monitor.ts`: `import { recordClaimsSchema } from "@gogol/share/schemas"`
- Update `people.ts`: `import { PERSON_AFFILIATIONS } from "@gogol/share/schemas"`
- Update `content-business.ts`: remove `import { getBusinessSchema } from "@gogol/business/dispatcher"`, use `pbpSchemaById` only (already imported)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `grep -r "@gogol/business" packages/os/site-kernel-checks/src/ --include="*.ts"` returns 0 results (excluding comment-only references)

**Completion criterion:** No code import from `@gogol/business` in `packages/os/site-kernel-checks/src/`. All schemas imported from `@gogol/share/schemas`.

**Human review:** no

---

### Step 4. Move buildPageSemanticModel to @gogol/pbp

**Goal:** Move `buildPageSemanticModel` from `packages/business/src/semantic-model.ts` to `packages/pbp/src/semantic-model.ts`.

**Agent actions:**

- Copy `packages/business/src/semantic-model.ts` to `packages/pbp/src/semantic-model.ts`
- Update imports in the new file:
  - `buildSiteSemanticProfile` import from `./semantic-profile.ts` → remove (not needed, PBP uses `buildPbpSemanticProfile`)
  - `getBusinessFaqEntries` from `./loaders.ts` → inline a simple FAQ loader or make it optional (FAQ content may not exist after migration)
  - `DEFAULT_LANGUAGE_CODE` from `./loaders.ts` → define locally as `"de"` or import from `@gogol/share`
  - `astroSemanticReader` → keep as-is (reads from `astro:content`)
- Update `packages/pbp/src/semantic-profile.ts`:
  - Replace `export { buildPageSemanticModel } from "@gogol/business"` with `export { buildPageSemanticModel } from "./semantic-model.ts"`
  - Replace `export { buildPageSemanticModel as buildPbpPageSemanticModel } from "@gogol/business"` with local export
- Verify `packages/pbp/package.json` has `@gogol/site-kernel-content` dependency (for `emitPipelineLogEvent`)
- Verify `packages/pbp/package.json` has `@gogol/share` dependency (for `buildSemanticPageModelWith`, types)

**Validation:**

- `pnpm --filter @gogol/pbp run build:check`
- `pnpm --filter @gogol/pbp run test`

**Completion criterion:** `packages/pbp/src/semantic-model.ts` exists. `@gogol/pbp/semantic-profile` exports `buildPageSemanticModel` from local module. No import from `@gogol/business` in `packages/pbp/src/`.

**Human review:** no

---

### Step 5. Update codegen and onboarding templates

**Goal:** Replace `businessCollections` with `pbpCollections` in codegen and onboarding templates.

**Agent actions:**

- Update `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts`:
  - Replace `import { businessCollections } from "@gogol/business/astro"` with `import { pbpCollections } from "@gogol/pbp/astro"`
  - Replace `...businessCollections` with `...pbpCollections` in the collections export
- Update `packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts`:
  - Same replacement
- Update `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`:
  - Update `content.business.validate` description to reference PBP schemas instead of `@gogol/business`

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-onboarding run build:check`

**Completion criterion:** No import from `@gogol/business` in codegen or onboarding templates. Templates use `pbpCollections` from `@gogol/pbp/astro`.

**Human review:** no

---

### Step 6. Update documentation

**Goal:** Update AGENTS.md files to reflect the migration progress.

**Agent actions:**

- Update `packages/AGENTS.md`:
  - `@gogol/business` row: add note "Migration in progress — schemas being moved to @gogol/share, buildPageSemanticModel moved to @gogol/pbp. Package will be deleted after content reference migration (RFC-0470)."
  - `@gogol/pbp` row: update to mention `buildPageSemanticModel` is now exported from `@gogol/pbp/semantic-profile`
  - `@gogol/share` row: add `claims.ts` and `person.ts` schemas to the schemas entry point description
- Update `packages/pbp/AGENTS.md`:
  - Add `buildPageSemanticModel` to the runtime layer export paths table
  - Update critical rule to note migration is in progress

**Validation:**

- Visual review of AGENTS.md changes

**Completion criterion:** AGENTS.md files reflect the new locations of migrated code.

**Human review:** no

---

### Step 7. Full validation and commit

**Goal:** Verify all changes compile and tests pass, then commit.

**Agent actions:**

- Run `pnpm --filter @gogol/share run build:check`
- Run `pnpm --filter @gogol/pbp run build:check`
- Run `pnpm --filter @gogol/pbp run test`
- Run `pnpm --filter @gogol/business run test` (business package still exists, should still pass)
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` (if available)
- Run `pnpm -r run test` (full suite)
- Verify `grep -rn 'from "@gogol/business' packages/ --include="*.ts" | grep -v "packages/business/" | grep -v "node_modules"` returns only `packages/pbp/src/cutover-check.ts` (which references `@gogol/business` in a string check, not an import)
- Commit all changes with message referencing RFC-0470

**Validation:**

- All build:check commands pass
- All test suites pass
- grep verification shows no code imports from `@gogol/business` outside `packages/business/` (excluding `systems/warpgogol-com` which is out of scope)

**Completion criterion:** All builds and tests pass. Commit is created.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/pbp run build:check`
- `pnpm --filter @gogol/pbp run test`
- `pnpm --filter @gogol/business run test`
- `pnpm -r run test`
- `grep -rn 'from "@gogol/business' packages/ --include="*.ts" | grep -v "packages/business/" | grep -v "node_modules"` — verify only cutover-check string references remain

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0470` in the subject line
- No verification evidence file needed (RFC-0470 has no acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Missed import from @gogol/business | Step 7 grep verification catches any remaining imports |
| FAQ/people content loss | Out of scope — content migration is a separate phase. Business package is NOT deleted in this plan. |
| buildPageSemanticModel dependency on getBusinessFaqEntries | Step 4 inlines or makes FAQ loader optional. Business package still exists as fallback. |
| content.business.validate breaks | Step 5 updates command description. Step 3 removes getBusinessSchema import. |
| Other sites break | Out of scope — warpgogol-com is the only site. Other sites don't exist yet. |

## 6. Escalation triggers

- If moving `buildPageSemanticModel` reveals a circular dependency between `@gogol/pbp` and `@gogol/business`, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0470 --reason "circular dependency discovered"` instead of working around it.
- If `recordClaimsSchema` has hidden dependencies on other business schemas (beyond zod), escalate rather than partial-copy.
