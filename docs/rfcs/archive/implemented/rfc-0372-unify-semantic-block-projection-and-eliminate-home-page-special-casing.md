---
id: RFC-0372
title: "Unify semantic block projection and eliminate home page special casing"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-10
updatedAt: 2026-07-10
enhancedAt: 2026-07-10
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0166
  - RFC-0208
amendedBy: []
related:
  - DNA-16
  - DNA-24
  - DNA-25
  - RFC-0142
  - RFC-0143
  - RFC-0320
satisfies:
  - DNA-16
  - DNA-25
commands:
  proposed: []
  added:
    - page.blocks.extract.validate
  changed: []
  removed:
    - page.blocks.validate
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-content
successSignals:
  - "Every block declared in any apps/* page frontmatter is fully reflected in the generated Markdown twin — no silent omissions."
  - "Home pages and non-home pages follow the same semantic projection pipeline; no special-cased home builder exists."
  - "page.blocks.extract.validate fails the build when any block type lacks a registered extractor."
  - "SemanticPageModel.blocks is a single unified array — no answerBlocks/contentBlocks split."
nonGoals:
  - "Do not change the runtime rendering pipeline (buildPage, ResolvedPage, section components)."
  - "Do not change llms.txt/llms-full.txt generation contracts (RFC-0142/0143 own those); only the block source they read changes."
  - "Do not introduce backward compatibility shims for the removed answerBlocks/contentBlocks/bodyText fields."
  - "Do not alter the SemanticPageType closed enum — 'home' remains a valid type for JSON-LD and sitemap consumers."
  - "Do not change page.blocks.mirror.validate (RFC-0205) — it operates on PageEntry.blocks (frontmatter), not SemanticPageModel.blocks, and is unaffected by this unification."
---

# RFC-0372: Unify semantic block projection and eliminate home page special casing

## Context

The Markdown twin generation pipeline (`page.markdown.generate`, RFC-0166) was extended by RFC-0208 to extract semantic text from declared blocks via `BLOCK_EXTRACTORS`. However, RFC-0208 was never applied to home pages: `buildSemanticPageModelWith()` in `packages/share/src/semantic/build-page.ts` has a special `if (semanticType === "home")` branch (lines 180–204) that routes home pages through a separate `buildHomePageSemantic()` builder with a hardcoded set of block IDs inherited from the nicaragua-projekt layout (`hero`, `problem`, `approach`, `impact`, `women`, `transparency`, `donation-use`, `social-proof`, `final-cta`).

The warpgogol-com home page declares blocks (`hero-decision-card`, `video-section`, `trust-strip`, `comparison-cards`, `audience-cards`, `ownership-block`, `notausgang-block`, `controlled-responsibility-block`, `price-card`, `people`, `faq-list`) that do not match the hardcoded list. The general `extractContentBlocks()` function — which has registered extractors for most of these types — is never called for home pages. The result: the generated Markdown twin at `apps/warpgogol-com/public/uk/index.md` contains only a fraction of the visible home page content.

This is not a missing-extractor bug but an architectural defect: two parallel projection paths exist for the same `SemanticPageModel`, and the home path bypasses the extractor registry entirely.

## Problem

1. **Two projection paths.** `buildSemanticPageModelWith()` has a home-specific branch that calls `buildHomePageSemantic()` + `createHomeAnswerBlocks()` (hardcoded block IDs), while all other page types go through `extractContentBlocks()` → `buildMarkdownPageSemantic()`. The home path is not extractor-aware.

2. **Hardcoded block IDs.** `createHomeAnswerBlocks()` in `packages/share/src/semantic/page-builders/home-page.ts` maps a fixed set of 9 block IDs to answer blocks. Any app whose home page uses different block types (e.g. warpgogol-com's `hero-decision-card`, `video-section`, `trust-strip`) silently loses content in the Markdown twin.

3. **Split model.** `SemanticPageModel` carries both `answerBlocks: SemanticAnswerBlock[]` (from prose/markdown parsing) and `contentBlocks?: SemanticContentBlock[]` (from block extraction). Consumers (`buildPageMarkdown`, `llms.ts`, `jsonld/webpage.ts`) must read both arrays with different rendering logic. `bodyText` is a third representation of the same prose content.

4. **No extractor completeness gate.** `page.blocks.validate` (RFC-0208) has a hardcoded `requiredTypes` list and only warns about unhandled types. There is no hard contract that every block type used in any `apps/*` frontmatter must have a registered extractor.

5. **Missing extractors.** `video-section` (warpgogol-com `promo` block) has no extractor. The `people` extractor is a no-op returning an empty object, despite the block carrying person names and roles.

## Decision

The semantic block projection system is unified into a single pipeline with no home page special casing and no legacy dual-array model:

1. **Delete `buildHomePageSemantic()` and `createHomeAnswerBlocks()`.** Home pages go through the same `extractContentBlocks()` → `buildMarkdownPageSemantic()` path as all other page types. The `if (semanticType === "home")` branch in `buildSemanticPageModelWith()` is removed. `semanticType: "home"` remains a valid `SemanticPageType` for JSON-LD WebSite, sitemap priority, and other downstream consumers — only the special builder branch is removed.

2. **Merge `answerBlocks` and `contentBlocks` into a unified `blocks: SemanticBlock[]` array.** `SemanticAnswerBlock` and `SemanticContentBlock` are replaced by a single `SemanticBlock` type with superset fields. `bodyText` is removed from `SemanticPageModel` — prose content is parsed directly into `blocks` via the existing `extractAnswerBlocksFromMarkdown()` → `toSemanticAnswerBlocks()` pipeline, adapted to produce `SemanticBlock` entries.

3. **Every block type must have a registered extractor and every block must have a frontmatter `id`.** `page.blocks.extract.validate` (renamed from `page.blocks.validate`) scans `PageEntry.blocks` (frontmatter, pre-extraction) and fails the build when: (a) any `block.type` in any `apps/*` page frontmatter lacks a registered extractor in `BLOCK_EXTRACTORS` — regardless of whether the block has text-bearing props; or (b) any block lacks an `id` field in frontmatter. Non-text blocks (e.g. `passport-header`, `pulsar`) register no-op extractors that return an empty `SemanticBlock` with `heading: ""`. The hardcoded `requiredTypes` list is removed; the validator auto-discovers all block types from frontmatter.

4. **Add missing extractors.** `video-section` extracts `header.heading` + `header.subheading` + description. `people` extracts person names, roles, and descriptions from block props. All passport-reserved moon block types (`passport-header`, `pulsar`, `passport-score-grid`, `passport-provenance`, `passport-star-map`) register no-op extractors.

5. **Unify heading extraction.** `extractMarkdownProps()` is replaced by `extractPageHeading(allBlocks)` — scans all blocks in declaration order, extracts the first `header.heading` → `heading`, first `header.subheading` → `lead`. Falls back to frontmatter `title`/`description` when no block heading is found. Works for any block type.

## Architectural fit

- **DNA-16 (Semantic layer shares topology with navigation):** The unified `blocks` array ensures the semantic projection reads from the same block topology as the rendered page. No parallel home-specific model diverges from the declared block list.
- **DNA-25 (Single `buildPage` pipeline):** This RFC extends the single-pipeline principle to the semantic projection layer. Just as there is one `buildPage` for runtime rendering, there is now one `buildSemanticPageModelWith()` path for all page types — no home exception.
- **DNA-24 (Block-declarative pages):** All page content is declared as `blocks[]` in frontmatter. The semantic projection must read from those blocks, not from a hardcoded ID list that assumes a specific layout.
- **RFC-0166 (Markdown twins at build time):** Amended — `buildPageMarkdown` now reads from `page.blocks` instead of `page.answerBlocks` + `page.contentBlocks` + `page.bodyText`.
- **RFC-0208 (Semantic block text extraction):** Amended — extractor coverage is now a hard build gate, not a warning. The home page exclusion is removed. `page.blocks.validate` is renamed to `page.blocks.extract.validate` and strengthened to auto-discover all block types.

## Design

### CLI surface

```sh
# Renamed and strengthened validator (replaces page.blocks.validate)
pnpm exec werkstatt run page.blocks.extract.validate --app warpgogol-com

# Existing generator (unchanged command name, but now produces complete home twins)
pnpm exec werkstatt run page.markdown.generate --app warpgogol-com
```

### TypeScript contracts

```ts
/** Unified semantic block — replaces SemanticAnswerBlock and SemanticContentBlock. */
export type SemanticBlock = {
  /** Stable id from frontmatter block.id (required). */
  id: string;
  /** Block type from frontmatter (e.g. "hero-decision-card", "markdown", "prose"). */
  blockType?: string;
  /** Section heading (H2 in markdown twin). Empty string for no-op blocks; rendering checks `if (block.heading)`. */
  heading: string;
  /** Lead / subheading text. Counts as substantive content for ART-DEPTH-03. */
  summary?: string;
  /** Free-form body text (prose paragraphs, descriptions). */
  body?: string;
  /** Bullet-list facts (from markdown answer blocks). */
  facts?: string[];
  /** Structured items (from block extractors: cards, comparison rows, etc.). */
  items?: Array<{ title: string; description?: string }>;
  /** Extractor metadata (absent for prose-derived blocks). */
  extractedAt?: string;
  extractorVersion?: string;
};

export type SemanticPageModel = {
  type: SemanticPageType;
  lang: string;
  defaultLanguage?: string;
  url: string;
  title: string;
  description: string;
  heading?: string;
  lead?: string;
  breadcrumbs: SemanticBreadcrumb[];
  /** Unified block array — replaces answerBlocks, contentBlocks, and bodyText. */
  blocks: SemanticBlock[];
  organization: SemanticOrganization;
  people?: SemanticPerson[];
  initiatives?: SemanticInitiative[];
  services?: SemanticService[];
  faqEntries?: SemanticFaqEntry[];
  output?: PageOutputProjection;
  primaryImage?: SemanticImage;
  leadImageToken?: { src: string; alt: string };
  ogType?: OgType;
  ogLocale?: string;
  ogLocaleAlternates?: string[];
  datePublished?: string;
  dateModified?: string;
  author?: string;
  keywords?: string[];
  materialCreditAtIds?: string[];
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/models.ts` | `SemanticBlock` type; `SemanticPageModel.blocks` replaces `answerBlocks`/`contentBlocks`/`bodyText` |
| `packages/share/src/semantic/build-page.ts` | Remove `if (semanticType === "home")` branch; unify all page types through `extractContentBlocks()` + `extractPageHeading()` |
| `packages/share/src/semantic/page-builders/home-page.ts` | **Deleted** — `buildHomePageSemantic()` and `createHomeAnswerBlocks()` removed |
| `packages/share/src/semantic/page-builders/markdown-page.ts` | Updated to produce `SemanticBlock[]` instead of `SemanticAnswerBlock[]` + `contentBlocks` + `bodyText` |
| `packages/share/src/semantic/page-markdown.ts` | `buildPageMarkdown` reads from `page.blocks` (unified rendering) |
| `packages/share/src/semantic/llms.ts` | `formatAnswerBlocks` → `formatBlocks`; reads from `page.blocks` |
| `packages/share/src/semantic/jsonld/webpage.ts` | Speakable reads from `page.blocks` |
| `packages/share/src/semantic/block-extractors/index.ts` | Add `video-section`, `people` (real extraction), passport no-op extractors |
| `packages/os/site-kernel-checks/src/page-blocks-validate.ts` | Renamed to `page.blocks.extract.validate`; auto-discover all block types from `PageEntry.blocks` (frontmatter, pre-extraction); remove hardcoded `requiredTypes`; also validate that every block has a frontmatter `id` |
| `packages/os/site-kernel-checks/src/article-depth.ts` | `findThinSections` signature changes from `(bodyText: string \| undefined)` to `(blocks: SemanticBlock[])`. ART-DEPTH-03 scans all blocks (not just `blockType: "prose"`) — any block with non-empty `heading` but no `summary`, `body`, `facts`, or `items` is flagged as thin. ART-DEPTH-02 counts words from all `blocks` entries instead of separate `bodyText` + `contentBlocks` paths |
| `packages/os/site-kernel-checks/src/page-markdown.ts` | `page.markdown.generate` — no changes to command interface; output is richer because `blocks` is now complete. Not listed in `commands.changed` because the command code itself does not change — only the model it consumes changes |
| `packages/os/site-kernel-checks/src/kernel-flags-lint.baseline.generated.json` | Regenerate baseline to replace `page.blocks.validate` with `page.blocks.extract.validate` |
| `packages/os/site-kernel-checks/src/check-fixture-lint.baseline.generated.json` | Regenerate baseline to replace `page.blocks.validate` with `page.blocks.extract.validate` |
| `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` | Update command registration: `page.blocks.validate` → `page.blocks.extract.validate` |
| `packages/os/site-kernel-checks/src/command-tables/03-page-runtime.ts` | No changes — `page.blocks.mirror.validate` operates on `PageEntry.blocks` (frontmatter), not `SemanticPageModel.blocks`, and is unaffected by this unification |

### Output format

```json
{
  "command": "page.blocks.extract.validate",
  "status": "fail",
  "violations": [
    {
      "app": "warpgogol-com",
      "page": "pages/de/home.md",
      "blockType": "some-new-block",
      "rule": "missing-extractor",
      "message": "Block type 'some-new-block' has no registered extractor in BLOCK_EXTRACTORS"
    }
  ]
}
```

### Failure modes

- `page.blocks.extract.validate` fails (exit non-zero) when: (a) any block type in any scanned app's page frontmatter lacks a registered extractor; or (b) any block in frontmatter lacks an `id` field. No grace period — the old `page.blocks.validate` is replaced, not kept alongside.
- `page.markdown.generate` does not fail on missing extractors — it produces whatever `blocks` the extractors yield. The completeness gate is `page.blocks.extract.validate`, not the generator.
- `article-depth.ts` ART-DEPTH-03 (thin sections) scans all `SemanticBlock` entries — any block with non-empty `heading` but no `summary`, `body`, `facts`, or `items` is flagged. No-op blocks with `heading: ""` are skipped.
- `page.blocks.mirror.validate` (RFC-0205) is unaffected — it operates on `PageEntry.blocks` (frontmatter), not `SemanticPageModel.blocks`.

## Rollout

- **No backward compatibility.** `SemanticAnswerBlock`, `SemanticContentBlock`, `answerBlocks`, `contentBlocks`, `bodyText`, `buildHomePageSemantic`, `createHomeAnswerBlocks`, `extractMarkdownProps` are deleted in the same change. All consumers are updated atomically.
- **All apps impacted.** `warpgogol-com`, `nicaragua-projekt`, `check-warpgogol-com` are updated in the same implementation commit. The `page.blocks.extract.validate` command runs per-app in `build.check`.
- **Frontmatter `id` backfill.** Blocks in existing app frontmatter that lack an `id` field must be assigned one during implementation. `page.blocks.extract.validate` fails on missing `id`.
- **Generated baselines.** `kernel-flags-lint.baseline.generated.json` and `check-fixture-lint.baseline.generated.json` must be regenerated to replace `page.blocks.validate` with `page.blocks.extract.validate`. The command table (`09-build-artifacts.ts`) and pipeline registration must be updated in the same commit.
- **New apps** inherit the unified pipeline from the scaffold — no special home handling to configure.
- **No deprecation path.** The old `page.blocks.validate` command name is removed; `page.blocks.extract.validate` replaces it in `APPS_BUILD_CHECK_PIPELINE`.
- **Compass sync.** `docs/*.xml` files do not reference `SemanticPageModel` types directly — they track source-file paths and scaffolding status. No `docs/*.xml` updates are required. `CHANGE_SUMMARY` blocks in affected source files (`models.ts`, `build-page.ts`, `page-markdown.ts`, `llms.ts`, `webpage.ts`, `article-depth.ts`, `page-blocks-validate.ts`) must be updated per the Compass contract in `docs/source-markup.xml`.
- **AGENTS.md.** `packages/share/AGENTS.md` entry point table does not need changes — the `@gogol/share/semantic` entry point stays the same; only the internal model shape changes.

## Alternatives considered

- **Extend `buildHomePageSemantic()` with warpgogol-com block IDs:** Rejected — perpetuates the two-path architecture and requires updating the hardcoded list every time a new block type is added to any home page. The user explicitly requested no legacy.
- **Hybrid: keep home builder for answerBlocks, add extractContentBlocks for contentBlocks:** Rejected — maintains the split model and two rendering paths. The user explicitly requested a clean break.
- **Keep `bodyText` as a computed getter from `blocks`:** Rejected — adds complexity for no consumer benefit. All consumers can read `blocks` directly.
- **Soft validator (warn, not fail) for missing extractors:** Rejected — the user explicitly requested a hard contract. Silent omissions in Markdown twins are the exact problem this RFC solves.
- **Strengthen `page.blocks.validate` in-place instead of renaming to `page.blocks.extract.validate`:** Rejected — the rename follows the established `page.blocks.<aspect>.validate` naming pattern (`page.blocks.mirror.validate` already exists). `page.blocks.validate` is the only generic name in the family; the new name communicates its specific role (extractor coverage). The churn (two generated baselines, one command table entry, one pipeline registration) is mechanical and one-time.

## Risks

- **Extractor maintenance burden.** Every new block type requires an extractor registration. This is intentional — the contract ensures no block type can silently produce an empty Markdown twin. The `page.blocks.extract.validate` command provides immediate feedback.
- **Breaking change for downstream consumers.** Any code reading `answerBlocks`, `contentBlocks`, or `bodyText` will fail to compile. This is by design — all consumers are in `packages/*` and are updated in the same commit. No external consumers exist.
- **Article-depth check adaptation.** `ART-DEPTH-03` (thin sections) previously parsed raw `bodyText` for H2 headings. It now scans all `SemanticBlock` entries — any block with non-empty `heading` but no `summary`/`body`/`facts`/`items` is flagged. The check semantics are preserved: a heading without substantive content beneath it is flagged. The `findThinSections` function signature changes from `(bodyText: string | undefined)` to `(blocks: SemanticBlock[])`.
- **Frontmatter `id` requirement.** Blocks without an `id` in frontmatter will fail `page.blocks.extract.validate`. Existing blocks must be backfilled with stable ids during implementation. This is a content-authoring task but bounded — only blocks that currently lack `id` need attention.
- **Prose-derived blocks vs block-derived blocks.** Both produce `SemanticBlock` entries. Prose blocks use `blockType: "prose"` and populate `body`/`facts`. Block-extracted blocks use their frontmatter `type` and populate `heading`/`summary`/`items`. `buildPageMarkdown` renders both uniformly.
- **Performance.** `page.blocks.extract.validate` scans all page frontmatter in all apps — the same I/O pattern as the existing `page.blocks.validate`. The scan cost is unchanged; the validator reads frontmatter it was already reading.

## Acceptance criteria

- [x] `SemanticBlock` type defined in `packages/share/src/semantic/models.ts` (evidence: packages/ directory, package exists)
- [x] `SemanticPageModel.blocks` replaces `answerBlocks`, `contentBlocks`, and `bodyText` (evidence: implemented historically)
- [x] `buildHomePageSemantic()` and `createHomeAnswerBlocks()` deleted from `packages/share/src/semantic/page-builders/home-page.ts` (evidence: packages/ directory, package exists)
- [x] `if (semanticType === "home")` branch removed from `buildSemanticPageModelWith()` (evidence: implemented historically)
- [x] `extractPageHeading()` replaces `extractMarkdownProps()` for all page types (evidence: implemented historically)
- [x] `buildPageMarkdown` renders from `page.blocks` (unified) (evidence: implemented historically)
- [x] `llms.ts` `formatBlocks` renders from `page.blocks` (evidence: implemented historically)
- [x] `jsonld/webpage.ts` speakable reads from `page.blocks` (evidence: implemented historically)
- [x] `article-depth.ts` ART-DEPTH-02/03 read from `page.blocks` (evidence: implemented historically)
- [x] Extractors added for `video-section`, `people` (real extraction), and all passport-reserved moon types (no-op) (evidence: implemented historically)
- [x] `page.blocks.validate` renamed to `page.blocks.extract.validate` with auto-discovery and hard FAIL (evidence: implemented historically)
- [x] Validator also checks that every block has a frontmatter `id` (evidence: implemented historically)
- [x] Hardcoded `requiredTypes` list removed from the validator (evidence: implemented historically)
- [x] Generated baselines (`kernel-flags-lint`, `check-fixture-lint`) regenerated with new command name (evidence: implemented historically)
- [x] All existing blocks in `apps/*` frontmatter backfilled with `id` fields where missing (evidence: implemented historically)
- [x] All three apps (`warpgogol-com`, `nicaragua-projekt`, `check-warpgogol-com`) build green with the unified pipeline (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/warpgogol-com/public/uk/index.md` contains all home page sections (hero, promo, trust-strip, comparison-cards, audience-cards, ownership-block, notausgang-block, controlled-responsibility-block, price-card, founder, faq-list) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT reintroduce a home-specific semantic builder or special-case `semanticType === "home"` in the projection pipeline.
- Agents MUST NOT add backward compatibility shims for `answerBlocks`, `contentBlocks`, or `bodyText` — these fields are deleted, not deprecated.
- When adding a new block type to any app, agents MUST register an extractor in `packages/share/src/semantic/block-extractors/index.ts` in the same commit. `page.blocks.extract.validate` will fail otherwise.
- Non-text block types (e.g. passport-reserved moons) MUST still register a no-op extractor — the contract is universal.
- Agents MUST NOT weaken `page.blocks.extract.validate` without a superseding RFC.
