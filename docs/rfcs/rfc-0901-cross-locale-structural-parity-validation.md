---
id: RFC-0901
title: "Cross-locale structural parity validation for translated content"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
enhancedAt: 2026-08-21
implementedAt: 2026-08-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-11
  - DNA-82
  - RFC-0097
  - RFC-0684
  - RFC-0732
  - RFC-0734
  - RFC-0174
  - RFC-0914
dependsOn:
  - RFC-0914
satisfies:
  - DNA-11
versionBump: minor
commands:
  proposed:
    - translation.parity.validate
    - translation.parity.review
    - translation.parity.suppress
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-shared"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "translation.parity.validate detects section/paragraph/sentence count mismatches between locale variants of the same content file"
  - "Suppression records persist in workpiece git and survive mission lifecycle"
  - "Legal documents (impressum, datenschutz) produce error-severity diagnostics; other content produces warnings"
  - "Pipeline integration catches missing or incomplete translations before build"
nonGoals:
  - "Do not perform semantic comparison of translation content — only structural unit counts"
  - "Do not replace mirroring.validate (file presence) — this RFC extends it with structural parity"
  - "Do not replace surface.translation.validate (PSEO artifact lifecycle) — this RFC covers authored markdown content"
  - "Do not replace legal.translation.validate (binding-language policy) — this RFC covers structural completeness"
  - "Do not compare rendered HTML — all checks run against authored markdown source"
  - "Do not check frontmatter field parity between locale variants — frontmatter fields (title, description) are validated by content.validate and semantic.drift.validate; this RFC checks body structure only"
  - "Do not validate translation quality or accuracy — structural counts are a necessary but not sufficient condition for translation completeness"
---

# RFC-0901: Cross-locale structural parity validation for translated content

## Context

The Werkstatt enforces **file-level** locale mirroring via `mirroring.validate` (DNA-11): every page must exist across all declared locales. But file presence does not guarantee **structural parity** — a German `impressum.md` with 8 H2 sections and 24 paragraphs might have a Ukrainian counterpart with only 5 sections and 15 paragraphs because the translator skipped or merged content.

This gap is especially dangerous for **legal documents** (Impressum, Datenschutz, AGB) where a missing section can create legal exposure, and for **ratgeber articles** where structural parity ensures consistent user experience across languages.

Existing validators address adjacent concerns but not this one:

- `mirroring.validate` — checks file presence, not content structure
- `surface.translation.validate` — checks PSEO artifact lifecycle (sourceHash, derivedFrom), not authored markdown
- `legal.translation.validate` — checks binding-language policy, not structural completeness
- `content.regression.check` — compares rendered route content against a golden snapshot, not cross-locale structure

There is no validator that answers the question: "Does the Ukrainian translation have the same number of sections, paragraphs, and sentences as the German original?"

## Problem

A translator can produce a file that passes `mirroring.validate` (file exists in `prose/uk/`) but is structurally incomplete — missing sections, merged paragraphs, or omitted sentences. This is currently undetectable until a human reader notices the discrepancy, which for legal documents may be too late.

The operator needs:

1. **Automated detection** of structural mismatches between locale variants
2. **Suppression mechanism** for intentional differences (e.g., a German-only TMG §5 disclaimer not required under Ukrainian law)
3. **Review workflow** to see findings and decide whether to fix or suppress
4. **Per-site binding** — suppressions are tied to a specific Sternsystem, not global

## Decision

The kernel gains three commands that form a **translation parity contour**:

1. **`translation.parity.validate`** — detects structural mismatches between locale variants of authored markdown content, filters through suppression records, and reports unsuppressed findings as diagnostics
2. **`translation.parity.review`** — generates a review manifest listing all unsuppressed findings for operator inspection
3. **`translation.parity.suppress`** — adds a suppression record to the workpiece config file

## Architectural fit

- **DNA-11 (Language mirroring):** This RFC extends DNA-11 from file-level presence to structural-level parity. `mirroring.validate` answers "does the file exist?"; `translation.parity.validate` answers "does the file have the same structure?". Both are enforced; structural parity is a stricter superset of file presence.

- **RFC-0914 (Mandatory semantic block IDs):** This RFC depends on RFC-0914. With mandatory block IDs, the parity validator matches blocks by `blockId` directly — no index-based fallback needed. RFC-0914 must be implemented before this RFC.

- **RFC-0097 (per-page locale scoping):** Same mechanism — a page may declare `locales` in `system.md` to restrict which locales it must exist in. Structural parity respects this: a DE-only page is not checked for UK parity.

- **RFC-0684 (Axiom suppression layer):** The suppression mechanism follows the same pattern as `axiom-suppressions.yaml` — ruleId + conditions + reason, stored in a YAML config file, validated by a companion command. The key difference: suppressions are per-workpiece (not workshop-level), because translation parity findings are content-specific, not infrastructure-specific.

- **RFC-0732/0734 (content regression review):** The review workflow follows the same pattern as `content.regression.review.generate` — produce a manifest, let the operator decide, persist decisions. The difference: CREG compares against a golden snapshot; translation parity compares against the source locale.

- **RFC-0174 (legal translation binding-language):** Complementary — `legal.translation.validate` checks the binding-language policy (which language is authoritative); `translation.parity.validate` checks structural completeness (did the translator include all sections).

- **Site OS operator model:** All three commands are `scope: app` — they operate on a single site's content. `translation.parity.validate` integrates into `SITES_CHECK_AUTHOR_PIPELINE` after `mirroring.validate` (file presence is a prerequisite for structural parity).

## Design

### CLI surface

```sh
# Validate structural parity across locales
pnpm exec werkstatt run translation.parity.validate --site warpgogol-com
pnpm exec werkstatt run translation.parity.validate --site warpgogol-com --source-locale uk

# Generate review manifest for unsuppressed findings
pnpm exec werkstatt run translation.parity.review --site warpgogol-com
pnpm exec werkstatt run translation.parity.review --site warpgogol-com --source-locale uk

# Add a suppression record
pnpm exec werkstatt run translation.parity.suppress --site warpgogol-com \
  --file prose/impressum.md \
  --ruleId PARITY-SENTENCE-COUNT \
  --section "Haftung für Links" \
  --reason "DE has additional TMG §5 disclaimer not required under Ukrainian law"
```

**`--source-locale` flag** (on `validate` and `review` only): Overrides the source locale for comparison. Defaults to `defaultLang` from `system.md`. Operators can set `--source-locale uk` when authoring in Ukrainian but `defaultLang = de` — the Ukrainian text is the source of truth, and the German translation is checked for structural parity against it. `suppress` does not accept `--source-locale` — suppression records are source-locale-independent.

### Content directories covered

Content directories that use locale subdirectories (`{lang}/`). The parity validator scans only directories that exist and contain locale subdirectories matching `/^[a-z]{2}$/` — absent directories are silently skipped (no false positives on sites that don't use a particular content domain):

| Directory                              | Content type                       | Severity |
| -------------------------------------- | ---------------------------------- | -------- |
| `src/content/prose/{lang}/`            | Legal documents, ratgeber articles | error    |
| `src/content/pages/{lang}/`            | Page markdown                      | warning  |
| `src/content/business-profile/{lang}/` | Business profile entities          | warning  |
| `src/content/navigation/{lang}/`       | Navigation files                   | warning  |
| `src/content/faq/{lang}/`              | FAQ entries                        | warning  |
| `src/content/people/{lang}/`           | People records                     | warning  |
| `src/content/site/{lang}/`             | Site-level content                 | warning  |

Legal documents are identified by filename: `impressum.md`, `datenschutz.md`, `agb.md`, `widerruf.md`, `barrierefreiheit.md` — these produce **error**-severity diagnostics. All other files produce **warning**-severity diagnostics.

Note: `mirroring.validate` currently scans only `src/content/pages/{lang}/` (`paths.contentPagesDirectory`). The parity validator has a broader scope because it scans all locale-subdirectory content domains. This is intentional — `mirroring.validate` may be extended in a future RFC to cover the same scope, but parity validation does not wait for that.

### File matching

Files are matched across locales by **pageId** (from frontmatter `pageId` field). If frontmatter lacks `pageId`, the filename slug is used (same fallback as `mirroring.validate`).

```
prose/de/impressum.md  (pageId: impressum)
prose/uk/impressum.md  (pageId: impressum)
→ matched, structural parity checked
```

### Locale scoping

Same mechanism as `mirroring.validate` (RFC-0097): a page may declare `locales` in `system.md` `pages[]` to restrict which locales it must exist in. Files scoped to a single locale are not checked for parity.

### Structural metrics

Three hierarchical checks, applied per matched file pair. File-level presence is not checked here — `mirroring.validate` already enforces file presence (DNA-11) and runs before this validator in the pipeline. The parity validator assumes both source and target files exist; if a source file is missing, the finding is skipped (mirroring.validate catches it separately):

| Rule ID                  | What it checks                       | Level     |
| ------------------------ | ------------------------------------ | --------- |
| `PARITY-SECTION-COUNT`   | Block count matches                  | file      |
| `PARITY-PARAGRAPH-COUNT` | Paragraph count per block matches    | block     |
| `PARITY-SENTENCE-COUNT`  | Sentence count per paragraph matches | paragraph |

**Block matching:** For `pages` domain, extracts blocks from frontmatter `blocks[]` array via `extractPageSections` (direct frontmatter parsing with `id` field extraction). For `prose` and other domains, uses `splitMarkdownSections` to extract H2-headed sections. Blocks/sections are matched by `id` (language-neutral, mandatory per RFC-0914 for page blocks; slug-derived from heading for prose sections). Since RFC-0914 makes block IDs mandatory for pages, no index-based fallback is needed — all page blocks have explicit, stable IDs. Prose sections use slug-derived IDs from headings, which are stable across locales when headings are translated (slugs are locale-aware via `slugId`).

**Paragraph counting:** Uses `extractParagraphs` from `@warpgogol/werkstatt-shared/share/semantic/extract` on each block's body. A paragraph is a block of text separated by one or more blank lines.

**Sentence splitting:** Locale-aware sentence boundary detection via `splitSentences` (new function in `@warpgogol/werkstatt-shared/share/semantic/extract`). Abbreviation lists per locale to avoid false splits. Abbreviation matching has priority over the general boundary rule — a known abbreviation never triggers a sentence break:

- `de`: `z.B.`, `etc.`, `Nr.`, `Abs.`, `§`, `S.`, `ca.`, `u.a.`, `vgl.`, `bspw.`
- `uk`: `т.д.`, `т.п.`, `п.`, `ст.`, `див.`, `пор.`, `напр.`, `ім.`, `о.`
- `en`: `e.g.`, `i.e.`, `etc.`, `vs.`, `Mr.`, `Mrs.`, `Dr.`, `Inc.`, `Ltd.`

Sentence boundary = `.` `!` `?` followed by whitespace + capital letter, excluding known abbreviations. The `§` symbol in German legal text is treated as an abbreviation prefix, not a sentence boundary — `§ 5 TMG` must not split. For Ukrainian, where sentence-initial lowercase is uncommon but possible after certain abbreviations, the capital-letter requirement is relaxed: a sentence boundary is `.` `!` `?` followed by whitespace, regardless of the next letter's case, unless the preceding token matches a known abbreviation.

### Suppression mechanism

**Config file:** `translation-parity.suppressions.yaml` in the workpiece root (git-tracked, flows through mission lifecycle).

```yaml
suppressions:
  - file: prose/impressum.md
    ruleId: PARITY-SENTENCE-COUNT
    section: "Haftung für Links"
    reason: "DE has additional TMG §5 disclaimer not required under Ukrainian law"
    approvedAt: 2026-08-21
  - file: prose/datenschutz.md
    ruleId: PARITY-SECTION-COUNT
    reason: "UK combines sections 3 and 4 into one per local legal counsel"
    approvedAt: 2026-08-21
```

**Fields:**

| Field | Required | Description |
| --- | --- | --- |
| `file` | yes | Content-relative path (e.g. `prose/impressum.md`) |
| `ruleId` | yes | One of `PARITY-SECTION-COUNT`, `PARITY-PARAGRAPH-COUNT`, `PARITY-SENTENCE-COUNT` |
| `section` | no | H2 heading text. If omitted, suppression covers the entire file for this ruleId |
| `reason` | yes | Human-readable justification |
| `approvedAt` | yes | Date the suppression was approved |

**Matching logic:** A finding is suppressed when `file` + `ruleId` match and either `section` matches or `section` is omitted (file-level suppression).

**Validation:** `translation.parity.suppress` validates the config file schema (Zod), checks for duplicate suppression records, and warns on stale suppressions (file/section no longer exists). The `approvedAt` field is auto-populated with the current date (YYYY-MM-DD) — the operator does not need to pass `--approvedAt` as a flag. The command appends the new record to the existing file (or creates it if absent), preserving existing records.

### Agent-actionable diagnostics

All diagnostics are designed for **agent-first remediation** — an AI agent reading the `--json` output must have enough information to fix the translation or add a suppression without reading the source files manually. This minimizes operator distraction: the agent fixes what it can, and only escalates genuinely intentional differences for human suppression approval.

Each finding includes:

| Field | Purpose |
| --- | --- |
| `sourceFile` | Absolute path to the source-locale markdown file |
| `targetFile` | Absolute path to the target-locale markdown file |
| `fixHint` | Actionable instruction: "Translate missing section 'Haftung für Links' from de to uk" or "Add 3 missing paragraphs to section 'Vertragslaufzeit' in uk locale" |
| `sourceExcerpt` | The missing/extra content from the source locale (section heading + body for section count, paragraph text for paragraph count) |
| `missingItems` | Structured list of what the target locale is missing (section headings, paragraph indices, sentence indices) |

The agent workflow is:

1. Run `translation.parity.validate --json`
2. For each finding: read `fixHint` + `sourceExcerpt`, translate the missing content, write to `targetFile`
3. Re-run `translation.parity.validate` to confirm parity
4. If a finding is intentional (e.g., legal exemption): run `translation.parity.suppress` with the finding's `file` + `ruleId` + `section`

Only step 4 requires operator attention — and only when the agent cannot determine that the difference is intentional.

### TypeScript contracts

```ts
interface MissingItem {
  type: "section" | "paragraph" | "sentence";
  index: number;
  heading?: string;
  sourceText: string;
}

interface ParityFinding {
  file: string;
  sourceFile: string;
  targetFile: string;
  ruleId: "PARITY-SECTION-COUNT" | "PARITY-PARAGRAPH-COUNT" | "PARITY-SENTENCE-COUNT";
  section?: string;
  sourceLocale: string;
  targetLocale: string;
  sourceCount: number;
  targetCount: number;
  severity: "error" | "warning";
  message: string;
  fixHint: string;
  sourceExcerpt?: string;
  missingItems?: MissingItem[];
}

interface SuppressionRecord {
  file: string;
  ruleId: string;
  section?: string;
  reason: string;
  approvedAt: string;
}

interface ParityValidateResult {
  command: "translation.parity.validate";
  status: "pass" | "warn" | "fail";
  findings: ParityFinding[];
  suppressed: ParityFinding[];
  paritySummary: {
    filesChecked: number;
    errors: number;
    warnings: number;
    suppressed: number;
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/{domain}/{lang}/*.md` | Scanned for structural parity |
| `src/content/system.md` | Read for `pages[].locales` scoping (RFC-0097) and `defaultLang` |
| `translation-parity.suppressions.yaml` (workpiece root) | Suppression records, git-tracked |
| `packages/werkstatt-shared/src/share/semantic/extract.ts` | `extractParagraphs` — existing, reused; `splitSentences` — new function added here |
| `packages/werkstatt-site/src/content/semantic-loader.ts` | `loadSemanticSiteModel` — existing, reused for block-level matching by `blockId` |
| `packages/werkstatt-site/src/checks/translation-parity.ts` | New module: validate, review, suppress command handlers, suppression Zod schema (only consumer is this command — no cross-package export needed) |
| `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` | Command registration for all three `translation.parity.*` commands |
| `translation-parity-review.yaml` (workpiece root) | Review manifest written by `translation.parity.review` (generated, git-tracked) |

### Output format

```json
{
  "command": "translation.parity.validate",
  "status": "fail",
  "findings": [
    {
      "file": "prose/impressum.md",
      "sourceFile": "/home/syrokomskyi/projects/warpgogol/werkstatt/missions/m000052/workpiece/src/content/prose/de/impressum.md",
      "targetFile": "/home/syrokomskyi/projects/warpgogol/werkstatt/missions/m000052/workpiece/src/content/prose/uk/impressum.md",
      "ruleId": "PARITY-SECTION-COUNT",
      "sourceLocale": "de",
      "targetLocale": "uk",
      "sourceCount": 8,
      "targetCount": 5,
      "severity": "error",
      "message": "prose/impressum.md: section count mismatch (de=8, uk=5)",
      "fixHint": "Translate 3 missing H2 sections from de to uk: 'Haftung für Links', 'Urheberrecht', 'Streitschlichtung'. Add them to the target file after the last existing section.",
      "missingItems": [
        {
          "type": "section",
          "index": 5,
          "heading": "Haftung für Links",
          "sourceText": "## Haftung für Links\n\nUnser Angebot enthält ggf. Verweise zu externen Webseiten Dritter..."
        },
        {
          "type": "section",
          "index": 6,
          "heading": "Urheberrecht",
          "sourceText": "## Urheberrecht\n\nDie durch die Seitenbetreiber erstellten Inhalte..."
        },
        {
          "type": "section",
          "index": 7,
          "heading": "Streitschlichtung",
          "sourceText": "## Streitschlichtung\n\nDie Europäische Kommission stellt eine Plattform..."
        }
      ]
    }
  ],
  "suppressed": [
    {
      "file": "prose/impressum.md",
      "ruleId": "PARITY-SENTENCE-COUNT",
      "section": "Haftung für Links",
      "sourceLocale": "de",
      "targetLocale": "uk",
      "sourceCount": 3,
      "targetCount": 1,
      "severity": "error",
      "message": "Suppressed: DE has additional TMG §5 disclaimer not required under Ukrainian law"
    }
  ],
  "paritySummary": {
    "filesChecked": 42,
    "errors": 1,
    "warnings": 0,
    "suppressed": 1
  }
}
```

### Failure modes

- **No locale subdirectories** → pass (nothing to compare)
- **Single locale** → pass (nothing to mirror)
- **Missing suppression file** → pass (no suppressions to apply, all findings reported)
- **Malformed suppression file** → error `PARITY-SUP-01` (invalid YAML or schema violation)
- **Stale suppression** (file or section no longer exists) → warning `PARITY-SUP-02`
- **Duplicate suppression records** → error `PARITY-SUP-03`
- **Source locale file missing** → skip (mirroring.validate catches this separately)
- **Concurrent suppression file writes** → low risk (missions are single-threaded; if two agents somehow write simultaneously, the last writer wins and the stale writer's suppression is lost — acceptable since suppressions are idempotent and re-addable). No file locking needed.

## Rollout

- **Default behavior:** `translation.parity.validate` runs in `SITES_CHECK_AUTHOR_PIPELINE` after `mirroring.validate`. Findings are diagnostics — errors block the build, warnings do not.
- **Existing sites:** No migration needed. The first run may surface pre-existing structural mismatches. Operators suppress intentional differences via `translation.parity.suppress` or fix the translation.
- **New sites:** Automatically comply from day one. Structural parity is checked from the first multi-locale build.
- **No flag day:** The suppression file is optional. Sites without it simply get all findings reported.
- **Pipeline integration:** Added to `SITES_CHECK_AUTHOR_PIPELINE` after `mirroring.validate` (line ~338 in `sites-check-author.ts`).

### Review manifest output

`translation.parity.review` writes a review manifest to `translation-parity-review.yaml` in the workpiece root (git-tracked, same pattern as `content.regression.review.generate` writes `review.yaml` in RFC-0734). The manifest contains all unsuppressed findings with `sourceFile`, `targetFile`, `ruleId`, `section`, `sourceCount`, `targetCount`, `fixHint`, and `sourceExcerpt` for operator inspection. The command also outputs the manifest to `--json` for agent consumption.

### AGENTS.md updates

The following `AGENTS.md` files require updates during implementation:

- `packages/werkstatt-site/AGENTS.md` — add `translation.parity.validate`, `translation.parity.review`, `translation.parity.suppress` to the «Check commands» section with one-line descriptions.
- `packages/werkstatt-shared/AGENTS.md` — document the new `splitSentences` function in the share/semantic entry.

### Compass sync

The following `docs/*.xml` files require synchronization during implementation:

- `docs/requirements.xml` — add the translation parity validation requirement.
- `docs/knowledge-graph.xml` — add the three new commands and their relationships to DNA-11, mirroring.validate, and the translation validation contour.

### Subpath exports

`splitSentences` is added to the existing `@warpgogol/werkstatt-shared/share/semantic` subpath export — no new subpath export needed. The suppression Zod schema lives in `packages/werkstatt-site/src/checks/translation-parity.ts` and is not exported cross-package (single consumer).

## Alternatives considered

- **Extend `mirroring.validate` to also check structure:** Rejected — `mirroring.validate` is focused on file presence and is already complex with RFC-0097 locale scoping. Structural parity is a distinct concern with different rules, suppression, and review workflow. Mixing them would violate single-responsibility and make both commands harder to maintain.

- **Use `content.regression.check` (CREG) for this:** Rejected — CREG compares rendered route content against a golden snapshot in the cache clone. It requires a build and a baseline. Translation parity runs against authored markdown source, needs no build, and compares locales against each other (not against a golden baseline).

- **LLM-based semantic comparison:** Rejected by the operator — "мы только считаем структурные единицы". Structural counting is deterministic, fast, and has zero false-positive rate for the "is the count different?" question. Semantic comparison is a separate, harder problem.

- **Per-file suppression in frontmatter:** Rejected — suppressions are an operational concern, not content metadata. Mixing them into content files would pollute the content layer and make bulk management harder. A separate YAML file is the established pattern (RFC-0684).

## Risks

- **False positives from sentence splitting:** Abbreviation lists may not cover all cases. Mitigation: per-locale abbreviation lists are extensible, and suppressions handle edge cases. The sentence count check is the finest-grained — operators can suppress at the section level without disabling the coarser checks.

- **Performance on large sites:** Scanning all content files across all locales is O(N×L) where N = files per locale, L = locale count. Acceptable for typical sites (< 100 files × 2-3 locales). The check runs in the author pipeline alongside 50+ other validators — marginal cost is small compared to the build itself.

- **Suppression file maintenance:** Stale suppressions accumulate when content is restructured. Mitigation: `PARITY-SUP-02` warning flags suppressions whose file or section no longer exists.

- **Paragraph count sensitivity:** Translators may legitimately split or merge paragraphs. Mitigation: paragraph count is a warning-level check (even for legal documents), and section-level suppression covers the section's paragraphs.

## Acceptance criteria

- [x] `translation.parity.validate` command registered with `scope: app` in `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` (evidence: packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts:912)
- [x] Detects block count mismatches between locale variants (using frontmatter block extraction + `blockId` matching per RFC-0914) (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:201-214,336-377)
- [x] Detects paragraph count mismatches per section (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:381-423)
- [x] Detects sentence count mismatches per paragraph (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:426-463)
- [x] Legal documents (`impressum.md`, `datenschutz.md`, `agb.md`, `widerruf.md`, `barrierefreiheit.md`) produce error-severity diagnostics (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:93-99,140-142,497)
- [x] Non-legal content produces warning-severity diagnostics (evidence: packages/werkstatt-site/src/checks/tests/translation-parity.test.ts:198-222)
- [x] Respects RFC-0097 `pages[].locales` scoping in `system.md` (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:302-319,518-522)
- [x] Suppression file `translation-parity.suppressions.yaml` loaded from workpiece root (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:224-244)
- [x] Suppressed findings excluded from diagnostics and reported separately (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:614-625, tests:275-308)
- [x] `translation.parity.review` generates a review manifest with all unsuppressed findings (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:684-758, tests:344-368)
- [x] `translation.parity.suppress` adds records to the suppression file with schema validation (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:765-832, tests:424-445)
- [x] Integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `mirroring.validate` (evidence: packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts:343)
- [x] `--json` output format documented and stable (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:629-677)
- [x] Each finding includes `sourceFile`, `targetFile`, `fixHint`, and `missingItems` for agent-actionable remediation (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:51-73,362-376)
- [x] `sourceExcerpt` includes the source-locale text of missing sections/paragraphs so agents can translate without re-reading files (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:374,416-418,458-459)
- [x] `translation.parity.validate` and `translation.parity.review` accept `--source-locale` flag (default = `defaultLang` from `system.md`) (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:582-583,693-694)
- [x] Each command handler returns `KernelCommandResult` with `exitCode` explicitly set on every return path, `summary` prefixed with `[command.name]`, and `nextSteps` non-empty on failure (DNA-82) (evidence: packages/werkstatt-site/src/checks/translation-parity.ts:590,630-657,659-677,741-758,816-831)
- [x] Unit tests cover: section count, paragraph count, sentence count, suppression matching, stale suppression detection, locale scoping, legal vs non-legal severity (evidence: packages/werkstatt-site/src/checks/tests/translation-parity.test.ts:108-341)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate run 2026-08-21)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT implement this RFC before RFC-0914 is implemented — mandatory block IDs are a prerequisite for block-level matching.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0901 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The sentence-splitting abbreviation lists must be extensible without code changes — consider a config file or a constant map that operators can extend per-site.
- The suppression file is git-tracked in the workpiece. Agents MUST NOT `git add -f` it — it is a normal tracked file, not an untracked artifact like `.env`.
