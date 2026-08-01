# Site Composition Guide

This document defines the shared instruction layer for site composition across all Sternsystemen. Pair it with the root `AGENTS.md`, then prefer the closest site-level or directory-level `AGENTS.md`.

Sites are registered in `systems/registry.yaml` and materialized as mission workpieces under `missions/<missionId>/workpiece/`. The rules below apply to every site workspace regardless of where it physically lives (external git repo, mission workpiece, or onboarding scaffold output).

For repository-wide, cross-workspace, architectural, shared-package, or high-risk tasks, read the root Compass documents in `docs/*.xml` (referenced from root AGENTS.md) before applying site-level rules.

## Scope

- This file applies to all site workspaces (Sternsystemen, mission workpieces, onboarding scaffolds).
- Each site may add tighter rules in its own `AGENTS.md`.
- Do not assume one site's internals automatically apply to another site unless the closer site-level guide says so.

## Shared site architecture

- Treat each site as a deployable product with its own config, assets, routes, content, scripts, and validation commands.
- Keep routes thin and use them as orchestration entrypoints.
- Keep visitor-facing meaning in content, not in route templates or structural components.
- Keep shell navigation destinations language-invariant: `src/content/site/{lang}/labels.md` `header.navIds` and `footer.navIds` must contain the same IDs in the same order for every supported language of a site. Localize labels in `navigation/{lang}/navigation.md`, not the menu structure per language.
- RFC-0031 (implemented 2026-04-27) canonicalizes source-asset colocation under `src/content/**/assets/` and bounded feature entry modules via `*.client.ts`. The current validator behavior enforces this target state.
- Keep styling in `src/styles/**`. Do **not** create `src/styles/tokens-override.css` — brand tokens belong in the site biome YAML (see §Cosmic overlay below).
- Keep React or other framework islands isolated and hydrate only when needed.
- Keep machine-readable outputs derived from canonical site data instead of creating a second source of truth.

## Shared ownership boundaries

- Routes own composition, layout selection, and route-local loading.
- Content owns visitor-facing copy and structured meaning.
- **Page frontmatter** owns project-specific section content as `blocks[]` (RFC-0026 / DNA-24). Component `.md` files hold generic defaults merged with `pageOverride` at render time.
- Components own presentation and local behavior, not global feature registration.
- Config owns feature visibility, navigation resolution, and environment-aware switches.
- Scripts own generation, drift detection, validation, and operational maintenance.
- Shared packages own reusable abstractions and must not depend on one site's private internals.

## Material Credits (RFC-0220)

Every published video or content image in a site must have a material credit sidecar before it is committed. When adding a `media.source.name` video, a living-photo clip (RFC-0202: a `live` block with a `photo` token, or ambient media via `media.source.fromImage`), or a content image token such as `backgroundImage`, `image`, `imageName`, `photo`, `portraitImage`, or `src` under `pages`, `business`, or `site`, add a matching `*.credits.yaml` file in the same `assets/` folder. A living-photo video is a distinct `kind: video` material and requires its own credit sidecar, separate from the still-image credit.

Credit sidecars are the source for inline `Bildnachweis`/localized disclosures and for the generated `/credits` page. Missing credits are not advisory: `material.credits.validate` runs in `sites-check.author` and `build:check`, so uncited material blocks deployment. Validate with `pnpm exec site-kernel run material.credits.validate --site <id>`.

Use `docs/authoring/material-credits.md` for sidecar templates and rights-notice conventions.

## Block-declarative pages (DNA-24 / RFC-0026 / RFC-0047)

Every page `.md` under `src/content/pages/` is a frontmatter-only block-declarative document. No markdown body is permitted.

Blocks use **CMS-friendly `type:` names** — **not** cosmic `use:` names. The platform resolves archetype names to internal cosmic identifiers through package manifests and registries.

```yaml
---
kind: page
pageId: privacyPolicy    # stable cross-language page identity (RFC-0048)
cosmicStar: Fomalhaut
title: "..."
description: "..."
lang: de
blocks:
  - id: hero
    type: hero           # CMS-friendly archetype — resolved to cosmicPlanet internally
    props:
      heading: "..."
---
```

**Agent rules:**

- **Never use `use: PlanetName`** in page block entries — that pattern is retired (RFC-0047). Use `type: <archetype>` instead.
- Never add a markdown body after `---`. Move prose to `src/content/prose/{lang}/<slug>.md` and reference it via `type: markdown, props: { contentRef: "prose/<slug>" }`.
- Treat `src/content/pages/{lang}/*.md` as workflow-authored outputs regenerated by the author phase; update them through the content workflow, not as ad hoc long-lived hand-edited prose documents.
- Treat `src/content/prose/{lang}/*.md` as appendable narrative companions: the author phase may generate them, but follow-up editorial additions belong there rather than in page markdown bodies.
- Treat `onboarding/.output/05-audit/audit-report.md` as generated audit output: never hand-edit it; re-run `app.qa.validate` to regenerate.
- Treat `onboarding/.output/05-audit/llm-cache.jsonl` as content-hash-keyed audit cache: never delete or "reset" it to suppress findings; fix the source inputs and re-run the audit.
- Never hand-assemble blocks in route files. Every route calls `buildPage(entry.data, ctx)` from `@warpgogol/share` and passes `ResolvedBlock[]` to `BlocksRenderer`.
- Every `blocks[].type` must be an author-facing archetype name whose cosmicPlanet is pinned in `src/content/system.md pages[pageId].planets[]`.
- Every `blocks[].props` must match the section's propsSchema (strict — no extra keys).
- Every page `.md` must carry a stable `pageId` matching an entry in `src/content/system.md pages[]`.

**RuntimeContext no-op contract (DNA-26):**

- `EMPTY_RUNTIME_CONTEXT(locale)` from `@warpgogol/share` is the only constructor at MVP.
- `ctx.segment` is always `null`; `ctx.flags` is always `{}` at build time. Never construct context with non-null `segment` or non-empty `flags` until RFC-0027 activates Growth.
- `{ segment }` and `{ flag }` visibility expressions are valid to author today — they always evaluate `false` at MVP and will activate when RFC-0027 ships.

See `docs/authoring/block-declarative-pages.md` and `docs/authoring/visibility-expressions.md` for full authoring reference.

## Legal pages (RFC-0328)

Statutory/legal pages (Impressum, Datenschutz, AGB, Widerruf, Barrierefreiheit, etc.) must be declared with `semanticType: legal` in `src/content/system.md`:

```yaml
- pageId: legalNotice
  semanticType: legal
  routes:
    de: impressum
    en: legal-notice
  cosmicStar: Polaris
  planets:
    - { cosmicPlanet: Hyperion, pin: "1.0.0" }
```

For `semanticType: legal`, the platform derives the following defaults automatically:

- `output.sitemap.category: legal`
- `output.sitemap.includeLastmod: true`
- `output.llms.depth: exclude`
- `output.robots.index: true`, `output.robots.follow: true`

Explicit `output` values may override these defaults, but the legacy pattern `semanticType: content` + `output.sitemap.category: legal` is rejected by `system.manifest.validate`. There is no backward-compatibility mode or compass period. When migrating a legal page, remove the redundant `output.llms: exclude` and `output.sitemap.category: legal` declarations unless they carry non-default values (e.g., `output.sitemap: false` or a custom `robots` block).

**Visual contract — section position matters (RFC-0233):**

- A section's `background` is validated **in page context** by `visual.contract.validate` (runs in `build.check`), not just against its schema.
- A vertical `fade` background that merges into a page edge at full opacity must sit where that edge is: `noEndFade` (+ `endOpacity: 1`) belongs on the **last** block; `noStartFade` (+ `startOpacity: 1`) belongs on the **first** block. Putting an end-edge fade anywhere else fails the build (`VIS-BG-01/02`) — this is the bug behind the 2026-06-23 nicaragua fade. **When you reorder, insert, or append sections, move the edge fade with the edge.**
- Two adjacent blocks with an identical non-transparent background warn (`VIS-BG-03`); confirm it is intentional or vary one.
- Run `visual.rules.list` to see every visual rule; run `visual.report` for a non-failing posture check.

## Programmatic Surface / Blueprints (RFC-0192/0193)

The Programmatic Surface generates long-tail pages from `dataset × axes` instead of one authored markdown file per page. It is a sellable module gated by the single `pseo` entitlement (RFC-0169) and is **opt-in by datasets**: a workspace Blueprint (`packages/ontology/blueprints/<id>.yaml`) applies to a site only when the site ships that Blueprint's dataset collection.

**Authoring a surface for a site:**

1. Ship the datasets as markdown under `src/content/surface/<collection>/<lang>/*.md` (e.g. `industries/de/*.md`, `cities/de/*.md`). These are read by the kernel content loader at build time; they are NOT page files and are not author-validated as pages.
2. Grant the `pseo` entitlement (Stripe, or `entitlementsOverride: [pseo]` in `system.md` for dogfooding).
3. `surface.generate` (in `build.prepare`, after `entitlements.resolve`) expands the Blueprint into `src/surface.generated.json` (a per-build artifact, gitignored). The route registry folds these virtual entries in; pages render through the normal `[...slug].astro` → `buildPage` path and enter the sitemap automatically.

**Multilingual.** A surface generates one page per site-supported language (`system.md i18n.supported`). Datasets are per-language under `src/content/surface/<collection>/<lang>/`; a localized file may translate only some fields — the rest fall back to the default language (shallow-merge, like authored-page fallback). Blueprint `slug`/`titleTemplate`/`intro` are per-language with default-language fallback; baker UI strings (CTAs, headings) are localized in the engine. Non-default languages are served lang-prefixed (`/uk/...`) with correct `hreflang`. To add a language to a surface, add its datasets (or rely on default-language fallback) — the engine picks up the site's supported languages automatically.

**Per-language URL segments (RFC-0199).** The interpolated segments of a route (`{industry}`, `{city}`, `{topic}`, `{service}`) come from each axis record. A record MAY localize its own URL segment with a `slug:` frontmatter field in its per-language file (e.g. `industries/uk/elektriker.md` → `slug: "elektryk"` yields `/uk/sait/elektryk/...`). The **default-language** slug (filename stem) stays the identity key — page identity, eligibility, and redirect stubs never use the localized slug. Records without a `slug:` override fall back to the neutral slug (so untranslated records and single-language axes are unaffected and output is byte-identical). Static slug prefixes are localized in the Blueprint `slug` map (e.g. `slug: { de: "website", uk: "sait" }`). `surface.validate` hard-fails on a `duplicate-localized-slug` (two records resolving to one URL in a language) and emits an advisory `untranslated-route` warning when a non-default route equals its default-language slug.

Generated pages are baked block-declarative `PageEntry` objects — never hand-author them and never add a parallel render path. `blueprint.validate` + `surface.validate` + `pseo.validate` (in `sites-check.author`) enforce the contract. Do not edit `src/surface.generated.json` by hand.

**Frozen LLM enrichment (RFC-0197/0207).** A Blueprint may declare `enrichedFields`, each with a `kind` and `scope`. `kind: "field"` (default) writes a single string rendered as a content block (the original per-city local-market paragraph). `kind: "narrative"` (RFC-0207) writes a structured bespoke narrative (`h1`/`lead`/`tagline`/`bridges`) in the entry frontmatter — the baker uses it for the hero + connective prose, replacing template-glued headings. `scope: "tuple"` (default) generates once per live tuple at `scopeDepth`; `scope: "record"` once per axis value. `surface.enrich` generates each via the provider from `selectEnrichProvider()` — the real Claude provider (`claude-opus-4-8`) when `ANTHROPIC_API_KEY` is set, else a deterministic stub so CI/build.check stay green and provider-free. It enumerates the tuple structure from the **default-language** records (so it can generate non-default languages too) and writes a content entry under `src/content/enriched/<blueprint>/<lang>/` with full provenance + `approved: false`. Generation is idempotent (`--regenerate`), `--blueprint <id>` scopes it, and it is NEVER on the build path. Only `approved: true` entries render — review + batch-approve with **`surface.enrich.review`** (`--approve-all` / `--approve <pageId>:<field>`). Removing the provider leaves the site buildable from the frozen entries. `enrich.validate` checks provenance + approval shape.

**Page substance: images + field-driven anatomy (RFC-0207).** The baker (`bakePage`) is axis-generic and **field-presence-driven**: it never glues `{axis.name}` labels into headings, and it never feeds one record field into two slots (the hero lead, the hero tagline, and the first body block are always distinct strings). The hero draws the approved narrative (`h1`/`lead`/`tagline`) or, absent one, distinct record fields per slot (`heroLead`/`heroIntro`/`intro`). Each present record field maps to its own block — `specialFocus`/`sections` → focus cards, `decisionFactors`/`localPainPoints`/`painPoints`/`localTrustCues`/`regionNotes` → labelled card lists, `scenarioSnippets` → scenario cards, `faqs` → prose — and absent fields simply omit their block (so thin records and other blueprints stay valid). A record may carry an `image` (content-asset token, resolved like a hero `leadImage.src` / `portraitImage`) + `imageAlt`; the baker sets the hero `leadImage` (deepest axis with an image wins) and imaged internal-link teaser cards, all rendered through `<ResponsiveImage>` (RFC-0152/0204). **Asset location gotcha:** `resolveImage` only constructs keys under `src/content/pages/<lang>/assets/` and `src/content/business-profile/<lang>/assets/` — there is **no** `src/content/surface/**/assets/` lookup. Put a surface record's image webp under `src/content/pages/<default-lang>/assets/<token>.webp` (default-language assets are reused across languages via fallback); the `image:` value is the bare filename stem. `surface.validate` warns `lead-image-missing` / `narrative-missing` (advisory) so images and narratives can be filled in incrementally.

**Untranslated-language gate (RFC-0207).** A non-default language whose baked **core content** (the hero signature: title + heading + lead + tagline) falls back to the default language has no native content to offer. The baker drops that language's `routes` + `pages` entry and records it in `untranslatedLangs`, so the default-language text never renders under a localized URL, never enters the sitemap/hreflang/twins/llms, and is never indexed. `surface.validate` reports each as an `untranslated-route` error. Reversible: supply native record fields (or an approved narrative) and the localized route reappears on the next `surface.generate`.

**Index budget + freshness (RFC-0196).** Two reversible indexability modifiers compose after the substance gate. The entitlement may carry `pseo.indexBudget` (a tier): the engine keeps the top-K indexable pages by substance score and `noindex`es the rest (`over-budget`); absent ⇒ unbounded (fail-open). A Blueprint may declare `freshness.field` + `slaDaysPerDepth`: a page whose contributing records' `lastVerified` is older than the SLA decays to `noindex` (`decayed`) until the records are re-verified. `surface.freshness` (in `build.prepare`) reports decay but never fails. Decay/budget `noindex` are reversible — never hard-delete generated pages.

**Dual SEO + GEO (RFC-0195).** Every live, non-suppressed generated page is also a GEO artifact: `surface.generate` writes a clean Markdown twin (`public/<route>/index.md`) and `llms.generate` lists full-GEO pages under a "Programmatic pages" section in `llms.txt`. Each Blueprint level declares `geo: full | twin-only | off` (full → twin + llms; twin-only → twin; off → neither). Suppressed (noindex/thin) and redirect-stub pages are excluded from all GEO output. The twins are committed (deterministic), like authored-page twins.

**Anti-thin-content (RFC-0194).** Every generated page gets a deterministic Page Substance Score (independent blocks, unique-vs-family token ratio, signal blocks, link diversity). A Blueprint's `policy.substanceMin` is a hard gate: a page below it is auto-`noindex` (rendered, excluded from the sitemap) regardless of record count. `substanceMin: 0` is report-only. `pseo.validate` fails a family that is more than `maxThinShare` thin, exceeds its `sitemapBudget`, collides with an authored slug, or has an orphan internal link. The gate is deterministic — never raise a score by padding content, and never lower `substanceMin` to pass a build.

## Blog and Articles (RFC-0167)

The blog is a sellable module gated by the `blog` entitlement (RFC-0169). When a site is not entitled, article routes do not compile and articles are excluded from the sitemap and RSS feed — authoring article content on a non-entitled site is simply inert, not an error.

**Authoring an article (the detail page).** An article is an ordinary block-declarative page, not a new page kind:

1. In `src/content/system.md`, give the page `semanticType: article` and an `article:` block:
   ```yaml
   - pageId: myArticle
     semanticType: article
     article:
       publishedAt: "2026-05-01"      # required, ISO date
       updatedAt: "2026-06-06"        # optional; must be >= publishedAt
       author: Andrii Syrokomskyi     # optional; MUST match a person in src/content/people/**
       tags: [Digitalisierung, Handwerk]   # optional; non-empty strings
     routes: { de: mein-artikel, uk: ... }
     planets: [ ... ]                 # the page's sections (usually hero + markdown)
   ```
2. Author the page body as normal blocks in `src/content/pages/<lang>/<file>.md` — typically a `hero` plus a `markdown` block whose `contentRef` points at `prose/<lang>/<slug>`. Never inline a markdown body in the page entry (DNA-24).
3. The page automatically emits `Article`/`BlogPosting` JSON-LD with dates/author/tags, sets `og:type: article`, and is picked up by the RSS feed (`feed.generate`) and the Markdown twin (RFC-0166).
4. To put the article's lead image into the image sitemap, give the hero a `leadImage` (see `packages/ui/AGENTS.md` → "Lead/content image → image sitemap").

**Listing articles (the index).** Add an `article-list` block (cosmic name `Io`) to any page. It auto-enumerates every article page, newest-first, as a card grid (date, title, summary, tags) — no manual list to maintain:

```yaml
- id: articles
  type: article-list
  props:
    header: { heading: "Aus dem Blog" }
    tag: Handwerk        # optional — only articles carrying this tag
    limit: 6             # optional — cap on cards (newest-first)
    emptyLabel: "Bald mehr."   # optional — shown when no articles match
```

Pin its planet (`- cosmicPlanet: Io`) in the page's `planets[]` like any section.

**Validation.** `blog.validate` checks the article contract (valid `publishedAt`, `updatedAt >= publishedAt`, non-empty tags, and `author` resolving to a business/team person). It is a no-op pass when `blog` is not entitled or no article pages exist. It runs in `sites-check`.

## People / Team module (RFC-0200)

A person is described **once** as a canonical record; the People section, the optional team page, the optional per-member profile page, and all Person/Organization JSON-LD all read that single record. Never inline person data into a page block, never keep a `founders`/`boardMembers` list in `company.md`, and never merge bios in a route file.

**1. Author a Person record** at `src/content/people/<lang>/<slug>.md` (default-language anchor required; other languages overlay it per RFC-0008 — typically only `role` + `bio` differ). Scaffold one with `person.create`:

```sh
pnpm exec site-kernel run person.create --site <id> --slug andrii-syrokomskyi --name "Andrii Syrokomskyi" --page
```

```yaml
---
slug: "andrii-syrokomskyi"
name: "Andrii Syrokomskyi"
role: "Gründer und technischer Leiter"   # localized
photo: andrii-portrait                    # asset TOKEN (Image Provider Port) — NEVER a /src path
affiliations: [founder]                   # founder|board → Organization JSON-LD; team|patron|author → shown only
location: "Backnang"                      # spotlight-only
statement: "…"                            # spotlight-only
stats: [{ label: "Jahre Erfahrung", value: "25+" }]   # spotlight-only
cta: { label: "Frage stellen", target: contact }      # spotlight-only
sameAs: ["https://www.linkedin.com/in/…"] # → Person.sameAs
page: { enabled: true }                   # optional per-member profile page (see step 4)
order: 1
bio: |
  Multi-paragraph biography…
---
```

Photo tokens resolve from `business/<lang>/assets/<token>.webp` (with default-language fallback). Founders/board derive from `affiliations` — they are core SEO and are **never** gated.

**2. Place the People section on any page** (data-driven — it loads records itself):

```yaml
- id: team
  type: people
  props:
    header: { heading: "Das Team", hideSectionNumber: true }
    select: { affiliation: team }     # OR { slugs: [a, b, c] } (ordered) OR { all: true }
    showRole: true
    linkToProfile: true               # card links to the person's profile page when one is live
```

Pin its planet (`- { cosmicPlanet: Mimas }`) in the page's `planets[]`. For a product/contact page, use `select.slugs: [...]` to show specific contributors; with `linkToProfile: true` each card links to that person's profile page when it exists.

**3. Spotlight (single featured person)** — set `layout: spotlight` and `select.slugs: [<one>]`. Renders the portrait + location/stats/statement/CTA from the record (this replaced the old founder-trust-card). By default the spotlight does **not** render the long `bio` (keep an embedded spotlight — e.g. a home page — short via `statement`); set `showBio: true` to also render the full multi-paragraph `bio` below the statement. The `bio` supports inline `[label](https://…)` markdown links (rendered as safe external anchors); no other markdown is parsed.

**4. Per-member profile page (paid).** Set `page: { enabled: true }` on the record. The page is a **virtual route** (`/<team-base>/<slug>`) materialized from the record — no page file to author — gated by the `team.profiles` entitlement (RFC-0169). When the entitlement is absent the route does not compile and is omitted from the sitemap (authoring `page.enabled` is then inert, not an error). The page is a spotlight with `showBio` on (so the full `bio` shows there even when the embedded home spotlight is short) and emits `og:type: profile` + a `Person` node.

**Validation.** `people.validate` checks the record contract (name/slug, affiliation vocabulary, `sameAs` URLs, photo-as-token, bio for `page.enabled` records) and runs in `sites-check`; it warns (non-fatal) when a `page.enabled` record has no `team.profiles` entitlement. No-op pass when a site has no people.

## Growth layer (RFC-0027 / DNA-27..30)

The growth layer provides vendor-agnostic event tracking, content-declared funnels, and client-editable experiments. It is activated per-site via `system.md growth:` block.

**Agent rules:**

- Never import vendor analytics SDKs directly in site code — always use `emit()` from `@warpgogol/growth/emit`.
- Never call `emit()` with a string literal that is not in the closed `EventName` catalog (validated by `growth.events.validate`).
- Never hard-code funnel logic in TypeScript — funnels are YAML in `packages/ontology/growth/funnels/`.
- Never instantiate adapters directly — `bootGrowthLayer()` handles adapter loading. Site code only calls `emit()`.
- Place `<GrowthProvider>` once per page, before `<Header>`, so the adapter initialises before any CTA clicks.
- To swap analytics vendors: change `system.md growth.vendor.adapter` and the matching `<GrowthProvider>` props — no application code changes.
- The `null` adapter (adapter id: `"null"`) is the safe default for local dev and CI environments.

**Event authoring:**

- New event names require: (1) update `EventName` union in `packages/growth/src/adapter.ts`, (2) add `EventPayloadMap[name]` entry, (3) add `packages/ontology/growth/events/<name>.yaml`.
- See `docs/engineering/growth-adapters.md` for adapter implementation guide.
- See `docs/authoring/growth-experiments.md` for experiment lifecycle.

## Cosmic-name resolution checklist (when adding a new section/component)

1. Pick a free name from the correct catalog in `@warpgogol/ontology` (`StarCatalog` for pages, `PlanetCatalog` for sections, `MoonCatalog` for components — minus the five passport-reserved moons).
2. Set `cosmicName: <Name>` in the new manifest.yaml.
3. Register the name in `PLANET_IMPORT_PATHS` (sections + passport pages) or `MOON_IMPORT_PATHS` (shell components) in `packages/share/src/page.ts`.
4. Add the name to `src/content/system.md` `pages[pageId].planets[]` (or `pages[pageId].shell.<slot>.cosmicMoon`) of every site that uses it. There is no longer a `system.yaml` or `src/content/assets/system.md` to update — `src/content/system.md` is the single canonical manifest (RFC-0047).
5. Run `pnpm exec site-kernel run cosmic.catalog.validate cosmic.name.unique manifest.contract.validate page.block.validate` before merging.

Skipping any of steps 2–4 produces silent mismatches that surface only at runtime as `[buildPage] No component import path registered for ...`.

## RFC-0042 content pattern

Section components read from `blocks[].props` via `pageOverride` with explicit `NEED_THIS_*` markers for missing required fields. Use `need()`/`cast()` from `@warpgogol/share`. Run `semantic.page.validate` to check for markers. See root AGENTS.md §Image resolution (RFC-0053) for the image fallback pattern.

## Shared implementation rules

- Prefer static generation and minimal client JavaScript.
- Do not hardcode large blocks of visitor-facing copy in `.astro`, `.tsx`, or route files.
- Do not put project-specific copy in component `.md` files — use `blocks[].props` in the page entry (RFC-0026) instead of `componentOverrides`.
- Do not make section content full-bleed on wide screens in any site or biome. Use the shared `<SectionShell>` container contract from `@warpgogol/ui`; only shell/background paint may extend edge-to-edge.
- Keep localization flow explicit; do not add ad hoc language behavior inside components.
- Be careful when touching middleware, content registration, global layouts, and navigation flow.
- Preserve stable `data-*`, schema, and content-path contracts used by scripts or semantic outputs.
- Use shared icon imports from `@warpgogol/ui` instead of creating or restoring site-local icon asset trees.
- **Before writing entity-ID normalization, i18n helpers, or base page schemas in any site file, check `@warpgogol/share` first.** See `packages/share/AGENTS.md` for the full guide and how to wire a new site.

## Build verification discipline

Agents **MUST NOT** run root `pnpm build` or `turbo run build` during fix, review, or implementation workflows for sites. These commands build every workspace in the monorepo via Turbo and are prohibitively expensive for iterative agent work.

**Scoped typecheck verification** is the correct substitute for touched sites:

```sh
pnpm --filter <site-name> exec astro check
```

This runs Astro's typecheck (`.astro` + `.ts` files) without SSG build. For touched `packages/*` dependencies, run `pnpm --filter <package-name> run build:check` (`tsc --noEmit`).

**Exceptions** (scoped via `--filter`, never root `pnpm build`):

- Onboarding scaffold may run `pnpm --filter <site> run build` for the first build of a new site.
- Deploy workflow may run `pnpm --filter <site> run build:deploy:main` or `build:deploy:alt`.
- CI pipelines run their own build steps — not agent sessions.

See root AGENTS.md §Build verification discipline for the full policy.

## Env-and-deploy contract (RFC-0346 / DNA-40)

Every site project MUST ship a `.env.example` file in its project root with every variable documented by a preceding `#` comment. Values MUST stay empty — never commit real secrets.

- Site projects with `.env.example` MUST also have `.env` (local/alt) and `.env.production` (main/deploy) on disk. Both are gitignored.
- `README.md` files MUST NOT duplicate env-variable tables — they reference `.env.example` instead.
- Site `package.json` MUST contain the six canonical deploy scripts:
  - `build:main` — build for the main domain
  - `build:alt` — build for the alt domain
  - `deploy:main` — `wrangler deploy --name <site> --secrets-file .env.production`
  - `deploy:alt` — `wrangler deploy --name alt-<site> --secrets-file .env`
  - `build:deploy:main` — `pnpm run build:main && pnpm run deploy:main`
  - `build:deploy:alt` — `pnpm run build:alt && pnpm run deploy:alt`
- Enforced by `env.contract.validate`, `env.local.check`, `env.production.check`, and `deploy.scripts.validate` (all run in `sites-check.author`).

## Content language fallback contract (RFC-0008)

Every site MUST implement the following contract for authored content entry lookups from the active semantic domains (`pages`, `prose`, `business`, `navigation`, `site`):

**Whole-file fallback** — when a content entry for the requested language is entirely absent:

- Fall back to the site's `defaultLanguageCode` entry.
- Emit `console.warn("[content-fallback] ...")` at build time so the gap is visible.
- Never throw a hard error when only the translation file is missing — throw only when neither the requested nor the default-language entry exists.
- Never suppress the `console.warn` — it is a first-class signal that a translation is missing.
- Do NOT create empty stub translation files as a workaround.

**Partial field-level fallback (structured content entries)** — when the requested-language entry exists but is missing fields required by the schema:

- Deep-merge the lang entry on top of the default-language entry: `deepMerge(defaultEntry.data, langEntry.data)`.
- Object fields: recursively merged (lang value wins per key; absent keys fall back to default).
- Array fields: merged **element-by-element** — each element at index `i` is field-merged with the default element at the same index, so partial array items (e.g. a `cards` item without `image`) inherit missing fields from the default.
- No `console.warn` is emitted — partial translation files are intentional.
- Schema validation runs on the merged result.

For shared page-block context reuse, use the RFC-0099 contract: block data comes from `pages/{lang}/*.md` `blocks[].props` with deterministic cross-page fallback driven by `src/content/system.md sharedContext.requiredPageIds`. Do not reintroduce `componentContent` as an active surface.

**Per-site implementation:**

- New sites — adopt both patterns from day one. Use `deepMergeEntryData` (not `mergeComponentContent`) for default-lang ↔ lang entry merging; `mergeComponentContent` (wholesale array replace) is reserved for `pageOverride` application.

## AGENTS.md files inside src/pages/

Astro treats every file in `src/pages/` as a page route. `AGENTS.md` files placed there must be renamed with an underscore prefix so Astro skips them:

```
src/pages/_AGENTS.md   ✓ ignored by Astro router
src/pages/AGENTS.md    ✗ becomes a page route
```

This is Astro's built-in convention — no `astro.config.mjs` change is needed. The file stays in place as AI-agent documentation and is never built as a page.

## Cosmic overlay (RFC-0025 / DNA-23)

Every site is bound to the **cosmic overlay** — a three-layer naming taxonomy that assigns a unique identity to every page, section, and component.

### Taxonomy

The three-layer overlay is defined in root AGENTS.md §Cosmic naming contract (DNA-23). At the site level:

- Every site declares pages, planets, and moons in `src/content/system.md`.
- Every manifest under `packages/ui/src/{pages,sections,components}/` must carry a cosmicName; build fails if absent.
- The five passport-reserved moons (`Methone`, `Despina`, `Klarissa`, `Bianca`, `Adrastea`) are exclusive to their respective passport components.

### src/content/system.md (RFC-0047)

Each site **must** have a single `src/content/system.md` at its canonical location. There is no longer a root `system.yaml` or a `src/content/assets/system.md` mirror — those were removed per RFC-0047.

```yaml
---
app: <kebab-slug>            # unique site identifier
version: 1.0.0
identity:
  systemStar: <StarName>     # primary page star (must be used in at least one page manifest)
  biome: <biome-id>          # references packages/ontology/biomes/<id>.yaml
  tagline: "…"               # optional
i18n:
  default: de
  supported:
    de: { name: "Deutsch", flag: "🇩🇪", hreflang: "de-DE", rtl: false }
    en: { name: "English", flag: "🇬🇧", hreflang: "en-US", rtl: false }
constellations:              # ordered section sequences this site uses
  - <constellation-slug>     # resolves to packages/ontology/constellations/<slug>.yaml
clientEditable:              # paths under src/content/ that CMS editors may touch
  - pages
  - prose
  - business
  - navigation
  - site
pages:
  - pageId: home             # stable cross-language identity (RFC-0048)
    routes:
      de: ""                 # empty string = home page
      en: ""
    cosmicStar: <Star>
    planets: []
---
```

Validated by `system.manifest.validate`. Missing or invalid `src/content/system.md` is a hard build failure.

Route slugs (RFC-0048) live in `pages[pageId].routes`. The `src/pages/[lang]/[...slug].astro` route reads this registry to generate static paths and resolve content by `pageId`.

### Standalone pages (dedicated `.astro` routes)

When a page is rendered by a dedicated `.astro` file (e.g. `src/pages/check.astro`) instead of the catch-all `[...slug].astro`, set `standalone: true` on its `pages[]` entry in `system.md`:

```yaml
pages:
  - pageId: check
    routes: { de: "check" }
    cosmicStar: Polaris
    standalone: true
```

The `standalone` flag keeps the page in the route registry for semantic target resolution and link validation, but **excludes it from `[...slug].astro` static path generation** — preventing route conflict warnings when both the dedicated `.astro` and the catch-all would emit the same path. The page's content entry (`src/content/pages/{lang}/check.md`) is still required for block rendering and breadcrumb resolution.

Standalone pages should also set `output.robots: { index: false }` (or a `<meta name="robots" content="noindex">` tag in the `.astro` file) when the page is a tool/utility not meant for search engines. Post-build validators (`seo.structured-data.validate`, `first-party-data.validate`, `dist.content-references.validate`) skip noindex pages, so tool forms and JS template literals won't trigger false positives.

### Per-page robots / indexability (RFC-0165)

Indexability is authored, not hand-coded. Add an `output.robots` projection to a `pages[]` entry (or to page frontmatter) — no engineering change required:

```yaml
pages:
  - pageId: widerruf
    routes: { de: "widerruf" }
    output:
      robots: { index: false }      # → <meta name="robots" content="noindex,follow"> and dropped from the sitemap
      # robots: false                # shorthand for noindex,nofollow
      # robots: { index: false, follow: false }
```

Defaults are `{ index: true, follow: true }`, so existing pages are unaffected. The resolved directive feeds **both** the `<meta name="robots">` tag and the sitemap (a `noindex` page is excluded). `robots.page.validate` enforces that a `noindex` page never appears in the sitemap. `robots` is part of the closed `output` schema (RFC-0143) resolved by `resolvePageOutput`.

### Biome CSS generation

`biome.css.generate` (run in `build.prepare`) reads `src/content/system.md` → `packages/ontology/biomes/<id>.yaml` → writes `src/styles/biome.generated.css`.

- **`src/styles/biome.generated.css` is auto-generated — add it to `.gitignore`.**
- Apply the biome in the root layout: `<html data-biome="<id>">`.
- The generated file sets `html[data-biome="<id>"] { --ds-color-primary: …; … }` scoped CSS custom properties.
- Never hand-edit `biome.generated.css`; changes are overwritten on next build.
- Brand token overrides belong in `packages/ontology/biomes/<id>.yaml`. Component-specific tokens that are not in the biome schema belong in `src/styles/global.css` as a `:root {}` block.

### Asset layout (DNA-21 / RFC-0047 / RFC-0031)

- Visitor-facing optimized media lives in **content-local `assets/` folders** colocated with the owning content domain: `src/content/pages/{lang}/assets/**`, `src/content/prose/{lang}/assets/**`, `src/content/site/{lang}/assets/**`, `src/content/business-profile/{lang}/assets/**`.
- **`src/content/media/` is forbidden.** `content.surface.validate` rejects it.
- **`public/`** is reserved for fixed-path unoptimized exceptions only: well-known files, robots/sitemap static files, vendor verification files, and icon files served as-is.
- `src/assets/images/` must not exist. Legacy parallel asset trees remain forbidden.
- `src/styles/tokens-override.css` must not exist. `app.layout.validate` fails if it is present.
- `src/content/` must exist (feature-first layout contract).

### Favicon SVG source override (RFC-0631, amended by RFC-0632)

By default, `public.icons.generate` programmatically generates favicon SVGs via `buildIconSvg` using the site's biome palette and initial. A site may override the source SVG by authoring `src/content/favicon.svg`. The maskable variant is auto-wrapped from `favicon.svg` with an Android 80% safe-zone transform (`translate(51.2, 51.2) scale(0.8)`) — no separate maskable source file is needed.

The source SVG must have `viewBox="0 0 512 512"` on the root `<svg>` element. `public.icons.validate` reports `ICON-SRC-01` (wrong viewBox on `favicon.svg`), `ICON-SRC-02` (invalid XML), and `ICON-SRC-04` (warning — maskable auto-wrap applied, visually verify on Android) when a source SVG is present. Sites without `favicon.svg` are unaffected — `buildIconSvg` remains the default.

### Build prepare pipeline (`SITES_BUILD_PREPARE_PIPELINE`)

The canonical build sequence is:

1. `build.prepare` — generate/refresh artifacts into the project tree
2. `build.check` — validate everything (including the freshly generated artifacts)
3. `astro build` — Astro compiles and copies to `dist/`
4. `build.post` — emit passport, well-known files, etc.

**`SITES_BUILD_PREPARE_PIPELINE`** (defined in `@warpgogol/site-kernel-checks`) runs in step 1 and produces files that Astro later copies to `dist/`:

**Agent rules:**

- When adding a new generated artifact, register its command in `SITES_BUILD_PREPARE_PIPELINE` (in `packages/os/site-kernel-checks/src/module.ts`) if it is cross-site, or append it to the site's `build.prepare` pipeline in `tools/kernel.config.ts` if it is site-specific.
- **Build-time file generators (sitemap, llms, ai, robots, and any new one) MUST follow the Generator Contract** in `packages/os/site-kernel/docs/generator-contract.md` (RFC-0143): typed config in one of two families (per-page `pages[].output.<id>` or a site-wide top-level block), a pure formatter in `@warpgogol/share`, a `*.generate`/`*.validate` command pair, and a safe default. Per-page projection config is resolved by `resolvePageOutput` and validated by the closed `output` schema — extend that schema in the same change that adds a per-page generator.
- **OS packages (`packages/os/site-kernel*`) resolve from `src`, not `dist` (RFC-0145).** A source edit takes effect on the next `site-kernel` command with **no rebuild** — like `@warpgogol/share`. Their `build` script is `tsc --noEmit` (type-check only); they emit no `dist/`. Do **not** re-add a `prebuild` dist-compilation chain to sites or a `dist` build to these packages. Anything that loads an OS package outside the tsx CLI / Node ≥24 type-strip must add its own build step.
- **PBP data → AI/JSON-LD projection (RFC-0147/0148):** PBP entity files (`offerings/`, `places/`, `people/`, …) auto-project into `llms-full.txt` + JSON-LD via the shared `buildOrganizationProfile` and the projectors in `@warpgogol/share/semantic/business-projection.ts`. The `BUSINESS_DOMAIN_VISIBILITY` map is a **hard privacy boundary**: `external-services` and `compliance` are `none` and must never reach public outputs. `agent.knowledge.validate` (no-leak boundary) and `semantic.parity` (llms matches the model) are the gates.
- Commands that write files must target `public/`, `src/content/`, `src/styles/`, or `src/components/` — **never `dist/`**.
- Validation commands must read the generated file from its project-tree location (e.g., `public/sitemap.xml`), not from `dist/`.
- If the generated file should be served as a static asset (robots.txt, sitemap.xml, favicon manifests), place it in `public/` so Astro copies it verbatim.
- **`src/middleware/language-redirect.ts` is a generated, gitignored file (RFC-0055). Never edit it directly.** To change supported languages or the default language, edit `src/content/system.md` under `i18n:`, then run `pnpm i18n:middleware:gen`. This applies to every site that uses language redirect middleware.
- Every site that has `src/middleware/language-redirect.ts` must: (1) register `i18n.middleware.generate` in its `service.module.ts`, (2) add `i18n:middleware:gen` script to `package.json`, (3) call it before `icons:gen` in the `build` script, (4) gitignore `src/middleware/language-redirect.ts`.

### Constellation validation

When a constellation is listed in `src/content/system.md`, `constellation.compose.validate` verifies:

- Every **required** slot (`optional: false`, the default) has a matching section cosmicName in the page that uses the constellation.
- Required slots appear in the correct **relative order** declared in the constellation YAML.
- Optional slots that are missing emit a warning, not a failure.

## Validation

- Run the smallest site-scoped validation set from the repository root with `pnpm --filter <site> ...`.
- Use each site's local `build:check`, `astro check`, tests, and lint-like validation scripts as appropriate.
- When a change affects shared packages and site consumers together, validate the package first and then each affected site.

## Rule map

- `<site>/AGENTS.md` for site-specific architecture
- `<site>/src/**/AGENTS.md` for directory-level implementation rules
- `<site>/scripts/AGENTS.md` when a site defines script layout guidance

## Generated AGENTS.md files (RFC-0079)

A site's `AGENTS.md`, `src/content/AGENTS.md`, and `src/styles/AGENTS.md` are **generated files**. They carry a `<!-- GENERATED. Do not change this line unless the file contains project specific changes. -->` marker (RFC-0081) and must not be edited directly.

**Agent rules:**

- **Never edit a generated AGENTS.md file.** Changes made directly to these files will be overwritten the next time `agents.generate` runs (every `pnpm build`).
- **To change instructions that apply to all sites** — edit the shared template in `packages/os/site-kernel-codegen/src/templates/app-boilerplate/`, then run `pnpm exec site-kernel run agents.generate --site <id>` for every affected site.
- **To add site-specific rules** — add them to the `## Site-specific notes` section at the bottom of the site's `AGENTS.md`. The generator preserves this section on every regeneration.

## Universal authored import/export contract

- For generator-owned TypeScript files emitted into site workspaces, change the owning template or generator under `packages/*`, not the generated site file.
- Do not infer site import rules from package source files. `packages/**/*.ts(x)` uses the `.ts/.tsx` authored-source contract enforced by `import.extensions.lint`; site files follow the owning generator template and Astro/Vite runtime contract.
- When a generated site file needs an import-style change, update the template or generator first, regenerate the file, then validate the site.

## Site OS

- All sites share a site OS runtime built on `@warpgogol/site-kernel`.
- Full operator and extension guide: `packages/os/site-kernel/docs/site-os.md`.
- **Check module wiring guide: `packages/os/site-kernel-checks/docs/check-module-guide.md`** — how to onboard `build.check` and avoid duplicate command registration.
- Each site joins the OS by creating `tools/kernel.config.ts` — see the guide for the step-by-step onboarding procedure.
- Site-specific commands and modules stay inside the site's `tools/`; cross-site features go into a shared package.
- Workspace-scoped commands that operate on shared packages or repository-wide assets belong in the repository root `tools/kernel.config.ts`.

## OS architecture standards

The following documents define cross-site standards enforced or tracked by the OS. Every site must satisfy these requirements.

| Document | What it covers |
| --- | --- |
| `packages/os/site-kernel/docs/architecture-dna.md` | 28 non-negotiable architectural invariants with enforcement status |
| `packages/os/site-kernel/docs/naming-conventions.md` | File naming rules per layer (pages, content, components, schemas, styles, assets) |
| `packages/os/site-kernel/docs/anti-patterns.md` | 19 forbidden patterns that break architectural portability |
| `packages/os/site-kernel/docs/page-contracts.md` | Page archetypes, mandatory artifacts, and definition of done |
| `packages/os/site-kernel/docs/component-contracts.md` | Component classes, mirroring rules, CSS and accessibility contracts |
| `packages/os/site-kernel/docs/semantic-layer.md` | Projection-based semantic output architecture |
| `packages/os/site-kernel/docs/scaling-playbook.md` | How to grow a site without breaking the DNA |

### RFC-0025 check pipeline (Wave-0 commands)

The following commands were added to `SITES_CHECK_PIPELINE` by RFC-0025 and run for every site. All are fail-first (non-zero exit on any violation):

| Command | What it enforces |
| --- | --- |
| `app.layout.validate` | No `src/assets/images/`, no `tokens-override.css`, `src/content/` present |
| `system.manifest.validate` | `src/content/system.md` valid against schema; `systemStar` used in at least one page manifest; constellations resolve; `pages[].pageId` and `pages[].routes` valid (RFC-0048) |
| `biome.contract.validate` | All biome YAMLs valid; `identity.biome` in `system.md` resolves; no per-feature CSS outside `src/styles/` |
| `cosmic.catalog.validate` | Every manifest `cosmicName` valid for its layer (star/planet/moon) |
| `cosmic.name.unique` | No duplicate `cosmicName` values within the same layer across the workspace |
| `constellation.compose.validate` | Active constellation required slots present and in correct relative order |
| `client.edit.validate` | Every `clientEditable` path in `system.md` resolves under `src/content/` |
| `content.surface.validate` | CMS-friendly content surface: no `components/`, `sections/`, `features/`, `media/` dirs; prose uses language folders; `system.md` is the only manifest (RFC-0047) |
| `routes.localized.validate` | `pages[].pageId` unique; `routes` keys are supported languages; slugs unique per language; navigation `pageId` targets exist in registry (RFC-0048) |

## Cosmic Passport (RFC-0028 / DNA-31..34)

Sites with `release.passport.enabled: true` in `src/content/system.md` participate in the passport pipeline:

- `passport.emit` — signs and writes `dist/.well-known/cosmic-passport.json`
- `nebula.score.compute` — writes `dist/.well-known/nebula-score.json`
- `star-map.render` — writes `dist/.well-known/cosmic-star-map.svg`
- `passport.verify` — post-deploy verification gate

**Agent rules:**

- Never commit a `PASSPORT_PRIVATE_KEY` value — only the public key JSON in `public/.well-known/cosmic-passport-key.json` is committed.
- The passport page uses the Moon Quintet `Methone / Despina / Klarissa / Bianca / Adrastea`. All five moons are data-driven — they read passport artifacts at SSG build time via `@warpgogol/passport/data`.
- `cosmic-star-map.svg` must be byte-stable — never inject timestamps or random state into the SVG generation path.
- See `docs/authoring/passport-and-star-map.md` for content authoring guide.
- See `docs/engineering/passport-signing-and-keys.md` for signing, key rotation, and Nebula Score pillar definitions.

## New client onboarding (RFC-0029 / DNA-35..36)

New sites must be built via the workflows in `.agents/workflows/`, not by copying an existing site directory.

**Agent rules:**

- Never create a new site by duplicating an existing one. Use `.agents/workflows/00-prepare.md` and run `onboarding.scaffold` only during the scaffold phase.
- Treat `onboarding/.input/**` as read-only and require `brief.validate` before phase work starts.
- The canonical CI readiness gate is `app.contract.full --site <id>`. A site is deployable only when this exits zero.
- `app.contract.full` is NOT in `SITES_CHECK_PIPELINE` — run it separately as the final gate.
- See `docs/engineering/scaffold-internals.md` for maintaining the scaffold templates.

## Historical note

- Legacy `.agents/**` folders inside sites are reference material unless a closer `AGENTS.md` explicitly says otherwise.
