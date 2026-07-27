---
rfcId: RFC-0504
planId: PLAN-RFC-0504-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
    - "@gogol/ui"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/requirements.xml
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/ontology/AGENTS.md
---

# Implementation Plan: RFC-0504

## 1. Objectives

- [ ] Objective 1 — Add three new block types (`article-header`, `toc`, `changelog`) to the archetype registry with cosmic names `Himalia`, `Metis`, `Prometheus` — maps to acceptance criterion "block types registered in archetypes/index.yaml"
- [ ] Objective 2 — Rewrite `bakeRatgeberArticle` to emit the 12-section layout with article-header, TOC, articleSections extraction, changelog, and three-tier CTA — maps to acceptance criterion "bakeRatgeberArticle emits 12-section layout"
- [ ] Objective 3 — Add RG-ART-07..10 validation rules to `ratgeber.article.validate` — maps to acceptance criteria for RG-ART-07, 08, 09, 10
- [ ] Objective 4 — Create and register migrator `rfc-0504` with PBT and snapshot tests — maps to acceptance criterion "migrator registered and transforms existing records"
- [ ] Objective 5 — Create UI components for `article-header`, `toc`, `changelog` in `@gogol/ui` — maps to acceptance criterion "UI components created"
- [ ] Objective 6 — Synchronize documentation (AGENTS.md, Compass XML) — maps to acceptance criterion "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/archetypes/index.yaml` — add `blockTypeToCosmicName` and `roleByCosmicName` entries for `article-header` → `Himalia`, `toc` → `Metis`, `changelog` → `Prometheus`
- `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` — rewrite to emit 12-section layout
- `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` — add RG-ART-07..10 rules
- `packages/os/site-kernel-handoff/src/migrators/rfc-0504.ts` — new migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — register `rfc-0504`
- `packages/os/site-kernel-handoff/src/migrators/rfc-0504.pbt.test.ts` — PBT test
- `packages/os/site-kernel-handoff/src/migrators/rfc-0504.snapshot.test.ts` — snapshot test
- `packages/os/site-kernel-handoff/src/tests/migrators.test.ts` — update registry count assertion
- `packages/ui/src/components/article-header/` — new UI component (`.astro`, `.css`, `.manifest.yaml`)
- `packages/ui/src/components/toc/` — new UI component
- `packages/ui/src/components/changelog/` — new UI component

### 2.2 Configuration and data

- `packages/ontology/archetypes/index.yaml` — archetype registry extension
- Article frontmatter schema — add optional `articleSections`, `changelog`, `secondaryCta` fields (Zod loose)

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — document RG-ART-07..10, 12-section baker layout
- `packages/ontology/AGENTS.md` — document three new block types
- `docs/verification-plan.xml` — add RG-ART-07..10 checks
- `docs/requirements.xml` — update: new frontmatter fields, new block types
- `docs/technology.xml` — update: baker changes, new migrator, new UI components
- `docs/knowledge-graph.xml` — update: RFC-0504 relationships

### 2.4 Validation and pipelines

- `ratgeber.article.validate` — extended with RG-ART-07..10, runs in `build.check` (blocking)
- `migrator.registry.validate` — must pass after registering `rfc-0504`
- `rfc.validate RFC-0504` — must pass
- `pnpm --filter @gogol/ontology build:check` — must pass after archetype registry changes
- `pnpm --filter @gogol/site-kernel-checks build:check` — must pass after baker and validator changes
- `pnpm --filter @gogol/site-kernel-handoff build:check` — must pass after migrator changes

## 3. Step sequence

### Step 1. Add block types to archetype registry

**Goal:** Register `article-header`, `toc`, `changelog` block types in the ontology archetype registry with cosmic names.

**Agent actions:**

- Edit `packages/ontology/archetypes/index.yaml`: add to `blockTypeToCosmicName`:
  - `article-header: Himalia`
  - `toc: Metis`
  - `changelog: Prometheus`
- Add to `roleByCosmicName`:
  - `Himalia: article-metadata-header`
  - `Metis: table-of-contents`
  - `Prometheus: changelog-history`
- Verify `Himalia`, `Metis`, `Prometheus` are in `PlanetCatalog` (they are — confirmed in audit).

**Validation:**

- `pnpm --filter @gogol/ontology build:check`

**Completion criterion:** `archetypes/index.yaml` contains the three new `blockTypeToCosmicName` and `roleByCosmicName` entries; `build:check` passes.

**Human review:** no

---

### Step 2. Add frontmatter field validation to article validator

**Goal:** Add validation logic for optional `articleSections`, `changelog`, `secondaryCta` frontmatter fields in `ratgeber.article.validate`.

**Agent actions:**

- The article frontmatter is parsed loosely via `parseMarkdownFrontmatter` — there is no separate Zod schema for article records. The validator reads fields directly from `data`.
- In `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts`, add field validation logic:
  - `articleSections`: if present, must be an array of strings from the valid slot set.
  - `changelog`: if present, must be an array of objects with `date`, `summary`, `authorId`.
  - `secondaryCta`: if present, must be an object with `label`, `target`.
- These checks are implemented as part of RG-ART-08, RG-ART-09, RG-ART-10 in Step 4. This step establishes the field reading and type-narrowing logic that Step 4 builds on.
- The fields remain optional — existing articles without them continue to pass validation.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check`

**Completion criterion:** Validator reads and type-narrows the three new optional frontmatter fields; `build:check` passes.

**Human review:** no

---

### Step 3. Rewrite bakeRatgeberArticle for 12-section layout

**Goal:** Replace the current 5-block baker with the 12-section layout: breadcrumbs → article-header → direct-answer → TOC → main analysis → practical tool → limitations → Webgogol connection → sources → authorship/review → changelog → contextual next step (CTA).

**Agent actions:**

- Rewrite `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts`:
  - Replace `hero` block with `article-header` block (cosmicName: `Himalia`) carrying: category, title (H1), summary, articleType, author name, reviewedAt, readTime.
  - Add `toc` block (cosmicName: `Metis`) after article-header — auto-generated from H2 headings in prose body.
  - When `articleSections` is present, extract named sections from prose body using the slot-to-H2 mapping table and render as separate blocks.
  - When `articleSections` is absent, render prose body as a single `markdown` block (Hyperion).
  - Add `changelog` block (cosmicName: `Prometheus`) before the CTA block when `changelog` frontmatter is present.
  - Enhance CTA block to support three tiers: primary (articleType-specific), secondary (optional `secondaryCta` frontmatter), tertiary (fixed `/kontakt/`).
  - Preserve existing FAQ blocks, related articles, and provenance footer (RFC-0502).
- Implement H2 extraction helper: pure function that parses markdown, extracts H2 headings, and returns TOC entries. Skip fenced code blocks and HTML comments.
- Implement section extraction helper: pure function that extracts the content between an H2 heading and the next H2 heading.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check`

**Completion criterion:** `bakeRatgeberArticle` emits 12 blocks in the correct order; `build:check` passes.

**Human review:** no

---

### Step 4. Add RG-ART-07..10 validation rules

**Goal:** Extend `ratgeber.article.validate` with four new validation rules.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts`:
  - **RG-ART-07**: Check prose body for H1 headings (`^# ` outside fenced code blocks and HTML comments). Error severity.
  - **RG-ART-08**: Check `articleSections` entries are from the valid set (`direct-answer`, `definitions`, `analysis`, `example`, `checklist`, `limitations`, `sources`, `webgogol-connection`). Error severity.
  - **RG-ART-09**: Check `changelog` entries have `date`, `summary`, `authorId`; `authorId` must resolve to an author record (reuse RFC-0502's author resolution). Error severity.
  - **RG-ART-10**: Check `secondaryCta.target` is a valid internal URL (starts with `/` or `#`). Error severity.
- Implement H1 detection that skips fenced code blocks (`...`) and HTML comments (`<!-- ... -->`).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check`

**Completion criterion:** All four rules implemented and produce correct diagnostics; `build:check` passes.

**Human review:** no

---

### Step 5. Create and register migrator rfc-0504

**Goal:** Create the `rfc-0504` migrator that transforms existing article records and register it in the migrator registry.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0504.ts`:
  - `id: "rfc-0504"`
  - `transform`: For each article record:
    - Add `articleSections: []` if absent.
    - Add `changelog: []` if absent.
    - Strip H1 headings from prose bodies: remove H1 headings that duplicate the article `title`; convert unique H1 headings to H2, unless an H2 with the same text already exists (remove the H1 to avoid duplicates).
  - Must be a pure idempotent function (DNA-41, RFC-0479).
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0504.pbt.test.ts`:
  - Property: `f(f(x)) === f(x)` (idempotency).
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0504.snapshot.test.ts`:
  - Snapshot test on representative article data.
- Register in `packages/os/site-kernel-handoff/src/migrators/registry.ts`:
  - Import `rfc0504Migrator` and add to `migratorRegistry` array.
  - Add `CHANGE_SUMMARY` entry.
- Update `packages/os/site-kernel-handoff/src/tests/migrators.test.ts`:
  - Update registry count from 12 to 13.
  - Add `expect(migratorRegistry[12].id).toBe("rfc-0504")`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`

**Completion criterion:** Migrator created, PBT + snapshot tests pass, registry updated, `migrator.registry.validate` passes.

**Human review:** no

---

### Step 6. Create UI components

**Goal:** Create UI components for `article-header`, `toc`, and `changelog` in `@gogol/ui`.

**Agent actions:**

- Create `packages/ui/src/components/article-header/`:
  - `article-header.astro` — renders category, title (H1), summary, articleType, author name, reviewedAt, readTime.
  - `article-header.css` — colocated styles.
  - `article-header.manifest.yaml` — DNA-17 Mirror Quintet manifest with `propsSchema`.
- Create `packages/ui/src/components/toc/`:
  - `toc.astro` — renders auto-generated TOC from H2 headings.
  - `toc.css` — colocated styles.
  - `toc.manifest.yaml` — manifest.
- Create `packages/ui/src/components/changelog/`:
  - `changelog.astro` — renders changelog entries (date, summary, authorId).
  - `changelog.css` — colocated styles.
  - `changelog.manifest.yaml` — manifest.

**Validation:**

- `pnpm --filter @gogol/ui build:check`

**Completion criterion:** Three UI component directories created with `.astro`, `.css`, `.manifest.yaml` files; `build:check` passes.

**Human review:** no

---

### Step 7. Update amendedBy on RFC-0500 and RFC-0501

**Goal:** Add RFC-0504 to the `amendedBy` field of RFC-0500 and RFC-0501.

**Agent actions:**

- Edit `docs/rfcs/rfc-0500-*.md`: add `RFC-0504` to `amendedBy: []`.
- Edit `docs/rfcs/rfc-0501-*.md`: add `RFC-0504` to `amendedBy: []`.

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0500`
- `pnpm exec site-kernel run rfc.validate --id RFC-0501`

**Completion criterion:** Both RFCs have `RFC-0504` in `amendedBy`; `rfc.validate` passes for both.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Synchronize AGENTS.md files and Compass XML documents with the implementation changes.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md`:
  - Document RG-ART-07..10 validation rules in the ratgeber-article-validate module description.
  - Update `bake-ratgeber-article.ts` description to reflect 12-section layout.
- Update `packages/ontology/AGENTS.md`:
  - Document three new block types in archetype registry section.
- Update `docs/verification-plan.xml`:
  - Add RG-ART-07, RG-ART-08, RG-ART-09, RG-ART-10 check entries.
- Update `docs/requirements.xml`:
  - Add `articleSections`, `changelog`, `secondaryCta` frontmatter fields.
  - Add `article-header`, `toc`, `changelog` block types.
- Update `docs/technology.xml`:
  - Add baker 12-section layout changes.
  - Add `rfc-0504` migrator.
  - Add three new UI components.
- Update `docs/knowledge-graph.xml`:
  - Add RFC-0504 relationships (amends RFC-0500, RFC-0501; related to RFC-0502, RFC-0503, RFC-0506).
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed.

**Validation:**

- `git diff` — verify all scope docs are updated.
- `pnpm exec site-kernel run rfc.validate --id RFC-0504`

**Completion criterion:** All documentation artifacts in scope are updated; `rfc.validate` passes.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp

**Goal:** Verify all acceptance criteria, run final validation, and stamp the RFC as implemented.

**Agent actions:**

- Verify each acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Run `pnpm exec site-kernel run ratgeber.article.validate --site webgogol-com --json` — must pass.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0504` — must pass.
- Run `pnpm --filter @gogol/ontology build:check` — must pass.
- Run `pnpm --filter @gogol/site-kernel-checks build:check` — must pass.
- Run `pnpm --filter @gogol/site-kernel-handoff build:check` — must pass.
- Run `pnpm --filter @gogol/ui build:check` — must pass.
- Stamp the RFC as implemented: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0504 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- All build:check commands pass.
- `rfc.validate` passes.
- `rfc.implement.stamp` succeeds.

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0504`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/ui build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run ratgeber.article.validate --site webgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0504` in the subject line (RFC-0265 commit hygiene)
- PBT and snapshot test results for `rfc-0504` migrator

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Block type proliferation | Step 1: cosmic names from unused PlanetCatalog entries — no catalog extension needed |
| `articleSections` extraction complexity | Step 3: pure function with snapshot tests; Step 5: PBT idempotency on migrator |
| H1 stripping migrator heading hierarchy | Step 5: migrator checks for duplicate H2 before conversion; PBT idempotency test |
| RG-ART-07 false positives | Step 4: validator skips fenced code blocks and HTML comments |
| `articleSections` extraction gaps | Step 3: baker skips missing slots silently (field-presence-driven pattern) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-19 (closed catalog), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0504 --reason "..." --invariant "DNA-19"` instead of extending the catalog.
- If implementation reveals an invariant conflict with DNA-23 (three-way alignment), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0504 --reason "..." --invariant "DNA-23"` instead of working around it.
- If the migrator fails idempotency on real data, stop and fix the migrator before proceeding — do not suppress the test.
