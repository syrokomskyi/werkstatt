---
id: enhance-site-pages
title: "Enhance site pages: apply expert recommendations to UK pages"
phase: enhance
chain: enhance
reads:
  - obsidian:Tech/Site/!Research/2026-07-20 Страницы сайта - Улучшения/output/enhance-site-pages/
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/prose/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/people/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/surface/industries/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/surface/demands/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/surface/topics/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/
writes:
  - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/prose/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/people/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/surface/industries/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/surface/demands/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/surface/topics/uk/
  - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/
scope:
  allowedWriteRoots:
    - missions/warpgogol-com-m000015/workpiece/src/content/pages/uk/
    - missions/warpgogol-com-m000015/workpiece/src/content/prose/uk/
    - missions/warpgogol-com-m000015/workpiece/src/content/people/uk/
    - missions/warpgogol-com-m000015/workpiece/src/content/surface/industries/uk/
    - missions/warpgogol-com-m000015/workpiece/src/content/surface/demands/uk/
    - missions/warpgogol-com-m000015/workpiece/src/content/surface/topics/uk/
    - missions/warpgogol-com-m000015/workpiece/src/content/faq/uk/
  forbiddenWriteRoots:
    - missions/warpgogol-com-m000015/workpiece/src/content/pages/de/
    - missions/warpgogol-com-m000015/workpiece/src/content/prose/de/
    - missions/warpgogol-com-m000015/workpiece/src/content/people/de/
    - missions/warpgogol-com-m000015/workpiece/src/content/surface/industries/de/
    - missions/warpgol-com-m000015/workpiece/src/content/surface/demands/de/
    - missions/warpgogol-com-m000015/workpiece/src/content/surface/topics/de/
    - missions/warpgogol-com-m000015/workpiece/src/content/faq/de/
    - packages/
    - docs/
runs:
  - content.references.validate --site webgogol-com
  - content.voice.lint --site webgogol-com
recoveryRules:
  - on: "Expert recommendation requires changes to a generated page (bildnachweise, website, ratgeber)"
    do: "Check whether the change is content-only or requires generator logic changes in packages/*. If generator changes are needed, pause and raise an RFC."
  - on: "Expert recommendation references a page not in the current workpiece (e.g. /team/ index)"
    do: "Pause and ask the operator whether to create the new route (may require an RFC) or defer it."
  - on: "Expert file mentions cross-page changes (e.g. file 3 asks to edit /preis/, /kontakt/)"
    do: "Do NOT edit those pages in this session. Note the dependency in the report and defer to the target page's own session."
  - on: "content.references.validate reports broken CTA targets after editing"
    do: "Fix the target reference in the edited UK page. Do not create placeholder pages."
checkpoints:
  - "YAML in edited files is valid (no syntax errors)."
  - "All block type values match known archetypes."
  - "All CTA target references point to existing pages."
  - "No German text left in UK pages."
  - "content.references.validate exits 0."
  - "Dev build starts without runtime errors."
agentInvariants:
  - "Only edit UK (uk) content files. Never touch DE (de) files."
  - "Expert files are in Russian with German content examples. Translate all content to Ukrainian when applying to UK pages."
  - "Preserve YAML block-style formatting in page frontmatter (no inline {} flow style)."
  - "Preserve existing block structure and archetype contracts (RFC-0101..0107)."
  - "Do not invent facts, prices, or legal claims not present in the expert file or current page."
  - "If an expert recommendation requires changes to shared packages or external surfaces (URL schema, JSON-LD, sitemaps), stop and raise an RFC."
  - "Process one expert file per session. Do not batch multiple expert files."
  - "Commit via mission.git.commit (RFC-0480), not direct git commit. Leave workpiece clean — mission.reconcile and mission.close block on dirty workpiece."
  - "Do not edit pages outside the current expert file's scope, even if the expert mentions cross-page changes. Defer those to their own session."
  - "Generated pages (bildnachweise, website, ratgeber) may require generator logic changes in packages/* — if so, pause for RFC."
  - "Creating new routes (e.g. /team/ index) requires an RFC — pause and ask operator."
  - "Preserve PBP references ({business-profile...}) — do not replace with hardcoded values. The expert saw rendered output, not source."
  - "Check if UK page already has the recommended fix before applying — the expert saw DE, UK may have diverged."
  - "When a CTA targets an anchor (#some-id), the target block MUST have anchorId: some-id in its props."
  - "When the same block type appears multiple times on a page, each instance MUST have a unique anchorId to avoid duplicate DOM IDs."
selfOrchestration:
  autoRun: false
  pauseFor:
    - "Expert recommendation requires package-level or architectural change — pause and discuss RFC need."
    - "Expert recommendation contradicts existing legal or business data — pause and ask operator."
    - "Expert file references a page or route not present in the workpiece — pause and ask operator."
    - "Expert recommendation requires new page type or block type not in current schema — pause and discuss."
    - "Expert recommendation requires creating a new route (e.g. /team/ index) — pause for RFC."
    - "Expert file mentions cross-page changes — defer to target page's own session, do not edit inline."
---

# Enhance site pages — apply expert recommendations to UK pages

## What this workflow does

Takes expert recommendation files (produced by an external analyst) and applies them sequentially to the Ukrainian (uk) content of the webgogol-com site. German (de) content is left untouched for a separate translation session.

## Critical context: expert vs codebase gap

The expert analysed the **deployed DE pages on webgogol.com**. The codebase has since undergone major migrations the expert does not know about. Before applying any recommendation, the agent must bridge this gap.

### What the expert does NOT know

- **Block-declarative YAML (RFC-0026):** pages are not markdown — they are structured frontmatter with `blocks[]`, each block has `type` and `props` matching an archetype contract.
- **Archetype contracts (RFC-0101..0107):** every block follows a discriminated union schema. You cannot add arbitrary props or invent block types.
- **PBP reference system (RFC-0398):** business data (prices, guarantees, legal terms) lives in `@gogol/pbp` and is referenced via `{business-profile.offerings/<id>.presentation.<path>}`. Do NOT replace these with hardcoded values.
- **Cosmic naming (DNA-23):** every page has a `cosmicStar` from a closed catalog. Do not change or remove it.
- **Sternsystem model:** the site lives in `missions/warpgogol-com-m000015/workpiece/`, not `apps/`.
- **Surface collections:** industries, demands, topics are separate content collections with generated routes, not manual pages.
- **People collection:** team members live in `people/{lang}/`, not `pages/{lang}/team/`.
- **DE/UK split:** the expert saw DE. We edit UK. The UK pages may already differ from what the expert described.

### How to map expert recommendations to YAML structure

| Expert says | YAML action |
| --- | --- |
| "Заменить формулировку в hero" | Update `tagline` or `header.heading` in the hero block's `props` |
| "Показать три цены в hero" | Update `decisionCard.items[]` in the hero block |
| "Основной CTA" | Update `primaryCta.label` and `primaryCta.target` |
| "Убрать Notausgang из hero" | Remove `secondaryCta` from the hero block |
| "Добавить раздел" | Add a new block to `blocks[]` using an existing archetype |
| "Убрать блок" | Remove the block from `blocks[]` |
| "Изменить порядок блоков" | Reorder `blocks[]` entries |
| "Заменить Sit­uation beschreiben на Unverbindliche Anfrage starten" | Update `primaryCta.label` (but check if UK already has a different label) |
| "Вынести цены в канонический источник" | Use `{business-profile.offerings/...}` references, do not hardcode |

### Already-fixed detection

The expert may recommend changes that are **already applied in the UK version**. Before applying each recommendation:

1. Check if the current UK page already has the recommended content or structure.
2. If yes — skip that recommendation and note it in the report ("already present in UK").
3. If the UK page has a **different but equivalent** implementation — use judgement; do not regress.
4. If the UK page has the **opposite** of what the expert saw (because DE was not updated) — apply the recommendation to UK.

### PBP references — do not hardcode

Current UK pages use dynamic references like:

```yaml
monthly: "{business-profile.offerings/digital-foundation.presentation.price.monthly}"
```

When the expert says "показать 70 €", do NOT replace this with `"70 €"`. Keep the PBP reference. The expert does not know about this system — they saw the rendered output.

If the expert recommends showing a value that is NOT in PBP yet, pause and ask the operator whether to add it to PBP or hardcode it.

## Expert files source

```
/home/syrokomskyi/projects/obsidian/WGogolDocObsidian/Tech/Site/!Research/2026-07-20 Страницы сайта - Улучшения/output/enhance-site-pages/
```

## Processing order

Files are processed by number, sequentially from 1 to 18.

| # | Expert file | UK target(s) | Notes |
| --- | --- | --- | --- |
| 1 | Index plus | `pages/uk/home.md` | Home page commercial flow restructure — **most important file, defines the entire buyer journey** |
| 2 | preis | `pages/uk/pricing.md` | Price page restructure |
| 3 | leistungen-digitales-fundament | `pages/uk/digitales-fundament.md` | Product page restructure |
| 4 | notausgang | `pages/uk/notausgang.md` | Exit page restructure |
| 5 | kontakt | `pages/uk/contact.md` | Contact page |
| 6 | agb | `pages/uk/agb.md` + `prose/uk/agb.md` | Terms |
| 7 | datenschutz | `pages/uk/datenschutz.md` + `prose/uk/datenschutz.md` | Privacy |
| 8 | impressum | `pages/uk/impressum.md` + `prose/uk/impressum.md` | Imprint |
| 9 | barrierefreiheit | `pages/uk/barrierefreiheit.md` + `prose/uk/barrierefreiheit.md` | Accessibility |
| 10 | widerruf & muster-widerruf | `pages/uk/widerruf.md` + `pages/uk/muster-widerruf.md` + `prose/uk/widerruf.md` + `prose/uk/muster-widerruf.md` | Withdrawal |
| 11 | bildnachweise | `pages/uk/credits.md` + `prose/uk/credits.md` | Media provenance — **generated page, may need RFC** |
| 12 | open-source | `pages/uk/open-source.md` | Open source page |
| 13 | leistungen | `pages/uk/services.md` | Services/product map |
| 14.0 | website | `pages/uk/home.md` or generated route | Industry hub — **may need RFC if route is generated** |
| 14.1 | website industries | `surface/industries/uk/*.md` | Industry pages — **may need RFC if generator changes** |
| 14.2 | website industries+cities | `surface/industries/uk/*.md` + cities | City pages — **may need RFC if generator changes** |
| 14.3 | website industries+cities+services | `surface/industries/uk/*.md` + `surface/demands/uk/*.md` | Service pages — **may need RFC if generator changes** |
| 15.0 | ratgeber | `prose/uk/ratgeber-*.md` + `surface/topics/uk/*.md` | Advice library — **may need RFC if generator changes** |
| 15.1 | ratgeber+details | same as 15.0 + detail pages | Article depth — **may need RFC if generator changes** |
| 16.1 | team persona | `people/uk/andrii-syrokomskyi.md` + `prose/uk/andrii-syrokomskyi.md` | Team/responsibility registry — **new /team/ route needs RFC** |
| 17 | Final Check | — | **Audit only, run after 2–16** |
| 18 | Enhanced Plus | — | **Evaluation only, run after 17** |

## Steps per expert file

### 1. Read the expert file

Read the full expert file by number. Understand:

- What the expert says is wrong with the current page
- What structural changes are recommended (block order, new blocks, removed blocks)
- What content changes are recommended (text, CTAs, headings)
- What must be preserved (prices, legal facts, existing promises)

### 2. Read the current UK page(s)

Read the current UK content file(s) listed in the mapping table. Understand:

- Current block structure and archetype types
- Current frontmatter (pageId, cosmicStar, title, description, lang, blocks)
- Current prose content (if page references `prose/uk/` files)
- **Which PBP references are used** — identify all `{business-profile...}` references and what they resolve to
- **What the UK page already does differently from what the expert described** — the expert saw DE, the UK may have already fixed some issues

### 3. Check for RFC triggers

Before editing, assess:

- Does the change require a new block type not in the current schema? → **pause**
- Does the change alter URL structure, JSON-LD, or sitemap? → **pause, needs RFC with `Breaks-C: yes`**
- Does the change require modifications to `packages/*` (generators, validators, archetypes)? → **pause, needs RFC**
- Does the change contradict existing business data (prices, legal terms)? → **pause, ask operator**
- Does the expert ask to create a new route (e.g. `/team/` index)? → **pause, needs RFC**
- Does the expert ask to change a _generated_ page (bildnachweise, website, ratgeber)? → **check if generator logic in `packages/*` needs changes — if yes, pause for RFC**
- Does the expert mention cross-page changes (e.g. "also update /preis/"? → **defer to that page's own session, do not edit inline**

If none of the above — proceed with content-only changes.

### 3.5. Audit already-applied changes (MANDATORY before editing)

Before applying any recommendation, produce a gap analysis table comparing the expert file against the current UK page:

| Expert recommendation | Status | Evidence | Action |
| --- | --- | --- | --- |
| ... | Done / Partial / Missing / Wrong / N/A | line ref or quote | Apply / Fix / Skip |

**Status values:**

- **Done** — recommendation already fully applied in UK. Skip.
- **Partial** — some part is missing or incomplete. Fix the gap.
- **Missing** — no trace in the UK page. Apply.
- **Wrong** — UK page has the opposite or incorrect implementation. Fix.
- **N/A** — recommendation does not apply to UK context (e.g. DE-specific legal text). Skip with note.

This audit MUST be presented to the operator before any edits. If the audit reveals no gaps (all Done or N/A), skip editing and report "already fully applied".

### 3.6. Check archetype props (RFC-0567)

The following optional props are now available (RFC-0567 implemented):

- **`header.eyebrow`** — short contextual label above heading in any section composing `section-header`. Use instead of `header.subheading` when the expert asks for eyebrow/over-heading text.
- **`ctaNote`** — short clarifying string between CTAs and decision card in `hero-decision-card`. Use when the expert recommends a note under the hero CTAs.
- **`orderTags`** — `Record<string, number>` in FAQ frontmatter for per-tag ordering. Use when FAQ entries need different order on different pages.

Before applying a recommendation that was previously blocked by archetype limitations, check if RFC-0567 props now solve it.

### 4. Apply changes to UK page(s)

- Translate all German content examples from the expert file to Ukrainian.
- Preserve YAML block-style formatting (no inline `{}` flow style).
- Preserve existing archetype contracts — use only block types already defined in the codebase.
- Preserve all `pageId`, `cosmicStar`, and structural identifiers.
- Keep frontmatter fields (`kind`, `pageId`, `cosmicStar`, `title`, `description`, `lang`) consistent.
- **Preserve PBP references** — do not replace `{business-profile...}` with hardcoded values. The expert saw rendered output; the source uses dynamic references.
- **Check already-fixed** — skip recommendations already applied in the UK version (see "Already-fixed detection" above).
- If the expert recommends new blocks, use the closest existing archetype type.
- If the expert recommends removing blocks, remove them cleanly from the `blocks[]` array.
- Do not touch `de/` files under any circumstances.

### 5. Verify

After editing, run from the **monorepo root** (not the workpiece):

- Check that YAML is valid (no syntax errors).
- Check that all block `type` values match known archetypes.
- Check that all `target` references in CTAs point to existing pages.
- Run `pnpm exec site-kernel run content.references.validate --site webgogol-com` if available.
- Run `pnpm exec site-kernel run content.voice.lint --site webgogol-com` if available.
- Run dev build from the workpiece: `pnpm --filter webgogol-com dev` or equivalent, to confirm no runtime errors.
- If Playwright tests exist for the affected route, run them.

### 6. Report

Summarize:

- What was changed (blocks added/removed/reordered, text updated).
- What was preserved (prices, legal facts, CTAs).
- What could not be applied and why (with recommendation).
- Whether RFC is needed for any aspect.

### 7. Commit to mission workpiece

Commit via the canonical mission command (RFC-0480), **not** direct `git commit`:

```sh
pnpm exec site-kernel run mission.git.commit --mission warpgogol-com-m000015 --message "enhance-site-pages: <file#> <short description>"
```

Run from the **monorepo root**. Before committing, check `git status` and `git diff` in the workpiece to verify only this session's files are staged:

```sh
git -C missions/warpgogol-com-m000015/workpiece status
git -C missions/warpgogol-com-m000015/workpiece diff
```

**Why this matters:** `mission.reconcile` and `mission.close` block if the workpiece is dirty. `mission.validate` warns if dirty after validation. Each session MUST leave the workpiece clean.

## Quality gates (fo-review / fo-fix)

fo-review and fo-fix are **not** run after every expert file — that would be excessive for content-only YAML edits. However, the **first file establishes patterns** (anchorId usage, duplicate ID avoidance, PBP reference handling, translation conventions) that all subsequent files follow. If the first file has systemic issues, they will repeat across all remaining files.

Run quality gates at these checkpoints:

| Checkpoint | When | Skills | Why |
| --- | --- | --- | --- |
| **First-file gate** | After file 1 (the very first processed file) | `fo-review` → `fo-fix` if findings | The first file establishes all patterns. Catch systemic mistakes (broken anchors, duplicate IDs, hardcoded values, translation conventions) before they repeat across files 2–16. **This is the most important gate.** |
| **Pattern drift check** | After file 8 (mid-point) | `fo-review` → `fo-fix` if findings | Verify corrected patterns from the first-file gate are maintained. Catch any new pattern issues introduced by different page types (legal pages, generated pages). |
| Pre-audit gate | Before file 17 (after all 2–16.1 done) | `fo-review` → `fo-fix` if findings | Full review of accumulated changes before integration audit. |
| RFC-trigger response | After any file that triggered an RFC pause | `fo-review` + `fo-fix` | Architectural changes require full review. |
| Final gate | After file 18 (all processing complete) | `fo-review` + `fo-fix` + `fo-doc-audit` | Final quality gate before `mission.reconcile` and `mission.close`. |

### How to run

In a **separate session** after the enhance-site-pages session has committed:

1. Run `fo-review` — review the diff from the last checkpoint.
2. If findings are reported, run `fo-fix` to address them.
3. If `fo-fix` made changes, commit them via `mission.git.commit`.
4. Resume the next expert file in a new session.

### When NOT to run

- After every single expert file (overkill for YAML content edits).
- If the previous checkpoint's `fo-review` was clean and no new pattern was introduced.
- For files that only had already-fixed results (no changes made).

### Known systemic limitations (from first-file review)

These issues were identified in the first-file review and apply to all subsequent files:

- **PBP interpolation does not work in FAQ content** — FAQ answer text is plain markdown, not block props. Prices hardcoded in FAQ are accepted maintenance burden, not a violation.
- **Price drift risk** — base prices may appear hardcoded in multiple places (hero, comparison cards, FAQ, badges). Always prefer PBP references in block props. In FAQ, note the duplication in the session report.
- **`anchorId` prop required for anchor links** — when a CTA targets `#some-id`, the target block MUST have `anchorId: some-id` in its `props`. Without it, the anchor resolves to nothing.
- **Duplicate HTML IDs on repeated blocks** — when the same block type appears multiple times on a page (e.g. two `audience-cards` blocks), each MUST have a unique `anchorId` to avoid duplicate DOM IDs.

## Cross-page dependencies

Several expert files mention changes to other pages (e.g. file 3 asks to update `/preis/`, `/kontakt/`, `/notausgang/`). These cross-page changes must be **deferred** to the target page's own session. Do not edit pages outside the current expert file's scope. Note the dependency in the session report.

## Translation notes

- Expert files contain German content examples (headings, body text, CTAs, labels).
- All content must be rendered in Ukrainian when applied to UK pages.
- Do not leave German text in UK pages.
- Preserve semantic meaning — do not paraphrase loosely.
- Legal terms (AGB, Datenschutz, Impressum, Widerruf) keep their Ukrainian equivalents already established in the codebase.
- Prices and numbers stay as-is (70 €, 700 €, 200 €).
