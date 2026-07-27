---
id: RFC-0490
title: "Reposition the website-local depth-0 pillar as an industry navigation hub"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-22
updatedAt: 2026-07-22
enhancedAt: 2026-07-22
implementedAt: 2026-07-22
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0238
  - RFC-0207
amendedBy: []
related:
  - RFC-0192
  - RFC-0193
  - RFC-0194
  - RFC-0199
  - RFC-0207
  - RFC-0224
  - RFC-0238
  - RFC-0239
  - RFC-0240
  - RFC-0330
  - RFC-0398
  - RFC-0480
  - RFC-0488
satisfies:
  - DNA-24
breaksC: false
versionBump: minor
commands:
  proposed:
    - surface.hub.validate
  added:
    - surface.hub.validate
  changed:
    - surface.generate
    - surface.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "The /website/ depth-0 pillar page positions itself as an industry navigation hub, not a separate 'Website erstellen lassen' service — the H1, hero lead, and CTAs communicate 'choose your trade' rather than 'order a website'."
  - "The hero primary CTA is 'Gewerbe auswählen' (choose trade), not 'Situation beschreiben' (describe situation) — the visitor selects an industry before entering the contact flow."
  - "A 'Was sich je nach Gewerbe verändert' (what changes by trade) block explains the four adaptation dimensions (Leistungen/Sprache, Einsatzgebiet, Kontakt/Handlung, Nachweise/Vertrauen) using existing archetype block types."
  - "An industry catalog section shows all published industries as linked cards with trade name, one specific trade task, typical contact scenario, and a link to the industry page — generated from the surface axis universe, not hardcoded."
  - "A 'Gleiche Grundlage, angepasste Struktur' (same basis, adapted structure) block shows the base price from PBP references and explains that the trade does not change the base price."
  - "A final CTA block addresses unlisted trades with 'Ihr Gewerbe ist noch nicht aufgeführt?' and offers 'Unverbindliche Anfrage starten' + 'Preis ansehen'."
  - "The page title is 'Website für Handwerk und Gewerbe | Branchenübersicht | Webgogol' (DE) / 'Сайт для ремесла та бізнесу | Огляд галузей | Webgogol' (UK), not the generic 'Website erstellen lassen' / 'Створення вебсайту'."
  - "The meta description communicates the hub function: how Digitales Fundament adapts to different trades."
  - "JSON-LD for the pillar page emits CollectionPage + ItemList (of published industry links) + BreadcrumbList — not per-card Product or Service nodes."
  - "No unfulfillable commercial promises ('Anfragen, die zu echten Aufträgen führen', 'lokale Sichtbarkeit aufbauen') appear in any industry card description or meta description on the hub page."
  - "surface.hub.validate enforces: pillar hero CTA is not 'Situation beschreiben', industry cards do not contain commercial promises, published industries have routes, pillar metadata matches the hub positioning."
nonGoals:
  - "Does not change the URL of /website/ (DE) or /sait/ (UK) — the slug is preserved."
  - "Does not add city-level or demand-level pages — those are depth 2–5 and governed by RFC-0238."
  - "Does not add client-side search or filtering of industries — the catalog is server-rendered; search is a possible future enhancement."
  - "Does not change the industry content schema (surface/industries/*.md frontmatter) — the hub reads existing fields (name, metaDescription, intro, image, imageAlt)."
  - "Does not modify the footer, home page, /leistungen/, /kontakt/, or /bildnachweise/ — cross-page changes are deferred to their own expert-file sessions."
  - "Does not create a new industry registry separate from the surface axis universe — the hub is a projection of existing published industries."
  - "Does not add new block archetypes — the hub uses existing block types (hero, audience-cards, markdown, final-cta) with new content."
  - "Does not change the baker for depth ≥1 pages — only the depth-0 pillar bake is modified."
---

# RFC-0490: Reposition the website-local depth-0 pillar as an industry navigation hub

## Problem

The `website-local` surface (RFC-0238) generates a six-level geo-demand cascade: depth-0 pillar → depth-1 industry → depth-2 country → depth-3 region → depth-4 city → depth-5 Bedarfskarte. The depth-0 pillar (`/website/` DE, `/sait/` UK) is the entry point — a hub that should help a business owner find their trade and understand how the single product (Digitales Fundament) adapts to their industry.

An external expert review (file 14.0) analysed the deployed DE `/website/` page and identified that it fails this hub role. The page positions itself as a separate service, sends visitors to the contact form before they have selected their trade, shows only two hardcoded industries, contains unfulfillable commercial promises, has no product/price connection, and emits generic structured data instead of CollectionPage + ItemList. The content-only fixes (removing commercial promises from UK industry `metaDescription` fields) were applied in the 14.0 session; the structural redesign requires blueprint, baker, and semantic-layer changes that this RFC governs.

## Context

The `website-local` surface (RFC-0238) generates a six-level geo-demand cascade: depth-0 pillar → depth-1 industry → depth-2 country → depth-3 region → depth-4 city → depth-5 Bedarfskarte. The depth-0 pillar (`/website/` DE, `/sait/` UK) is the entry point — a hub that should help a business owner find their trade and understand how the single product (Digitales Fundament) adapts to their industry.

An external expert review (file 14.0) analysed the deployed DE `/website/` page and identified that it fails this hub role:

### Current problems

1. **Positions as a separate service.** The H1 "Website erstellen lassen" competes with the product page (`/leistungen/digitales-fundament/`) and implies a second service rather than an industry view of one product.

2. **Hero CTA sends visitors away too early.** The primary CTA "Situation beschreiben" routes to the contact form before the visitor has selected their trade or understood the product. The hub should help them find their industry first.

3. **No explanation of industry adaptation.** The page does not explain what changes between trades (services, service area, contact scenarios, trust signals) and what stays the same (the product, the price basis, the legal framework).

4. **Only two industries shown.** The current page shows Elektriker and Friseur as hardcoded cards. The hub should project all published industries from the surface axis universe.

5. **Unfulfillable commercial promises.** Industry card descriptions contain "Anfragen, die zu echten Aufträgen führen" (leads that become real orders) and "lokale Sichtbarkeit aufbauen" (build local visibility) — neither is guaranteed by the product. (Content-only fixes for UK `metaDescription` were applied in the 14.0 session; the structural fix is to ensure the hub baker never renders these promises.)

6. **No product/price connection.** The page does not show the base price or explain that the trade does not change it. Visitors cannot connect the industry choice to the product cost.

7. **No path for unlisted trades.** A visitor whose trade is not in the catalog has no clear next step. The page should offer an inquiry path for unlisted trades.

8. **Metadata does not communicate the hub function.** The title "Website erstellen lassen" and the current meta description are generic and do not convey "industry navigation hub."

9. **Structured data is generic.** The pillar page emits a default WebPage node, not a CollectionPage with an ItemList of industry links. Search engines cannot understand the page as a collection of trades.

## Decision

The depth-0 pillar bake is restructured to position `/website/` as an **industry navigation hub**. The baker (`bakePage` in `@gogol/site-kernel-checks`) gains a depth-0 specialization for the `website-local` surface that replaces the generic hero + children-cards + closing-CTA pattern with a structured hub layout.

The specialization is **blueprint-driven**, not hardcoded: the `website-local.yaml` blueprint gains a `pillar` configuration block that declares the hub's content slots (hero, adaptation dimensions, catalog, product/price, final CTA). The baker reads this configuration and emits blocks using existing archetypes. Other surfaces (e.g. `ratgeber`) are unaffected — they do not declare a `pillar` block.

### Hub block layout (depth-0 only)

| Position | Block type | Content source |
| --- | --- | --- |
| 1 | `hero` | Blueprint `pillar.hero` (eyebrow, heading, lead, primary/secondary CTA) |
| 2 | `markdown` | Blueprint `pillar.adaptation` heading + body (four dimensions) |
| 3 | `audience-cards` (linked) | Published industries from the axis universe (catalog) |
| 4 | `markdown` | Blueprint `pillar.productPrice` heading + body (base price from PBP ref, trade doesn't change price) |
| 5 | `final-cta` | Blueprint `pillar.finalCta` (unlisted-trade inquiry + price link) |

### Blueprint configuration (`website-local.yaml`)

The depth-0 level gains a `pillar` block:

```yaml
levels:
  - depth: 0
    slug: { de: "website", uk: "sait" }
    constellation: website-pillar
    geo: twin-only
    semanticType: collection
    titleTemplate:
      de: "Website für Handwerk und Gewerbe | Branchenübersicht | Webgogol"
      uk: "Сайт для ремесла та бізнесу | Огляд галузей | Webgogol"
    descriptionTemplate:
      de: "Wie das Digitale Fundament an Elektriker, Friseure und andere lokale Betriebe angepasst wird: Leistungen, Einsatzgebiet, Kontaktwege und passende Funktionen."
      uk: "Як Цифровий фундамент адаптується до електриків, перукарів та іншого локального бізнесу: послуги, зона роботи, шляхи контакту та відповідні функції."
    intro:
      de: "Das Digitale Fundament bleibt dasselbe. Aufbau, Inhalte, Kontaktwege und optionale Funktionen werden an den jeweiligen Betrieb angepasst."
      uk: "Цифровий фундамент залишається тим самим. Структуру, контент, шляхи контакту та додаткові функції адаптуємо до конкретного бізнесу."
    pillar:
      hero:
        eyebrow:
          de: "Digitales Fundament für Ihr Gewerbe"
          uk: "Цифровий фундамент для вашого бізнесу"
        heading:
          de: "Welche Website braucht Ihr Betrieb?"
          uk: "Який сайт потрібен вашому бізнесу?"
        lead:
          de: "Ein Elektrikerbetrieb, ein Friseursalon und eine Gebäudereinigung benötigen nicht dieselben Inhalte und Kontaktwege. Hier sehen Sie, wie das Digitale Fundament an unterschiedliche Gewerbe angepasst wird."
          uk: "Електромонтаж, перукарня та прибирання будівель потребують різного контенту та шляхів контакту. Тут видно, як Цифровий фундамент адаптується до різних видів бізнесу."
        primaryCta:
          label:
            de: "Gewerbe auswählen"
            uk: "Обрати галузь"
          target: "#industry-catalog"
        secondaryCta:
          label:
            de: "Digitales Fundament verstehen"
            uk: "Зрозуміти Цифровий фундамент"
          target: "digitales-fundament"
      adaptation:
        heading:
          de: "Was sich je nach Gewerbe verändert"
          uk: "Що змінюється залежно від галузі"
        dimensions:
          - heading:
              de: "Leistungen und Sprache"
              uk: "Послуги та мова"
            body:
              de: "Welche Leistungen unterschieden werden und wie Kunden sie nennen."
              uk: "Які послуги потрібно розрізняти і як їх називають клієнти."
          - heading:
              de: "Einsatzgebiet"
              uk: "Зона роботи"
            body:
              de: "Ob der Betrieb an einem Standort, in einem Radius, in mehreren Städten, mit Notdienst oder nur nach Termin arbeitet."
              uk: "Чи працює бізнес на одному місці, в певному радіусі, у кількох містах, з аварійною службою чи лише за записом."
          - heading:
              de: "Kontakt und Handlung"
              uk: "Контакт та дія"
            body:
              de: "Welche Aktionen wichtig sind: Anruf, Termin, Notdienst, Angebot, Rückruf, Wegbeschreibung."
              uk: "Які дії важливі: дзвінок, запис, аварійна служба, пропозиція, зворотний дзвінок, маршрут."
          - heading:
              de: "Nachweise und Vertrauen"
              uk: "Докази та довіра"
            body:
              de: "Welche Angaben helfen, den Betrieb einzuschätzen: Qualifikationen, Meisterbetrieb, Fotos, Bewertungen, Öffnungszeiten."
              uk: "Які відомості допомагають оцінити бізнес: кваліфікації, майстерність, фото, відгуки, години роботи."
      productPrice:
        heading:
          de: "Gleiche Grundlage, angepasste Struktur"
          uk: "Спільна основа, адаптована структура"
        body:
          de: "Die Branche verändert nicht automatisch den Basispreis. Zusätzliche Seiten, Sprachen, Buchungsfunktionen oder Integrationen werden gesondert vereinbart."
          uk: "Галузь не змінює автоматично базову ціну. Додаткові сторінки, мови, функції бронювання чи інтеграції узгоджуються окремо."
        priceRef: "{business-profile.offerings/digital-foundation.presentation.price}"
      finalCta:
        heading:
          de: "Ihr Gewerbe ist noch nicht aufgeführt?"
          uk: "Вашої галузі ще немає в списку?"
        body:
          de: "Beschreiben Sie kurz Ihren Betrieb, Ihre Leistungen und Ihr Einsatzgebiet. Webgogol prüft, wie das Digitale Fundament für Ihre Situation aufgebaut werden kann."
          uk: "Коротко опишіть свій бізнес, послуги та зону роботи. Webgogol перевірить, як Цифровий фундамент можна побудувати для вашої ситуації."
        primaryCta:
          label:
            de: "Unverbindliche Anfrage starten"
            uk: "Почати необов'язковий запит"
          target: "contact"
        secondaryCta:
          label:
            de: "Preis ansehen"
            uk: "Переглянути ціну"
          target: "pricing"
```

### Baker changes (`bake.ts` / `bake-helpers.ts`)

`bakePage` gains a depth-0 pillar specialization. When `entry.depth === 0` and the level declares a `pillar` block, the baker emits the hub layout instead of the generic hero + children + CTA pattern.

The specialization:

1. **Hero**: reads `pillar.hero` (eyebrow, heading, lead, primaryCta, secondaryCta). The eyebrow is rendered as the hero `tagline`. The primary CTA targets an anchor (`#industry-catalog`) on the same page, not the contact form. The secondary CTA targets the product page (`digitales-fundament`).

2. **Adaptation block**: a `markdown` block with the `pillar.adaptation.heading` and a body composed from the four `dimensions` entries. Each dimension is a `{heading, body}` pair rendered as a subsection within the markdown body.

3. **Industry catalog**: an `audience-cards` block with `kind: cards` and `linked: true` (using `linkedCardGrid` from `bake-blocks.ts`). The `anchorId: industry-catalog` is set in the block props so the hero CTA anchor resolves. Cards are built from all published industries (the axis universe for the `industry` axis), each showing:
   - `title`: the industry name (`valData(ctx, "industry", slug, lang).name`)
   - `description`: the industry `metaDescription` (already cleaned of commercial promises in the 14.0 content session)
   - `href`: the industry page URL (`hrefFor` for the depth-1 child entry)
   - `image` / `imageAlt`: the industry image (from `valData`)

4. **Product/price block**: a `markdown` block with `pillar.productPrice.heading` and a body that interpolates the PBP price reference (`pillar.productPrice.priceRef`). The body text explains that the trade does not change the base price. The PBP reference is resolved at render time by the same interpolation layer used in authored pages — it is not hardcoded.

5. **Final CTA**: a `final-cta` block with `pillar.finalCta.heading`, `body`, and two CTA items (primary: contact, secondary: pricing).

### Industry card promise enforcement

`surface.hub.validate` checks that industry `metaDescription` values used in the catalog do not contain known unfulfillable promise phrases:

- `Anfragen, die zu echten Aufträgen führen` / `запити, що ведуть до реальних замовлень`
- `lokale Sichtbarkeit aufbauen` / `побудувати локальну видимість`

This is a safety net — the content was already cleaned in the 14.0 session, but the validator prevents regressions.

### Structured data changes

The depth-0 pillar page's `semanticType` is set to `"collection"` (a new value in `SemanticPageType`). The JSON-LD builder (`buildWebPageNode` in `@gogol/share`) maps `"collection"` to `["WebPage", "CollectionPage"]` and emits an `ItemList` node listing the published industry links.

The `ItemList` is built from the same published industries that render in the catalog. Each `ListItem` references the industry page URL (not a Product or Service node — the expert explicitly warns against per-card Product/Service when there is one product).

The `BreadcrumbList` is already emitted by the existing breadcrumb builder; no change needed.

### Label changes

The `SURFACE_LABELS` in `bake-helpers.ts` are not used for the depth-0 pillar (the pillar reads its labels from the blueprint `pillar` block). The existing labels (`cta`, `exit`, `related`, `more`, `closing`, etc.) remain unchanged for depth ≥1 pages.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/blueprints/website-local.yaml` | Add `pillar` block to depth-0 level; update `titleTemplate` and add `descriptionTemplate` |
| `packages/surface/src/blueprint.ts` | Add `pillar` field to `BlueprintLevel` type |
| `packages/os/site-kernel-checks/src/surface-expand/bake.ts` | Add depth-0 pillar specialization in `bakePage` |
| `packages/os/site-kernel-checks/src/surface-expand/bake-helpers.ts` | Add `pillarFor` helper to read pillar config |
| `packages/os/site-kernel-checks/src/surface-expand/bake-blocks.ts` | Add `anchorId` support to `linkedCardGrid` |
| `packages/share/src/semantic/models.ts` | Add `"collection"` to `SemanticPageType` |
| `packages/share/src/semantic/jsonld/webpage.ts` | Map `"collection"` to `["WebPage", "CollectionPage"]` |
| `packages/share/src/semantic/jsonld/context.ts` | Add `collectionListId` to `JsonLdContext` |
| `packages/share/src/semantic/jsonld.ts` | Build and attach `ItemList` node for `"collection"` pages |
| `packages/os/site-kernel-checks/src/surface-hub-validate.ts` | New validator: `surface.hub.validate` |

### Failure modes

`surface.hub.validate` reports:

- `pillar-hero-cta-not-anchor` (fail): the depth-0 pillar hero primary CTA targets a pageId (e.g. `contact`) instead of an anchor (e.g. `#industry-catalog`). The hub must guide visitors to the catalog first.
- `pillar-commercial-promise` (fail): an industry `metaDescription` used in the catalog contains a known unfulfillable promise phrase.
- `pillar-missing-title-template` (fail): the depth-0 level has no `titleTemplate` — the hub title must communicate the industry-hub function.
- `pillar-orphan-industry` (warn): a published industry in the axis universe has no corresponding depth-1 route entry (the industry page was dropped by the eligibility engine).
- `pillar-no-published-industries` (fail): the catalog is empty — no published industries exist for this surface.
- `pillar-priceref-unresolvable` (warn): the `pillar.productPrice.priceRef` PBP reference cannot be resolved at validation time (the PBP entity or field path does not exist). The validator checks reference syntax (`{business-profile.` prefix) as a fail; resolution is a warn because the PBP data may not be available in the validation environment.

## Architectural fit

- **RFC-0238 (website-local v2):** this RFC amends the depth-0 level configuration and bake. The five-axis cascade, the geo-demand model, and the Bedarfskarte content model are unchanged. The `pillar` block is an optional extension to `BlueprintLevel` — other surfaces are unaffected.
- **RFC-0207 (bespoke narrative):** the pillar hero reads from the blueprint `pillar.hero` block, not from an approved bespoke narrative. The narrative system remains for depth ≥1 pages. A future RFC may add narrative support for the pillar if bespoke hero copy is desired.
- **RFC-0192/0193 (surface contracts):** the `pillar` field is a new optional field on `BlueprintLevel`. The Blueprint Zod schema in `@gogol/ontology` is extended to validate it. The baker's `BakeCtx` is unchanged — the pillar config is read from the level, which is already in `ctx.levels`.
- **RFC-0398 (PBP):** the product/price block uses `{business-profile.offerings/digital-foundation.presentation.price}` references, not hardcoded values. The interpolation is handled by the same render-time resolver used in authored pages.
- **RFC-0480 (Layer C protection):** the URL `/website/` (DE) and `/sait/` (UK) are preserved. No URL schema, sitemap, or hreflang changes. The new `semanticType: "collection"` adds a `CollectionPage` JSON-LD type but does not remove or alter existing types — this is a Layer C additive change, not a Breaks-C. `breaksC: false`.
- **RFC-0488 (material credits):** the industry catalog cards show images from the industry content (`valData` image/imageAlt). The Bildnachweis leakage fix (expert §8) is a separate concern — the catalog card renders the image via `<ResponsiveImage>` and does not embed JSON-LD or credit text in the accessible name. If leakage is found in the linked-card rendering, it is addressed in the credits-gallery component (RFC-0488 scope), not here.
- **Platform versioning (RFC-0478):** this RFC changes `packages/surface` (Blueprint type), `packages/share` (SemanticPageType), and `packages/ontology` (blueprint YAML schema) — all Breaks-B. `versionBump: minor`. The `website-local.yaml` blueprint is updated directly in the implementation commit — no migrator is needed because the file is platform code, not Sternsystem data.

## Design

### Blueprint type extension (`packages/surface/src/blueprint.ts`)

```ts
export interface BlueprintPillarHero {
  eyebrow: LocalizedString;
  heading: LocalizedString;
  lead: LocalizedString;
  primaryCta: { label: LocalizedString; target: string };
  secondaryCta: { label: LocalizedString; target: string };
}

export interface BlueprintPillarAdaptationDimension {
  heading: LocalizedString;
  body: LocalizedString;
}

export interface BlueprintPillarAdaptation {
  heading: LocalizedString;
  dimensions: BlueprintPillarAdaptationDimension[];
}

export interface BlueprintPillarProductPrice {
  heading: LocalizedString;
  body: LocalizedString;
  priceRef: string;
}

export interface BlueprintPillarFinalCta {
  heading: LocalizedString;
  body: LocalizedString;
  primaryCta: { label: LocalizedString; target: string };
  secondaryCta: { label: LocalizedString; target: string };
}

export interface BlueprintPillar {
  hero: BlueprintPillarHero;
  adaptation: BlueprintPillarAdaptation;
  productPrice: BlueprintPillarProductPrice;
  finalCta: BlueprintPillarFinalCta;
}

// Extend BlueprintLevel:
export interface BlueprintLevel {
  // ... existing fields ...
  /** Optional pillar-hub configuration for depth-0 hub pages. */
  pillar?: BlueprintPillar;
}
```

### Baker specialization (`bake.ts`)

```ts
// In bakePage(), after the existing hero/block logic, add a depth-0 pillar branch:
if (entry.depth === 0 && level?.pillar) {
  return bakePillarHub(entry, lang, ctx, level);
}
```

`bakePillarHub` emits the five-block layout described in the hub block layout table. It reads published industries from `ctx.entries` (depth-1 children that are `indexable`) and builds linked cards with `anchorId: industry-catalog`.

### Semantic type extension (`packages/share/src/semantic/models.ts`)

```ts
export type SemanticPageType =
  | "home"
  | "about"
  | "projects"
  | "donationContact"
  | "openSource"
  | "content"
  | "article"
  | "person"
  | "legal"
  | "collection"; // new

export const SEMANTIC_PAGE_TYPES: readonly SemanticPageType[] = [
  // ... existing ...
  "collection",
];
```

### JSON-LD CollectionPage + ItemList (`packages/share/src/semantic/jsonld/`)

`buildWebPageNode` maps `"collection"` to `["WebPage", "CollectionPage"]`.

A new `buildCollectionListNode` builds an `ItemList` from the page's industry links (passed via a new `collectionItems` field on `SemanticPageModel`):

```ts
{
  "@type": "ItemList",
  "@id": `${webpageId}/industries`,
  itemListElement: industries.map((industry, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: industry.url,
    name: industry.name,
  })),
}
```

The `SemanticPageModel` gains an optional `collectionItems: Array<{ url: string; name: string }>` field. The `SemanticModelOptions` interface (`packages/share/src/astro/page-handler/types.ts`) gains a matching optional `collectionItems` field. The page handler (`resolve-route.ts`) computes the depth-1 children from the surface artifact (`surfaceEntry` → `getSurfaceEntryByPageId` → entries with `depth === 1` and `indexable`), builds the `{ url, name }` array, and passes it through the `buildSemanticModel` callback via `SemanticModelOptions.collectionItems`. The callback (`buildPageSemanticModel` in `@gogol/pbp/semantic-profile`) sets `collectionItems` on the returned `SemanticPageModel`.

### Validator (`surface.hub.validate`)

A new check command in `@gogol/site-kernel-checks` that validates the depth-0 pillar configuration and rendered output:

1. If the surface has a depth-0 level with a `pillar` block, validate:
   - `pillar.hero.primaryCta.target` starts with `#` (anchor target).
   - `pillar.hero` has `eyebrow`, `heading`, `lead`, `primaryCta`, `secondaryCta`.
   - `pillar.adaptation.dimensions` has at least 2 entries.
   - `pillar.productPrice.priceRef` starts with `{business-profile.` (PBP reference, not hardcoded).
   - `pillar.finalCta` has `heading`, `body`, `primaryCta`, `secondaryCta`.
2. For each published industry in the axis universe:
   - `metaDescription` does not contain known unfulfillable promise phrases.
   - A depth-1 route entry exists and is `indexable`.
3. The depth-0 `titleTemplate` is not the generic "Website erstellen lassen" / "Створення вебсайту" (it must communicate the hub function).

### Validator output format

`surface.hub.validate --site <site-id> --json` outputs:

```json
{
  "command": "surface.hub.validate",
  "site": "<site-id>",
  "surfaceId": "website-local",
  "checks": [
    {
      "rule": "pillar-hero-cta-not-anchor",
      "severity": "fail",
      "message": "...",
      "path": "levels[0].pillar.hero.primaryCta.target"
    }
  ],
  "exitCode": 0
}
```

Exit codes: `0` = all checks pass (warnings allowed), `1` = one or more fail-severity checks, `2` = invalid surface configuration (no depth-0 level, no `pillar` block — the validator is a no-op and reports nothing).

### Blueprint YAML update

The `packages/ontology/blueprints/website-local.yaml` file is updated directly in the implementation commit (not via a migrator). The migrator registry (RFC-0479) operates on `SternsystemData` — authored content within a Sternsystem repo — and is not applicable to platform package files. The blueprint YAML is platform code in the monorepo.

The update adds:

1. The `pillar` block to the depth-0 level with the content from the blueprint configuration above.
2. `semanticType: collection` on the depth-0 level.
3. Updated `titleTemplate` for depth-0 to the hub title.
4. A new `descriptionTemplate` for depth-0.

No `migratorCursor` entry is needed — the blueprint change ships with the platform version upgrade and is applied when a mission materializes against the new platform pin.

## Rollout

1. **Blueprint type**: add `BlueprintPillar` types to `@gogol/surface`. Extend the Zod schema in `@gogol/ontology` to validate the `pillar` field. `surface.validate` is changed because it validates blueprints against the Zod schema — the schema now accepts and validates the `pillar` field.
2. **Semantic type**: add `"collection"` to `SemanticPageType` in `@gogol/share`. Update `buildWebPageNode` and `buildJsonLd` for CollectionPage + ItemList. Add `collectionItems` to `SemanticModelOptions` and `SemanticPageModel`.
3. **Baker**: implement `bakePillarHub` in `bake.ts`. Add `anchorId` support to `linkedCardGrid` in `bake-blocks.ts`. `surface.generate` is changed because its expansion pipeline calls `bakePage`, which now emits the hub layout for depth-0 entries with a `pillar` block.
4. **Blueprint YAML**: update `packages/ontology/blueprints/website-local.yaml` directly in the implementation commit — add the `pillar` block, `semanticType: collection`, updated `titleTemplate`, and new `descriptionTemplate` to the depth-0 level.
5. **Page handler**: compute depth-1 children from the surface artifact in `resolve-route.ts` and pass `collectionItems` through `SemanticModelOptions` to the semantic model callback.
6. **Validator**: implement `surface.hub.validate` and add it to the `build.check` pipeline.
7. **Labels**: no new label keys needed — the pillar reads all labels from the blueprint `pillar` block.
8. **Compass sync**: update `docs/technology.xml` and `docs/knowledge-graph.xml` to reflect the new `pillar` field on `BlueprintLevel` and the `"collection"` semantic page type.
9. **AGENTS.md**: update `packages/share/AGENTS.md` semantic table to note the `"collection"` type and `collectionItems` field.
10. **Pilot**: regenerate the surface for `webgogol-com` and verify the rendered `/website/` and `/sait/` pages.
11. **Switch to fail-hard**: enable `surface.hub.validate` in `APPS_CHECK_AUTHOR_PIPELINE`.

## Alternatives considered

- **Hand-edit the generated page.** Rejected — the page is generator-owned (RFC-0081 marker). Hand-editing would be overwritten on the next `surface.generate` run.
- **Create an authored page at `pages/uk/website.md`.** Rejected — the `/website/` route is owned by the surface generator. Creating an authored page would conflict with the generated route and break the surface registry.
- **Add new block archetypes (industry-catalog, adaptation-grid, product-price).** Rejected — the hub layout can be expressed with existing archetypes (hero, markdown, audience-cards, final-cta). Adding new archetypes increases the schema surface without clear benefit.
- **Hardcode the pillar content in the baker.** Rejected — the pillar content (headings, leads, CTAs) is language-specific and belongs in the blueprint, not in TypeScript. The baker reads the blueprint; it does not contain content.
- **Use a bespoke narrative (RFC-0207) for the pillar hero.** Deferred — the narrative system is designed for depth ≥1 tuple-specific pages. The pillar is a single page with stable content that belongs in the blueprint. A future RFC may add narrative support if bespoke pillar copy is desired.
- **Add client-side industry search.** Deferred — the catalog is server-rendered with 2–15 industries. Search adds complexity without clear value at this scale. A future RFC may add it when the catalog grows beyond ~20 industries.
- **Create a separate industry registry collection.** Rejected — the surface axis universe is already the canonical industry list. A separate registry would create drift and dual maintenance.
- **Extend `surface.validate` instead of creating `surface.hub.validate`.** Rejected — `surface.validate` validates the blueprint schema (structural correctness of all levels and axes). The hub checks are semantic (hero CTA is an anchor, no commercial promises, title communicates hub function) and apply only to depth-0 pillar pages with a `pillar` block. Mixing schema validation with hub-specific semantic checks in one command would blur the command's purpose and make the output harder to act on. A separate command keeps the concern boundary clear.

## Risks

- **Blueprint complexity.** The `pillar` block adds a large nested structure to the blueprint. However, it is optional — surfaces without a `pillar` block are unaffected. The Zod schema validates the structure at load time.
- **Baker branching.** Adding a depth-0 pillar branch to `bakePage` increases the function's complexity. Mitigated by extracting `bakePillarHub` as a separate function, keeping `bakePage` as a dispatcher.
- **PBP reference in markdown body.** The `pillar.productPrice.body` contains a PBP reference (`{business-profile...}`). The markdown block must interpolate this at render time. If the interpolation layer does not handle markdown bodies, the reference will appear as literal text. Mitigated by testing the interpolation in the pilot step.
- **CollectionPage JSON-LD compatibility.** Adding `"collection"` to `SemanticPageType` and mapping it to `CollectionPage` is a new type. The JSON-LD builder must handle it without breaking existing types. Mitigated by the additive design — the new type is in a switch statement default branch, not a replacement.
- **Industry catalog completeness.** The catalog shows all published industries. If only two industries are published (current state), the catalog is short. This is a content issue, not a structural one — the expert recommends adding more industries only when they have substantive content (§5: "Не публиковать пустую отрасль только для заполнения каталога").
- **False-positive rate for commercial-promise check.** The `pillar-commercial-promise` rule scans `metaDescription` values for two known unfulfillable promise phrases. The false-positive rate is near zero because the phrases are specific multi-word strings ("Anfragen, die zu echten Aufträgen führen", "lokale Sichtbarkeit aufbauen") unlikely to appear in legitimate descriptions. If a legitimate description triggers a false positive, the fix is to rephrase the `metaDescription` — there is no suppression mechanism, by design.

## Acceptance criteria

- [x] `BlueprintLevel` in `@gogol/surface` includes the optional `pillar` field with the full `BlueprintPillar` type. (evidence: `packages/surface/src/blueprint.ts:97-102,133-134`)
- [x] The Zod schema in `@gogol/surface` validates the `pillar` field when present. (evidence: `packages/surface/src/blueprint-schema.ts:26-68,150`)
- [x] `website-local.yaml` depth-0 level has a `pillar` block with hero, adaptation, productPrice, and finalCta. (evidence: `packages/ontology/blueprints/website-local.yaml:47-121`)
- [x] `website-local.yaml` depth-0 has `semanticType: collection`. (evidence: `packages/ontology/blueprints/website-local.yaml:37`)
- [x] `website-local.yaml` depth-0 `titleTemplate` is the hub title (not "Website erstellen lassen" / "Створення вебсайту"). (evidence: `packages/ontology/blueprints/website-local.yaml:38-40`)
- [x] `website-local.yaml` depth-0 has a `descriptionTemplate` communicating the hub function. (evidence: `packages/ontology/blueprints/website-local.yaml:41-43`)
- [x] `bakePage` emits the five-block hub layout for depth-0 entries with a `pillar` block. (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake.ts:100-178`)
- [x] The hero primary CTA targets `#industry-catalog` (anchor), not `contact` (pageId). (evidence: `packages/ontology/blueprints/website-local.yaml:62`)
- [x] The hero secondary CTA targets `digitales-fundament` (product page). (evidence: `packages/ontology/blueprints/website-local.yaml:67`)
- [x] The industry catalog block has `anchorId: industry-catalog` in its props. (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake.ts:149-153`, rendered HTML contains `industry-catalog`)
- [x] The industry catalog shows all published industries as linked cards with name, description, href, and image. (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake.ts:131-153`)
- [x] The product/price block uses a PBP reference (`{business-profile.offerings/digital-foundation.presentation.price}`), not hardcoded values. (evidence: `packages/ontology/blueprints/website-local.yaml:104`)
- [x] The final CTA block has two items: primary (contact) and secondary (pricing). (evidence: `packages/ontology/blueprints/website-local.yaml:112-121`)
- [x] `SemanticPageType` includes `"collection"`. (evidence: `packages/share/src/semantic/models.ts:32,45`)
- [x] `buildWebPageNode` maps `"collection"` to `["WebPage", "CollectionPage"]`. (evidence: `packages/share/src/semantic/jsonld/webpage.ts:31-33`)
- [x] `buildJsonLd` emits an `ItemList` node for `"collection"` pages with industry links. (evidence: `packages/share/src/semantic/jsonld/collection-list.ts:16-26`, rendered `/uk/sait/index.html` contains `ItemList`)
- [x] `SemanticPageModel` has an optional `collectionItems` field. (evidence: `packages/share/src/semantic/models.ts:341-344`)
- [x] `resolve-route.ts` populates `collectionItems` for `"collection"`-typed surface pages. (evidence: `packages/share/src/astro/page-handler/resolve-route.ts:409-426`)
- [x] `surface.hub.validate` enforces: `pillar-hero-cta-not-anchor`, `pillar-commercial-promise`, `pillar-missing-title-template`, `pillar-no-published-industries`. (evidence: `packages/os/site-kernel-checks/src/surface-hub-validate.ts`, command exit 0 verified)
- [x] `surface.hub.validate` warns on `pillar-orphan-industry` and `pillar-priceref-unresolvable`. (evidence: `packages/os/site-kernel-checks/src/surface-hub-validate.ts`, 1 warning verified)
- [x] `website-local.yaml` is updated directly in the implementation commit (no migrator). (evidence: git log shows direct edit, no migrator registered)
- [x] `surface.hub.validate --site webgogol-com --json` exits 0. (evidence: `node packages/os/site-kernel/bin/site-kernel.mjs run surface.hub.validate --site webgogol-com --json` → exitCode 0, 0 errors, 1 warning)
- [x] `content.references.validate --site webgogol-com` exits 0. (evidence: `node packages/os/site-kernel/bin/site-kernel.mjs run content.references.validate --site webgogol-com` → OK, 0 warnings)
- [x] `docs/technology.xml` and `docs/knowledge-graph.xml` updated to reflect the new `pillar` field and `"collection"` semantic type. (evidence: `docs/technology.xml:163-177,206-207`, `docs/knowledge-graph.xml:550-607`)
- [x] `packages/share/AGENTS.md` semantic table updated to note the `"collection"` type and `collectionItems` field. (evidence: `packages/share/AGENTS.md:15`)
- [x] Dev build of `webgogol-com` starts without runtime errors on `/website/` and `/sait/`. (evidence: `pnpm --filter webgogol-com run build` — `/uk/sait/index.html` and `/de/website/index.html` prerendered successfully; `/open-source` crash is pre-existing and unrelated)
- [x] The rendered `/website/` page shows: hub hero, adaptation block, industry catalog, product/price block, final CTA. (evidence: 5 `section-shell` blocks in rendered HTML, `industry-catalog` anchor present)
- [x] The rendered `/sait/` page shows the same layout in Ukrainian. (evidence: `missions/webgogol-com-m000010/workpiece/dist/client/uk/sait/index.html` — 5 section-shell blocks, CollectionPage + ItemList JSON-LD)
- [x] No unfulfillable commercial promises appear in any industry card on the hub page. (evidence: grep for known promise phrases in rendered HTML returned 0 matches)
- [x] `rfc.validate RFC-0490` passes. (evidence: `node packages/os/site-kernel/bin/site-kernel.mjs run rfc.validate RFC-0490` → 0 errors, 1 warning V-30 advisory)
- [x] RFC-0238 `amendedBy` includes RFC-0490; RFC-0207 `amendedBy` includes RFC-0490. (evidence: `docs/rfcs/archive/implemented/rfc-0238-*.md:17-19`, `docs/rfcs/archive/implemented/rfc-0207-*.md:19-21`)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted` (RFC-0224). The `accepted → implemented` transition requires human architecture review.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT hardcode industry names, prices, or CTAs in the baker — all content comes from the blueprint `pillar` block and the industry content files.
- Agents MUST NOT replace PBP references with hardcoded values in the product/price block.
- Agents MUST NOT add new block archetypes — use existing types (hero, markdown, audience-cards, final-cta).
- Agents MUST NOT modify the baker for depth ≥1 pages — only the depth-0 pillar specialization is in scope.
- Agents MUST NOT edit the footer, home page, /leistungen/, /kontakt/, or /bildnachweise/ — cross-page changes are deferred.
- Agents MUST NOT register a migrator (RFC-0479) for the blueprint YAML changes — the file is platform code, not Sternsystem data. Update it directly in the implementation commit.
- Agents MUST update `amendedBy` on RFC-0238 and RFC-0207 when this RFC is implemented.
- Agents MUST update `docs/technology.xml`, `docs/knowledge-graph.xml`, and `packages/share/AGENTS.md` in the same implementation change.
- Verification evidence for the acceptance criteria must be collected during implementation (RFC-0330): command output, rendered HTML, JSON-LD output.
- When implementing, reference RFC-0490 in commit messages or PR descriptions.
