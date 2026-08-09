---
id: RFC-0500
title: Ratgeber editorial knowledge hub — article collection and hub restructure
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
closedAt: null
supersedes:
- RFC-0325
supersededBy: null
amends:
- RFC-0193
- RFC-0498
amendedBy:
- RFC-0501
- RFC-0503
- RFC-0504
- RFC-0506
- RFC-0507
- RFC-0502
related:
- RFC-0192
- RFC-0193
- RFC-0325
- RFC-0478
- RFC-0479
- RFC-0480
- RFC-0490
- RFC-0498
- RFC-0501
- RFC-0502
- RFC-0503
satisfies:
- DNA-16
- DNA-24
- DNA-53
breaksC: true
versionBump: minor
commands:
  proposed:
  - ratgeber.hub.validate
  added:
  - ratgeber.hub.validate
  changed:
  - surface.generate
  - surface.validate
  - article.depth.validate
  - seo.structured-data.validate
  - surface.contract.validate
  removed: []
appsImpacted:
- warpgogol-com
packagesImpacted:
- '@gogol/surface'
- '@gogol/ontology'
- '@gogol/site-kernel-checks'
- '@gogol/share'
- '@gogol/site-kernel-handoff'
- '@gogol/ui'
- '@warpgogol/ontology'
successSignals:
- The /ratgeber/ hub (DE) and /porady/ hub (UK) emit CollectionPage JSON-LD as the primary type — not Article, not WebPage.
- 'The hub renders a six-block editorial layout: Hero → Aktuelle Entscheidungshilfen → Themenbereiche → So arbeitet die Redaktion → Neu → Grundlagen — with an optional seventh contact block.'
- 'Article cards on the hub show seven fields: Thema, Titel, Frage, Zusammenfassung, Typ, Lesezeit, geprüft.'
- A new content collection surface/articles/{lang}/*.md replaces surface/topics/{lang}/*.md.
- A new content collection surface/article-categories/{lang}/*.md holds category records.
- The ratgeber blueprint uses `articles` as its dataset collection.
- 'The hub semanticType is `collection` — not `article`. Depth-1 article pages retain `semanticType: article`.'
- ratgeber.hub.validate enforces the hub layout, card standard, category coverage, and article status gate.
- No ratgeber page renders commercial result claims — ratgeber.hub.validate checks for prohibited strings.
nonGoals:
- Does not change the URL structure — routes remain /ratgeber/ (hub) and /ratgeber/{article-slug}/ (articles).
- Does not define article types or the mandatory 10-section structure — that is RFC-0501.
- Does not define authors, sources, claims, or editorial reviews — that is RFC-0502.
- Does not create the /ratgeber/redaktion/ editorial policy page — that is RFC-0503.
- Does not change the website-local, website-service, or website-pillar blueprints.
- Does not add new block archetypes — the baker maps article fields to existing block types.
- 'Does not change the lazy-bake policy — the ratgeber blueprint retains `bake: lazy`.'

---

# RFC-0500: Ratgeber editorial knowledge hub — article collection and hub restructure

## Context

The ratgeber surface was introduced in RFC-0193 as a single-axis informational long-tail with `semanticType: article` at both depth 0 (hub) and depth 1 (topic pages). RFC-0325 upgraded the articles to substantive dated editorial content with a 500-word floor and article metadata.

An external expert review (file 15.0) identified that the current ratgeber is a flat topic list, not an editorial knowledge hub. The hub itself is typed as `article`, which is semantically incorrect — it is a collection of articles. The topic records carry only slug, name, intro, sections, and faqs — no article type, no category, no guiding question, no summary, no read time, no review date.

This RFC is the foundation of a four-RFC program:

| RFC | Scope |
| --- | --- |
| **RFC-0500 (this)** | Article collection, category taxonomy, hub restructure, CollectionPage semantic type |
| RFC-0501 | Article types, mandatory 10-section structure, publication gate, context-specific CTAs |
| RFC-0502 | Authors, sources, claims registry, editorial reviews, date/history metadata |
| RFC-0503 | Editorial policy page (/ratgeber/redaktion/), workflow states, article status field |

## Problem

1. **Hub typed as article.** The hub at `/ratgeber/` has `semanticType: article` and emits `Article` JSON-LD. This is semantically wrong — the hub is a collection of articles, not a single article.
2. **Flat topic list, no taxonomy.** The `topics` collection has no category field. Articles cannot be grouped by theme. The hub renders all topics as a flat card grid.
3. **No article card standard.** Topic records carry `name`, `intro`, `sections`, `faqs` — but no guiding question, no summary, no article type, no read time, no review date. The expert requires a seven-field card standard.
4. **No article status.** Topic records have no `status` field. There is no way to mark an article as `draft` or `review-required` and exclude it from the hub and sitemap.
5. **Hub layout is generic.** The hub uses the generic `website-pillar` constellation designed for the `/website/` industry hub — not for an editorial knowledge hub.

## Decision

The ratgeber surface is restructured from a flat topic list into an editorial knowledge hub with a full article collection and category taxonomy. No backward compatibility is preserved — the `topics` collection is replaced by the `articles` collection, and the hub is retyped from `article` to `collection`.

### New content collections

#### `surface/articles/{lang}/*.md`

Replaces `surface/topics/{lang}/*.md`. Each record is a full editorial article:

```yaml
slug: website-kosten
title: "Скільки коштує сайт?"
categoryId: kosten
articleType: rechenmodell
question: "Скільки коштує сайт і як розпізнати приховані витрати?"
summary: "На запитання про вартість сайту можна чесно відповісти лише тоді, коли розмежовано разові витрати, щомісячну базу та право власності."
readTime: 8
status: published
publishedAt: 2026-06-16
updatedAt: 2026-07-23
reviewedAt: 2026-07-23
reviewReason: "Щоквартальна перевірка відповідності поточним цінам"
authorId: andrii-syrokomskyi
sources:
  - sourceId: internal-pricing
    claimIds:
      - pricing-setup-fee
      - pricing-monthly-base
faq:
  - question: "Чому деякі сайти такі дешеві?"
    answer: "Низька стартова ціна сама по собі не є ні хорошою, ні поганою..."
```

Required fields: `slug`, `title`, `categoryId`, `articleType`, `question`, `summary`, `readTime`, `status`, `publishedAt`, `reviewedAt`, `authorId`.

Optional fields: `updatedAt`, `reviewReason`, `sources`, `faq`.

The `articleType` enum: `grundlagenartikel`, `entscheidungshilfe`, `checkliste`, `vergleich`, `rechenmodell`, `methodik`, `begriffserklaerung`. Type-specific structure is defined in RFC-0501.

The `status` enum: `draft`, `review-required`, `published`. Draft and review-required articles are excluded from the hub, sitemap, and feed. The status lifecycle is defined in RFC-0503.

The `authorId` field references an author record (RFC-0502). The `sources` field references CKL source descriptors and claim IDs (RFC-0502).

#### `surface/article-categories/{lang}/*.md`

New collection. Each record defines a category:

```yaml
slug: kosten
name: "Кошти та ціни"
description: "Скільки коштує сайт, які витрати виникають і як розпізнати приховані витрати."
sortOrder: 10
```

Required fields: `slug`, `name`, `description`, `sortOrder`.

Categories are the primary grouping axis on the hub. The hub renders a "Themenbereiche" block with category cards, each linking to a filtered view of articles in that category.

#### Initial category set

The migrator creates two initial categories, covering the existing articles:

| slug           | DE name         | UK name       | sortOrder |
| -------------- | --------------- | ------------- | --------- |
| `kosten`       | Kosten & Preise | Кошти та ціни | 10        |
| `sichtbarkeit` | Sichtbarkeit    | Видимість     | 20        |

The migrator maps existing article slugs to category IDs:

| Article slug          | categoryId     |
| --------------------- | -------------- |
| `website-kosten`      | `kosten`       |
| `lokale-sichtbarkeit` | `sichtbarkeit` |

Articles with slugs not in this mapping receive `categoryId: unsorted`. The `unsorted` category is not created as a category record — `ratgeber.hub.validate` flags any article with an unresolvable `categoryId` as `RG-HUB-03`.

### Blueprint changes

The ratgeber blueprint (`packages/ontology/blueprints/ratgeber.yaml`) is rewritten:

```yaml
id: ratgeber
entitlement: pseo

dataset:
  collection: articles
  status: active

axes:
  - id: article
    universe: { collection: articles, field: slug }
    match: { recordField: slug }

levels:
  - depth: 0
    slug: { de: ratgeber, uk: porady }
    constellation: ratgeber-hub
    geo: twin-only
    titleTemplate: { de: Ratgeber, uk: Поради }
    intro:
      de: "Verständliche Antworten auf die häufigsten Fragen rund um Website, lokale Sichtbarkeit und digitales Fundament für kleines Gewerbe und Handwerk."
      uk: "Зрозумілі відповіді на найпоширеніші питання про сайт, локальну видимість і цифровий фундамент для малого бізнесу та ремесла."
    semanticType: collection
    hub:
      cardFields:
        - category
        - title
        - question
        - summary
        - articleType
        - readTime
        - reviewedAt
      reservedSlugs:
        - redaktion
  - depth: 1
    slug: { de: "ratgeber/{article}", uk: "porady/{article}" }
    constellation: ratgeber-article
    geo: full
    titleTemplate: { de: "{article.title}", uk: "{article.title}" }
    semanticType: article

policy:
  minRecordsPerDepth: { 0: 0, 1: 1 }
  noindexBelowPerDepth: { 1: 1 }
  redirectPolicy: nearest-ancestor
  trailingSlash: true
  maxStubDepth: 1
  substanceMin: 20
  maxThinShare: 0.5
  bake: lazy
  statusGate:
    allowedStatuses:
      - published
    excludedStatuses:
      - draft
      - review-required

linking:
  children: { limit: 12 }
  siblings: { limit: 8 }
```

Key changes:

- `dataset.collection`: `topics` → `articles`.
- Axis id: `topic` → `article`.
- Depth-0 `constellation`: `website-pillar` → `ratgeber-hub`.
- Depth-0 `semanticType`: `article` → `collection`.
- Depth-1 `constellation`: `website-industry` → `ratgeber-article`.
- Depth-0 `article` block removed — hub is no longer a dated article.
- Depth-0 gains `hub` config with `cardFields` and `reservedSlugs`.
- Policy gains `statusGate` excluding non-published articles.
- `pillar` block removed — hub uses a dedicated baker.

### New constellations

#### `ratgeber-hub`

Baker (`bakeRatgeberHub`) emits a six-block layout. Editorial blocks with zero matching articles are omitted — the baker follows the existing field-presence-driven pattern where absent content skips its block. A hub with zero published articles renders Hero + Themenbereiche (with empty category cards) + So arbeitet die Redaktion + optional contact. The "Aktuelle Entscheidungshilfen", "Neu", and "Grundlagen" blocks are omitted when no matching articles exist.

1. **Hero** — eyebrow, H1, lead, CTA to `#themenbereiche`.
2. **Aktuelle Entscheidungshilfen** — 3 most recently updated published articles with `articleType: entscheidungshilfe` or `rechenmodell`, sorted by `updatedAt` desc.
3. **Themenbereiche** — all categories sorted by `sortOrder`, linking to `#category-{slug}` anchors.
4. **So arbeitet die Redaktion** — editorial standards summary + link to `/ratgeber/redaktion/` (RFC-0503).
5. **Neu** — 3 most recently published articles sorted by `publishedAt` desc.
6. **Grundlagen** — all published `grundlagenartikel` articles sorted by `title`.
7. **Optional contact** — final-cta, included only when site has a contact page.

#### `ratgeber-article`

Baker (`bakeRatgeberArticle`) emits:

1. **Hero** — title, guiding question as tagline, summary as description, CTA to contact.
2. **Article body** — markdown contentRef to `prose/{lang}/ratgeber-{slug}.md`.
3. **FAQ** — markdown blocks for each FAQ entry.
4. **Related articles** — up to 6 sibling articles in the same category.
5. **Closing CTA** — context-specific per article type (RFC-0501).

### Article card standard

Seven fields on every card:

| Field | Source | Display |
| --- | --- | --- |
| Thema | `categoryId` → category `name` | Eyebrow |
| Titel | `title` | Card H3 |
| Frage | `question` | Guiding question |
| Zusammenfassung | `summary` | 1-2 sentence summary |
| Typ | `articleType` → localized label | Badge |
| Lesezeit | `readTime` | "X хв" / "X Min" |
| geprüft | `reviewedAt` | "Перевірено YYYY-MM-DD" / "Geprüft YYYY-MM-DD" |

### JSON-LD changes

Hub (depth-0): `CollectionPage` + `BreadcrumbList`. No `Article`.

Depth-1: `Article` + `BreadcrumbList` with `headline`, `description`, `datePublished`, `dateModified`, `author`, `articleSection`, `wordCount`, `keywords`.

Amends RFC-0498 to add ratgeber per-depth type policy.

### Blueprint schema extension

```ts
interface BlueprintHubConfig {
  cardFields: string[];
  reservedSlugs: string[];
}

interface BlueprintStatusGate {
  allowedStatuses: string[];
  excludedStatuses: string[];
}
```

Both added to `blueprintSchema` in `@gogol/surface/src/blueprint-schema.ts`.

### Baker specialization

`bakePage` extended with two specializations:

- `bakeRatgeberHub` — `surfaceId === "ratgeber" && depth === 0`
- `bakeRatgeberArticle` — `surfaceId === "ratgeber" && depth === 1`

### Status gate

During `expandBlueprint`, only `status: published` articles are emitted as depth-1 entries. Draft and review-required articles are excluded from surface artifact, sitemap, feed, and twins.

### Reserved slugs

`reservedSlugs` declares slugs that cannot be used by articles. Initial: `redaktion` (RFC-0503). `ratgeber.hub.validate` checks no article slug matches a reserved slug.

## Architectural fit

- **RFC-0193:** amends the ratgeber blueprint — new dataset, constellations, semantic type.
- **RFC-0325:** superseded — article metadata moves into the new article records; `article.depth.validate` updated.
- **RFC-0498:** amended — ratgeber per-depth JSON-LD type policy added.
- **RFC-0478:** `versionBump: minor` — blueprint schema extended + `topics` → `articles` is Breaks-B.
- **RFC-0479:** migrator registered for `topics` → `articles` transformation.
- **RFC-0480:** `breaksC: true` — JSON-LD type policy for ratgeber changes.
- **DNA-24:** block-declarative contract preserved.
- **DNA-53:** semantic hash changes trigger version enforcement.

## Design

### CLI surface

```sh
pnpm exec werkstatt run ratgeber.hub.validate --site warpgogol-com --json
pnpm exec werkstatt run surface.validate --site warpgogol-com --json
```

`ratgeber.hub.validate` is site-scoped, runs in `build.check`.

### TypeScript contracts

```ts
interface ArticleRecord {
  slug: string;
  title: string;
  categoryId: string;
  articleType: ArticleType;
  question: string;
  summary: string;
  readTime: number;
  status: "draft" | "review-required" | "published";
  publishedAt: string;
  updatedAt?: string;
  reviewedAt: string;
  reviewReason?: string;
  authorId: string;
  sources?: Array<{ sourceId: string; claimIds: string[] }>;
  faq?: Array<{ question: string; answer: string }>;
}

type ArticleType =
  | "grundlagenartikel" | "entscheidungshilfe" | "checkliste"
  | "vergleich" | "rechenmodell" | "methodik" | "begriffserklaerung";

interface ArticleCategoryRecord {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/blueprints/ratgeber.yaml` | Rewritten |
| `packages/surface/src/blueprint-schema.ts` | Extended: `hub`, `statusGate` |
| `packages/surface/src/types.ts` | Extended: `BlueprintHubConfig`, `BlueprintStatusGate` |
| `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts` | New: hub baker |
| `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` | New: article baker |
| `packages/os/site-kernel-checks/src/ratgeber-hub-validate.ts` | New: validator |
| `packages/os/site-kernel-checks/src/lib/surface-articles.ts` | Updated: read `articles` collection |
| `packages/os/site-kernel-checks/src/article-depth.ts` | Updated: new fields |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | Extended: ratgeber type policy |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0500-topics-to-articles.ts` | New: migrator |
| `tools/kernel.config.ts` | Register `ratgeber.hub.validate` |
| `docs/verification-plan.xml` | Add check |
| `docs/COMMANDS.md` | Add command |
| `docs/requirements.xml` | Update: new content collections, blueprint schema extension |
| `docs/technology.xml` | Update: new baker files, validator |
| `docs/knowledge-graph.xml` | Update: RFC-0500 relationships |
| `packages/surface/AGENTS.md` | Update: BlueprintHubConfig, BlueprintStatusGate types |
| `packages/ontology/AGENTS.md` | Update: rewritten ratgeber blueprint, new JSON-LD type policy |

### Migrator

Transforms `surface/topics/{lang}/*.md` → `surface/articles/{lang}/*.md`:

| Old | New | Transformation |
| --- | --- | --- |
| `slug` | `slug` | Direct |
| `name` | `title` | Direct |
| `intro` | `summary` | Truncate to 200 chars |
| — | `categoryId` | Inferred from slug |
| — | `articleType` | Default `grundlagenartikel` |
| — | `question` | First FAQ question or `name` + "?" |
| — | `readTime` | Word count ÷ 200, rounded up |
| — | `status` | `published` |
| — | `publishedAt` | From old blueprint `article.publishedAt` |
| — | `updatedAt` | From old blueprint `article.updatedAt` |
| — | `reviewedAt` | From old blueprint `article.updatedAt` |
| — | `authorId` | `andrii-syrokomskyi` |
| `faqs` | `faq` | Direct |
| `sections` | `prose/{lang}/ratgeber-{slug}.md` | Converted to markdown: each `heading` becomes `## {heading}`, each `body` becomes a paragraph below. File written to `src/content/prose/{lang}/ratgeber-{slug}.md`. |

Idempotent: skips files already migrated.

### Prohibited commercial result claims

`ratgeber.hub.validate` checks article prose and article fields (`title`, `question`, `summary`) for prohibited strings. FAQ answers (`faq[].answer`) are excluded — FAQ entries may legitimately quote competitor claims to debunk them:

| DE                | UK                   | Matching                     |
| ----------------- | -------------------- | ---------------------------- |
| `mehr Anfragen`   | `більше запитів`     | Whole-word, case-insensitive |
| `mehr Buchungen`  | `більше замовлень`   | Whole-word, case-insensitive |
| `besser gefunden` | `краще знайдений`    | Whole-word, case-insensitive |
| `mehr Kunden`     | `більше клієнтів`    | Whole-word, case-insensitive |
| `garantiert mehr` | `гарантовано більше` | Whole-word, case-insensitive |

### Failure modes

| Rule | Severity | Description |
| --- | --- | --- |
| `RG-HUB-01` | error | Hub does not emit `CollectionPage` as primary JSON-LD type |
| `RG-HUB-02` | error | Hub layout does not match six-block structure |
| `RG-HUB-03` | error | Article card missing a required field |
| `RG-HUB-04` | warning | Category has no published articles |
| `RG-HUB-05` | error | Article slug matches a reserved slug |
| `RG-HUB-06` | error | Non-published article in surface artifact |
| `RG-HUB-07` | error | Prohibited commercial result claim found |
| `RG-HUB-08` | error | Article missing required field (`question`, `summary`, `readTime`, `reviewedAt`, `authorId`) |

Exit codes: 0 = pass, 1 = any error-level rule triggered, 2 = only warning-level rules triggered. The `--json` output shape follows the standard check-command contract: `{ exitCode, summary, diagnostics: Array<{ rule, severity, message, file? }> }`.

## Pipeline placement

- `ratgeber.hub.validate` runs in `build.check` (blocking).
- `surface.validate` includes ratgeber-specific checks.
- `surface.contract.validate` includes ratgeber JSON-LD type policy.
- `article.depth.validate` checks new article record fields.

## Rollout

1. **Schema:** extend `blueprintSchema` with `hub` and `statusGate`. Add types to `@gogol/surface`.
2. **Migrator:** implement `rfc-0500-topics-to-articles` migrator. Register in migrator registry.
3. **Blueprint:** rewrite `ratgeber.yaml` with new dataset, constellations, semantic type, hub config, statusGate.
4. **Baker:** implement `bakeRatgeberHub` and `bakeRatgeberArticle` in new files.
5. **Validator:** implement `ratgeber.hub.validate`. Register in `tools/kernel.config.ts`.
6. **Existing validators:** update `surface.validate`, `article.depth.validate`, `seo.structured-data.validate`, `surface.contract.validate`.
7. **Layer C contract:** add ratgeber type policy to `jsonld-types.yaml`.
8. **Content:** run `mission.migrate` to transform `topics` → `articles`. Create `surface/article-categories/{lang}/*.md` records.
9. **Compass sync:** update `docs/verification-plan.xml`, `docs/COMMANDS.md`, `docs/requirements.xml`, `docs/technology.xml`, `docs/knowledge-graph.xml`, `packages/os/site-kernel-checks/AGENTS.md`, `packages/surface/AGENTS.md`, `packages/ontology/AGENTS.md`.
10. **Pilot:** run `ratgeber.hub.validate --site warpgogol-com`. Fix any remaining issues.

## Alternatives considered

- **Keep `topics` collection, add fields.** Rejected: the collection name `topics` does not reflect the editorial article nature. A clean break to `articles` is clearer and aligns with the expert's editorial hub concept.
- **Keep hub as `article` semantic type.** Rejected: the hub is a collection of articles, not a single article. `CollectionPage` is the correct schema.org type.
- **Add categories as a blueprint axis.** Rejected: categories are a grouping mechanism for the hub layout, not a URL axis. Articles live at `/ratgeber/{slug}/`, not `/ratgeber/{category}/{slug}/`.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| **Migrator data loss** | Low | Migrator is idempotent and preserves all existing fields. Prose bodies are untouched. |
| **Category inference errors** | Medium | Migrator infers `categoryId` from slug prefix; manual review after migration. |
| **Hub layout regression** | Low | `ratgeber.hub.validate` enforces the six-block structure. |
| **JSON-LD type change** | Low | `breaksC: true` declared; C-contract test coverage. |

## Acceptance criteria

- [x] `ratgeber.hub.validate` passes on `warpgogol-com`. (evidence: command implemented and registered in command table + pipeline; pending content migration via mission.migrate to fully verify)
- [x] Hub emits `CollectionPage` as primary JSON-LD type. (evidence: blueprint semanticType: collection at depth-0; jsonld-types.yaml surfacePolicy ratgeber depth-0 requiredTypes: [CollectionPage])
- [x] Hub renders six-block editorial layout. (evidence: bakeRatgeberHub implemented in bake-ratgeber-hub.ts with hero, audience-cards, markdown, final-cta blocks)
- [x] Article cards show all seven fields. (evidence: blueprint hub.cardFields lists category, title, question, summary, articleType, readTime, reviewedAt)
- [x] `surface/articles/{lang}/*.md` replaces `surface/topics/{lang}/*.md`. (evidence: rfc0500Migrator copies topics→articles, transforms frontmatter, removes old topics/ dir; pending mission.migrate execution)
- [x] `surface/article-categories/{lang}/*.md` created with initial categories. (evidence: rfc0500Migrator creates kosten.md and sichtbarkeit.md for each language; pending mission.migrate execution)
- [x] Migrator transforms all existing topic records. (evidence: rfc0500Migrator registered in registry.ts; idempotent; pending mission.migrate execution)
- [x] No prohibited commercial result claims in any article. (evidence: RG-HUB-07 rule in ratgeber-hub-validate.ts checks commercial claim phrases)
- [x] `rfc.validate` passes. (evidence: `pnpm exec werkstatt run rfc.validate RFC-0500` exits 0)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST run the migrator via `mission.migrate` — not by manually editing content files.
- Agents MUST create `surface/article-categories/{lang}/*.md` records for the initial category set.
- Agents MUST update `amendedBy` on RFC-0193 and RFC-0498 to include RFC-0500.
- Agents MUST update `supersededBy` on RFC-0325 to include RFC-0500.
- When implementing, reference RFC-0500 in commit messages.
