---
rfcId: RFC-0372
planId: PLAN-RFC-0372-01
status: draft
owner: architecture
createdAt: 2026-07-10
updatedAt:
scope:
  apps:
    - apps/warpgogol-com
    - apps/nicaragua-projekt
    - apps/check-warpgogol-com
  packages:
    - packages/share
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-content
  services: []
  docs:
    - docs/rfcs/rfc-0372-unify-semantic-block-projection-and-eliminate-home-page-special-casing.md
---

# Implementation Plan: RFC-0372

## 1. Objectives

- [ ] O1 — Define `SemanticBlock` type and replace `answerBlocks`/`contentBlocks`/`bodyText` with unified `blocks` array on `SemanticPageModel` (acceptance criteria 1–2)
- [ ] O2 — Delete `buildHomePageSemantic()` and `createHomeAnswerBlocks()`; remove `if (semanticType === "home")` branch (acceptance criteria 3–4)
- [ ] O3 — Replace `extractMarkdownProps()` with `extractPageHeading()` for all page types (acceptance criterion 5)
- [ ] O4 — Update all consumers (`buildPageMarkdown`, `llms.ts`, `jsonld/webpage.ts`, `article-depth.ts`) to read from `page.blocks` (acceptance criteria 6–9)
- [ ] O5 — Add missing extractors (`video-section`, `people`) and passport no-op extractors (acceptance criterion 10)
- [ ] O6 — Rename `page.blocks.validate` → `page.blocks.extract.validate` with auto-discovery, hard FAIL, frontmatter `id` check, and baseline regeneration (acceptance criteria 11–14)
- [ ] O7 — All three apps build green with the unified pipeline (acceptance criterion 15)
- [ ] O8 — `apps/warpgogol-com/public/uk/index.md` contains all home page sections (acceptance criterion 16)
- [ ] O9 — Home pages no longer emit Service JSON-LD nodes (services extraction deferred to a separate RFC)

## 2. Affected artifacts

### 2.1 Code and commands

**`packages/share/src/semantic/`**

- `models.ts` — Define `SemanticBlock` type; replace `SemanticAnswerBlock` + `SemanticContentBlock` with `SemanticBlock`; replace `answerBlocks: SemanticAnswerBlock[]` + `contentBlocks?: SemanticContentBlock[]` + `bodyText?: string` on `SemanticPageModel` with `blocks: SemanticBlock[]`
- `build-page.ts` — Remove `if (semanticType === "home")` branch (lines 180–204); remove `import { buildHomePageSemantic }`; replace `extractMarkdownProps()` with `extractPageHeading(allBlocks)`; adapt `extractContentBlocks()` to return `SemanticBlock[]`; adapt prose parsing (`extractAnswerBlocksFromMarkdown` → `toSemanticAnswerBlocks`) to produce `SemanticBlock` entries with `blockType: "prose"`
- `page-builders/home-page.ts` — **Delete entire file** (`buildHomePageSemantic()` + `createHomeAnswerBlocks()`)
- `page-builders/markdown-page.ts` — Update `MarkdownPageInput` to accept `blocks: SemanticBlock[]` instead of `bodyText` + `contentBlocks`; produce `SemanticPageModel` with `blocks` only
- `page-utils.ts` — Update `toSemanticAnswerBlocks()` to return `SemanticBlock[]` instead of `SemanticAnswerBlock[]`; add `blockType: "prose"` to each entry; keep `extractAnswerBlocksFromMarkdown()` as-is (it produces intermediate `{ heading, content }` pairs)
- `page-markdown.ts` — `buildPageMarkdown`: replace dual `page.answerBlocks` + `page.contentBlocks` rendering with single `page.blocks` loop; render `heading` (skip if empty string), `summary`, `body`, `facts`, `items`
- `llms.ts` — `formatAnswerBlocks` → `formatBlocks`; read from `page.blocks` with same rendering logic as `buildPageMarkdown`
- `jsonld/webpage.ts` — Speakable: replace `page.answerBlocks.length > 0` with `page.blocks.length > 0` (or `page.blocks.some(b => b.heading)`)
- `block-extractors/index.ts` — Add `video-section` extractor (extract `header.heading` + `header.subheading` + description); replace `people` no-op with real extractor (extract person names, roles, descriptions from `body.people` or `body.cards`); add no-op extractors for `passport-header`, `pulsar`, `passport-score-grid`, `passport-provenance`, `passport-star-map`
- `index.ts` (barrel) — Export `SemanticBlock` type; remove `SemanticAnswerBlock` + `SemanticContentBlock` exports

**`packages/os/site-kernel-checks/src/`**

- `page-blocks-validate.ts` — Rename command to `page.blocks.extract.validate`; remove `requiredTypes` hardcoded list; auto-discover all block types from frontmatter (`PageEntry.blocks`); add `missing-id` rule (fail when any block lacks frontmatter `id`); change `missing-extractor` to fail on ANY block type without a registered extractor (not just text-bearing ones); update command name strings in result/summary
- `article-depth.ts` — `findThinSections`: change signature from `(bodyText: string | undefined)` to `(blocks: SemanticBlock[])`; scan all blocks — flag any with non-empty `heading` but no `summary`/`body`/`facts`/`items`; skip blocks with `heading: ""`; ART-DEPTH-02: count words from all `blocks` entries (remove separate `bodyText` + `contentBlocks` paths)
- `command-tables/09-build-artifacts.ts` — Rename command registration from `page.blocks.validate` to `page.blocks.extract.validate`; update description
- `kernel-flags-lint.baseline.generated.json` — Regenerate (replace `page.blocks.validate` with `page.blocks.extract.validate`)
- `check-fixture-lint.baseline.generated.json` — Regenerate (same replacement)
- `module.ts` — Update pipeline registration if `page.blocks.validate` is referenced by name in pipeline arrays

**`packages/os/site-kernel-content/src/`**

- `semantic-loader.ts` — Update any references to `answerBlocks`/`contentBlocks`/`bodyText` on `SemanticPageModel` to use `blocks`

### 2.2 Configuration and data

- `apps/warpgogol-com/src/content/pages/de/home.md` — Already has `id` on all blocks ✓
- `apps/warpgogol-com/src/content/pages/uk/home.md` — Verify `id` fields present
- `apps/nicaragua-projekt/src/content/pages/de/home.md` — Already has `id` on all blocks ✓
- `apps/check-warpgogol-com/src/content/pages/` — Verify `id` fields present on all pages with blocks
- Any remaining app pages with blocks lacking `id` — backfill with stable ids

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0372-*.md` — Read-only reference (accepted status)
- No `docs/*.xml` Compass updates required (RFC confirms: `docs/*.xml` does not reference `SemanticPageModel` types)
- `CHANGE_SUMMARY` blocks in affected source files must be updated per `docs/source-markup.xml`:
  - `packages/share/src/semantic/models.ts`
  - `packages/share/src/semantic/build-page.ts`
  - `packages/share/src/semantic/page-builders/markdown-page.ts`
  - `packages/share/src/semantic/page-utils.ts`
  - `packages/share/src/semantic/page-markdown.ts`
  - `packages/share/src/semantic/llms.ts`
  - `packages/share/src/semantic/jsonld/webpage.ts`
  - `packages/share/src/semantic/block-extractors/index.ts`
  - `packages/os/site-kernel-checks/src/page-blocks-validate.ts`
  - `packages/os/site-kernel-checks/src/article-depth.ts`
- `packages/share/AGENTS.md` — No changes needed (entry point table unchanged)

### 2.4 Validation and pipelines

- `page.blocks.extract.validate` replaces `page.blocks.validate` in `APPS_BUILD_CHECK_PIPELINE`
- `pnpm exec werkstatt run rfc.validate RFC-0372 --json` — must pass
- `pnpm --filter @gogol/share run build:check` — must pass after type changes
- `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass after validator changes
- `pnpm run build:check` per app — all three apps must build green
- Generated baselines must be regenerated after command rename

## 3. Step sequence

### Step 1. Define `SemanticBlock` type and update `SemanticPageModel`

**Goal:** Establish the unified type contract that all downstream code will consume.

**Agent actions:**

- Add `SemanticBlock` type to `packages/share/src/semantic/models.ts` with fields: `id: string`, `blockType?: string`, `heading: string`, `summary?: string`, `body?: string`, `facts?: string[]`, `items?: Array<{ title: string; description?: string }>`, `extractedAt?: string`, `extractorVersion?: string`
- Replace `answerBlocks: SemanticAnswerBlock[]` + `contentBlocks?: SemanticContentBlock[]` + `bodyText?: string` on `SemanticPageModel` with `blocks: SemanticBlock[]`
- Keep `SemanticAnswerBlock` and `SemanticContentBlock` types temporarily (they will be deleted in Step 5 after all consumers are migrated)
- Update `CHANGE_SUMMARY` in `models.ts`

**Validation:**

- `pnpm --filter @gogol/share run build:check` — expect type errors in consumers (this is expected; subsequent steps fix them)

**Completion criterion:** `SemanticBlock` type is defined; `SemanticPageModel.blocks` field exists; `answerBlocks`/`contentBlocks`/`bodyText` fields are removed from `SemanticPageModel`.

**Human review:** no

---

### Step 2. Update `page-utils.ts` to produce `SemanticBlock[]`

**Goal:** Adapt the prose parsing pipeline to emit `SemanticBlock` entries.

**Agent actions:**

- Update `toSemanticAnswerBlocks()` return type from `SemanticAnswerBlock[]` to `SemanticBlock[]`
- Add `blockType: "prose"` to each entry
- Map `id` from `slugify(block.heading)`, `heading` from `block.heading`, `summary`/`facts` from existing logic
- Update `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/share run build:check` — expect type errors in `markdown-page.ts` (fixed in Step 3)

**Completion criterion:** `toSemanticAnswerBlocks()` returns `SemanticBlock[]` with `blockType: "prose"`.

**Human review:** no

---

### Step 3. Update `extractContentBlocks()` and add `extractPageHeading()`

**Goal:** Replace the two extraction paths with one unified path.

**Agent actions:**

- In `build-page.ts`, update `extractContentBlocks()` to return `SemanticBlock[]` instead of `SemanticContentBlock[]`: map `blockId` → `id`, `blockType` → `blockType`, `heading`/`lead` → `heading`/`summary`, keep `body`/`items`, add `extractedAt`/`extractorVersion`
- Remove the `if (extracted.heading || extracted.lead || ...)` filter — always push the block (no-op extractors return `heading: ""`)
- Replace `extractMarkdownProps()` with `extractPageHeading(allBlocks)`: scan all **frontmatter** blocks in declaration order (raw `block.props`, not `SemanticBlock`), extract first `header.heading` → `heading`, first `header.subheading` → `lead`; fall back to frontmatter `title`/`description`. Works with any block type that has `header.heading` (hero-decision-card, markdown, etc.) — not limited to `type: "markdown"`
- Update `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/share run build:check` — expect type errors in `markdown-page.ts` and `home-page.ts` (fixed in Steps 4–5)

**Completion criterion:** `extractContentBlocks()` returns `SemanticBlock[]`; `extractPageHeading()` replaces `extractMarkdownProps()` and scans frontmatter block props (any block type) for `header.heading`.

**Human review:** no

---

### Step 4. Update `markdown-page.ts` builder

**Goal:** Adapt the generic page builder to consume and produce `SemanticBlock[]`.

**Agent actions:**

- Update `MarkdownPageInput`: replace `bodyText?: string` + `contentBlocks?: SemanticContentBlock[]` with `blocks: SemanticBlock[]`
- In `buildMarkdownPageSemantic()`: remove `extractAnswerBlocksFromMarkdown(bodyText)` + `toSemanticAnswerBlocks()` call (prose parsing now happens in `build-page.ts` before calling the builder); accept `blocks` directly
- `build-page.ts` is responsible for: (1) parsing prose → `SemanticBlock[]` with `blockType: "prose"`, (2) extracting block-derived → `SemanticBlock[]` via `extractContentBlocks()`, (3) merging both arrays **in frontmatter declaration order** (blocks and prose interleaved as they appear in the page), (4) passing the merged `blocks` to the builder
- Return `SemanticPageModel` with `blocks` only (no `answerBlocks`/`contentBlocks`/`bodyText`)
- Update `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/share run build:check` — expect type errors in `build-page.ts` (fixed in Step 5)

**Completion criterion:** `buildMarkdownPageSemantic()` accepts and returns `SemanticBlock[]` via `blocks`.

**Human review:** no

---

### Step 5. Delete `home-page.ts` and remove home branch from `build-page.ts`

**Goal:** Eliminate the home page special casing.

**Agent actions:**

- Delete `packages/share/src/semantic/page-builders/home-page.ts`
- Remove `import { buildHomePageSemantic }` from `build-page.ts`
- Remove the `if (semanticType === "home")` branch (lines 180–204) in `buildSemanticPageModelWith()`
- Unify the flow: all page types go through `extractContentBlocks()` → `extractPageHeading()` → `buildMarkdownPageSemantic()` with `blocks`
- Preserve FAQ resolution: `resolveFaqEntries()` is still called for all page types (it already checks `faq-list` blocks)
- **Services extraction deferred.** Home pages previously derived services from `approach` cards or `organization.offer.growthModules` via `buildHomePageSemantic()`. After unification, home pages will NOT emit Service JSON-LD nodes. This is accepted scope reduction — a separate RFC will restore services extraction for home pages if needed.
- Update `CHANGE_SUMMARY` in `build-page.ts`

**Validation:**

- `pnpm --filter @gogol/share run build:check` — must pass (all type errors resolved)

**Completion criterion:** `home-page.ts` is deleted; `buildSemanticPageModelWith()` has no `semanticType === "home"` branch; all page types use the unified path.

**Human review:** no

---

### Step 6. Update consumers: `page-markdown.ts`, `llms.ts`, `jsonld/webpage.ts`

**Goal:** All rendering/projection consumers read from `page.blocks`.

**Agent actions:**

- `page-markdown.ts` `buildPageMarkdown()`: replace the dual `page.answerBlocks` loop (lines 54–67) + `page.contentBlocks` loop (lines 70–96) with a single `page.blocks` loop; render: skip `## heading` if `heading` is empty string; render `summary` as paragraph; render `body` as paragraph; render `facts` as bullet list; render `items` as `### title` + description
- `llms.ts` `formatAnswerBlocks()` → `formatBlocks()`: same rendering logic as `buildPageMarkdown` but with `###` heading level; read from `page.blocks`; filter `excludeIds` by `block.id`
- `jsonld/webpage.ts` speakable: replace `page.answerBlocks.length > 0` with `page.blocks.some((b) => b.heading)`
- Update `CHANGE_SUMMARY` in all three files

**Validation:**

- `pnpm --filter @gogol/share run build:check` — must pass

**Completion criterion:** All three consumers read exclusively from `page.blocks`; no references to `answerBlocks`/`contentBlocks`/`bodyText` remain.

**Human review:** no

---

### Step 7. Add missing extractors and passport no-ops

**Goal:** Ensure every block type used in any app has a registered extractor.

**Agent actions:**

- In `block-extractors/index.ts`:
  - Add `video-section` extractor: extract `header.heading` → `heading`, `header.subheading` → `summary`, `description` or prose `contentRef` body → `body`
  - Replace `people` no-op with real extractor: extract `header.heading` → `heading`, person entries from `body.people` or `body.cards` → `items` with `{ title: person.name, description: person.role }`
  - Add no-op extractors for `passport-header`, `pulsar`, `passport-score-grid`, `passport-provenance`, `passport-star-map`: return `{ heading: "" }`
  - Add no-op extractors for any other block types currently in app frontmatter that lack extractors (auto-discovered in Step 9)
- Update `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/share run build:check` — must pass

**Completion criterion:** `BLOCK_EXTRACTORS` has entries for `video-section`, `people` (real extraction), and all 5 passport-reserved moon types.

**Human review:** no

---

### Step 8. Rename and strengthen `page.blocks.validate` → `page.blocks.extract.validate`

**Goal:** Replace the validator with auto-discovery and hard FAIL.

**Agent actions:**

- In `page-blocks-validate.ts`:
  - Rename command string from `page.blocks.validate` to `page.blocks.extract.validate` in all result/summary strings
  - Remove `TEXT_PROP_PATHS` + `hasTextProps()` — no longer needed (all block types require extractors)
  - Remove hardcoded `requiredTypes` list (lines 148–163)
  - Change the frontmatter scan (lines 126–144): fail on ANY `block.type` that lacks a registered extractor (not just text-bearing ones)
  - Add `missing-id` rule: fail when any block in frontmatter lacks an `id` field
  - Remove `page.contentBlocks` / `page.bodyText` references in the report loop (lines 95–109) — read from `page.blocks` instead
  - Update `MODULE_CONTRACT` purpose and `CHANGE_SUMMARY`
- In `command-tables/09-build-artifacts.ts`: rename `name: "page.blocks.validate"` to `name: "page.blocks.extract.validate"`; update description
- In `module.ts`: update pipeline registration if `page.blocks.validate` is referenced by name
- Regenerate `kernel-flags-lint.baseline.generated.json` and `check-fixture-lint.baseline.generated.json` (run the baseline generators or manually replace `page.blocks.validate` with `page.blocks.extract.validate`)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass
- `pnpm exec werkstatt run page.blocks.extract.validate --app warpgogol-com` — must pass (all extractors registered)
- `pnpm exec werkstatt run page.blocks.extract.validate --app nicaragua-projekt` — must pass
- `pnpm exec werkstatt run page.blocks.extract.validate --app check-warpgogol-com` — must pass

**Completion criterion:** `page.blocks.extract.validate` runs per-app, auto-discovers all block types from frontmatter, fails on missing extractor or missing `id`; old `page.blocks.validate` name is gone; baselines regenerated.

**Human review:** no

---

### Step 9. Update `article-depth.ts`

**Goal:** Adapt ART-DEPTH-02/03 to read from `page.blocks`.

**Agent actions:**

- Change `findThinSections` signature from `(bodyText: string | undefined)` to `(blocks: SemanticBlock[])`
- Update logic: scan all blocks — flag any with non-empty `heading` but no `summary`/`body`/`facts`/`items` as thin; skip blocks with `heading: ""`
- ART-DEPTH-02: replace `countWords(model.bodyText)` + `for (const block of model.contentBlocks ?? [])` with a single `for (const block of model.blocks)` loop; count words from `heading` + `summary` + `body` + `facts` + `items`; exclude CTA-prefixed items
- Update `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass
- `pnpm exec werkstatt run article.depth.validate --app warpgogol-com` — must pass

**Completion criterion:** `article-depth.ts` reads exclusively from `page.blocks`; `findThinSections` accepts `SemanticBlock[]`.

**Human review:** no

---

### Step 10. Update `packages/os/site-kernel-content/src/semantic-loader.ts`

**Goal:** Fix any remaining references to removed fields in the content loader.

**Agent actions:**

- Search `semantic-loader.ts` for `answerBlocks`/`contentBlocks`/`bodyText` references
- Update to use `blocks`
- Update `CHANGE_SUMMARY` if file is modified

**Validation:**

- `pnpm --filter @gogol/site-kernel-content run build:check` — must pass

**Completion criterion:** No references to `answerBlocks`/`contentBlocks`/`bodyText` remain in `site-kernel-content`.

**Human review:** no

---

### Step 11. Delete `SemanticAnswerBlock` and `SemanticContentBlock` types

**Goal:** Remove the legacy types now that all consumers are migrated.

**Agent actions:**

- Delete `SemanticAnswerBlock` type from `models.ts`
- Delete `SemanticContentBlock` type from `models.ts`
- Remove any remaining imports of these types across the codebase
- Update `CHANGE_SUMMARY` in `models.ts`

**Validation:**

- `pnpm --filter @gogol/share run build:check` — must pass with zero references to deleted types

**Completion criterion:** `SemanticAnswerBlock` and `SemanticContentBlock` are deleted; no imports remain.

**Human review:** no

---

### Step 12. Backfill missing frontmatter `id` fields

**Goal:** Ensure every block in every app has a frontmatter `id`.

**Agent actions:**

- Run `page.blocks.extract.validate` on each app to discover blocks missing `id`
- Backfill `id` fields in app frontmatter where missing
- `apps/warpgogol-com` home page: already has `id` on all blocks ✓
- `apps/nicaragua-projekt` home page: already has `id` on all blocks ✓
- Check all other pages with blocks in all three apps

**Validation:**

- `pnpm exec werkstatt run page.blocks.extract.validate --app warpgogol-com` — must pass (no `missing-id` violations)
- Same for `nicaragua-projekt` and `check-warpgogol-com`

**Completion criterion:** `page.blocks.extract.validate` passes on all three apps with zero `missing-id` violations.

**Human review:** no

---

### Step 13. Full build verification

**Goal:** All three apps build green with the unified pipeline.

**Agent actions:**

- Run `pnpm run build:check` for `warpgogol-com`
- Run `pnpm run build:check` for `nicaragua-projekt`
- Run `pnpm run build:check` for `check-warpgogol-com`
- Verify `apps/warpgogol-com/public/uk/index.md` contains all home page sections: hero, promo, trust-strip, comparison-cards, audience-cards, ownership-block, notausgang-block, controlled-responsibility-block, price-card, founder, faq-list
- Run `pnpm exec werkstatt run rfc.validate RFC-0372 --json` — must pass

**Validation:**

- All three `build:check` runs pass
- `public/uk/index.md` contains all expected sections
- `rfc.validate` passes

**Completion criterion:** All acceptance criteria checkboxes in RFC-0372 are verifiable as checked.

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0372 --json`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-content run build:check`
- `pnpm exec werkstatt run page.blocks.extract.validate --app warpgogol-com`
- `pnpm exec werkstatt run page.blocks.extract.validate --app nicaragua-projekt`
- `pnpm exec werkstatt run page.blocks.extract.validate --app check-warpgogol-com`
- `pnpm exec werkstatt run article.depth.validate --app warpgogol-com`
- `pnpm run build:check` (per app, all three)
- Verify `apps/warpgogol-com/public/uk/index.md` contains all home page sections

### 4.2 Evidence artifacts

- Generated `public/uk/index.md` with all home sections present
- Generated `public/de/index.md` with all home sections present
- Commit messages referencing `RFC-0372` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Extractor maintenance burden | Step 7 adds all missing extractors; Step 8 enforces the contract going forward |
| Breaking change for downstream consumers | Steps 1–6 update all consumers atomically; Step 11 deletes legacy types only after all consumers are migrated |
| Article-depth check adaptation | Step 9 updates `findThinSections` signature and ART-DEPTH-02 word counting |
| Frontmatter `id` requirement | Step 12 backfills missing ids; Step 8 enforces the requirement going forward |
| Prose-derived vs block-derived blocks | Steps 2–3 ensure both produce `SemanticBlock` entries with appropriate `blockType` |
| Performance | No mitigation needed — scan cost is unchanged (same frontmatter I/O as existing validator) |
| Services extraction for home pages | Accepted scope reduction — home pages lose Service JSON-LD nodes; a separate RFC will restore if needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16 or DNA-25, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0372 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `extractPageHeading()` cannot produce a valid heading for some page type (no block with `header.heading` and no frontmatter `title`), escalate to the operator — this indicates a content contract gap that may need a separate RFC.
- If the `people` block extractor cannot find person data in the expected props path (`body.people` vs `body.cards` vs `people`), escalate — the extractor may need to handle multiple prop shapes, which should be documented in the extractor implementation.
