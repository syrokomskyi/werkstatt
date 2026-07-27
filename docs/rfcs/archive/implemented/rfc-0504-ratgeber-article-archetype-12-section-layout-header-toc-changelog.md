---
id: RFC-0504
title: "Ratgeber article archetype — 12-section layout, article header, TOC, and changelog"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
implementedAt: 2026-07-23
enhancedAt: 2026-07-23
supersedes: []
supersededBy:
amends:
  - RFC-0500
  - RFC-0501
amendedBy: []
related:
  - RFC-0193
  - RFC-0325
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0500
  - RFC-0501
  - RFC-0502
  - RFC-0503
  - RFC-0506
satisfies:
  - DNA-16
  - DNA-24
breaksC: false
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - ratgeber.article.validate
    - surface.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/ontology"
  - "@gogol/ui"
successSignals:
  - "Every ratgeber article page renders a 12-section layout: breadcrumbs → article-header → direct-answer → TOC → main analysis (prose body) → practical tool → limitations → Webgogol connection → sources → authorship/review → changelog → contextual next step (CTA)."
  - "The article-header block displays seven fields: Themenbereich (category), H1 (title), Kurzbeschreibung (summary), Artikeltyp (articleType), Autor (author name), Zuletzt fachlich geprüft (reviewedAt), Lesezeit (readTime)."
  - "The article page has exactly one H1 — in the article-header block. The prose body uses H2 headings only."
  - "The TOC block is auto-generated from H2 headings in the prose body. No manual TOC editing."
  - "The changelog block renders article history entries from a frontmatter `changelog` array."
  - "Article records carry an optional `articleSections` frontmatter field mapping prose sections to named slots: direct-answer, definitions, analysis, example, checklist, limitations, sources."
  - "Context-specific CTAs have three tiers: primary (target depends on articleType), secondary (related tool/page), tertiary (small contact action)."
  - "ratgeber.article.validate enforces single-H1 in prose body, `articleSections` schema, and `changelog` entry schema."
  - "The baker omits the changelog block when no `changelog` frontmatter is present."
nonGoals:
  - "Does not change the URL structure — routes remain /ratgeber/{article-slug}/ and /porady/{article-slug}/."
  - "Does not change the 10-section mandatory prose structure (RFC-0501) — the 12-section layout wraps around it."
  - "Does not define authors, sources, or claims — that is RFC-0502 and RFC-0505."
  - "Does not change JSON-LD emission — that is RFC-0506."
  - "Does not create a CMS or editing interface — authors edit markdown frontmatter directly."
  - "Does not add the editorial policy page — that is RFC-0503."
---

# RFC-0504: Ratgeber article archetype — 12-section layout, article header, TOC, and changelog

## Context

RFC-0500 introduced the `articles` collection and hub restructure. RFC-0501 defined the mandatory 10-section prose structure and seven article types. An external expert review (file 15.1) identified that the current article archetype does not render full article content — most material is hidden in `Business context` and only a hero, two short theses, one FAQ, and a CTA are visible on the published page.

The expert requires a 12-section article archetype that renders all editorial content in structured blocks, not as a single continuous markdown blob. The archetype adds an article header (metadata), a table of contents, a changelog, and context-specific CTAs around the existing 10-section prose body.

## Problem

1. **No article header.** The current article page has a hero block with title and optional tagline, but no structured metadata display. Readers cannot see the category, article type, author, review date, or read time at a glance.

2. **No table of contents.** Articles are 500+ words with 10 mandatory H2 sections, but there is no auto-generated TOC. Readers cannot jump to a specific section.

3. **No changelog.** Articles have a `reviewedAt` date but no visible history of changes. Readers cannot see when the article was last updated and what changed.

4. **Multiple H1 headings.** The current prose bodies contain H1 headings (e.g., `# Reicht ein Eintrag bei Kartendiensten?`). The article page should have exactly one H1 — the article title in the article header.

5. **No `articleSections` field.** The expert requires a frontmatter field that maps prose sections to named slots (direct-answer, definitions, analysis, example, checklist, limitations, sources) so the baker can render structured blocks instead of a single markdown blob.

6. **Generic CTAs.** RFC-0501 introduced context-specific closing CTAs based on articleType, but the expert requires a three-tier CTA system: primary, secondary, and tertiary (small contact action).

## Decision

### 12-section page layout

The ratgeber article page (depth-1) renders twelve blocks in order:

| # | Block | Source | Existing? |
| --- | --- | --- | --- |
| 1 | Breadcrumbs | Auto-generated from URL hierarchy | New (visible) |
| 2 | Article header | Frontmatter fields | New |
| 3 | Direct answer | `articleSections: direct-answer` from prose | New |
| 4 | Table of contents | Auto-generated from H2 headings | New |
| 5 | Main analysis | Prose body (10-section structure, RFC-0501) | Existing (markdown block) |
| 6 | Practical tool | `articleSections: checklist` or type-specific tool | New |
| 7 | Limitations | `articleSections: limitations` from prose | New |
| 8 | Webgogol connection | `articleSections: webgogol-connection` from prose | New |
| 9 | Sources | `## Quellen` / `## Джерела` section from prose | Existing (part of markdown) |
| 10 | Authorship and review | Author record + reviewedAt (RFC-0502) | Existing (provenance footer) |
| 11 | Changelog | Frontmatter `changelog` array | New |
| 12 | Contextual next step | CTA block (primary, secondary, tertiary) | Existing (enhanced) |

### Article header block

New block type `article-header` rendered by `bakeRatgeberArticle`:

```yaml
type: article-header
props:
  category: "Sichtbarkeit"
  title: "Lokale Auffindbarkeit: Was kleine Betriebe tatsächlich beeinflussen können"
  summary: "Welche Faktoren lokale Ergebnisse beeinflussen..."
  articleType: "grundlagenartikel"
  authorName: "Andrii Syrokomskyi"
  reviewedAt: "2026-07-23"
  readTime: "8 min"
```

The article header renders exactly one H1 (`title`). The prose body must not contain any H1 headings.

### `articleSections` frontmatter field

New optional frontmatter field on article records:

```yaml
articleSections:
  - direct-answer
  - definitions
  - analysis
  - example
  - checklist
  - limitations
  - sources
```

Valid section names: `direct-answer`, `definitions`, `analysis`, `example`, `checklist`, `limitations`, `sources`, `webgogol-connection`.

Each slot name maps to a mandatory H2 heading from RFC-0501 (except `webgogol-connection`, which is optional):

| Slot                  | DE heading                     | UK heading                | Optional? |
| --------------------- | ------------------------------ | ------------------------- | --------- |
| `direct-answer`       | `## Kernfrage`                 | `## Ключове питання`      | No        |
| `definitions`         | `## Wissensbasis`              | `## База знань`           | No        |
| `analysis`            | `## Häufige Missverständnisse` | `## Поширені помилки`     | No        |
| `example`             | `## Praxisbezug`               | `## Практична частина`    | No        |
| `checklist`           | `## Checkliste`                | `## Контрольний список`   | No        |
| `limitations`         | `## Kosten und Trade-offs`     | `## Витрати і компроміси` | No        |
| `sources`             | `## Quellen`                   | `## Джерела`              | No        |
| `webgogol-connection` | `## Webgogol-Bezug`            | `## Зв'язок із Webgogol`  | Yes       |

The `webgogol-connection` slot is an optional H2 heading. When present, it must appear after `## Zusammenfassung` / `## Підсумок` and before `## Quellen` / `## Джерела` in the heading order. `ratgeber.article.validate` does not require its presence but accepts it if present.

When `articleSections` is present, the baker extracts named sections from the prose body and renders them as separate blocks. When absent, the baker renders the prose body as a single markdown block (field-presence-driven rendering, not a compatibility shim). When a slot is listed in `articleSections` but the corresponding H2 heading is not found in the prose body, the baker skips that block silently (no error, no warning — the field-presence-driven pattern).

### TOC auto-generation

New block type `toc` auto-generated from H2 headings in the prose body. The TOC is always present when the prose body has ≥ 3 H2 headings. No manual TOC editing.

### Changelog block

New block type `changelog` rendered from frontmatter:

```yaml
changelog:
  - date: "2026-07-23"
    summary: "Initial publication"
    authorId: "andrii-syrokomskyi"
  - date: "2026-08-15"
    summary: "Updated cost model after price change"
    authorId: "andrii-syrokomskyi"
```

The changelog block is omitted when no `changelog` frontmatter is present.

### Three-tier CTA system

The closing CTA block (block 12) has three tiers:

| Tier | Label source | Target | Example |
| --- | --- | --- | --- |
| Primary | Article-type-specific (RFC-0501) | Varies by articleType | "Struktur für Ihr Gewerbe ansehen" → /leistungen/digitales-fundament/ |
| Secondary | Article-specific or related tool | Varies by article | "Anbieter-Checkliste verwenden" → #checklist |
| Tertiary | Fixed small contact action | /kontakt/ | "Eigene Ausgangslage prüfen lassen" |

The primary CTA target is determined by `articleType` (RFC-0501's context-specific CTA logic). The secondary CTA is an optional frontmatter field `secondaryCta: { label, target }`. The tertiary CTA is fixed.

### Single H1 enforcement

`ratgeber.article.validate` checks that the prose body contains no `# ` headings. The article title is rendered as H1 by the article-header block only.

Validation rule RG-ART-07: prose body must not contain H1 headings. Error if any line matches `^# ` outside fenced code blocks and HTML comments. The validator skips lines inside ``` fenced code blocks and `<!-- ... -->` HTML comment blocks to avoid false positives on shell commands (`# comment`) and commented-out content.

### Validator changes

`ratgeber.article.validate` adds:

- **RG-ART-07**: No H1 headings in prose body (H1 is in article-header only).
- **RG-ART-08**: `articleSections` entries must be from the valid set.
- **RG-ART-09**: `changelog` entries must have `date`, `summary`, `authorId`; `authorId` must resolve to an author record (RFC-0502).
- **RG-ART-10**: `secondaryCta.target` must be a valid internal URL or anchor.

### Baker changes

`bakeRatgeberArticle` in `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts`:

- Replace the current hero block with an `article-header` block.
- Add `toc` block after article-header (auto-generated from prose H2 headings).
- Add `changelog` block before the CTA block (when `changelog` frontmatter is present).
- Enhance the CTA block to support three tiers.
- When `articleSections` is present, extract named sections from prose and render as separate blocks.

### Migrator

A migrator (RFC-0479) transforms existing article records:

- Adds empty `articleSections: []` if absent (field-presence-driven — baker renders single markdown block when absent).
- Adds empty `changelog: []` if absent.
- Strips H1 headings from prose bodies: removes H1 headings that duplicate the article `title`; converts unique H1 headings to H2, unless an H2 with the same text already exists (in which case the H1 is removed to avoid duplicate headings).

Migrator id: `rfc-0504`.

## Architectural fit

- **RFC-0500:** amends — the article baker (`bakeRatgeberArticle`) is rewritten to emit the 12-section layout instead of the current 5-block layout. The article collection schema gains `articleSections`, `changelog`, and `secondaryCta` optional fields.
- **RFC-0501:** amends — the 10-section prose structure is preserved and wrapped by the 12-section page layout. The `articleSections` slot-to-H2 mapping table defines how named slots correspond to RFC-0501's mandatory H2 headings. RG-ART-07..10 extend the publication gate.
- **RFC-0478:** `versionBump: minor` — new frontmatter fields and new validation rules are Breaks-B (data contract extension). The migrator transforms existing article records.
- **RFC-0479:** migrator `rfc-0504` registered in the migrator registry, ordered by RFC-id.
- **RFC-0480:** `breaksC: false` — no external surface contract changes. URL structure, JSON-LD types, and sitemap shape are unchanged. The RFC adds block types to the archetype registry (`archetypes/index.yaml`), not to `packages/ontology/src/external-surfaces/`. The V-30 warning is a false positive — `@gogol/ontology` is impacted for archetype registry changes, not external-surface changes.
- **DNA-16:** the TOC is auto-generated from the same H2 headings that structure the prose body. The article-header metadata (title, author, review date) is derived from the same frontmatter fields used for JSON-LD emission. No parallel page-structure model is created.
- **DNA-24:** the three new block types (`article-header`, `toc`, `changelog`) are frontmatter-driven blocks rendered through the `buildPage` pipeline. They follow the block-declarative contract — no markdown body in page entries, no route-local composition.

## Design

### CLI surface

```sh
pnpm exec site-kernel run ratgeber.article.validate --site webgogol-com --json
```

Site-scoped, runs in `build.check` (blocking). The `--json` output shape follows the standard check-command contract: `{ exitCode, summary, diagnostics: Array<{ ruleId, severity, message, file?, fixHint?, data? }> }`.

### TypeScript contracts

```ts
type ArticleSectionSlot =
  | "direct-answer" | "definitions" | "analysis" | "example"
  | "checklist" | "limitations" | "sources" | "webgogol-connection";

interface ChangelogEntry {
  date: string;       // YYYY-MM-DD
  summary: string;
  authorId: string;   // resolves to author record (RFC-0502)
}

interface SecondaryCta {
  label: string;
  target: string;     // internal URL or anchor (e.g. "#checklist")
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/archetypes/index.yaml` | Extended: `blockTypeToCosmicName` and `roleByCosmicName` for `article-header` → `Himalia`, `toc` → `Metis`, `changelog` → `Prometheus` |
| `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` | Rewritten: 12-section layout, article-header, TOC, articleSections extraction, changelog, three-tier CTA |
| `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` | Extended: RG-ART-07..10 rules |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0504.ts` | New: migrator |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Extended: register `rfc-0504` |
| `packages/ui/src/components/article-header/` | New: UI component for article-header block |
| `packages/ui/src/components/toc/` | New: UI component for TOC block |
| `packages/ui/src/components/changelog/` | New: UI component for changelog block |
| `docs/verification-plan.xml` | Add RG-ART-07..10 checks |
| `docs/requirements.xml` | Update: new frontmatter fields, new block types |
| `docs/technology.xml` | Update: baker changes, new migrator, new UI components |
| `docs/knowledge-graph.xml` | Update: RFC-0504 relationships |
| `packages/os/site-kernel-checks/AGENTS.md` | Update: document RG-ART-07..10, baker 12-section layout |
| `packages/ontology/AGENTS.md` | Update: new block types in archetype registry |

### Failure modes

| Rule | Severity | Description |
| --- | --- | --- |
| `RG-ART-07` | error | Prose body contains H1 headings (`# ` outside code blocks and HTML comments) |
| `RG-ART-08` | error | `articleSections` contains an invalid slot name (not in the valid set) |
| `RG-ART-09` | error | `changelog` entry missing `date`, `summary`, or `authorId`; or `authorId` does not resolve to an author record |
| `RG-ART-10` | error | `secondaryCta.target` is not a valid internal URL or anchor |

Exit codes: 0 = pass, 1 = any error-level rule triggered, 2 = only warning-level rules triggered.

### Pipeline placement

- `ratgeber.article.validate` runs in `build.check` (blocking) — site-scoped. Extended with RG-ART-07..10.
- `surface.validate` includes ratgeber article block type checks as part of the surface validation pipeline.

## Rollout

1. Add `article-header`, `toc`, `changelog` block types to `@gogol/ontology` archetype registry (`archetypes/index.yaml`). Assign cosmic names from unused `PlanetCatalog` entries: `article-header` → `Himalia`, `toc` → `Metis`, `changelog` → `Prometheus`. Add `blockTypeToCosmicName` and `roleByCosmicName` entries for each.
2. Add `articleSections`, `changelog`, `secondaryCta` to article record schema (Zod, loose — optional fields).
3. Update `bakeRatgeberArticle` to emit the 12-section layout.
4. Add RG-ART-07..10 validation rules to `ratgeber.article.validate`.
5. Create `packages/os/site-kernel-handoff/src/migrators/rfc-0504.ts`.
6. Register migrator in `registry.ts`.
7. Add UI components for `article-header`, `toc`, `changelog` in `@gogol/ui`.
8. Run migrator on webgogol-com mission workpiece.
9. Verify with `ratgeber.article.validate` and dev build.

## Alternatives considered

**Keep single markdown block.** Rejected — the expert explicitly requires structured section rendering, not a continuous markdown blob. The current archetype hides most content.

**Manual TOC in frontmatter.** Rejected — auto-generation from H2 headings is simpler, less error-prone, and always in sync with the prose body.

**Separate RFC per block type.** Rejected — the article header, TOC, changelog, and CTA tiers are tightly coupled in the 12-section layout. Splitting would create artificial dependencies.

## Risks

- **Block type proliferation.** Three new block types (`article-header`, `toc`, `changelog`) are ratgeber-specific. Mitigation: they are generic enough for reuse on future editorial surfaces.
- **`articleSections` extraction complexity.** Extracting named sections from markdown requires parsing H2 boundaries. Mitigation: the extractor is a pure function with snapshot tests.
- **H1 stripping migrator.** Converting H1 to H2 in prose bodies could change heading hierarchy. Mitigation: the migrator only strips H1 headings that duplicate the article title; unique H1 headings are converted to H2, unless an H2 with the same text already exists (in which case the H1 is removed to avoid duplicate headings).
- **RG-ART-07 false positives.** Shell commands and commented-out content in code blocks may contain `# ` lines. Mitigation: the validator skips fenced code blocks and HTML comments.
- **`articleSections` extraction gaps.** A slot listed in `articleSections` without a corresponding H2 heading in the prose body. Mitigation: the baker skips missing slots silently (field-presence-driven pattern).

## Acceptance criteria

- [x] `bakeRatgeberArticle` emits a 12-section layout: breadcrumbs → article-header → direct-answer → TOC → main analysis → practical tool → limitations → Webgogol connection → sources → authorship/review → changelog → contextual next step (CTA). (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` — article-header, toc, sectioned markdown, changelog, three-tier CTA blocks emitted)
- [x] The article-header block displays seven fields: category, title (H1), summary, articleType, author name, reviewedAt, readTime. (evidence: `packages/ui/src/sections/article-header/article-header-section.astro` — all seven fields rendered)
- [x] The article page has exactly one H1 — in the article-header block. The prose body contains no H1 headings (RG-ART-07). (evidence: `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` — `hasH1OutsideCodeBlocks` helper + RG-ART-07 rule)
- [x] The TOC block is auto-generated from H2 headings in the prose body when ≥ 3 H2 headings are present. (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` — TOC block emitted with `sourceContentRef` for renderer-time H2 extraction)
- [x] The changelog block renders from frontmatter `changelog` array and is omitted when no `changelog` frontmatter is present. (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` — `changelogBlock` emitted only when `changelogRaw` is a non-empty array)
- [x] `articleSections` entries are validated against the valid slot set (RG-ART-08). (evidence: `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` — `VALID_SECTION_SLOTS` constant + RG-ART-08 rule)
- [x] `changelog` entries have `date`, `summary`, `authorId`; `authorId` resolves to an author record (RG-ART-09). (evidence: `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` — RG-ART-09 rule checks `date`, `summary`, `authorId` fields)
- [x] `secondaryCta.target` is a valid internal URL or anchor (RG-ART-10). (evidence: `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` — RG-ART-10 rule validates `target` starts with `/` or `#`)
- [x] Three-tier CTA system renders primary (articleType-specific), secondary (optional frontmatter), and tertiary (fixed contact) tiers. (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` — `secondaryCta` frontmatter merged with `buildContextualCta` output + fixed contact CTA)
- [x] `article-header`, `toc`, `changelog` block types are registered in `archetypes/index.yaml` with cosmic names `Himalia`, `Metis`, `Prometheus` respectively. (evidence: `packages/ontology/archetypes/index.yaml` — `blockTypeToCosmicName`, `roleByCosmicName`, `planetImportPaths` entries)
- [x] Migrator `rfc-0504` is registered in the migrator registry and transforms existing article records (adds empty `articleSections` and `changelog`, strips H1 headings). (evidence: `packages/os/site-kernel-handoff/src/migrators/rfc-0504.ts` + `registry.ts` — migrator registered, PBT + snapshot tests pass)
- [x] `ratgeber.article.validate --site webgogol-com --json` passes. (evidence: `packages/os/site-kernel-checks/src/ratgeber-article-validate.ts` — `build:check` passes, validator compiles with RG-ART-07..10)
- [x] `rfc.validate RFC-0504` passes. (evidence: `pnpm exec site-kernel run rfc.validate RFC-0504 --json` — status: pass, exitCode: 0)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST NOT auto-generate article prose bodies — the H1 stripping migrator transforms existing content, but new prose authoring is human editorial work.
- Agents MUST run the migrator via `mission.migrate` — not by manually editing content files.
- Agents MUST update `amendedBy` on RFC-0500 and RFC-0501 to include RFC-0504.
- Agents MUST update `packages/os/site-kernel-checks/AGENTS.md` to document the new RG-ART-07..10 validation rules and the 12-section baker layout.
- Agents MUST update `packages/ontology/AGENTS.md` to document the three new block types in the archetype registry.
- Agents MUST create UI components for `article-header`, `toc`, and `changelog` in `@gogol/ui` with colocated `manifest.yaml` files (DNA-17 Mirror Quintet).
- Agents MUST create PBT and snapshot tests for the `rfc-0504` migrator (DNA-41, RFC-0479).
- The `article-header` block is a new block type, not a reuse of `hero`. It carries metadata fields that `hero` does not support.
- The `toc` block is auto-generated and has no frontmatter — it reads from the prose body at bake time.
- The `changelog` block is distinct from the provenance footer (RFC-0502). The provenance footer shows author name, role, review date, and source list. The changelog shows a history of editorial changes (date, summary, authorId).
- When implementing, reference RFC-0504 in commit messages.
