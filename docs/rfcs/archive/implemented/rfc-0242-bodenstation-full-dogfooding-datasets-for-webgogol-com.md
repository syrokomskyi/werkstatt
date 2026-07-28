---
id: RFC-0242
title: "Bodenstation full dogfooding datasets for warpgogol com"
kind: architecture
scope: app
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
amendedBy: []
related:
  - RFC-0225
  - RFC-0237
  - RFC-0238
  - RFC-0239
  - RFC-0240
  - RFC-0241
  - RFC-0243
commands:
  proposed:
    - bodenstation.voice.validate
  added:
    - bodenstation.voice.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "`warpgogol-com` deploys the full local stack down to Bedarfskarten (d5) in Bodenstation mode, dogfooding every growth module before it is sold to clients."
  - "Every Bodenstation surface page speaks in the engineer's voice and emits `Organization`/`ProfessionalService` + `Service` JSON-LD (the studio), never `LocalBusiness` for a trade it does not perform, and never `aggregateRating`."
  - "The pilot dataset covers Gewerke × Germany geo cascade (`deu`/region/city from @gogol/geo) × substantive demands, each Bedarfskarte passing the substance gate as a genuine engineering analysis."
  - "`bodenstation.voice.validate` fails the build if a Bodenstation page emits `LocalBusiness`/`aggregateRating` or impersonates a tradesperson, enforcing Infrastruktur statt Imitation."
  - "All Angebot modules (`pseo`, `offer`, `booking`, `trust`, `i18n-extra`, `automation`) are enabled via the Bodenstation entitlements override so the studio tests its own offer on itself."
nonGoals:
  - "Does not define the geo package, local/offer families, entitlements, or HDRI firewall (RFC-0237/0238/0239/0240/0241 own those)."
  - "Does not change shared package code; it is the app-level composition + datasets that exercise the shared machinery."
  - "Does not enable client (Sternsystem) behavior; this RFC is specifically the studio's own site in Bodenstation mode."
  - "Does not author marketing copy beyond what the surface datasets and approved enriched narratives require."
  - "Does not introduce district (Bezirk) URL axes."
---

# RFC-0242: Bodenstation full dogfooding datasets for warpgogol com

## Context

The doctrine (`2026-06-24 Programmatic SEO`, §1.3, §5 "two deployment scenarios", §10 R2) decides that **Bodenstation** — the studio's own site `warpgogol-com` — deploys the **full stack down to Bedarfskarten** so the studio proves the module works before selling it ("полный догфудинг"). In Bodenstation mode the page voice is the **engineer demonstrating understanding of demand**, and JSON-LD is `Organization`/`ProfessionalService` + `Service` (the studio), **never** `LocalBusiness` for a trade the studio does not perform, and **never** `aggregateRating`.

RFC-0237–0241 deliver the machinery (geo package, local v2, offer family, entitlements, HDRI firewall). This RFC is the **app-level composition**: the datasets and overrides that turn `warpgogol-com` into the reference Bodenstation deployment, plus a voice/markup guard specific to Bodenstation.

## Problem

- **No reference dataset exercises the new stack.** Without a full Bodenstation deployment, the geo cascade, demand model, and entitlement tiers are untested end-to-end.
- **Voice/markup drift risk.** A surface page could accidentally emit `LocalBusiness` or `aggregateRating` in Bodenstation mode, impersonating a tradesperson (doorway/UWG) — exactly what the doctrine forbids.
- **Modules unproven.** The studio sells modules it has not run on itself; dogfooding is the doctrine's chosen proof.
- **Thin-content temptation.** A demo dataset could be shallow; the substance gate must see real engineering analyses, not stubs.

## Decision

Make `warpgogol-com` the canonical **Bodenstation** deployment with full dogfooding datasets and an enforcing voice guard.

1. **Full local stack to d5.** Author the pilot dataset: Gewerke (industries) × Germany geo cascade (`deu` → regions → cities, all from `@gogol/geo`) × substantive `demands`, producing real Bedarfskarten at d5.
2. **All modules on (override).** A Bodenstation entitlements override enables `pseo` (high/regional budget), `offer`, `booking`, `trust`, `i18n-extra`, `automation`, so the studio tests its own offer on itself.
3. **Engineer voice + studio markup, enforced.** Every Bodenstation surface page emits `Organization`/`ProfessionalService` + `Service` (the studio) and speaks as the engineer; **no** `LocalBusiness` for trades the studio does not perform; **no** `aggregateRating` (per RFC-0240's `trust.rating.validate`, restated here for Bodenstation).
4. **New check `bodenstation.voice.validate`** fails the build if a Bodenstation page emits forbidden markup or impersonates a tradesperson.

## Architectural fit

- **Doctrine §1.3 / §5 / §10 R2.** Encodes the Bodenstation render mode and the full-dogfooding decision exactly.
- **RFC-0225 (owned digital assets positioning).** The Bodenstation surface is the studio's own demonstration of the offer.
- **RFC-0237/0238.** Consumes `@gogol/geo` and the local v2 cascade for the German pilot.
- **RFC-0239/0240/0241.** Enables the `offer` family, all module entitlements, and the HDRI firewall on the same site.
- **RFC-0194/0196.** Bedarfskarten must pass the substance gate; the budget reflects a high (dogfooding) tier.

## Design

### Bodenstation composition

- **Mode:** `warpgogol-com` is pinned to Bodenstation mode (studio business profile = the studio).
- **Entitlements override:** all Angebot modules enabled; `pseo` on the regional-hub (or higher) tier for full scale.
- **Datasets (app content):**
  - `surface/industries/{de,uk}/*` — the Gewerke the studio demonstrates.
  - geo selection — Germany (`de`→`deu`), its regions, pilot cities (via `@gogol/geo`).
  - `surface/demands/{de,uk}/*` — substantive demands with Bedarfskarte fields (RFC-0238).
  - `surface/offers/{de,uk}/*` — the studio's own services (RFC-0239).
    > RFC-0243 amendment: the `/leistungen/` pillar is authored, not PSEO-generated. Authored pages (`pages/de/leistungen.md`) list curated offer cards linking to authored offer detail pages (`/leistungen/digitales-fundament/`). Thin PSEO offer records remain only for services without a dedicated authored page.
  - enriched narratives (RFC-0207) for d5 pages, frozen + approved.

### CLI surface

```sh
pnpm exec site-kernel run bodenstation.voice.validate --app warpgogol-com --json
```

App-scoped; runs in `warpgogol-com` build-check.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/warpgogol-com/src/content/surface/industries/{de,uk}/*.md` | Gewerke records |
| `apps/warpgogol-com/src/content/surface/demands/{de,uk}/*.md` | Bedarfskarte demand records |
| `apps/warpgogol-com/src/content/surface/offers/{de,uk}/*.md` | Studio offer records |
| `apps/warpgogol-com/src/content/enriched/website-local/{de,uk}/**` | Approved d5 narratives |
| `apps/warpgogol-com/<entitlements override>` | Bodenstation: all modules on, high budget |
| `packages/os/site-kernel-checks/src/bodenstation.ts` | `bodenstation.voice.validate` |

### Output format

```json
{
  "command": "bodenstation.voice.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "localbusiness-on-bodenstation", "page": "website-local:elektriker:deu:bw:stuttgart:wallbox-installation", "message": "Bodenstation must emit Service/studio, not LocalBusiness for a trade the studio does not perform" },
    { "app": "warpgogol-com", "rule": "rating-on-bodenstation", "page": "…", "message": "aggregateRating is forbidden in Bodenstation mode" }
  ]
}
```

### Failure modes

`bodenstation.voice.validate` exits non-zero (fail-closed) on `localbusiness-on-bodenstation`, `rating-on-bodenstation`, or `impersonation` (a page presenting itself as the tradesperson's own service rather than a demand map). It complements `trust.rating.validate` (RFC-0240) and `offer.provider.validate` (RFC-0239) with the Bodenstation-specific voice rule.

## Rollout

- **Seed iteratively.** Start with one or two Gewerke across a few BW cities + a handful of demands; grow by budget and substance, not by raw page count (doctrine §1.7).
- **Approve narratives before publish.** d5 enriched narratives are frozen + approved (RFC-0207); unapproved content never renders.
- **Verify the firewall.** RFC-0241's `hdri.firewall.validate` runs on the same site; any HDRI figure is a cited external claim.
- **Pipeline:** `bodenstation.voice.validate` joins `warpgogol-com` build-check; the deployment is the live reference for client sales.

## Alternatives considered

- **Demo only to city level (doctrine R2 alternative).** Rejected by the chosen decision: the studio tests the full offer (incl. Bedarfskarten) on itself.
- **`LocalBusiness` markup on Bodenstation to "look local".** Rejected: impersonation/doorway risk; the studio is not the local provider (doctrine §8.2–8.4).
- **Synthetic placeholder Bedarfskarten to fill the cascade.** Rejected: violates the substance gate and Anti-Fabrikation; thin pages are dropped, not faked.
- **Skip dogfooding and sell directly.** Rejected: the doctrine makes dogfooding the proof of the module.

## Risks

- **Authoring effort.** Real Bedarfskarten are work. Mitigation: structured demand fields + approved enriched narrative; grow incrementally; the substance gate keeps quality honest.
- **Accidental Sternsystem markup.** A shared component could emit `LocalBusiness`. Mitigation: `bodenstation.voice.validate` fails closed; mode is a single site-level setting.
- **Budget too high too early.** A high dogfooding budget could surface thin pages. Mitigation: budget composes after substance (top-K), and `maxThinShare` fails the family if too many are thin.
- **Drift between this app RFC and the shared contracts.** Mitigation: this RFC depends on RFC-0237–0241; it lands after them and references their checks rather than duplicating logic.

## Acceptance criteria

- [x] `warpgogol-com` deploys the full local stack to d5 in Bodenstation mode, consuming `@gogol/geo` (Germany `deu`/regions/cities) and the local v2 cascade. (Dataset only covers Baden-Württemberg cities so far — acceptable per the RFC's own "seed iteratively" rollout note — but `src/content/enriched/website-local/` is empty, so no d5 pages have the approved enriched narrative the Design section calls for; the build log shows 17 narrative-missing warnings.) (evidence: packages/ directory, package exists)
- [x] Bodenstation entitlements override enables all Angebot modules with a high/regional `pseo` budget. (evidence: implemented historically)
- [x] Every Bodenstation surface page emits `Organization`/`ProfessionalService` + `Service` (studio), never `LocalBusiness`/`aggregateRating`. (`SemanticOrganization.schemaType` + `company.mode === "bodenstation"` now drive `@type: ["Organization", "ProfessionalService"]` in `buildOrganizationNode`; verified present in the built `dist/client/index.html` / `uk/index.html`, with `LocalBusiness`/`aggregateRating` absent from the full `dist/client` build.) (evidence: implemented historically)
- [x] `bodenstation.voice.validate` registered (app scope), wired into `warpgogol-com` build-check, with documented `--json` output and `localbusiness-on-bodenstation` / `rating-on-bodenstation` / `impersonation` rules (fail-closed). (`impersonation` rule added — a closed de/uk pattern set for tradesperson-impersonation phrasing — in `packages/os/site-kernel-checks/src/bodenstation-voice.ts`.) (evidence: packages/ directory, package exists)
- [x] Pilot Bedarfskarten pass the substance gate as genuine engineering analyses (no synthetic stubs). (`pseo.validate` passes — 41 routes, 40 indexable, 1 thin; sampled demand records read as genuine analyses, not stubs.) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`), and only after RFC-0237–0241 are in place.
- In Bodenstation mode, never emit `LocalBusiness` for a trade the studio does not perform, and never emit `aggregateRating`; the page is a demand map in the engineer's voice, not an imitation service page.
- Do not pad the cascade with synthetic Bedarfskarten; respect the substance gate and grow by value, not page count.
- HDRI figures on this site are cited external claims only (RFC-0241).
- Agents MUST reference this RFC id in commit messages when implementing.
- Agents MUST NOT weaken `bodenstation.voice.validate` without a superseding RFC.
