---
rfcId: RFC-0901
planId: PLAN-RFC-0901-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-shared"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - "packages/werkstatt-site/AGENTS.md"
    - "packages/werkstatt-shared/AGENTS.md"
    - "docs/requirements.xml"
    - "docs/knowledge-graph.xml"
---

# Implementation Plan: RFC-0901

## 1. Objectives

- [ ] Objective 1 — Add `splitSentences` locale-aware sentence boundary function to `@warpgogol/werkstatt-shared/share/semantic/extract` — maps to acceptance criterion "Detects sentence count mismatches per paragraph"
- [ ] Objective 2 — Implement `translation.parity.validate` command handler that uses `loadSemanticSiteModel` to compare blocks by `blockId` (hybrid: blockId-first, index-fallback) and detects paragraph/sentence count mismatches between locale variants — maps to acceptance criteria "Detects H2 section count mismatches", "Detects paragraph count mismatches per section", "Detects sentence count mismatches per paragraph", "Legal documents produce error-severity", "Non-legal content produces warning-severity", "Respects RFC-0097 locales scoping"
- [ ] Objective 3 — Implement `translation.parity.review` command handler that writes a review manifest to `translation-parity-review.yaml` — maps to acceptance criterion "translation.parity.review generates a review manifest"
- [ ] Objective 4 — Implement `translation.parity.suppress` command handler that adds records to suppression file with schema validation — maps to acceptance criterion "translation.parity.suppress adds records with schema validation"
- [ ] Objective 5 — Register all three commands in `command-tables/04-content-quality.ts` and wire `translation.parity.validate` into `SITES_CHECK_AUTHOR_PIPELINE` after `mirroring.validate` — maps to acceptance criteria "registered with scope: app", "Integrated into SITES_CHECK_AUTHOR_PIPELINE"
- [ ] Objective 6 — Ensure all command handlers return `KernelCommandResult` with `exitCode`, `summary`, and `nextSteps` per DNA-82 — maps to acceptance criterion "Each command handler returns KernelCommandResult with exitCode explicitly set..."
- [ ] Objective 7 — Write unit tests covering all rules, suppression matching, stale suppression, locale scoping, legal vs non-legal severity — maps to acceptance criterion "Unit tests cover..."
- [ ] Objective 8 — Update AGENTS.md and docs/*.xml Compass files — maps to acceptance criteria for documentation sync

### Design decisions from grilling

1. **Section matching**: Uses `loadSemanticSiteModel` to load the semantic page model per locale. Blocks are matched by `blockId` (language-neutral). Hybrid: blocks with explicit IDs match by ID; blocks with index-based fallback IDs (`block-N`) match by index. A future RFC will make block IDs mandatory for all sections (for anchor links), but RFC-0901 works with whatever IDs exist today.
2. **Source locale**: `--source-locale` flag on `validate` and `review` (not `suppress`). Default = `defaultLang` from `system.md`. Operators can override (e.g., `--source-locale uk` when authoring in Ukrainian but `defaultLang = de`).
3. **`splitMarkdownSections`**: Not the primary section splitting tool. The semantic block model provides blocks/sections with IDs. `extractParagraphs` and `splitSentences` are still used for paragraph/sentence counting within block bodies.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-shared/src/share/semantic/extract.ts` — add `splitSentences` function with locale-aware abbreviation lists
- `packages/werkstatt-site/src/checks/translation-parity.ts` — new module: validate, review, suppress command handlers + suppression Zod schema. Uses `loadSemanticSiteModel` for block-level matching by `blockId`.
- `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` — register three `translation.parity.*` commands
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — add `{ command: "translation.parity.validate" }` after `mirroring.validate` (line ~338)
- `packages/werkstatt-site/src/checks/tests/translation-parity.test.ts` — new test file

### 2.2 Configuration and data

- `translation-parity.suppressions.yaml` (workpiece root) — suppression records, git-tracked (created by `translation.parity.suppress` command)
- `translation-parity-review.yaml` (workpiece root) — review manifest, git-tracked (created by `translation.parity.review` command)

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — add three new commands to «Check commands» section
- `packages/werkstatt-shared/AGENTS.md` — document `splitSentences` in share/semantic entry
- `docs/requirements.xml` — add translation parity validation requirement
- `docs/knowledge-graph.xml` — add three new commands and relationships to DNA-11, mirroring.validate

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — `translation.parity.validate` added after `mirroring.validate`
- Unit tests via `pnpm --filter @warpgogol/werkstatt-site run build:check` and `pnpm --filter @warpgogol/werkstatt-site run test`
- `rfc.validate --id RFC-0901` — must pass after implementation

## 3. Step sequence

### Step 1. Add `splitSentences` to werkstatt-shared semantic extract

**Goal:** Add locale-aware sentence splitting function to the shared semantic extraction module.

**Agent actions:**

- Read `packages/werkstatt-shared/src/share/semantic/extract.ts` to understand existing patterns (`splitMarkdownSections`, `extractParagraphs`)
- Add `splitSentences(text: string, locale: string): string[]` function with:
  - Per-locale abbreviation maps (`de`, `uk`, `en`)
  - Abbreviation matching has priority over general boundary rule
  - `§` treated as abbreviation prefix for `de`
  - For `uk`: capital-letter requirement relaxed (boundary = `.` `!` `?` + whitespace, regardless of next letter case)
  - For `de`/`en`: boundary = `.` `!` `?` + whitespace + capital letter, excluding known abbreviations
- Export `splitSentences` from the `share/semantic` subpath
- Add type export `SentenceSplitLocale` if needed

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check` — typecheck passes
- `splitSentences` is exported and importable from `@warpgogol/werkstatt-shared/share/semantic/extract`

**Completion criterion:** `splitSentences` function exists, is exported, typechecks, and handles `de`/`uk`/`en` locale abbreviation lists with the `§` edge case for German.

**Human review:** no

---

### Step 2. Create `translation-parity.ts` module with suppression schema

**Goal:** Create the new module with Zod suppression schema and the three command handler functions. Uses semantic block model for block-level matching by `blockId`.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/translation-parity.ts`
- Define Zod schema for suppression records:
  - `suppressionRecordSchema`: `{ file: string, ruleId: enum, section?: string, reason: string, approvedAt: string }`
  - `suppressionsConfigSchema`: `{ suppressions: SuppressionRecord[] }`
- Define `ParityFinding`, `MissingItem`, `ParityValidateResult` interfaces (from RFC TypeScript contracts)
- Implement `runTranslationParityValidate(input, context)`:
  - Read `defaultLang` from `system.md` via `defaultLanguageFromManifest` or `readLangs`
  - Accept `--source-locale` flag (default = `defaultLang`)
  - Scan all 7 content directories for locale subdirs (`/^[a-z]{2}$/`)
  - Skip absent directories silently
  - For each content domain, collect files per locale, match by `pageId` (or filename slug fallback)
  - Respect RFC-0097 `pages[].locales` scoping from `system.md`
  - For each matched file pair (source = `--source-locale`, target = each other locale):
    - Load semantic page model via `loadSemanticSiteModel` for each locale
    - Compare block count → `PARITY-SECTION-COUNT`
    - Match blocks by `blockId` (hybrid: explicit ID match first; blocks with `block-N` fallback IDs match by index)
    - For each matching block, compare paragraph count via `extractParagraphs` on block body → `PARITY-PARAGRAPH-COUNT`
    - For each matching paragraph, compare sentence count via `splitSentences(text, locale)` → `PARITY-SENTENCE-COUNT`
  - Determine severity: error for legal filenames (`impressum`, `datenschutz`, `agb`, `widerruf`, `barrierefreiheit`), warning for others
  - Load suppressions from `translation-parity.suppressions.yaml` if it exists
  - Apply suppressions: match `file` + `ruleId` + optional `section`
  - Return `diagnosticsResult` with unsuppressed findings as diagnostics, suppressed findings in summary
  - Each finding includes `sourceFile`, `targetFile`, `fixHint`, `sourceExcerpt`, `missingItems`
  - Handle failure modes: no locale subdirs → `passResult`, single locale → `passResult`, missing suppression file → pass (no suppressions), malformed suppression file → error `PARITY-SUP-01`, stale suppression → warning `PARITY-SUP-02`, duplicate suppressions → error `PARITY-SUP-03`
- Implement `runTranslationParityReview(input, context)`:
  - Accept `--source-locale` flag (default = `defaultLang`)
  - Run the same validation logic to collect all unsuppressed findings
  - Write review manifest to `translation-parity-review.yaml` in workpiece root using `yamlStringify` + `writeFileIfChanged`
  - Return `passResult` with manifest path in summary
- Implement `runTranslationParitySuppress(input, context)`:
  - Read flags: `--file`, `--ruleId`, `--section` (optional), `--reason`
  - Auto-populate `approvedAt` with current date
  - Load existing suppression file if it exists, parse with Zod
  - Check for duplicate records → error `PARITY-SUP-03`
  - Append new record, write back using `yamlStringify` + `writeFileIfChanged`
  - Check for stale suppressions (file/section no longer exists) → warning `PARITY-SUP-02`
  - Return `passResult` with confirmation in summary
- All three handlers must return `KernelCommandResult` with `exitCode` set on every path, `summary` prefixed with `[command.name]`, `nextSteps` non-empty on failure (DNA-82)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- All three handlers are exported and importable

**Completion criterion:** `translation-parity.ts` exists with three exported handler functions, Zod suppression schema, all handlers return `KernelCommandResult` with DNA-82-compliant output on every return path.

**Human review:** no

---

### Step 3. Register commands in command-tables and wire pipeline

**Goal:** Register all three commands in the command table and add `translation.parity.validate` to the author pipeline.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts`:
  - Import `runTranslationParityValidate`, `runTranslationParityReview`, `runTranslationParitySuppress` from `../translation-parity.ts`
  - Add three entries to `CONTENT_QUALITY_COMMANDS`:
    - `translation.parity.validate` — `scope: "app"`, `supportsAllSites: true`, `reads: ["<app>/src/content/**/*.md", "<app>/src/content/system.md"]`, `modulePaths: ["translation-parity.ts"]`
    - `translation.parity.review` — same scope, `reads`, `modulePaths`
    - `translation.parity.suppress` — same scope, `reads`, `modulePaths`
- In `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts`:
  - Add `{ command: "translation.parity.validate" }` immediately after `{ command: "mirroring.validate" }` (line ~338)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm exec werkstatt run translation.parity.validate --site <test-site>` — command is registered and runnable

**Completion criterion:** All three commands appear in `ALL_COMMANDS` via the command-tables aggregation; `translation.parity.validate` runs in `SITES_CHECK_AUTHOR_PIPELINE` after `mirroring.validate`.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Comprehensive unit tests for all parity validation rules, suppression matching, and edge cases.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/translation-parity.test.ts`
- Test cases:
  1. **Section/block count mismatch** — source has 5 blocks, target has 3 → `PARITY-SECTION-COUNT` finding with `missingItems` listing missing block IDs + `sourceExcerpt`
  2. **Paragraph count mismatch** — block has 4 paragraphs in source, 2 in target → `PARITY-PARAGRAPH-COUNT` finding
  3. **Sentence count mismatch** — paragraph has 5 sentences in source, 3 in target → `PARITY-SENTENCE-COUNT` finding
  4. **Legal document severity** — `impressum.md` mismatch → `severity: "error"`
  5. **Non-legal content severity** — `ratgeber-foo.md` mismatch → `severity: "warning"`
  6. **RFC-0097 locale scoping** — page declared with `locales: [de]` → no parity check for `uk`
  7. **Suppression matching** — finding with matching `file` + `ruleId` + `section` → suppressed, not in diagnostics
  8. **File-level suppression** — suppression without `section` → suppresses all findings for that `file` + `ruleId`
  9. **Stale suppression** — suppression references file that no longer exists → `PARITY-SUP-02` warning
  10. **Duplicate suppression** — `translation.parity.suppress` with duplicate record → `PARITY-SUP-03` error
  11. **Malformed suppression file** — invalid YAML → `PARITY-SUP-01` error
  12. **No locale subdirs** → pass result
  13. **Single locale** → pass result
  14. **Missing suppression file** → pass (no suppressions applied)
  15. **`splitSentences` abbreviation handling** — `z.B.` in German does not split; `§ 5 TMG` does not split
  16. **Ukrainian sentence boundary** — sentence ending with lowercase next word still splits
  17. **`translation.parity.review`** — writes `translation-parity-review.yaml` with all unsuppressed findings
  18. **`translation.parity.suppress`** — appends record to existing file, preserves existing records
  19. **DNA-82 compliance** — every return path has `exitCode` set, `summary` prefixed with `[command.name]`, `nextSteps` on failure
  20. **Block matching by blockId** — blocks with explicit IDs match across locales; blocks with `block-N` fallback IDs match by index
  21. **`--source-locale` flag** — overrides default source locale; validate and review accept it, suppress does not
- Use temp directories with mock content files following the pattern in `mirroring.test.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** All test cases pass; test file covers every acceptance criterion checkbox.

**Human review:** no

---

### Step 5. Update AGENTS.md files

**Goal:** Document the three new commands in the relevant AGENTS.md files.

**Agent actions:**

- In `packages/werkstatt-site/AGENTS.md`:
  - Add `translation.parity.validate`, `translation.parity.review`, `translation.parity.suppress` to the «Check commands» section with one-line descriptions
- In `packages/werkstatt-shared/AGENTS.md`:
  - Document `splitSentences` in the `share/semantic` export entry

**Validation:**

- `git diff packages/werkstatt-site/AGENTS.md` — shows new command entries
- `git diff packages/werkstatt-shared/AGENTS.md` — shows `splitSentences` entry

**Completion criterion:** Both AGENTS.md files updated with new command/function documentation.

**Human review:** no

---

### Step 6. Update docs/*.xml Compass files

**Goal:** Synchronize Compass XML files with the new commands and requirements.

**Agent actions:**

- In `docs/requirements.xml`:
  - Add translation parity validation requirement entry
- In `docs/knowledge-graph.xml`:
  - Add three new command nodes: `translation.parity.validate`, `translation.parity.review`, `translation.parity.suppress`
  - Add relationships to DNA-11, `mirroring.validate`, and the translation validation contour

**Validation:**

- `git diff docs/requirements.xml` — shows new requirement
- `git diff docs/knowledge-graph.xml` — shows new command nodes and relationships

**Completion criterion:** Both XML files updated with new entries.

**Human review:** no

---

### Step 7. Run validation suite

**Goal:** Run all validation commands to verify the implementation is clean.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-site run test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0901 --json`
- Fix any type errors, test failures, or validation violations

**Validation:**

- All commands exit 0
- `rfc.validate` reports zero violations

**Completion criterion:** All validation commands pass with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0901 --implementation-commit <sha>` to atomically transition `accepted → implemented`. Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0901`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0901`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0901` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from sentence splitting | Step 1: per-locale abbreviation lists with priority over boundary rule; Step 4: test cases for `z.B.`, `§`, Ukrainian lowercase |
| Performance on large sites | Step 2: O(N×L) scan with early skip for absent directories; runs alongside 50+ other validators |
| Suppression file maintenance | Step 2: `PARITY-SUP-02` stale suppression warning; Step 4: test case for stale suppression |
| Paragraph count sensitivity | Step 2: paragraph count is warning-level even for legal docs; section-level suppression covers paragraphs |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0901 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `splitSentences` needs to be shared by another package (not just `werkstatt-site`), verify the subpath export in `packages/werkstatt-shared/package.json` covers the new consumer.
