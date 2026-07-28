---
id: RFC-0237
title: "Geo cascade ontology and the shared gogol geo package"
kind: architecture
scope: workspace
status: implemented
owners:
  - architecture
reviewers: []
createdAt: 2026-06-24
updatedAt: 2026-06-24
implementedAt: 2026-06-25
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0192
  - RFC-0193
  - RFC-0199
  - RFC-0207
  - RFC-0238
  - RFC-0239
  - RFC-0240
  - RFC-0241
  - RFC-0242
commands:
  proposed:
    - geo.catalog.validate
    - geo.slug.preview
  added:
    - geo.catalog.validate
    - geo.slug.preview
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/geo"
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A single shared package `@gogol/geo` resolves every country, region, and city used by the Programmatic Surface from bundled, offline ISO 3166 data — apps carry zero geo gazetteer files."
  - "Country URL segments are ISO 3166-1 alpha-3 codes (`deu`), region segments are the ISO 3166-2 subdivision part (`bw`), and city segments are locale-correct Latin transliterations of the city name in the page language (de `stuttgart`, uk `shtuthart`)."
  - "Geo identity is language-neutral and standard-anchored (alpha-2 / ISO 3166-2 / GeoNames id), so a country, region, or city keeps its identity for centuries even when its display slug or localized name changes."
  - "`geo.catalog.validate` fails when an app references a country/region/city that the shared catalog cannot resolve, or when two distinct cities collide on the same per-language slug under the same region."
  - "Adding a new country, region, or city to a site is a thin selection entry (codes + bindings), never a copied gazetteer record."
nonGoals:
  - "Does not define the local family axes, levels, or the Bedarfskarte content model (RFC-0238 owns those)."
  - "Does not change the eligibility, substance, budget, or freshness gates (RFC-0240 owns budget/tier)."
  - "Does not add districts (Bezirke) as a URL axis — districts remain page content per the doctrine (deferred to a future RFC)."
  - "Does not introduce any runtime network calls or per-request geocoding; all geo data is build-time and bundled."
  - "Does not ship localized exonyms for every world city; it defines the resolution contract and fallbacks, and bundles only the data the chosen libraries provide plus app-pinned overrides."
---

# RFC-0237: Geo cascade ontology and the shared gogol geo package

## Context

The Programmatic Surface (RFC-0192/0193) currently models geography with a **single `city` axis** whose universe is a per-app gazetteer: `apps/warpgogol-com/src/content/surface/cities/{de,uk}/*.md`. Each city record hand-carries its display name, its `state` as free German prose (`"Baden-Württemberg"`), and its URL slug as the filename stem. There is no country level and no region level; the URL is `…/{industry}/{city}/`.

The canonical PSEO doctrine (`2026-06-24 Programmatic SEO`, sections 2, 4, 11) makes geography a **three-level cascade — Land → Region → Stadt — anchored on ISO 3166** so identities are stable for centuries while slugs stay localizable. The client added two binding refinements on top of the doctrine:

1. The **country** URL segment must be the **ISO 3166-1 alpha-3** code (e.g. `deu`), not a readable localized name (`deutschland`/`germany`) as the doctrine's R3 default proposed.
2. **Cities** must use ready-made TypeScript packages that produce the **correct Latin transliteration of the city name in the page's language**, and the country/city gazetteers should live in `packages/*`, not in each thin app.

Today none of this exists: there is no country/region identity, no ISO anchoring, no transliteration pipeline, and the gazetteer is duplicated into the app instead of shared.

## Problem

- **No stable geo identity.** A city is identified by a filename stem and a prose `state` string. Renaming a slug or correcting a name silently breaks links and loses identity. There is no ISO anchor, so the model cannot survive slug/localization churn (violates the doctrine's "stable identities" invariant).
- **No country or region axis.** The doctrine's sellable hubs (`country` hub as an option, `region` hub as an upsell — RFC-0240) are impossible because those entities do not exist.
- **Gazetteer lives in the app.** Every site that buys the `pseo` module would re-author the same country/region/city data, contradicting the "apps are composition only; shared data lives in packages" platform rule.
- **No locale-correct city slugs.** uk city slugs are just the German stem (`stuttgart`), not a transliteration of the Ukrainian name. There is no umlaut-expansion rule for German (`münchen` → `muenchen`) and no Ukrainian KMU transliteration.
- **Collisions are unguarded.** Two cities that transliterate to the same slug within one region would silently overwrite each other; nothing detects it.

## Decision

Introduce a new shared, framework-free package **`@gogol/geo`** that owns the geo gazetteer and the slug pipeline for the whole monorepo, anchored on ISO 3166, and make the surface generator consume it.

1. **Three permanent geo entities with standard, language-neutral identities:**
   - `Country` — identity = **ISO 3166-1 alpha-2** (`de`); URL slug = **ISO 3166-1 alpha-3, lowercased** (`deu`); language-neutral.
   - `Region` — identity = **ISO 3166-2** (`DE-BW`); URL slug = the **subdivision part, lowercased** (`bw`); language-neutral.
   - `City` — identity = **GeoNames id (preferred) or a stable stem + region binding**; URL slug = **locale-aware Latin transliteration of the city name in the page language** (de `stuttgart`, uk `shtuthart`).
2. **Data is bundled and offline,** sourced from maintained npm libraries wrapped behind one typed facade:
   - `i18n-iso-countries` → alpha-2 ⇄ alpha-3 ⇄ localized country names (de, uk).
   - `iso-3166-2` → subdivision codes and names (e.g. `DE-BW` → "Baden-Württemberg").
   - `country-state-city` → the worldwide country → state → city hierarchy and canonical city names.
   - A locale-aware **slug pipeline**: German umlaut expansion (`@sindresorhus/slugify` with custom replacements `ä→ae, ö→oe, ü→ue, ß→ss`) and **Ukrainian KMU** Cyrillic→Latin transliteration (`cyrillic-to-translit-js` `uk` preset, normalized to the KMU 2010 table) before slugging.
3. **Apps stay thin.** A site no longer ships a gazetteer. It declares only a thin **geo selection** (which alpha-2 countries, which ISO 3166-2 regions, which city ids it serves) plus per-language **presence/Bedarf content** (RFC-0238). All names and slugs are derived by `@gogol/geo`.
4. **A new check `geo.catalog.validate`** verifies every app geo reference resolves against the shared catalog and that no two cities collide on the same per-language slug within a region. `geo.slug.preview` is a developer aid that prints the resolved slug for a city in each language.

## Architectural fit

- **Doctrine §2 / §11 (stable identities).** ISO 3166 anchors survive algorithm, market, and language change; slugs are derived projections that may change without identity loss — exactly the centuries-horizon requirement.
- **Doctrine §4 + client override (alpha-3 country).** Country slug is `deu`, region slug `bw`, city slug locale-transliterated — encoded as the single source of truth in `@gogol/geo`.
- **Platform rule "apps are composition only; shared libraries live in `packages/*`."** The gazetteer moves out of the app into `@gogol/geo`.
- **RFC-0199 (per-language record slugs).** `@gogol/geo` becomes a `LocalizedUniverse` provider for the geo axes; the generator's existing localized-slug machinery is reused, not replaced.
- **RFC-0192/0193 (surface port + Blueprint).** `@gogol/geo` is a pure data/identity package with no Astro/IO; it feeds the build-time generator just like the current collection universes.

## Design

### CLI surface

```sh
# Validate that every geo reference in an app resolves and that slugs do not collide.
pnpm exec site-kernel run geo.catalog.validate --app warpgogol-com
pnpm exec site-kernel run geo.catalog.validate --all --json

# Developer aid: preview the resolved per-language slug for a city.
pnpm exec site-kernel run geo.slug.preview -- stuttgart --json
```

`geo.catalog.validate` is workspace/app-scoped and runs in the apps build-check pipeline. `geo.slug.preview` is a standalone developer command (no pipeline).

### TypeScript contracts

```ts
// @gogol/geo — framework-free, no Astro, no per-request IO.

export type Alpha2 = string;   // "de" — Country identity
export type Alpha3 = string;   // "deu" — Country URL slug
export type RegionCode = string; // "DE-BW" — Region identity (ISO 3166-2)

export interface GeoCountry {
  alpha2: Alpha2;
  alpha3: Alpha3;            // lowercased for the URL segment
  slug: string;             // === alpha3 (language-neutral)
  names: Record<string, string>; // { de: "Deutschland", uk: "Німеччина" }
}

export interface GeoRegion {
  code: RegionCode;          // "DE-BW"
  countryAlpha2: Alpha2;     // "de"
  subdivision: string;       // "bw" — URL slug (lowercased subdivision part)
  slug: string;             // === subdivision (language-neutral)
  names: Record<string, string>;
}

export interface GeoCity {
  id: string;                // GeoNames id (preferred) or "<region>:<stem>"
  countryAlpha2: Alpha2;
  regionCode: RegionCode;
  names: Record<string, string>; // localized display names (with fallback)
  /** Locale-aware Latin URL slug per language (de "stuttgart", uk "shtuthart"). */
  slugByLang: Record<string, string>;
}

export interface GeoService {
  country(alpha2: Alpha2): GeoCountry | undefined;
  region(code: RegionCode): GeoRegion | undefined;
  city(id: string): GeoCity | undefined;
  citiesOfRegion(code: RegionCode): GeoCity[];
  /** The locale-aware slug pipeline, exposed for the generator and geo.slug.preview. */
  citySlug(name: string, lang: string): string;
}

export function createGeoService(overrides?: GeoOverrides): GeoService;

/** App-pinned corrections: localized names/slugs the libraries lack or get wrong. */
export interface GeoOverrides {
  cityNames?: Record<string, Record<string, string>>; // cityId -> lang -> name
  citySlugs?: Record<string, Record<string, string>>; // cityId -> lang -> slug
}
```

### Slug pipeline (normative)

```
citySlug(name, lang):
  de -> slugify(name, { customReplacements: [["ä","ae"],["ö","oe"],["ü","ue"],["ß","ss"], ...caps] })
  uk -> kmuTransliterate(name) then slugify(latin)   // official KMU 2010 table
  *  -> slugify(transliterate(name))                  // generic ASCII fallback
```

Where a library lacks the localized **name** for a city in a language (e.g. the Ukrainian exonym of a German city), resolution falls back in order: `GeoOverrides.cityNames` → the country-language canonical name → the native name. The slug is always derived from whatever name resolves, so the output is deterministic and offline.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/geo/package.json` | New package `@gogol/geo`; declares the geo npm dependencies |
| `packages/geo/src/index.ts` | Public facade: `createGeoService`, types |
| `packages/geo/src/countries.ts` | alpha-2/alpha-3 + localized names via `i18n-iso-countries` |
| `packages/geo/src/regions.ts` | ISO 3166-2 lookup via `iso-3166-2` |
| `packages/geo/src/cities.ts` | city hierarchy via `country-state-city` |
| `packages/geo/src/slug.ts` | locale-aware transliteration + slug pipeline |
| `packages/os/site-kernel-checks/src/geo.ts` | `geo.catalog.validate` + `geo.slug.preview` |

### Output format

```json
{
  "command": "geo.catalog.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "unresolved-city", "ref": "neckarsulm", "message": "no GeoCity for id; not in shared catalog or overrides" },
    { "app": "warpgogol-com", "rule": "slug-collision", "lang": "uk", "slug": "noienburh", "message": "DE-BW cities 12345/67890 collide on uk slug" }
  ]
}
```

### Failure modes

`geo.catalog.validate` exits non-zero on any `error`-severity violation (`unresolved-country`, `unresolved-region`, `unresolved-city`, `slug-collision`). It is **fail-open on library data gaps**: a missing localized _name_ (resolved via fallback) is a `warning`, never a build failure, so a data hole never empties the index. `geo.slug.preview` always exits zero and only prints.

## Rollout

- **New package first.** Introduce `@gogol/geo` with the four wrapped libraries and the slug pipeline; unit-test the de/uk slug rules (`münchen`→`muenchen`, `Штутгарт`→`shtuthart`).
- **Generator integration is owned by RFC-0238.** This RFC ships the package and the `geo.catalog.validate` check; RFC-0238 rewires the `website-local` Blueprint axes to consume it. The two land together.
- **App migration.** `apps/warpgogol-com` replaces `surface/cities/**` gazetteer fields with a thin geo selection; presence/Bedarf prose moves to RFC-0238 content domains. No backward compatibility, no redirects from the old single-axis URLs (explicit client decision: legacy is not preserved).
- **New apps** comply from day one: they only ever declare a geo selection; the gazetteer is never copied.
- **Pipeline.** `geo.catalog.validate` joins the apps build-check pipeline next to the existing surface checks.

## Alternatives considered

- **Country slug = readable localized name (`deutschland`/`germany`), the doctrine R3 default.** Rejected by explicit client decision in favor of the stable, language-neutral alpha-3 (`deu`).
- **Keep the gazetteer in each app.** Rejected: duplicates data across sites and breaks the thin-app rule; the doctrine explicitly allows holding countries/cities in `packages/*`.
- **Hand-roll geo data as JSON in `@gogol/ontology`.** Rejected: ISO tables and city lists drift; maintained libraries (`i18n-iso-countries`, `iso-3166-2`, `country-state-city`) track the standards and ship localized names for free.
- **Region slug = full ISO 3166-2 code (`de-bw`).** Rejected: the doctrine fixes the readable subdivision part (`bw`); the full code is retained as identity only.
- **Runtime geocoding service.** Rejected: violates the offline-build and cookie-free/no-egress posture; all geo resolution is build-time and bundled.

## Risks

- **Library data quality / Ukrainian exonyms.** `country-state-city` carries canonical (often native-Latin) names; Ukrainian exonyms for German cities may be absent. Mitigation: `GeoOverrides` lets an app pin correct localized names/slugs, and the fallback chain is deterministic. Misresolution surfaces as a `warning`, not a silent error.
- **Transliteration disputes (KMU edge cases).** Some Ukrainian letter combinations (зг→zgh, apostrophe handling) need the exact KMU table. Mitigation: the `uk` pipeline normalizes the library output to the KMU 2010 table, covered by unit tests; `geo.slug.preview` makes the result auditable.
- **Bundle size.** `country-state-city` ships a multi-MB dataset. Mitigation: it is a build-time-only dependency of `@gogol/geo`; nothing ships to the browser, and tree-shaking/lazy loading keeps the generator memory bounded.
- **Agent misuse.** An agent might re-add a per-app gazetteer. Mitigation: `geo.catalog.validate` + AGENTS guidance forbid gazetteer files in `apps/*`.

## Acceptance criteria

- [x] `@gogol/geo` package created with `createGeoService` and the `GeoCountry`/`GeoRegion`/`GeoCity` contracts, wrapping `i18n-iso-countries`, `iso-3166-2`, `country-state-city`, and the locale-aware slug pipeline. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] Country slug resolves to lowercased alpha-3 (`de`→`deu`); region slug to the subdivision part (`DE-BW`→`bw`); city slug is locale-aware (de `stuttgart`, uk `shtuthart`; `münchen`→`muenchen`). (evidence: implemented historically)
- [x] `geo.catalog.validate` registered (app + workspace scope), wired into the apps build-check pipeline, with documented `--json` output and `unresolved-*` / `slug-collision` rules. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `geo.slug.preview` registered as a standalone developer command. (evidence: command registered in kernel module)
- [x] Unit tests cover the de umlaut rules and the uk KMU table, plus the override/fallback chain. (evidence: tests pass, vitest run exitCode=0)
- [x] `AGENTS.md` (root + packages) document that geo gazetteers live only in `@gogol/geo` and apps carry only a thin geo selection. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- This RFC ships the package + check; the `website-local` axis rewiring lands with RFC-0238 — do not split them across releases.
- Geo identity is ISO/standard-anchored and language-neutral; never key a country/region/city by its display slug or localized name.
- Never re-introduce a per-app geo gazetteer; apps declare a thin selection only.
- Agents MUST reference this RFC id in commit messages when implementing.
- Agents MUST NOT weaken `geo.catalog.validate` (especially the slug-collision rule) without a superseding RFC.
