---
rfcId: RFC-0475
planId: PLAN-RFC-0475-01
status: draft
owner: architecture
createdAt: 2026-07-21
updatedAt:
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/faq"
    - "@gogol/share"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-onboarding"
  services: []
  docs:
    - docs/requirements.xml
    - docs/technology.xml
    - docs/verification-plan.xml
    - packages/AGENTS.md
    - packages/faq/AGENTS.md
---

# Implementation Plan: RFC-0475

## 1. Objectives

- [ ] O1 — Create `@gogol/faq` package with Zod schema, collection factory, loaders, and semantic mapping helper (maps to acceptance: package-level criteria)
- [ ] O2 — Add `faq.validate` command to `site-kernel-checks` and wire into `sites-check-author` pipeline (maps to acceptance: validator-level criteria)
- [ ] O3 — Update `content.config.ts` and `astro.config.mjs` templates to include FAQ collection by default (maps to acceptance: template-level criteria)
- [ ] O4 — Recover 12 legacy FAQ files (6 DE + 6 UK) to `systems/webgogol-com/src/content/faq/{lang}/` with claims-sidecar migration (maps to acceptance: site-level criteria)
- [ ] O5 — Update Compass XML and AGENTS.md documentation (maps to acceptance: documentation-level criteria)
- [ ] O6 — Verify build and validation pass (maps to acceptance: `faq.validate` passes, `pnpm --filter webgogol-com build` succeeds, `rfc.validate` passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/faq/package.json` — new package manifest
- `packages/faq/tsconfig.json` — TypeScript config
- `packages/faq/turbo.json` — Turborepo config
- `packages/faq/src/index.ts` — public API re-exports
- `packages/faq/src/schema.ts` — Zod schema (`faqSchema`, `FaqEntry`, `FaqGovernance`)
- `packages/faq/src/astro.ts` — `createFaqCollection`, `getFaqEntries`, `getFaqEntriesByTags`, `toSemanticFaqEntries`
- `packages/faq/AGENTS.md` — package agent guide
- `packages/faq/README.md` — package readme
- `packages/os/site-kernel-checks/src/faq.ts` — `runFaqValidate` command handler
- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — register `faq.validate` command entry
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — add `faq.validate` to pipeline
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts` — add FAQ collection
- `packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts` — add FAQ collection
- `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs` — add `@gogol/faq` to `optimizeDeps.exclude`
- `packages/AGENTS.md` — add `faq` row to ownership table

### 2.2 Configuration and data

- `systems/webgogol-com/src/content/faq/de/*.md` — 6 DE FAQ files (recovered from git history `ce8e6f7ee~1`)
- `systems/webgogol-com/src/content/faq/uk/*.md` — 6 UK FAQ files (recovered from git history `ce8e6f7ee~1`)
- `systems/webgogol-com/src/content/faq/de/df-start.md` — governance block with `fieldClaims.question`
- `systems/webgogol-com/src/content/faq/uk/df-start.md` — governance block with `fieldClaims.question`

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0475-pluggable-faq-content-module-and-content-recovery.md` — RFC (read-only reference)
- `docs/audits/audit-rfc-0475-pluggable-faq-content-module-and-content-recovery.md` — audit report (read-only reference)
- `docs/requirements.xml` — add FAQ collection requirement
- `docs/technology.xml` — add `@gogol/faq` package
- `docs/verification-plan.xml` — add `faq.validate` to verification flow
- `packages/AGENTS.md` — ownership table update
- `packages/faq/AGENTS.md` — new package agent guide

### 2.4 Validation and pipelines

- `sites-check-author` pipeline — add `faq.validate` step
- `pnpm --filter @gogol/faq build:check` — package build verification
- `pnpm --filter webgogol-com build` — site build verification
- `pnpm exec site-kernel run rfc.validate --id RFC-0475` — RFC mechanical validation

## 3. Step sequence

### Step 1. Scaffold `@gogol/faq` package

**Goal:** Create the package directory structure with manifest, configs, and empty source files.

**Agent actions:**

- Create `packages/faq/package.json` with `name: "@gogol/faq"`, `dependencies: { zod: "^4.4.3", "@gogol/content-source": "workspace:*", "@gogol/share": "workspace:*" }`, `exports` map for `.` and `./astro`
- Create `packages/faq/tsconfig.json` extending `../../tsconfig/base.json`
- Create `packages/faq/turbo.json` with build task
- Create `packages/faq/README.md` with brief description

**Validation:**

- `pnpm install` resolves the new workspace package without errors
- `ls packages/faq/` shows `package.json`, `tsconfig.json`, `turbo.json`, `README.md`

**Completion criterion:** `packages/faq/package.json` exists and `pnpm install` succeeds.

**Human review:** no

---

### Step 2. Implement Zod schema and types

**Goal:** Create the FAQ content schema with strict validation and optional governance block.

**Agent actions:**

- Create `packages/faq/src/schema.ts` with:
  - `faqGovernanceSchema` — `z.object({ fieldClaims: z.record(...) }).optional()`
  - `faqSchema` — `z.object({ slug, question, answer, order?, tags?, governance? }).loose()`
  - `FaqEntry` and `FaqGovernance` types via `z.infer`
- Create `packages/faq/src/index.ts` re-exporting `faqSchema`, `FaqEntry`, `FaqGovernance` from `./schema.ts`

**Validation:**

- `pnpm --filter @gogol/faq build:check` passes (typecheck)
- Schema accepts legacy FAQ frontmatter shape (slug, question, answer, order, tags)

**Completion criterion:** `packages/faq/src/schema.ts` exports `faqSchema` with `.loose()`, `FaqEntry`, `FaqGovernance`.

**Human review:** no

---

### Step 3. Implement Astro collection factory and loaders

**Goal:** Create the collection factory and loader functions that sites use.

**Agent actions:**

- Create `packages/faq/src/astro.ts` with:
  - `createFaqCollection()` — returns `{ faq: defineCollection({ loader: fsDataCollectionLoader({ base: "src/content/faq", generateId: toDataEntryId }), schema: faqSchema }) }`
  - `getFaqEntries(lang)` — loads entries for language, sorts by `order` (default 999)
  - `getFaqEntriesByTags(lang, tags)` — filters by tags
  - `toSemanticFaqEntries(entries)` — maps `FaqEntry[]` to `SemanticFaqEntry[]` (slug → id)
- Import `getCollection` from `@gogol/content-source/astro` (not `astro:content` directly)
- Import `SemanticFaqEntry` type from `@gogol/share/semantic`

**Validation:**

- `pnpm --filter @gogol/faq build:check` passes
- `createFaqCollection()` returns object with `faq` key

**Completion criterion:** `packages/faq/src/astro.ts` exports `createFaqCollection`, `getFaqEntries`, `getFaqEntriesByTags`, `toSemanticFaqEntries`.

**Human review:** no

---

### Step 4. Implement `faq.validate` command

**Goal:** Create the FAQ content validator in `site-kernel-checks`.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/faq.ts` with `runFaqValidate` function:
  - Accepts `(input: KernelCommandInput, context: KernelRuntimeContext)`
  - No-op pass when `src/content/faq/` directory does not exist
  - Validates: required fields (`slug`, `question`, `answer`), `order` type, `tags` type, `governance` structure, duplicate slugs per language
  - Does NOT enforce mirroring (follows `people.validate` precedent)
  - Uses `parseMarkdownFrontmatter` from `@gogol/site-kernel-content` (same as `people.ts`)
  - Returns `passResult` or `resultFromViolations`
- Add Compass MODULE_CONTRACT and CHANGE_SUMMARY headers
- Register in `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts`:
  - Import `runFaqValidate`
  - Add command entry: `name: "faq.validate"`, `scope: "app"`, `supportsAllSites: true`, `reads: ["<app>/src/content/faq/**/*.md"]`
- Add to pipeline in `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`:
  - Add `{ command: "faq.validate" }` after `people.validate`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check` passes
- `faq.validate` no-ops when `src/content/faq/` is absent

**Completion criterion:** `faq.validate` command registered, passes on sites without FAQ, validates FAQ files when present.

**Human review:** no

---

### Step 5. Update content.config.ts templates

**Goal:** Add FAQ collection to both codegen and onboarding templates.

**Agent actions:**

- Edit `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts`:
  - Add `import { createFaqCollection } from "@gogol/faq/astro";`
  - Add `const faq = createFaqCollection();`
  - Add `...faq,` to `collections` export
- Edit `packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts`:
  - Same changes as above

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen build:check` passes
- `pnpm --filter @gogol/site-kernel-onboarding build:check` passes
- Both templates contain `createFaqCollection` import and `...faq` spread

**Completion criterion:** Both `content.config.template.ts` files include FAQ collection.

**Human review:** no

---

### Step 6. Regenerate site content.config.ts

**Goal:** Update the live site's `content.config.ts` from the updated template.

**Agent actions:**

- Run `pnpm exec site-kernel run routes.generate --site webgogol-com` to regenerate `content.config.ts` from the updated codegen template
- Verify the generated file contains `createFaqCollection` import and `...faq` spread

**Validation:**

- `grep "createFaqCollection" systems/webgogol-com/src/content.config.ts` returns match
- `grep "...faq" systems/webgogol-com/src/content.config.ts` returns match

**Completion criterion:** `systems/webgogol-com/src/content.config.ts` includes FAQ collection.

**Human review:** no

---

### Step 7. Update astro.config template

**Goal:** Add `@gogol/faq` to `optimizeDeps.exclude` in the onboarding template.

**Agent actions:**

- Edit `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs`:
  - Add `"@gogol/faq",` to the `optimizeDeps.exclude` array (after `"@gogol/content-source",` or in alphabetical order)
- Do NOT change `ssr.noExternal` — already covered by `/^@gogol\//` regex

**Validation:**

- `pnpm --filter @gogol/site-kernel-onboarding build:check` passes
- Template contains `"@gogol/faq"` in `optimizeDeps.exclude`

**Completion criterion:** `astro.config.template.mjs` includes `@gogol/faq` in `optimizeDeps.exclude`.

**Human review:** no

---

### Step 8. Recover DE FAQ content

**Goal:** Restore 6 German FAQ files from git history.

**Agent actions:**

- Extract 6 DE FAQ files from `ce8e6f7ee~1:apps/webgogol-com/src/content/business/de/faq/`:
  - `df-baukasten.md`, `df-kuendigung.md`, `df-start.md`, `df-vertrag.md`, `df-wer-dahinter.md`, `warum-abonnement.md`
- Write to `systems/webgogol-com/src/content/faq/de/`
- Preserve original frontmatter (`slug`, `question`, `answer`, `order`, `tags`) and body content

**Validation:**

- `ls systems/webgogol-com/src/content/faq/de/` shows 6 `.md` files
- Each file has required frontmatter fields

**Completion criterion:** 6 DE FAQ files exist at `systems/webgogol-com/src/content/faq/de/`.

**Human review:** no

---

### Step 9. Recover UK FAQ content

**Goal:** Restore 6 Ukrainian FAQ files from git history.

**Agent actions:**

- Extract 6 UK FAQ files from `ce8e6f7ee~1:apps/webgogol-com/src/content/business/uk/faq/`:
  - Same filenames as DE
- Write to `systems/webgogol-com/src/content/faq/uk/`
- Preserve Ukrainian text as primary source

**Validation:**

- `ls systems/webgogol-com/src/content/faq/uk/` shows 6 `.md` files
- Each file has required frontmatter fields with Ukrainian content

**Completion criterion:** 6 UK FAQ files exist at `systems/webgogol-com/src/content/faq/uk/`.

**Human review:** no

---

### Step 10. Migrate claims-sidecar to governance block

**Goal:** Add `governance.fieldClaims.question` block to `df-start.md` (DE + UK).

**Agent actions:**

- Extract claims metadata from `ce8e6f7ee~1:apps/webgogol-com/src/content/business/de/faq/df-start.claims.yaml`:
  - `question: { provenance: asserted, asOf: "2026-01-01", confidence: high }`
- Add `governance` block to `systems/webgogol-com/src/content/faq/de/df-start.md` frontmatter
- Add same `governance` block to `systems/webgogol-com/src/content/faq/uk/df-start.md` frontmatter
- Do NOT create `.claims.yaml` sidecar files

**Validation:**

- `grep "governance" systems/webgogol-com/src/content/faq/de/df-start.md` returns match
- `grep "governance" systems/webgogol-com/src/content/faq/uk/df-start.md` returns match
- `grep "fieldClaims" systems/webgogol-com/src/content/faq/de/df-start.md` returns match

**Completion criterion:** Both `df-start.md` files contain `governance.fieldClaims.question` block.

**Human review:** no

---

### Step 11. Update documentation

**Goal:** Update AGENTS.md ownership table, create `packages/faq/AGENTS.md`, update Compass XML.

**Agent actions:**

- Add `faq` row to `packages/AGENTS.md` ownership table
- Create `packages/faq/AGENTS.md` with scope, public API, content location, validation, non-goals
- Update `docs/requirements.xml` — add FAQ collection requirement
- Update `docs/technology.xml` — add `@gogol/faq` package
- Update `docs/verification-plan.xml` — add `faq.validate` to verification flow

**Validation:**

- `packages/AGENTS.md` contains `faq` in ownership table
- `packages/faq/AGENTS.md` exists with required sections
- Compass XML files contain FAQ references

**Completion criterion:** All documentation files updated with FAQ references.

**Human review:** no

---

### Step 12. Run validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0475` — must pass
- Run `pnpm --filter @gogol/faq build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel-checks build:check` — must pass
- Run `pnpm exec site-kernel run faq.validate --site webgogol-com` — must pass
- Run `pnpm --filter webgogol-com build` — must succeed
- Fix any failures

**Validation:**

- All commands exit 0
- No validation errors

**Completion criterion:** All validation commands pass.

**Human review:** no

---

### Step 13. Commit and sync

**Goal:** Commit all changes and sync to mirror.

**Agent actions:**

- `git add` only files created/modified in this session
- Commit with message: `feat: RFC-0475 pluggable FAQ content module and content recovery`
- Run `sternsystem.sync --id webgogol-com` to push to mirror (manual operator action — recommend in output)

**Validation:**

- `git status` shows clean working tree
- Commit references RFC-0475

**Completion criterion:** All changes committed, mirror sync recommended.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0475`
- `pnpm --filter @gogol/faq build:check`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm exec site-kernel run faq.validate --site webgogol-com`
- `pnpm --filter webgogol-com build`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0475` in the subject line (RFC-0265 commit hygiene)
- `faq.validate` pass output as evidence for acceptance criterion
- `pnpm --filter webgogol-com build` success as evidence for acceptance criterion

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `createFaqCollection` factory does not work with `defineCollection` outside site context | Step 3 follows the exact PBP pattern (`pbpCollections` object with `defineCollection`) |
| Strict Zod schema rejects legacy FAQ files with missing fields | Step 2 uses `.loose()` and makes `order`/`tags`/`governance` optional |
| `faq.validate` false-positives on sites without FAQ | Step 4 implements no-op pass when `src/content/faq/` is absent (same as `people.validate`) |
| `@gogol/faq` not added to `optimizeDeps.exclude` causes `.ts` extension error | Step 6 adds `@gogol/faq` to `optimizeDeps.exclude` in onboarding template |
| FAQ semantic layer in `@gogol/share` expects different type shape | Step 3 implements `toSemanticFaqEntries` mapping function (slug → id) |
| Build fails after recovery | Step 11 runs full build verification and fixes failures |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0475 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `createFaqCollection` cannot be called outside site context (unlike PBP pattern), escalate to a new RFC proposing a different integration mechanism.
- If legacy FAQ files contain fields incompatible with strict Zod schema even with `.loose()`, escalate to amend RFC-0475 schema.
