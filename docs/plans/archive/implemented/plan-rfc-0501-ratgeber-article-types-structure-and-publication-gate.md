---
rfcId: RFC-0501
planId: PLAN-RFC-0501-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/COMMANDS.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0501

## 1. Objectives

- [ ] O1 — `ratgeber.article.validate` validator implemented with RG-ART-01..06 rules — maps to acceptance criteria 1, 2, 3, 4
- [ ] O2 — `bakeRatgeberArticle` emits context-specific closing CTAs per `articleType` — maps to acceptance criterion 5
- [ ] O3 — `article.depth.validate` skips ART-DEPTH-02 for ratgeber articles — maps to acceptance criterion 6
- [ ] O4 — `rfc-0501-article-status-review` migrator sets existing published articles to `review-required` — maps to acceptance criterion 7
- [ ] O5 — Command registered in check module command table — maps to acceptance criterion 1
- [ ] O6 — Compass docs and AGENTS.md synchronized — maps to acceptance criterion 8
- [ ] O7 — `rfc.validate` passes — maps to acceptance criterion 8

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` — New: `runRatgeberArticleValidate` validator
- `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` — Updated: context-specific CTAs based on `articleType`
- `packages/os/site-kernel-checks/src/article-depth.ts` — Updated: skip ART-DEPTH-02 for ratgeber articles (detect via `surfaceId === "ratgeber"` on surface entries)
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — Updated: add `ratgeber.article.validate` command entry
- `packages/os/site-kernel-handoff/src/migrators/rfc-0501-article-status-review.ts` — New: migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — Updated: register `rfc0501Migrator`

### 2.2 Configuration and data

- No blueprint changes (ratgeber.yaml is owned by RFC-0500, already implemented)
- No ontology catalog changes
- Migrator transforms article frontmatter: `status: published` → `status: review-required` for ratgeber articles

### 2.3 Documentation and specs

- `docs/verification-plan.xml` — Add `ratgeber.article.validate` check entry
- `docs/COMMANDS.md` — Add `ratgeber.article.validate` command
- `docs/requirements.xml` — Update: article type enum, mandatory section structure
- `docs/technology.xml` — Update: new validator file, migrator file
- `docs/knowledge-graph.xml` — Update: RFC-0501 relationships
- `packages/os/site-kernel-checks/AGENTS.md` — Document `ratgeber-article-validate.ts` module

### 2.4 Validation and pipelines

- `ratgeber.article.validate` joins `build.check` pipeline (blocking, site-scoped)
- `article.depth.validate` modified to skip word count for ratgeber articles
- `migrator.registry.validate` must pass after adding the new migrator

## 3. Step sequence

### Step 1. Implement `ratgeber.article.validate` validator

**Goal:** Create the new validator with all six rules (RG-ART-01..06).

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts`
- Implement `runRatgeberArticleValidate` function following the pattern of `ratgeber-hub-validate.ts`
- Load ratgeber article records from `src/content/surface/articles/{lang}/*.md`
- For each article with `status: published`:
  - RG-ART-01: check `articleType` is one of the seven allowed types
  - RG-ART-02: count words in prose body (`prose/{lang}/ratgeber-{slug}.md`), fail if < 500
  - RG-ART-03: check all 10 mandatory H2 section headings are present (DE or UK list based on lang)
  - RG-ART-04: check section headings appear in the correct order
  - RG-ART-05: check type-specific requirement (decision table, checklist items, comparison table, calculation example, numbered steps, bold definition)
- For articles with `status: draft` or `status: review-required`:
  - RG-ART-06: warning if structure is incomplete (non-blocking)
- For articles in languages without a defined section list:
  - RG-ART-06: warning (skip section structure check)
- Use `countWords` from `article-depth.ts` for word count (reuse existing function)
- Heading matching: trimmed, exact H2 match, no trailing attributes

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- Manual review of rule logic against RFC spec

**Completion criterion:** Validator file exists, typechecks, and implements all six rules per the RFC specification.

**Human review:** no

---

### Step 2. Update `bakeRatgeberArticle` with context-specific CTAs

**Goal:** Replace the generic closing CTA with type-specific CTAs based on `articleType`.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts`
- Add a CTA mapping from `articleType` to closing CTA block:
  - `grundlagenartikel` → "Verwandte Artikel" — linked card grid of related articles in same category (reuse existing `linkedCardGrid` + sibling lookup)
  - `entscheidungshilfe` → "Passende Leistungen" — linked card grid of service pages (link to `/leistungen/` or relevant service pages)
  - `checkliste` → "Brauchen Sie Hilfe?" — contact CTA (reuse `ctaBlock`)
  - `vergleich` → "Preise ansehen" — link to pricing page
  - `rechenmodell` → "Preise ansehen" — link to pricing page
  - `methodik` → "Verwandte Artikel" — linked card grid of related articles
  - `begriffserklaerung` → "Verwandte Begriffe" — linked card grid of related glossary articles (same `articleType: begriffserklaerung`)
- Replace the current generic `ctaBlock` at the end of `bakeRatgeberArticle` with the type-specific CTA
- Read `articleType` from the article data (`data?.articleType`)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `bakeRatgeberArticle` emits a different closing CTA block depending on `articleType`, matching the RFC's CTA table.

**Human review:** no

---

### Step 3. Update `article.depth.validate` to skip ART-DEPTH-02 for ratgeber articles

**Goal:** Avoid redundant word-count checking for ratgeber articles (RG-ART-02 handles it).

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/article-depth.ts`
- In the surface entry candidate loop, detect ratgeber articles (entries from `readSurfaceArticleTypedEntries` that belong to the ratgeber surface)
- Add a `isRatgeber` flag to `ArticleCandidate` interface
- Skip the ART-DEPTH-02 word-count check when `isRatgeber` is true
- Keep all other ART-DEPTH-* checks running for ratgeber articles (dates, thin sections, feed, twin)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `article.depth.validate` does not emit ART-DEPTH-02 violations for ratgeber articles; all other ART-DEPTH-* checks still run.

**Human review:** no

---

### Step 4. Register `ratgeber.article.validate` in command table

**Goal:** Make the validator callable via the kernel CLI.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`
- Add import for `runRatgeberArticleValidate` from `../ratgeber-article-validate.ts`
- Add a new `CheckCommandEntry` after the `ratgeber.hub.validate` entry:
  - `name: "ratgeber.article.validate"`
  - `description: "RFC-0501: validate ratgeber article types, mandatory 10-section structure, type-specific requirements, and publication gate."`
  - `scope: "app"`
  - `flags: {}`
  - `supportsAllSites: true`
  - `reads: ["<app>/src/content/surface/articles/**/*.md", "<app>/src/content/prose/**/ratgeber-*.md"]`
  - `execute: runRatgeberArticleValidate`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run ratgeber.article.validate --site warpgogol-com --json` — command is found (may skip if no articles exist yet)

**Completion criterion:** `ratgeber.article.validate` is callable via the kernel CLI and appears in the command table.

**Human review:** no

---

### Step 5. Implement `rfc-0501-article-status-review` migrator

**Goal:** Set existing `status: published` ratgeber articles to `status: review-required` so they don't fail the publication gate until their prose bodies are updated with the 10-section structure.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0501.ts`
- Follow the pattern of `rfc-0500.ts`:
  - `id: "rfc-0501"`
  - `description`: "Set existing published ratgeber articles to review-required — their prose bodies don't have the 10-section structure yet."
  - `transform`: iterate `src/content/surface/articles/{lang}/*.md`, for each article with `status: published`, set `status: review-required`
  - Idempotent: skip files where `status` is already not `published`
- Register in `packages/os/site-kernel-handoff/src/migrators/registry.ts`:
  - Add import for `rfc0501Migrator`
  - Add to `migratorRegistry` array after `rfc0500Migrator`
  - Add CHANGE_SUMMARY entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` — typecheck passes
- `pnpm exec site-kernel run migrator.registry.validate` — registry is valid

**Completion criterion:** Migrator file exists, registered, typechecks, and `migrator.registry.validate` passes.

**Human review:** no

---

### Step 6. Write tests for the validator

**Goal:** Unit tests covering all six rules and type-specific detection heuristics.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/ratgeber-article-validate.test.ts` (or `.pbt.test.ts` if property-based)
- Test cases:
  - RG-ART-01: article with invalid `articleType` fails
  - RG-ART-01: article with valid `articleType` passes
  - RG-ART-02: published article with < 500 words fails
  - RG-ART-02: published article with ≥ 500 words passes
  - RG-ART-03: missing mandatory section heading fails
  - RG-ART-03: all sections present passes
  - RG-ART-04: sections out of order fails
  - RG-ART-04: sections in order passes
  - RG-ART-05: each type-specific requirement (7 types) — positive and negative cases
  - RG-ART-06: draft article with incomplete structure emits warning, not error
  - RG-ART-06: article in unsupported language emits warning
  - Heading matching: trailing whitespace trimmed, attributes rejected, H3 subsections allowed

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test` — all tests pass

**Completion criterion:** All test cases pass and cover every rule + type-specific detection heuristic.

**Human review:** no

---

### Step 7. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` — add `ratgeber-article-validate.ts` module entry
- Update `docs/verification-plan.xml` — add `ratgeber.article.validate` check
- Update `docs/COMMANDS.md` — add `ratgeber.article.validate` command
- Update `docs/requirements.xml` — article type enum, mandatory section structure
- Update `docs/technology.xml` — new validator file, migrator file
- Update `docs/knowledge-graph.xml` — RFC-0501 relationships
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- Check off acceptance criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0501 --implementation-commit <sha> --dry-run` first, then without `--dry-run`
- Commit the stamped RFC separately from the implementation commit

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0501` — passes
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria checked off with inline evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0501`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0501` in the subject line (RFC-0265 commit hygiene)
- Test output confirming all RG-ART-* rules pass

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Existing articles fail the gate | Step 5: migrator sets existing articles to `review-required` before the gate is enforced |
| Section heading false positives | Step 1: heading matching is trimmed and documented; Step 6: test cases cover edge cases |
| Type-specific detection heuristics too strict | Step 1: detection rules use explicit regex patterns; Step 6: positive and negative test cases per type |
| Agent auto-generates prose bodies | Step 7: acceptance criteria distinguish code-verifiable from content-verifiable; implementation notes in RFC forbid auto-generation |
| Third language added without section list | Step 1: validator skips with RG-ART-06 warning for unsupported languages |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0501 --reason "..." --invariant "DNA-24"` instead of working around it.
- If the type-specific detection heuristics prove too strict for valid articles, do not weaken the validator — create a follow-up RFC adjusting the detection rules.
