# Implementation Plan: RFC-0901 — Cross-locale structural parity validation for translated content

- **RFC:** RFC-0901
- **Status:** accepted
- **Date:** 2026-08-22
- **Prerequisite:** RFC-0914 must be implemented first (mandatory block IDs are required for block-level matching)

## Affected artifacts

### Packages
- `packages/werkstatt-shared/src/share/semantic/extract.ts` — add `splitSentences` function
- `packages/werkstatt-shared/package.json` — no new subpath export needed (`splitSentences` added to existing `share/semantic` export)
- `packages/werkstatt-site/src/checks/translation-parity.ts` — **new file** — validate, review, suppress command handlers + suppression Zod schema
- `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` — register three `translation.parity.*` commands
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — add `translation.parity.validate` after `mirroring.validate`
- `packages/werkstatt-site/src/checks/result-helpers.ts` — reuse `diagnosticsResult`, `passResult` (no changes needed)

### Documentation
- `packages/werkstatt-site/AGENTS.md` — add three new commands to «Check commands» section
- `packages/werkstatt-shared/AGENTS.md` — document `splitSentences` in share/semantic entry
- `docs/requirements.xml` — add translation parity validation requirement
- `docs/knowledge-graph.xml` — add three new commands and relationships to DNA-11, mirroring.validate
- `docs/architecture-dna.md` — update DNA-11 entry to reference RFC-0901 for structural parity

### Content (per site, at migration time)
- `translation-parity.suppressions.yaml` (workpiece root) — optional, created by `translation.parity.suppress` when first suppression is added

## Step-by-step plan

### Phase 1: Add `splitSentences` to werkstatt-shared

**Step 1: Implement `splitSentences`**
- File: `packages/werkstatt-shared/src/share/semantic/extract.ts`
- Locale-aware sentence boundary detection
- Abbreviation lists per locale (`de`, `uk`, `en`) as constant maps
- Abbreviation matching has priority over general boundary rule
- `de`: `z.B.`, `etc.`, `Nr.`, `Abs.`, `§`, `S.`, `ca.`, `u.a.`, `vgl.`, `bspw.`
- `uk`: `т.д.`, `т.п.`, `п.`, `ст.`, `див.`, `пор.`, `напр.`, `ім.`, `о.`
- `en`: `e.g.`, `i.e.`, `etc.`, `vs.`, `Mr.`, `Mrs.`, `Dr.`, `Inc.`, `Ltd.`
- Boundary: `.` `!` `?` followed by whitespace + capital letter (for `de`/`en`); for `uk` capital-letter requirement relaxed
- `§` in German legal text treated as abbreviation prefix, not sentence boundary
- **Validation:** Unit tests for each locale: basic splitting, abbreviation protection, `§` handling, `uk` lowercase boundary

**Step 2: Export `splitSentences` from share/semantic**
- File: `packages/werkstatt-shared/src/share/semantic/index.ts` (or existing barrel)
- Add `splitSentences` to the existing `share/semantic` subpath export
- No new subpath export in `package.json` — reuses existing one
- **Validation:** `pnpm typecheck` passes; import works from `werkstatt-site`

### Phase 2: Create command handlers

**Step 3: Create `translation-parity.ts` module**
- File: `packages/werkstatt-site/src/checks/translation-parity.ts`
- Implement three handler functions: `runTranslationParityValidate`, `runTranslationParityReview`, `runTranslationParitySuppress`
- Suppression Zod schema (local to this file — single consumer, no cross-package export)

**Step 4: Implement `translation.parity.validate`**
- Scans 7 content directories with locale subdirs: `prose`, `pages`, `business-profile`, `navigation`, `faq`, `people`, `site`
- Skips absent directories silently (no false positives)
- Files matched across locales by `pageId` (frontmatter) or filename slug fallback
- Respects RFC-0097 `pages[].locales` scoping from `system.md`
- Three structural checks:
  - `PARITY-SECTION-COUNT` — block count per file (uses `loadSemanticSiteModel` + `blockId` matching per RFC-0914)
  - `PARITY-PARAGRAPH-COUNT` — paragraph count per block (uses `extractParagraphs`)
  - `PARITY-SENTENCE-COUNT` — sentence count per paragraph (uses `splitSentences`)
- Legal documents (`impressum.md`, `datenschutz.md`, `agb.md`, `widerruf.md`, `barrierefreiheit.md`) → `error` severity
- Other files → `warning` severity
- Loads suppressions from `translation-parity.suppressions.yaml` (workpiece root)
- Filters findings through suppression records (file + ruleId + optional section)
- Each finding includes: `sourceFile`, `targetFile`, `fixHint`, `sourceExcerpt`, `missingItems`
- `--source-locale` flag (default = `defaultLang` from `system.md`)
- Returns `KernelCommandResult` with `exitCode`, `summary` prefixed `[translation.parity.validate]`, `nextSteps` on failure (DNA-82)
- **Validation:** Unit tests: section count, paragraph count, sentence count, suppression matching, stale suppression, locale scoping, legal vs non-legal severity, no-content pass, DNA-82 compliance

**Step 5: Implement `translation.parity.review`**
- Same file: `packages/werkstatt-site/src/checks/translation-parity.ts`
- Runs the same validation logic, collects unsuppressed findings
- Writes review manifest to `translation-parity-review.yaml` (workpiece root, git-tracked)
- Manifest contains: `sourceFile`, `targetFile`, `ruleId`, `section`, `sourceCount`, `targetCount`, `fixHint`, `sourceExcerpt`
- Also outputs manifest to `--json`
- `--source-locale` flag (same as validate)
- **Validation:** Unit test: review manifest written, contains unsuppressed findings only

**Step 6: Implement `translation.parity.suppress`**
- Same file: `packages/werkstatt-site/src/checks/translation-parity.ts`
- Validates suppression record schema (Zod)
- `--file` (required), `--ruleId` (required), `--section` (optional), `--reason` (required)
- `approvedAt` auto-populated with current date (YYYY-MM-DD) — no `--approvedAt` flag
- Appends to existing `translation-parity.suppressions.yaml` or creates if absent
- Checks for duplicate suppression records → error `PARITY-SUP-03`
- Warns on stale suppressions (file/section no longer exists) → `PARITY-SUP-02`
- No `--source-locale` flag (suppressions are source-locale-independent)
- **Validation:** Unit tests: add suppression, duplicate detection, stale warning, create new file

**Step 7: Register commands in command table**
- File: `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts`
- Add `translation.parity.validate`, `translation.parity.review`, `translation.parity.suppress` with `scope: app`
- **Validation:** `pnpm exec werkstatt run translation.parity.validate --site <test-site>` exits 0

**Step 8: Integrate `translation.parity.validate` into author pipeline**
- File: `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts`
- Add `{ command: "translation.parity.validate" }` after `{ command: "mirroring.validate" }`
- **Validation:** Pipeline definition includes the new step

### Phase 3: Documentation and Compass sync

**Step 9: Update AGENTS.md files**
- `packages/werkstatt-site/AGENTS.md` — add three commands to «Check commands» section
- `packages/werkstatt-shared/AGENTS.md` — document `splitSentences` in share/semantic entry

**Step 10: Update Compass XML files**
- `docs/requirements.xml` — add translation parity validation requirement
- `docs/knowledge-graph.xml` — add three new commands, relationships to DNA-11, mirroring.validate

**Step 11: Update architecture-dna.md**
- `docs/architecture-dna.md` — update DNA-11 entry: "Extended from file-level presence to structural-level parity per RFC-0901"

### Phase 4: Verification and closure

**Step 12: Run full validation**
- `pnpm exec werkstatt run translation.parity.validate --site <site>` — passes or reports findings
- `pnpm exec werkstatt run rfc.validate --id RFC-0901` — passes
- `pnpm typecheck` — passes
- `pnpm test` — all tests pass (including new unit tests)

**Step 13: Transition RFC to implemented**
- Update `status: implemented`
- Check all acceptance criteria with `(evidence: <file:line>)` annotations
- Update `implementedAt` date
- Add reviewer if not already present (already has `human:andrii-syrokomskyi`)

## Risk mitigation

- **RFC-0914 dependency:** Steps 4-6 use `loadSemanticSiteModel` + `blockId` matching. If RFC-0914 is not yet implemented, block IDs may be optional and matching falls back to index. The RFC explicitly states "Agents MUST NOT implement this RFC before RFC-0914 is implemented."
- **Sentence splitting false positives:** Per-locale abbreviation lists are extensible. Operators can suppress at section level.
- **Content directory coverage:** Validator scans 7 directories but skips absent ones silently — no false positives on sites that don't use a particular content domain.
- **Performance:** O(N×L) where N = files per locale, L = locale count. Acceptable for typical sites (< 100 files × 2-3 locales).

## Estimated effort

- Phase 1 (Steps 1-2): ~2 hours — `splitSentences` implementation + tests
- Phase 2 (Steps 3-8): ~4-5 hours — three command handlers, suppression schema, pipeline integration, tests
- Phase 3 (Steps 9-11): ~1 hour — documentation + Compass sync
- Phase 4 (Steps 12-13): ~1 hour — verification and closure
