---
id: RFC-0238
title: "Website local v2 the geo demand cascade and Bedarfskarte content model"
kind: contract
scope: workspace
status: implemented
owners:
  - architecture
reviewers: []
createdAt: 2026-06-24
updatedAt: 2026-06-25
implementedAt: 2026-06-25
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0244
  - RFC-0490
  - RFC-0495
  - RFC-0496
  - RFC-0497
  - RFC-0498
related:
  - RFC-0192
  - RFC-0193
  - RFC-0194
  - RFC-0195
  - RFC-0196
  - RFC-0199
  - RFC-0207
  - RFC-0229
  - RFC-0237
  - RFC-0239
  - RFC-0240
  - RFC-0244
commands:
  proposed:
    - demand.modifier.lint
  added:
    - demand.modifier.lint
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/geo"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The `website-local` Blueprint expands to a five-axis cascade `industry × country × region × city × demand` over depths d0–d5, replacing the legacy two-axis `industry × city` model."
  - "A depth-5 page is a Bedarfskarte: a small engineering analysis of one substantive local demand (what people search, in which words, which page captures it, which trust proofs, typical lead-losing mistakes), never a noun-swapped template."
  - "Substantive demands (`wallbox-installation`, `balayage`) are their own d5 pages; intent modifiers (price, urgent, near-me, best) are blocks/FAQ inside a page, never separate URLs — enforced by `demand.modifier.lint`."
  - "Geo segments come entirely from `@gogol/geo` (country `deu`, region `bw`, city locale-transliterated); the app ships only thin geo selection + per-language demand/presence content."
  - "Empty upper-level hubs auto-resolve via the eligibility engine (live & index | live & noindex | 301 to live ancestor | dropped); a small client site indexes mainly its city page and its Bedarfskarten."
nonGoals:
  - "Does not define the geo package, identities, or slug pipeline (RFC-0237 owns those)."
  - "Does not add districts (Bezirke) as a URL axis — they remain content inside the city/Bedarf page."
  - "Does not define entitlement tiers, index budgets, or the regional-hub upsell (RFC-0240 owns productization)."
  - "Does not change the Bodenstation-vs-Sternsystem JSON-LD voice rule itself beyond consuming it (the provider/voice contract is shared with RFC-0240/0242)."
  - "Does not alter the substance scoring algorithm or the freshness ledger mechanics (RFC-0194/0196), only the per-depth thresholds and SLAs it is configured with."
---

# RFC-0238: Website local v2 the geo demand cascade and Bedarfskarte content model

## Context

`packages/ontology/blueprints/website-local.yaml` today is a two-axis surface: `industry × city`, depths 0–2, slug `website/{industry}/{city}`. The `city` axis universe is the per-app gazetteer this series removes (RFC-0237). The doctrine (`2026-06-24 Programmatic SEO`, §1.1–1.2, §2–3, §6) redefines this family as the platform's primary surface: an **engineering map of local demand** built on a geo cascade, where the deepest level is a **Bedarfskarte** — a small, honest analysis of one real local demand and how a website turns it into leads, not an imitation of a tradesperson's page.

RFC-0237 introduces `@gogol/geo` with the three geo entities (country/region/city) and their slugs (`deu`/`bw`/locale-city). This RFC consumes that and rewrites the `website-local` family to the full five-axis cascade plus a new `demands` collection and the Bedarfskarte content model.

## Problem

- **Geography is one flat axis.** There is no country or region level, so the doctrine's `Land → Region → Stadt` cascade and the sellable hubs (country option, region upsell) cannot exist.
- **No demand axis.** The thing a person actually searches ("install a socket", "balayage", "Wallbox") has no home. The legacy `website-service` family (RFC-0239 deletes it) conflated the studio's offers with client demand.
- **Thin-content risk is structural.** Without a demand-level analysis model and a modifier discipline, the surface invites noun-swapped templates and intent-modifier URL explosions (`…/cheap/`, `…/near-me/`) — exactly what the doctrine forbids (§1.7, §8.5).
- **City content is welded to identity.** Display name, region, and slug live in the same gazetteer record as the local prose, so identity cannot be standardized without losing the content.

## Decision

Replace the `website-local` Blueprint with a **v2 five-axis cascade** and a new `demands` collection, consuming `@gogol/geo` for all geo identity, names, and slugs.

1. **Axes:** `industry × country × region × city × demand`.
2. **Levels (depths):**

   | depth | level                | purpose                                  | geo       |
   | ----- | -------------------- | ---------------------------------------- | --------- |
   | 0     | pillar               | hub of all Gewerke                       | twin-only |
   | 1     | `industry`           | industry hub                             | full      |
   | 2     | `industry × country` | country hub (sellable option)            | full      |
   | 3     | `× region`           | **regional hub** (upsell, RFC-0240)      | full      |
   | 4     | `× city`             | city presence page                       | full      |
   | 5     | `× demand`           | **Bedarfskarte** — one demand's analysis | full      |

3. **Geo segments are derived, not authored:** country `deu` (alpha-3), region `bw` (subdivision), city locale-transliterated (`stuttgart`/`shtuthart`) — all from `@gogol/geo` via the RFC-0199 `LocalizedUniverse` provider.
4. **New `demands` collection** (the resemanticized successor of `services` for the local family): substantive needs only. Each demand record carries the Bedarfskarte fields. **Intent modifiers are never demands** — they are blocks/FAQ inside the page, enforced by `demand.modifier.lint`.
5. **Bedarfskarte content model (d5):** mandatory semantic blocks driven by the demand record + approved enriched narrative (RFC-0207): _what the person searches → in which words → which page the business needs → which trust proofs → typical lead-losing mistakes → how the Fundament/module solves it → an example block_. Voice and JSON-LD are mode-polymorphic (Bodenstation = engineer + `Service`; Sternsystem = business + `LocalBusiness`), per the shared provider/voice rule.
6. **Linking:** ↑ parent, ↓ teasers to live children, ↔ 3–5 live same-level neighbors (adjacent cities / sibling demands); breadcrumbs from the route hierarchy (RFC-0229).

## Architectural fit

- **Doctrine §3.1.** This is the `local` family ("Быть найденным"), gated by the `pseo` entitlement (RFC-0240).
- **RFC-0237.** All geo axes (`country`, `region`, `city`) draw their universe and localized slugs from `@gogol/geo`; `industry` and `demand` remain app content collections.
- **RFC-0192/0193 (port + Blueprint).** Stays data-driven: the new family is Blueprint YAML + datasets, not a new engine. The eligibility/redirect/stub machinery is reused unchanged.
- **RFC-0194/0196 (substance + freshness).** Per-depth `substanceMin`, `maxThinShare`, and freshness SLAs are tuned for a five-level cascade; the algorithms are unchanged.
- **RFC-0195/0229 (GEO twins + breadcrumbs).** Each live Bedarfskarte gets a Markdown twin and an N+1 breadcrumb trail automatically.

## Design

### Blueprint shape (illustrative)

```yaml
id: website-local
entitlement: pseo
dataset: { collection: demands, status: active }
axes:
  - { id: industry, universe: { collection: industries, field: slug }, match: { recordField: industries } }
  - { id: country,  universe: { provider: geo.countries }, match: { recordField: country } }
  - { id: region,   universe: { provider: geo.regions },   match: { recordField: region } }
  - { id: city,     universe: { provider: geo.cities },     match: { recordField: city } }
  - { id: demand,   universe: { collection: demands, field: slug }, match: { recordField: slug } }
levels:
  - { depth: 0, slug: { de: "website", uk: "sait" }, constellation: website-pillar, geo: twin-only }
  - { depth: 1, slug: { de: "website/{industry}", uk: "sait/{industry}" }, constellation: website-industry, geo: full }
  - { depth: 2, slug: { de: "website/{industry}/{country}", uk: "sait/{industry}/{country}" }, geo: full }
  - { depth: 3, slug: { de: "website/{industry}/{country}/{region}", uk: "sait/{industry}/{country}/{region}" }, geo: full }
  - { depth: 4, slug: { de: "website/{industry}/{country}/{region}/{city}", uk: "sait/{industry}/{country}/{region}/{city}" }, geo: full }
  - { depth: 5, slug: { de: "website/{industry}/{country}/{region}/{city}/{demand}", uk: "sait/{industry}/{country}/{region}/{city}/{demand}" }, constellation: bedarfskarte, geo: full }
policy:
  minRecordsPerDepth: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }
  noindexBelowPerDepth: { 5: 1 }
  redirectPolicy: nearest-ancestor
  trailingSlash: true
  substanceMin: 24
  maxThinShare: 0.4
freshness:
  field: lastVerified
  slaDaysPerDepth: { 0: 3650, 1: 540, 2: 540, 3: 540, 4: 365, 5: 270 }
  mode: all
```

Example resolved URLs:

```
de:  /website/elektriker/deu/bw/stuttgart/wallbox-installation/
uk:  /uk/sait/elektryk/deu/bw/shtuthart/vstanovlennya-wallbox/
```

A `universe.provider: geo.*` is the new RFC-0237-backed axis source (vs the existing `collection`/`field` source). The generator resolves `provider` universes and their localized slugs through `@gogol/geo`.

### Demand record + Bedarfskarte fields

```yaml
# surface/demands/{lang}/wallbox-installation.md frontmatter
slug: wallbox-installation        # neutral identity (stem)
name: "Wallbox-Installation"      # localized display
industries: [elektriker]          # which industries this demand belongs to
lastVerified: "2026-06-24"
searchedAs: ["wallbox anschließen", "ladestation installieren"]  # the words people use
neededPage: "…"                  # which page the business needs
trustProofs: ["…"]
leadLosingMistakes: ["…"]
howSolved: "…"                   # how the Fundament/module captures it
```

### CLI surface

```sh
pnpm exec werkstatt run demand.modifier.lint --app warpgogol-com --json
```

`demand.modifier.lint` scans the `demands` collection and the slug universe and fails when a demand slug is an **intent modifier** (a closed, configurable lexicon: price/cheap/cost, urgent/today/24h, near/nearby, best/top/cheapest, plus de/uk equivalents `preis`, `guenstig`, `dringend`, `in-der-naehe`, `ціна`, `терміново`, `поруч`, `найкращий`). Modifiers must be page blocks/FAQ, not records.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/blueprints/website-local.yaml` | Rewritten to the v2 five-axis cascade |
| `packages/surface/src/blueprint.ts` | Adds `universe.provider` (geo-backed axis source) |
| `packages/surface/src/blueprint-schema.ts` | Schema allows `universe.provider` alongside `collection`/`field` |
| `packages/os/site-kernel-checks/src/pseo.ts` | Adds `demand.modifier.lint` |
| `apps/warpgogol-com/src/content/surface/demands/{de,uk}/*.md` | New demand records (Bedarfskarte fields) |
| `apps/warpgogol-com/src/content/surface/cities/**` | Removed (geo identity now in @gogol/geo) |

### Output format

```json
{
  "command": "demand.modifier.lint",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "modifier-as-demand", "slug": "guenstig", "message": "intent modifier must be a block/FAQ inside a Bedarfskarte, not a demand record" }
  ]
}
```

### Failure modes

`demand.modifier.lint` exits non-zero on any `modifier-as-demand` violation. `blueprint.validate` (existing) fails if a `provider:` axis names an unknown geo provider or if a level references an undefined axis. The substance gate (RFC-0194) auto-`noindex`es a thin Bedarfskarte and fails the build only when family thin share exceeds `maxThinShare` — unchanged behavior at new thresholds.

## Rollout

- **Lands with RFC-0237.** The geo package and this Blueprint rewrite ship together; there is no intermediate single-axis state.
- **No backward compatibility.** Legacy `/website/{industry}/{city}/` URLs are not redirected (explicit client decision). Old city gazetteer records are deleted; their local prose is re-authored as city-presence (d4) and demand (d5) content.
- **Pilot = `warpgogol-com` (Germany).** Seed `country: de` → `deu`, regions like `DE-BW` → `bw`, the existing cities, and a first set of `demands` per industry.
- **New apps** get the v2 Blueprint by default via onboarding; they declare a geo selection and author demands.
- **Pipeline.** `demand.modifier.lint` joins the apps build-check pipeline next to `pseo.validate`.

## Alternatives considered

- **Keep demand as the deepest level of a separate `demand` Blueprint with its own budget (doctrine R1 alternative).** Rejected for now: a single five-axis tuple keeps hub-spoke linking and one budget simple; splitting later is a one-line Blueprint change.
- **Add a `/zapyty/` (demands index) segment before the demand slug.** Rejected: extra depth with no value; the city page already lists its Bedarfskarten as children.
- **Allow intent-modifier URLs (the "modifier matrix" expert proposal).** Rejected: violates anti-thin discipline; modifiers dilute, analyses deepen (doctrine §8.5, §9.9).
- **District (Bezirk) as a sixth axis.** Deferred: districts are page content in v2; an axis can be added later by RFC if demand proves it (doctrine R4).

## Risks

- **Combinatorial blow-up.** Five axes multiply candidate tuples fast. Mitigation: the eligibility engine only emits pages with matching active records; empty hubs `noindex`/301; the budget tier (RFC-0240) caps the index. The doctrine's metric is index quality, not page count.
- **Bedarfskarte authoring load.** Each d5 page needs real analysis. Mitigation: the demand record carries structured fields; RFC-0207 enriched narrative fills connective prose under a freeze+approve gate; the substance gate drops thin pages automatically.
- **Modifier lexicon gaps.** A non-English/German modifier could slip through. Mitigation: the lexicon is configurable and reviewable; `demand.modifier.lint` is additive and can be extended without a new RFC.
- **Geo provider coupling.** A bug in `@gogol/geo` would affect three axes at once. Mitigation: RFC-0237 unit tests + `geo.catalog.validate` run before generation; geo failures are fail-open.

## Acceptance criteria

- [x] `website-local.yaml` rewritten to the five-axis cascade (d0–d5) with geo-provider axes and per-depth substance/freshness config. (evidence: implemented historically)
- [x] `@gogol/surface` Blueprint type + schema accept `universe.provider` (geo-backed axis source) and the generator resolves geo slugs via `@gogol/geo` (RFC-0199 localized universe). (evidence: packages/ directory, package exists)
- [x] `demands` collection + Bedarfskarte content model defined; `warpgogol-com` ships pilot demand records for at least one industry. (evidence: implemented historically)
- [x] `demand.modifier.lint` registered (app scope), wired into apps build-check, with documented `--json` output and the de/uk modifier lexicon. (evidence: implemented historically)
- [x] Resolved URLs match the canon (`/website/elektriker/deu/bw/stuttgart/wallbox-installation/`, uk twin) and each live d5 page gets a Markdown twin + breadcrumb trail. (evidence: implemented historically)
- [x] Legacy single-axis city gazetteer removed from `warpgogol-com`; no legacy redirects added. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`), and only together with RFC-0237.
- Never author geo names/slugs in app content; consume `@gogol/geo`. Apps carry only a thin geo selection + demand/presence prose.
- Never create a demand record for an intent modifier; put modifiers into page blocks/FAQ.
- A Bedarfskarte is an engineering analysis, not a noun-swapped template; respect the substance gate — do not lower `substanceMin`/`maxThinShare` to push thin pages live.
- Agents MUST reference this RFC id in commit messages when implementing.
- Agents MUST NOT weaken `demand.modifier.lint` or re-introduce intent-modifier URLs without a superseding RFC.
