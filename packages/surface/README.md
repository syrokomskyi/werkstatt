# @warpgogol/surface

Framework-free **Programmatic Surface** route-source port: compile thousands of generated long-tail SEO/GEO pages from `dataset × axes` instead of authoring one markdown file per page.

This package is the **lower-level engine** — pure functions only, no Astro and no Node I/O. All filesystem/content work lives in the `surface.*` kernel commands (`@warpgogol/site-kernel-checks`); the runtime registry merge lives in `@warpgogol/share`. See the RFCs in `docs/rfcs/RFC-0192` … `RFC-0199` for the full design.

> **Invariant:** `@warpgogol/surface` must **not** depend on `@warpgogol/share`. Share consumes surface's route types, so a back-dependency would form a workspace cycle. Surface therefore declares its own `PageEntry`/`SurfaceBlock` (structurally compatible with share's).

## Mental model

```
Blueprint (packages/ontology/blueprints/<id>.yaml)
   axes × datasets × per-depth slug/title templates × policy
        │  surface.generate  (build.prepare, pseo-gated)
        ▼
VirtualRouteEntry[]  →  src/surface.generated.json   (the route artifact)
        │  getRouteRegistry() folds these in alongside system.md pages[]
        ▼
[...slug].astro → resolvePageRoute() → buildPage() → rendered HTML + sitemap + JSON-LD + GEO twin
```

A **Blueprint** is the declarative spec for one page family. The **eligibility engine** decides which axis combinations go live (and which are `noindex` or 301 redirect stubs). Each live page is **baked** into block-declarative `PageEntry` blocks from existing shared Planets (hero / card grid / FAQ / CTA / teaser links). A generated page is an ordinary page — it inherits effects, biome, i18n, JSON-LD, OG, the Markdown twin, and llms.txt for free.

## Module map

| File | Role |
| --- | --- |
| `types.ts` | Contracts: `SurfaceAxis`, `SurfaceRecord`, `EligibilityPolicy`, `VirtualRouteEntry`, `PageEntry`, `LocalizedUniverse`, manifest shapes. |
| `eligibility.ts` | Axis-generic matrix: enumerate tuples → count matching records → live / noindex / redirect; `liveChildrenOf`/`liveSiblingsOf` for internal-link grids. |
| `blueprint.ts` | `Blueprint` type + `generateEntries()` (matrix → routes), per-language slug resolution (`LocalizedUniverse`). |
| `blueprint-schema.ts` | Zod `blueprintSchema` + `parseBlueprint()`. |
| `decision-composer.ts` | Pure gate functions + `composeIndexDecision()` — concentrates all indexability gate logic (demand, evidence, substance, freshness, budget) in one module. |
| `substance.ts` | Deterministic Page Substance Score (anti-thin-content gate). |
| `geo.ts` | Markdown-twin rendering via `blockTwinRegistry` + GEO inclusion predicates (`includeInTwins`/`includeInLlms`). |
| `governance/index.ts` | Grouped sub-barrel for pure Zod schema bags (bordbuch, breaker, evidence-records, fleet, governance, visibility, module-context). |

## Lifecycle & commands

Run via `pnpm exec site-kernel run <command> --site <app>`:

| Command | What it does |
| --- | --- |
| `surface.generate` | Expand entitled Blueprints → `src/surface.generated.json` + `public/.well-known/pseo-manifest.json` + Markdown twins. Runs in `build.prepare`. |
| `surface.validate` | Artifact integrity: unique pageIds, no authored-slug collision, live redirect targets; `untranslated-route` error + `lead-image-missing`/`narrative-missing` warnings (RFC-0207). |
| `surface.freshness` | Report pages decayed to `noindex` by the Freshness Ledger (RFC-0196). |
| `surface.starmap` | Render the surface as a cosmic star-map SVG (RFC-0198). |
| `surface.enrich` | Generate-once, frozen, provenanced LLM-enriched `field`/`narrative` entries (RFC-0197/0207). **Not** on the build path. Real Claude when `ANTHROPIC_API_KEY` is set, else a deterministic stub. |
| `surface.enrich.review` | Review + batch-approve pending enriched entries (`--approve-all` / `--approve <pageId>:<field>`) (RFC-0207). |
| `blueprint.validate` | Validate Blueprint YAML against the schema + the app's datasets (RFC-0193). |
| `pseo.validate` | Quality gate: thin-share, sitemap budget, slug collisions, orphan internal links (RFC-0194). |
| `enrich.validate` | Provenance + approval shape on enriched entries (RFC-0197). |

## Authoring a surface (in an app)

1. **Datasets** — ship per-language markdown under `apps/<app>/src/content/surface/<collection>/<lang>/`. Each file is one axis value; the **filename stem is the language-neutral slug/identity**. Conventional fields the baker reads: `name`, `intro`, `metaDescription`, `sections[{heading,body}]`, `faqs[{question,answer}]`, `localNote`, `tagline`, (RFC-0199) `slug` for a localized URL segment, and (RFC-0207) the page-substance fields `heroLead`, `heroIntro`, `specialFocus[{title,description}]`, `scenarioSnippets[{title,description}]`, `painPoints`/`localPainPoints`, `decisionFactors`, `localTrustCues`, `regionNotes`, plus `image` (content-asset token) + `imageAlt`. A localized file may translate only some fields — the rest fall back to the default language (shallow merge).
2. **Blueprint** — add `packages/ontology/blueprints/<id>.yaml`: `axes` (each bound to a universe collection + the record field carrying membership), per-depth `levels` (`slug`/`titleTemplate`/ `intro` per language with `{axis.field}` tokens, `geo`, `constellation`), `policy` (`minRecordsPerDepth`, `noindexBelowPerDepth`, `substanceMin`, `maxThinShare`, `sitemapBudget`, `bake: inline|lazy`), optional `freshness`, `enrichedFields`.
3. **Adopt** — list the Blueprint id in the app's `system.md` `surface.blueprints` and grant the `pseo` entitlement (Stripe, or `entitlementsOverride: [pseo]` for dogfooding).
4. Build. The pages render, enter the sitemap/llms.txt, and emit Markdown twins automatically.

### Multilingual (RFC-0193 + RFC-0199)

A surface generates one page per app-supported language (`system.md i18n.supported`). Identity (pageId, matching, eligibility) is language-neutral; only display content and URL **slug segments** localize. Provide `<lang>/` datasets and per-language `slug`/`titleTemplate`/`intro` to localize; anything missing falls back to the default language. Non-default languages are lang-prefixed (`/uk/...`) with correct `hreflang`.

### Indexability gates (compose in this order)

1. **Record gate** — enough matching active records (`minRecordsPerDepth`).
2. **Demand gate** (RFC-0280) — missing qualifying demand signals ⇒ `noindex` or do-not-emit, per `demandPerDepth.missing` policy.
3. **Evidence gate** (RFC-0274/0281) — missing approved narrative, required record fields, or tuple-specific facts ⇒ `noindex`. Werk evidence count gates via `minWerkEvidence`.
4. **Substance gate** (RFC-0194) — below `substanceMin` ⇒ `noindex` (`thin`), regardless of records.
5. **Freshness** (RFC-0196) — records stale past the SLA ⇒ reversible `noindex` (`decayed`).
6. **Budget** (RFC-0196) — keep the top-K by substance for the entitlement tier; rest `noindex` (`over-budget`). Fail-open to unbounded.

Gate evaluation is centralized in `decision-composer.ts` (`composeIndexDecision` + `evaluate*Gate` functions). The consumer (`expandBlueprint` in `site-kernel-checks`) calls pure pipeline stages from `pipeline.ts` — each stage is independently testable with in-memory data.

`noindex` pages still render but are excluded from the sitemap and GEO corpus.

### Bespoke narrative, images, and the untranslated-language gate (RFC-0207)

The baker is **field-presence-driven** and never glues axis labels into headings. The hero draws an approved bespoke **narrative** (`h1`/`lead`/`tagline`/`bridges`) — declared as an `enrichedFields` entry with `kind: "narrative"`, `scope: "tuple"` — or, absent one, distinct record fields per slot (`heroLead`/`heroIntro`/`intro`), so the lead, the tagline, and the body are never the same string. Each present record field maps to its own block; absent fields omit theirs. A record's `image` token becomes the hero `leadImage` (deepest axis wins) + imaged teaser cards, rendered via `<ResponsiveImage>` (RFC-0152/0204). The token is a bare filename stem; `resolveImage` looks it up under `src/content/pages/<lang>/assets/` (default-language fallback) and `business/<lang>/assets/` — there is **no** `surface/**/assets/` lookup, so place surface image webp under `src/content/pages/<default-lang>/assets/`.

The **untranslated-language gate**: a non-default language whose baked core content (hero signature) falls back to the default language is dropped (`routes` + `pages` removed, recorded in `untranslatedLangs`) — the default-language text never renders under a localized URL, is never indexed, and never enters the sitemap/twins. Reversible: supply native fields or an approved narrative. `surface.validate` reports it as an `untranslated-route` error.

## Performance

`policy.bake: "lazy"` keeps the route artifact lightweight (metadata stub per entry) and writes each page's per-language blocks to `apps/<app>/.surface-cache/<pageId>.json`, loaded on demand at render — for surfaces too large to hold every page inline.
