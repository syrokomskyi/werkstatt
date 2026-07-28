---
id: RFC-0240
title: "Modular productization of the Programmatic Surface via entitlements"
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
  - RFC-0169
  - RFC-0196
  - RFC-0225
  - RFC-0237
  - RFC-0238
  - RFC-0239
  - RFC-0241
commands:
  proposed:
    - entitlement.module.validate
    - trust.rating.validate
  added:
    - entitlement.module.validate
    - trust.rating.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Each commercial growth module from the Angebot maps to exactly one entitlement: `pseo`, `offer`, `booking`, `trust`, `i18n-extra`, `automation` — so one machine sells many ways without code forks."
  - "The base Fundament builds with zero programmatic routes (the platform invariant); all PSEO is behind `pseo`, and business offers are behind `offer` — two independently purchasable modules."
  - "The `pseo` entitlement has tariff levels: a base tier (index budget ≈12 city/Bedarf pages) and a higher regional-hub tier that unlocks the d3–d4 region levels and a larger index budget (the upsell)."
  - "`trust` produces `aggregateRating` in `LocalBusiness` ONLY on Sternsystem with real, provenance-backed reviews — never on Bodenstation, never fabricated."
  - "`entitlement.module.validate` fails if compiled modules/routes exceed the resolved entitlement set; `trust.rating.validate` fails on fabricated or Bodenstation aggregateRating."
nonGoals:
  - "Does not change the Stripe-as-source-of-truth entitlement resolver mechanism (RFC-0169); it extends the closed feature catalog and tier map."
  - "Does not define the geo cascade, demand model, or offer family (RFC-0237/0238/0239 own those)."
  - "Does not implement booking/automation integrations themselves; it defines their entitlement gates and where their blocks inject."
  - "Does not change the substance/freshness algorithms (RFC-0194/0196), only the per-tier index budget that composes after them."
  - "Does not own the HDRI provenance firewall (RFC-0241)."
---

# RFC-0240: Modular productization of the Programmatic Surface via entitlements

## Context

RFC-0169 established a closed, Stripe-backed entitlement catalog (`blog`, `integrations.*`, `analytics`, `pseo`, `team.profiles`) and RFC-0196 added a `pseo` index-budget tier map (`PSEO_TIER_BUDGET`). The doctrine (`2026-06-24 Programmatic SEO`, §5, §9.10, table in §5) turns the studio's commercial **Angebot** into a productization model where **each module is an entitlement + configuration**, and the same engine deploys in two modes:

- **Bodenstation** (`warpgogol-com`, dogfooding): all modules on, high budget, full stack to Bedarfskarten, `Service`/studio voice.
- **Sternsystem** (client site): only purchased modules on, budget capped by tariff, small geo cascade (the client's fixed country/region/city), `LocalBusiness`/client voice.

The Angebot modules are: **Быть найденным** (`pseo`), **Услуги бизнеса** (`offer`), **Запись без переписки** (`booking`), **Формирование доверия** (`trust`), **Мультиязычность** (`i18n-extra`), **Автоматизация** (`automation`). Today only `pseo` exists; the others, the regional-hub upsell tier, and the `trust→aggregateRating` Sternsystem-only rule are unspecified.

## Problem

- **Incomplete module catalog.** Only `pseo` is an entitlement; `offer` (introduced by RFC-0239), `booking`, `trust`, `i18n-extra`, and `automation` have no gate, so they cannot be sold or compiled independently.
- **No regional-hub tariff.** RFC-0238 adds d3 (region) and d4 (city) levels, but there is no entitlement tier that unlocks the region hub as a paid upsell, nor a budget that distinguishes "≈12 pages" from "regional scale".
- **`trust` rule unspecified.** `aggregateRating` is a high-risk structured-data feature; nothing forbids it on Bodenstation or guards against fabricated reviews (UWG / Google policy).
- **No enforcement that compiled surface ⊆ entitlements.** A misconfigured site could emit routes/modules it has not purchased.

## Decision

Extend the entitlement catalog and tier map to cover the full Angebot, add the regional-hub upsell tier, and add two enforcement checks.

1. **Closed feature catalog gains:** `offer`, `booking`, `trust`, `i18n-extra`, `automation` (joining existing `pseo`, etc.), each with a Stripe `lookup_key`.
2. **Module → entitlement → composition map:**

   | Module (Angebot) | Entitlement | Activates | Composition |
   | --- | --- | --- | --- |
   | Fundament (base) | — | authored pages + own-business `Organization`/`LocalBusiness` on core pages | foundation; **zero virtual routes** |
   | Быть найденным | `pseo` | `local` family (geo cascade + Bedarfskarten) | base tier `indexBudget ≈ 12`; **regional hub** = bigger budget + d3–d4 (upsell tier) |
   | Услуги бизнеса | `offer` | `offer` family (RFC-0239) | independent |
   | Запись без переписки | `booking` | online-booking + WhatsApp CTA block, injected into pages (incl. Bedarfskarten) | strengthens `local` conversion |
   | Формирование доверия | `trust` | moderated review block → `aggregateRating` **only on Sternsystem with real reviews** | never on Bodenstation |
   | Мультиязычность | `i18n-extra` | extra language layer; multiplies surface × language; per-language substance gate | `untranslated-route` guards fallback junk |
   | Автоматизация | `automation` | lead routing (Kalender/CRM/E-Mail) | consumes captured leads |

3. **`pseo` tier map gains a regional-hub tier:** base tier emits only d0–d2 + d4–d5 within a small geo selection and caps the index budget at ≈12; the regional-hub tier unlocks **d3 region hubs** (and the larger d3–d4 scale) with a larger budget. The budget composes _after_ the substance/freshness gates (top-K by substance), fail-open on read errors (RFC-0196 unchanged).
4. **Two new checks:** `entitlement.module.validate` (compiled modules/routes must be a subset of the resolved entitlement set) and `trust.rating.validate` (`aggregateRating` only on Sternsystem, only from provenance-backed real reviews, never on Bodenstation).

## Architectural fit

- **RFC-0169 (entitlements).** Extends the closed catalog and Stripe lookup map; Stripe stays the source of truth; the build-time resolver is unchanged.
- **RFC-0196 (index budget).** Adds a regional-hub tier to `PSEO_TIER_BUDGET` and links it to unlocking d3–d4; budget composition order is preserved.
- **RFC-0238/0239.** `pseo` gates the `local` family, `offer` gates the `offer` family — the "two independently purchasable modules" decision (doctrine §9.10).
- **Doctrine §1.6 / §8.1 (Anti-Fabrikation, UWG).** `trust.rating.validate` enforces the no-fabricated-reviews / Sternsystem-only `aggregateRating` rule.
- **Platform invariant (base Fundament emits zero virtual routes).** Encoded by `entitlement.module.validate`.

## Design

### TypeScript contracts (extends @gogol/share/entitlement.ts)

```ts
export const ENTITLED_FEATURES = [
  "blog", "integrations.channels", "integrations.crm", "integrations.chat",
  "analytics", "pseo", "team.profiles",
  "offer", "booking", "trust", "i18n-extra", "automation", // RFC-0240
] as const;

export const STRIPE_FEATURE_LOOKUP_MAP = {
  // …existing…
  feature_offer: "offer",
  feature_booking: "booking",
  feature_trust: "trust",
  feature_i18n_extra: "i18n-extra",
  feature_automation: "automation",
};

export const PSEO_TIER_BUDGET = {
  feature_pseo: 12,            // base "Быть найденным" — ≈12 target pages
  feature_pseo_regional: 500, // regional-hub upsell — unlocks d3–d4
  feature_pseo_pro: 5000,
  feature_pseo_scale: 50000,
};

/** Tiers that unlock the d3 (region) and d4 levels of the local family. */
export const PSEO_REGIONAL_TIERS = ["feature_pseo_regional", "feature_pseo_pro", "feature_pseo_scale"] as const;
```

### CLI surface

```sh
pnpm exec site-kernel run entitlement.module.validate --app warpgogol-com --json
pnpm exec site-kernel run trust.rating.validate --app warpgogol-com --json
```

Both are app-scoped and run in apps build-check.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/entitlement.ts` | Extends `ENTITLED_FEATURES`, lookup map, tier budget, regional tiers |
| `packages/surface/src/eligibility.ts` | Gates d3–d4 emission on the regional tier |
| `packages/os/site-kernel-checks/src/entitlements.ts` | Adds `entitlement.module.validate` |
| `packages/os/site-kernel-checks/src/pseo.ts` | Adds `trust.rating.validate` |
| `apps/warpgogol-com/...entitlements override` | Bodenstation: all modules on, high budget, no `aggregateRating` |

### Output format

```json
{
  "command": "trust.rating.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "rating-on-bodenstation", "page": "…", "message": "aggregateRating is forbidden in Bodenstation mode (studio is not the local provider)" },
    { "app": "client-x", "rule": "unsourced-rating", "page": "…", "message": "aggregateRating requires provenance-backed real reviews (CKL claim)" }
  ]
}
```

### Failure modes

`entitlement.module.validate` exits non-zero when a compiled module or virtual-route family is not covered by the resolved entitlement set (or when the base Fundament emits any virtual route). `trust.rating.validate` exits non-zero on `rating-on-bodenstation` or `unsourced-rating`. Both are **fail-open on entitlement read errors** for the index-budget path (never empty the index), but **fail-closed** for the `trust`/fabrication rules (safety/legal).

## Rollout

- **Catalog extension is additive.** Adding features to the closed catalog + Stripe map is backward-safe; existing sites without the new lookup-keys simply do not get the modules.
- **Regional tier is opt-in.** Sites on the base `pseo` tier keep d0–d2 + d4–d5 within a small selection; buying the regional tier unlocks d3 region hubs and the larger budget.
- **Bodenstation dogfooding** (`warpgogol-com`) sets an entitlements override enabling all modules with a high budget, and is asserted to emit **no** `aggregateRating` (RFC-0242 ships the datasets).
- **Pipeline:** both checks join apps build-check; `entitlement.module.validate` runs after surface generation.

## Alternatives considered

- **One mega `pseo` entitlement covering offers and booking too.** Rejected: the client requires independently purchasable modules (doctrine §9.10); coarse gating prevents tariff differentiation.
- **Rank-&-Rent (studio owns the lead stream and rents it).** Rejected (doctrine §9.11): contradicts the client-ownership model (`Übertragbares Eigentum`, `Notausgang`, no lock-in).
- **Allow `aggregateRating` on Bodenstation with studio reviews.** Rejected: the studio is not the local provider of the mapped services; misleading + UWG risk.
- **Per-site custom budgets in content.** Rejected: budgets are a tariff property resolved from Stripe tiers, not editable content, to keep productization consistent.

## Risks

- **Stripe lookup-key drift.** New features need matching Stripe Features. Mitigation: the single `STRIPE_FEATURE_LOOKUP_MAP` is the only binding point; missing keys resolve to "no module" (safe).
- **Budget vs substance interaction.** A low budget could hide good pages. Mitigation: budget is top-K _by substance_ and fail-open; the doctrine accepts a small, high-quality index for the base tier.
- **trust check false negatives.** Detecting "real, provenance-backed" reviews relies on CKL claims (RFC-0211). Mitigation: `trust.rating.validate` requires a claim with `provenance` and validity window; absent provenance fails closed.
- **Mode detection.** Bodenstation vs Sternsystem must be unambiguous. Mitigation: mode is a site-level setting tied to the business profile identity, shared with RFC-0238/0239/0242.

## Acceptance criteria

- [x] `ENTITLED_FEATURES` + `STRIPE_FEATURE_LOOKUP_MAP` extended with `offer`, `booking`, `trust`, `i18n-extra`, `automation`. (evidence: implemented historically)
- [x] `PSEO_TIER_BUDGET` gains a regional-hub tier and `PSEO_REGIONAL_TIERS`; eligibility gates d3–d4 emission on that tier. (`packages/surface/src/eligibility.ts` gained `forceNonIndexableDepths`; the Blueprint's `policy.regionalGateDepths` — `[3]` for `website-local` — suppresses the region-hub depth unless the resolved entitlements report `pseo.regionalUnlocked`. Verified: `entitlements.resolve` reports `regionalUnlocked: true` for the Bodenstation override, and `/website/elektriker/deu/bw/` now builds.) (evidence: packages/ directory, package exists)
- [x] `entitlement.module.validate` registered (app scope), wired into apps build-check, fails when compiled modules/routes exceed entitlements or the base Fundament emits virtual routes. (evidence: implemented historically)
- [x] `trust.rating.validate` registered (app scope), wired into apps build-check, forbids `aggregateRating` on Bodenstation and requires CKL-provenance-backed real reviews on Sternsystem. (Sternsystem branch added: an `aggregateRating` reference now requires a CKL claim — `provenance: external` + a validity window — on a rating/review field in the record's `.claims.yaml` sidecar.) (evidence: implemented historically)
- [x] Bodenstation (`warpgogol-com`) override enables all modules with a high budget and emits no `aggregateRating`. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- Never emit `aggregateRating` on Bodenstation, and never from fabricated/unsourced reviews — `trust.rating.validate` fails closed for safety/legal reasons.
- The base Fundament must compile with zero virtual routes; all PSEO is behind `pseo`, all offers behind `offer`.
- Index budget is a tariff property from Stripe tiers, not editable content; keep the `STRIPE_FEATURE_LOOKUP_MAP` the single binding point.
- Agents MUST reference this RFC id in commit messages when implementing.
- Agents MUST NOT collapse the independently purchasable modules into one entitlement without a superseding RFC.
