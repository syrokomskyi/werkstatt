---
id: RFC-0243
title: "Authored Offer Pillar: Replace PSEO-generated /leistungen/ with authored listing page"
kind: architecture
scope: workspace
status: implemented
owners:
  - architecture
reviewers: []
createdAt: 2026-06-25
updatedAt: 2026-07-05
implementedAt: 2026-06-25
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0239
amendedBy:
  - RFC-0321
related:
  - RFC-0239
  - RFC-0240
  - RFC-0242
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
successSignals:
  - "`/leistungen/` (de) and `/uk/posluhy/` (uk) resolve as authored pages with rich content, explicit offer cards, and no PSEO-generated thin page."
  - "The offer Blueprint no longer emits a depth-0 pillar route; authored pages own the pillar namespace."
  - "Offer detail pages (depth 1) can still be emitted by the offer Blueprint or authored individually without URL collision."
  - "Navigation and footer link to `/leistungen/` consistently as the authored listing page."
nonGoals:
  - "Does not introduce geo cascade for offers (RFC-0239 already defers geo on offer; a future RFC may add it)."
  - "Does not auto-generate offer cards from authored pages; cards are hand-authored in the listing page."
  - "Does not remove the offer entitlement or the offer Blueprint entirely; only the depth-0 pillar is replaced."
---

# RFC-0243: Authored Offer Pillar: Replace PSEO-generated /leistungen/ with authored listing page

## Context

RFC-0239 introduced the `offer` family with a depth-0 pillar (`/leistungen/`, `/uk/posluhy/`) and depth-1 detail (`/leistungen/{offer}/`) generated from the PSEO surface. RFC-0242 (Bodenstation dogfooding) populated the studio's own services (`Digitales Fundament`, growth modules) as both:

- **Authored pages** (`pages/de/digitales-fundament.md`) at `/digitales-fundament/` — rich, hand-crafted content.
- **PSEO offer records** (`surface/offers/de/digitales-fundament.md`) at `/leistungen/digitales-fundament/` — thin, auto-generated duplicate.

The duplicate was removed in a prior change, but the deeper tension remains: **the studio (and every client) wants every page to be authored and polished.** A PSEO-generated pillar page (`/leistungen/`) is thin by definition — it lists what the surface knows, not what the business wants to say.

## Problem

- **Thin pillar page.** The offer Blueprint depth-0 page is a PSEO-generated list of offer records. It cannot carry a bespoke narrative, curated order, or cross-selling logic.
- **Authored pages are orphaned.** `digitales-fundament` (authored) lives at `/digitales-fundament/`, outside the `/leistungen/` namespace. Visitors browsing services do not naturally discover it from `/leistungen/`.
- **Two namespaces for one concept.** `/leistungen/` (PSEO list) and `/digitales-fundament/` (authored page) compete for attention without a clear hierarchy.
- **Future offers need the same treatment.** Every new service the studio launches deserves its own authored page, not a thin PSEO stub.

## Decision

**Replace the PSEO-generated offer pillar with an authored listing page.**

1. **Authored listing page** (`pages/de/leistungen.md`, `pages/uk/posluhy.md`) becomes the canonical `/leistungen/` and `/uk/posluhy/`. It contains hand-crafted content and explicit `audience-cards` blocks linking to authored offer pages.

2. **Offer Blueprint depth-0 is removed.** The offer Blueprint no longer emits a pillar route. Depth-1 (`/leistungen/{offer}/`) may still be emitted for offers that do _not_ have an authored page, or may be suppressed entirely if every offer has an authored page.

3. **Authored offer pages move into `/leistungen/` namespace.** The canonical URL for a service becomes `/leistungen/digitales-fundament/` (de) and `/posluhy/digitales-fundament/` (uk). Authored pages are the source of truth for offers that deserve rich content.

4. **Offer records remain for thin/geo offers only.** If a service is promoted per-city (e.g. "Local SEO für Elektriker in Karlsruhe"), the offer Blueprint may emit `/leistungen/local-seo/deu/bw/karlsruhe/` (future RFC). Authored pages own the pillar; PSEO owns the geo cascade.

## Architectural fit

- **Doctrine §1.2 (Infrastruktur statt Imitation).** Authored pages are owned content; PSEO is a projection. The pillar should be owned.
- **RFC-0239 (Offer family).** Amends RFC-0239 §Decision: the depth-0 pillar is no longer PSEO-generated. The offer Blueprint's role narrows to thin/geo detail pages when needed.
- **RFC-0240 (Entitlements).** The `offer` entitlement still gates the offer family, but its value shifts: it unlocks the _offer content domain_ and _potential geo cascade_, not a pre-built pillar page.
- **RFC-0242 (Bodenstation).** `warpgogol-com` dogfoods the authored-pillar pattern: `/leistungen/` is hand-crafted, linking to `/leistungen/digitales-fundament/` and other authored offer pages.

## Design

### Authored page structure (illustrative)

```yaml
# pages/de/leistungen.md
blocks:
  - type: hero
    props:
      header:
        heading: "Leistungen für Gewerbe und Handwerk"
        subheading: "Klare digitale Fundamente, lokale Sichtbarkeit und Wachstum — ohne Abhängigkeit."
  - type: audience-cards
    props:
      header:
        heading: "Unsere Leistungen"
      body:
        cards:
          - title: "Digitales Fundament"
            description: "Website, Domain, Inhalte und Bedingungen, die Sie verstehen und kontrollieren."
            href: "/leistungen/digitales-fundament/"
          - title: "Local SEO für Handwerk"
            description: "Strukturierter Auftritt für regionale Sichtbarkeit."
            href: "/leistungen/local-seo/"
```

### Offer Blueprint change

Remove depth-0 from `offer.yaml`:

```yaml
levels:
  # depth-0 removed — authored pages own /leistungen/
  - depth: 1
    slug: { de: "leistungen/{offer}", uk: "posluhy/{offer}" }
    constellation: offer-detail
    geo: full
```

The `offer` entitlement still enables depth-1 (and future geo cascade), but the pillar is no longer auto-generated.

### URL mapping

| Page | Old URL | New URL | Source |
| --- | --- | --- | --- |
| Offer pillar | `/leistungen/` (PSEO) | `/leistungen/` (authored) | `pages/de/leistungen.md` |
| Digitales Fundament | `/digitales-fundament/` | `/leistungen/digitales-fundament/` | `pages/de/digitales-fundament.md` (route changed) |
| Local SEO (thin) | `/leistungen/local-seo/` | `/leistungen/local-seo/` (unchanged) | `surface/offers/de/local-seo.md` |

### Navigation update

Footer and main navigation link `/leistungen/` directly, not via surface teaser. The authored page controls the entry point.

## Rollout

1. **Create authored `leistungen.md` pages** (de + uk) with explicit offer cards.
2. **Move authored offer pages** into `/leistungen/` namespace by changing `routes` in `system.md`.
3. **Remove offer Blueprint depth-0** from `offer.yaml`.
4. **Regenerate surface** — offer pillar disappears from `surface.generated.json`.
5. **Update navigation** — link to `/leistungen/` directly.
6. **Delete stale public directories** (`/leistungen/` generated files).

## Risks

- **Manual maintenance.** Adding a new offer requires editing the authored listing page. Mitigation: the studio's offer catalog changes infrequently; content workflow is normal editorial work.
- **Stale links.** Moving `/digitales-fundament/` to `/leistungen/digitales-fundament/` breaks external links. Mitigation: add 301 redirect in Astro routing (`/digitales-fundament/` → `/leistungen/digitales-fundament/`).

## Alternatives considered

- **Keep PSEO pillar and augment it with authored overrides.** Rejected because the depth-0 pillar is fundamentally a list projection; it cannot carry a curated narrative or cross-selling logic without turning into an authored page.
- **Move authored offers to `/angebot/` and keep `/leistungen/` as PSEO.** Rejected because it splits the service namespace and forces visitors to learn two paths for one concept.
- **Delete depth-1 offer Blueprint entirely.** Rejected because thin/geo detail pages (e.g. per-city local SEO) still need a generation surface; the Blueprint narrows but does not disappear.

## Implementation notes for agents

- Authored listing pages live in `pages/{lang}/` and carry `pageId: services`; navigation targets `services` directly.
- The `digitalesFundament` route slug changes from `digitales-fundament` to `leistungen/digitales-fundament` (de) and `posluhy/tsyfrovyy-fundament` (uk).
- Redirect Astro pages must be added for the old `/digitales-fundament/` and `/uk/tsyfrovyy-fundament/` paths.
- After editing `offer.yaml`, run `site-kernel pipeline build.prepare` so `surface.generated.json` drops the depth-0 pillar.

## Acceptance criteria

- [x] Authored `pages/de/services.md` and `pages/uk/services.md` created with rich content and explicit offer cards. (evidence: implemented historically)
- [x] Authored offer page routes moved to `/leistungen/` namespace in `system.md`. (evidence: implemented historically)
- [x] Offer Blueprint depth-0 removed; no PSEO-generated `/leistungen/` route remains. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Navigation and footer updated to point to authored `/leistungen/`. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)
