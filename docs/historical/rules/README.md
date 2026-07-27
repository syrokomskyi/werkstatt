# Historical Agent Rules (pre-RFC governance)

**These files are historical reference material, not active instructions.**

They were written before the RFC governance process and `AGENTS.md` instruction model were established. They are kept here for migration history and deeper rationale. Do NOT follow these rules for implementation work — follow `AGENTS.md` and `docs/policies/` instead.

If any guidance in these files conflicts with `AGENTS.md`, an RFC, or a DNA invariant, the latter is authoritative and these files are wrong.

These files were moved from `.agents/rules/` as part of the ecosystem refactoring (2026-07-13).

## Architecture DNA (all apps)

These files define the shared architecture that every app in `apps/` must follow. Cross-site invariants, naming rules, anti-patterns, and contracts also live in `packages/os/site-kernel/docs/`.

- `AGENT_QUICKSTART.md` — 60-second orientation before any change: non-negotiables, source-of-truth map, stop signs.
- `AGENT_RULES.md` — repeatable workflows for adding pages, sections, components, navigation, and semantic outputs.
- `SEMANTIC_LAYER.md` — full adoption guide for the semantic projection layer (JSON-LD, llms.txt, entity IDs).
- `PATTERN_MATRIX.md` — concern-to-implementation map; distinguishes portable DNA from project-level examples.
- `FILE_CONTRACTS.md` — annotated reference file tree with responsibility boundaries for each layer.
- `DECISION_LOG.md` — rationale behind key architectural decisions (static-first, content format, dispatcher pattern, etc.).
- `image-usage.md` — image storage, optimization pipeline, and forbidden patterns.
- `icon-usage.md` — icon system rules and generation workflow.
- `open-source-page-pattern.md` — generated third-party notices page integrated into the standard page/content/schema/semantic architecture.

## Content and schema (apps/nicaragua-projekt)

- `content-frontmatter-format.md` **← READ BEFORE editing `src/content/**`\*\*
  - Defines the required file format for project content.
  - `src/content/**` must use Markdown entries with frontmatter.
  - Do **not** add `.json` files under `src/content/**`.

- `content-migration-strategy.md` **← START HERE for content work**
  - **Current and authoritative** approach for organizing content.
  - Defines semantic content domains: `pages/`, `prose/`, `business/`, `navigation/`, `site/`.
  - Migration workflow and validation checklist.
  - Use this for all new content and migration tasks.

- `schema-mirroring.md` **← READ BEFORE editing `src/content/schemas/**`\*\*
  - Defines the current schema convention.
  - Canonical schemas live in `packages/share/schemas/`; app-local files are thin overrides.
  - **Retired:** component content/schema mirroring was removed per RFC-0047.
  - Use this for all new Zod schema work.

- `project-guide.md`
  - Main project map.
  - Covers architecture, routing, localization data flow, safe edit zones, and high-risk boundaries.

- `data-pages.md` **← DEPRECATED**
  - Historical note about the removed custom data-pages architecture.
  - Kept only to explain old references if they appear in legacy discussion.
  - **Do not use for implementation.**

- `design-system-ai-guide.md`
  - Design-token and styling rules.
  - Use this for CSS, section styles, depth effects, and `--ds-*` token work.

- `typescript.md`
  - Cross-cutting TypeScript and Astro coding conventions.
  - Applies to `.ts` and `.astro` files.

- `external-links.md`
  - Defines the standard for marking and styling external links.
  - **REQUIRED:** All external links must use `data-external-link="1"` attribute.
  - Uses CSS pseudo-elements with `↗` symbol instead of icon components.

## Active vs reference guidance

- Root `docs/*.xml` GRACE files are the primary machine-readable semantic layer for AI work.
- `docs/source-markup.xml` defines the canonical source-level GRACE markup model.
- `docs/grace-inventory.xml` is the generated rollout snapshot for current source coverage.
- Active guidance lives in root and nested `AGENTS.md` files.
- Files in `.agents/rules/**` are kept as reference material and deeper project notes.
- If guidance appears in both places, follow `AGENTS.md` first and use `.agents/rules/**` for extra detail.

## Reference file -> active scope map

- `AGENT_QUICKSTART.md` -> all `apps/*/AGENTS.md`
- `AGENT_RULES.md` -> all `apps/*/AGENTS.md`
- `SEMANTIC_LAYER.md` -> all `apps/*/AGENTS.md`
- `PATTERN_MATRIX.md` -> all `apps/*/AGENTS.md`
- `FILE_CONTRACTS.md` -> all `apps/*/AGENTS.md`
- `DECISION_LOG.md` -> all `apps/*/AGENTS.md`
- `image-usage.md` -> all `apps/*/src/components/AGENTS.md`
- `icon-usage.md` -> all `apps/*/src/components/AGENTS.md`
- `open-source-page-pattern.md` -> all `apps/*/src/pages/AGENTS.md`
- `project-guide.md` -> `AGENTS.md`, `docs/authoring/site-composition.md`, site-level `AGENTS.md`
- `typescript.md` -> `AGENTS.md`, `docs/authoring/site-composition.md`, site-level `AGENTS.md`, `src/pages/AGENTS.md`, `src/content/AGENTS.md`
- `content-frontmatter-format.md` -> `apps/nicaragua-projekt/src/content/AGENTS.md`
- `content-migration-strategy.md` -> `apps/nicaragua-projekt/src/content/AGENTS.md`, `apps/nicaragua-projekt/src/pages/AGENTS.md`
- `schema-mirroring.md` -> `apps/nicaragua-projekt/src/content/AGENTS.md`
- `design-system-ai-guide.md` -> `apps/nicaragua-projekt/src/styles/AGENTS.md`
- `external-links.md` -> `apps/nicaragua-projekt/src/components/AGENTS.md`
- `data-pages.md` -> `apps/nicaragua-projekt/AGENTS.md`, `apps/nicaragua-projekt/src/content/AGENTS.md`

## Suggested reading order

### For route/page work

1. `content-migration-strategy.md`
2. `project-guide.md`
3. `typescript.md`

### For content collection or pSEO work

1. `content-frontmatter-format.md`
2. `content-migration-strategy.md`
3. `schema-mirroring.md`
4. `project-guide.md`
5. `typescript.md`

### For styling work

1. `design-system-ai-guide.md`
2. `project-guide.md`
3. `typescript.md`

## Quick reminders

- Keep `apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro` thin.
- Keep components in `packages/ui/src/` thin; visitor-facing copy comes from page block props or `src/content/site/{lang}/`.
- Use Markdown entries with frontmatter in `src/content/**`.
- Do not add `.json` files under `src/content/**`.
- Do not hardcode visitor-facing strings in component templates.
- Page entries in `src/content/pages/{lang}/**` are frontmatter-only block-declarative pages.
- Every page `.md` must declare `pageId` matching `src/content/system.md`.
- Canonical routes live in `src/content/system.md pages[].routes` (RFC-0048).
- Prose lives in `src/content/prose/{lang}/**` and is referenced via `contentRef`.
- Do not recreate `src/content/components/` or `src/content/schemas/components/`.
- Do not recreate `src/content/features/` or `src/configure/features.ts`.
- Treat `spec/**` as read-only reference material; do not modify spec files/folders.
- Treat `todo/**` as planning-only reference material; do not use it as implementation guidance.
- Ignore `spec/**`, `todo/**`, and generated icon trees during normal code search unless the task explicitly targets them.
- Do not change middleware, localization data flow, or `system.md` casually.
