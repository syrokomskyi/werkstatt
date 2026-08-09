---
id: RFC-0239
title: "Offer family for owned business services and removal of website service and posluha"
kind: architecture
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
  - RFC-0243
related:
  - RFC-0192
  - RFC-0193
  - RFC-0195
  - RFC-0225
  - RFC-0237
  - RFC-0238
  - RFC-0240
commands:
  proposed:
    - offer.provider.validate
  added:
    - offer.provider.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A new `offer` family publishes the owning business's own services at `/leistungen/` (de) and `/uk/posluhy/` (uk), depths d0 (pillar) and d1 (`{offer}`), gated by a dedicated `offer` entitlement separate from `pseo`."
  - "The legacy `website-service` Blueprint and every `/sait/**/posluha/**` route are deleted with no redirects and no backward compatibility (explicit client decision)."
  - "The offer family is mode-polymorphic: on Bodenstation it markets the studio's own services with `Service`/studio JSON-LD; on Sternsystem it markets the client's own services with `LocalBusiness` (the client is the real provider) — never impersonating a third party."
  - "`offer.provider.validate` fails if an offer page declares a provider that is not the site's own business profile, preventing doorway/impersonation pages (UWG/Google policy risk)."
  - "Client demand semantics that used to live under `/posluha/` move to the `demand` axis of the `local` family (RFC-0238); studio/business offers live only in `offer`."
nonGoals:
  - "Does not define the geo cascade or demand model (RFC-0237/0238 own those)."
  - "Does not define entitlement tiers or index budgets (RFC-0240 owns productization)."
  - "Does not author the studio's actual service catalog copy (that is content work under the offer content domain)."
  - "Does not introduce district axes, nor any geo level on the offer family beyond the optional per-offer service-area field."
  - "Does not preserve any legacy route, redirect, or alias for the removed `/posluha/` URLs."
---

# RFC-0239: Offer family for owned business services and removal of website service and posluha

## Context

The Programmatic Surface ships two PSEO families today: `website-local` (industry × city) and **`website-service`** (`packages/ontology/blueprints/website-service.yaml`), the latter rendering `industry × service` long-tail at `/website/{industry}/leistung/{service}` (de) and `/uk/sait/{industry}/posluha/{service}` (uk). The doctrine (`2026-06-24 Programmatic SEO`, §1.2–1.3, §2 "offers↔demands", §3.2, §4, §9.1–9.4) splits the conflated `/posluha/` space along **meaning**, not naming:

- An **offer** page is the _provider's_ voice — "here is a service WE provide".
- A **demand** map is the _market's_ voice — "here is what people search, and how a site captures it".

For a client these sets often overlap (a hairdresser's `balayage` is both an offer and a demand) — but the _page types differ_. Studio/business offers belong to a dedicated `offer` family; client demand belongs to the `demand` axis of `local` (RFC-0238). The old `/sait/{business}/posluha/` is deleted outright (doctrine §4, §9.2; client direction 8).

## Problem

- **Conflated semantics.** `website-service` mixes "a service the studio provides" with "a thing a person searches", which is the root of the impersonation/doorway risk (a studio page pretending to be an electrician's service page).
- **Wrong provider identity.** Nothing prevents a `website-service` page from implying a provider the site does not represent — a UWG (German unfair-competition) and Google structured-data policy hazard.
- **Legacy URL debt.** `/sait/**/posluha/**` encodes the conflated model in the URL itself. The client has decided to delete it with no compatibility shim.
- **No clean home for owned services.** The studio's own services (`Digitales Fundament`, growth modules, named guarantees) and a client's own services have no dedicated, honestly-marked family.

## Decision

Introduce a polymorphic **`offer`** family and **delete** the `website-service` Blueprint and all `/posluha/` routes.

1. **New `offer` Blueprint**, gated by a new **`offer` entitlement** (RFC-0240), with the owning business's `offers` collection as its dataset:

   | depth | level   | URL de (canon)         | URL uk (working)       | geo       |
   | ----- | ------- | ---------------------- | ---------------------- | --------- |
   | 0     | pillar  | `/leistungen/`         | `/uk/posluhy/`         | twin-only |
   | 1     | `offer` | `/leistungen/{offer}/` | `/uk/posluhy/{offer}/` | full      |

2. **Mode polymorphism (shared voice rule):**
   - **Bodenstation** (`warpgogol-com`): the studio's own services; JSON-LD `Organization`/`ProfessionalService` + `Service` (no `LocalBusiness`); B2B intent ("website for small business", "local SEO for trades").
   - **Sternsystem** (client site): the client's own services; JSON-LD `LocalBusiness` (the client _is_ the provider — legitimate); B2C intent.
3. **No nesting under `/sait/`.** The offer family is a top-level space; it is not a geo cascade. An offer may carry an optional `areaServed` field for `Service` markup, but no geo URL axis.
4. **Hard deletion, no legacy:** remove `website-service.yaml`, its constellations' service-only depths, and every `/sait/**/posluha/**` route. No 301s, no aliases. Former content migrates by meaning: business services → `offer`; client demand → `demand` axis of `local`.
5. **New check `offer.provider.validate`:** the provider declared/emitted by any offer page must equal the site's own business profile (`content/business/{lang}/`); impersonation of a third party fails the build.

## Architectural fit

- **Doctrine §1.2 (Infrastruktur statt Imitation) + §1.3 (two render modes).** The provider in JSON-LD is always the site's own business — impersonation becomes impossible by construction.
- **Doctrine §3.2 / §4 / §9.1–9.4.** Encodes the offer↔demand split and the `/posluha/` deletion exactly.
- **RFC-0225 (owned digital assets positioning).** The studio's offer catalog (Fundament + growth modules) is the commercial surface for `warpgogol-com`'s own positioning.
- **RFC-0192/0193.** The offer family is another Blueprint over the existing port; no new engine.
- **RFC-0240.** `offer` is a separately purchasable entitlement, independent from `pseo`.

## Design

### Offer Blueprint (illustrative)

```yaml
id: offer
entitlement: offer
dataset: { collection: offers, status: active }
axes:
  - { id: offer, universe: { collection: offers, field: slug }, match: { recordField: slug } }
levels:
  - { depth: 0, slug: { de: "leistungen", uk: "posluhy" }, constellation: offer-pillar, geo: twin-only }
  - { depth: 1, slug: { de: "leistungen/{offer}", uk: "posluhy/{offer}" }, constellation: offer-detail, geo: full }
policy:
  minRecordsPerDepth: { 0: 0, 1: 1 }
  redirectPolicy: nearest-ancestor
  trailingSlash: true
  substanceMin: 24
  maxThinShare: 0.4
```

### CLI surface

```sh
pnpm exec werkstatt run offer.provider.validate --app warpgogol-com --json
```

`offer.provider.validate` (app scope) inspects each emitted offer page's provider node and the offer records, and fails when the provider is anything other than the site's own business profile, or when an offer record names an external provider.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/blueprints/offer.yaml` | New offer Blueprint |
| `packages/ontology/blueprints/website-service.yaml` | **Deleted** |
| `packages/os/site-kernel-checks/src/pseo.ts` | Adds `offer.provider.validate` |
| `apps/warpgogol-com/src/content/surface/offers/{de,uk}/*.md` | Studio offer records (renamed/migrated from services where they are studio offers) |
| `apps/warpgogol-com/src/content/surface/services/**` | **Deleted** (migrated to offers or to local demands) |

### Output format

```json
{
  "command": "offer.provider.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "foreign-provider", "page": "offer:elektriker-notdienst", "message": "offer page provider must be the site's own business profile, found external LocalBusiness" }
  ]
}
```

### Failure modes

`offer.provider.validate` exits non-zero on any `foreign-provider` violation. `blueprint.validate` (existing) fails the build if any route still references a deleted `/posluha/` segment or the removed `website-service` Blueprint. A route-source scan rejects re-introduction of `/sait/**/posluha/**`.

## Rollout

- **Delete-and-replace, no flag day.** `website-service.yaml` and `/posluha/` routes are removed in the same change that lands the `offer` Blueprint. No redirects (explicit client decision; the surface is being rewritten).
- **Content migration is a one-time editorial pass:** classify each former `service` as either a studio/business _offer_ (→ `offers` collection) or client _demand_ (→ `demands` collection, RFC-0238). Nothing is auto-migrated by URL.
- **Bodenstation pilot:** `warpgogol-com` publishes its own offer catalog (`Digitales Fundament`, growth modules, named guarantees) under `/leistungen/`.
- **Authored pillar (RFC-0243 amendment).** The depth-0 pillar `/leistungen/` is authored, not PSEO-generated. The offer Blueprint no longer emits a pillar route; authored pages own `/leistungen/` and `/uk/posluhy/`.
- **New apps:** the `offer` family is available via onboarding behind the `offer` entitlement; without it, no offer routes are emitted.
- **Pipeline:** `offer.provider.validate` joins apps build-check.

## Alternatives considered

- **Rename `/posluha/` instead of deleting it.** Rejected: the problem is semantic conflation, not naming; renaming would preserve the impersonation hazard.
- **Keep a single `services` family serving both offers and demands.** Rejected: it is exactly the conflation the doctrine resolves; page types and JSON-LD voice differ.
- **Emit 301 redirects from old `/posluha/` URLs.** Rejected by explicit client decision (no legacy, no backward compatibility); the surface is generated, so old URLs simply cease to exist.
- **Allow `LocalBusiness` on Bodenstation offer pages.** Rejected: the studio is not the local provider of those services; `Service`/studio markup only (doctrine §8.2, §9.4).

## Risks

- **Link loss from deleted URLs.** No redirects means any external links to old `/posluha/` pages 404. Mitigation: the legacy surface is young and low-traffic; the client explicitly accepts this; sitemaps regenerate.
- **Misclassification during migration.** An editor could file a demand as an offer. Mitigation: `offer.provider.validate` catches foreign-provider offers; `demand.modifier.lint` (RFC-0238) guards the demand side; review is a one-time pass.
- **Provider detection complexity.** Determining the "provider" of an offer page from JSON-LD/business profile must be precise. Mitigation: the provider is always the site's single business profile (`content/business/{lang}/`); the check compares identity, not heuristics.

## Acceptance criteria

- [x] `offer.yaml` Blueprint created (d0 pillar, d1 `{offer}`) gated by the `offer` entitlement; `/leistungen/` + `/uk/posluhy/` resolve. (evidence: implemented historically)
- [x] `website-service.yaml` and all `/sait/**/posluha/**` routes deleted; no redirects/aliases remain and `blueprint.validate` rejects their re-introduction. (evidence: implemented historically)
- [x] Offer pages are mode-polymorphic (Bodenstation `Service`/studio, Sternsystem `LocalBusiness`/client) with the provider always equal to the site's own business profile. (evidence: implemented historically)
- [x] `offer.provider.validate` registered (app scope), wired into apps build-check, with documented `--json` output and a `foreign-provider` rule. (evidence: implemented historically)
- [x] `warpgogol-com` `services` content migrated to `offers` (studio offers) and/or `demands` (client demand); no orphaned service records remain. (evidence: original apps retired by RFC-0381, migration completed historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- Never emit an offer page whose provider is not the site's own business profile; the `offer` family is not for impersonating tradespeople (that is the `demand` axis of `local`).
- Do not re-create `/posluha/` routes or the `website-service` Blueprint; do not add legacy redirects.
- When migrating, classify each former service as offer (provider voice) or demand (market voice) — never both as one page type.
- Agents MUST reference this RFC id in commit messages when implementing.
- Agents MUST NOT weaken `offer.provider.validate` without a superseding RFC.
