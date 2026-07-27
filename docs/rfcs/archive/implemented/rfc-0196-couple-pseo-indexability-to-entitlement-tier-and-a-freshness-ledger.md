---
id: RFC-0196
title: "Couple pSEO indexability to entitlement tier and a freshness ledger"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-15
updatedAt: 2026-06-17
implementedAt: 2026-06-16
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0141
  - RFC-0169
  - RFC-0192
  - RFC-0194
commands:
  proposed: []
  added:
    - surface.freshness
  changed:
    - surface.generate
  removed: []
appsImpacted:
  - apps/webgogol-com
packagesImpacted:
  - packages/surface
  - packages/share
successSignals:
  - "The number of indexable generated pages is bounded by the site's entitlement tier, and the highest-substance pages are the ones kept."
  - "A generated page auto-noindexes when its underlying records go stale past the Blueprint's freshness SLA, and returns to the index when refreshed — no manual intervention."
  - "One engine knob serves both anti-thin-content quality and tiered productization."
nonGoals:
  - "Do not define the substance score itself (RFC-0194) — this only consumes its ranking."
  - "Do not implement billing/Stripe integration — tiers come from resolved entitlements (RFC-0169)."
  - "Do not fetch live data at build — freshness is read from per-record metadata."
---

# RFC-0196: Couple pSEO indexability to entitlement tier and a freshness ledger

## Context

Two forces shape how many generated pages _should_ index and _which_ ones. First, productization: the studio sells the `pseo` module, and the natural upsell is volume — a starter site should index a modest long-tail, a pro site a large one. Second, quality durability: programmatic pages decay. The legacy funding entries already carried `lastVerified` and `status`; a page built on stale facts should not keep ranking on outdated information.

RFC-0194 produces a per-page substance ranking. RFC-0169 resolves the site's entitlements from Stripe. Combining them lets one mechanism serve both concerns: rank by substance, keep the top-K the tier allows, and let freshness pull individual pages out until refreshed.

## Problem

- `pseo` is a single on/off entitlement (RFC-0192). There is no volume dimension, so there is no productization lever beyond "module bought or not."
- Nothing expresses "this page's facts expired." A page built from a record last verified a year ago indexes identically to a freshly verified one, risking ranking on stale content.
- Both needs are really the same decision — _should this page be in the index right now_ — but there is no place that composes substance, tier, and freshness into it.

## Decision

The indexability decision gains two modifiers, both composed after the record-count gate (RFC-0192) and the substance gate (RFC-0194):

1. **Substance budget = tier cutoff (N2).** The resolved entitlement carries a `pseo.indexBudget` (e.g. `starter: 200`, `pro: 5000`). The engine ranks indexable candidates by substance score and keeps the top-K = budget; the remainder are `noindex` (still rendered, still in the GEO twin only if the Blueprint allows). Quality ranking and billing tier share one knob.

2. **Freshness Ledger (N3).** Each axis-value/record carries `lastVerified` + `source` (read via content-source, RFC-0141). The Blueprint declares a freshness SLA per depth. `surface.freshness` computes each page's effective freshness from its contributing records; a page past SLA is auto-`noindex` ("decayed") until its records are re-verified, then it returns to the index automatically. The ledger and decay reasons are written to the manifest.

## Architectural fit

- **RFC-0194:** consumes the substance ranking; the budget is "keep top-K by substance."
- **RFC-0169:** `pseo.indexBudget` is a property of the resolved entitlement; fail-open to an unbounded budget when entitlements are unknown (never silently drop pages because the entitlement read failed).
- **RFC-0141:** `lastVerified`/`source` are per-record content fields read through the content-source port; freshness never triggers a network call at build.
- **RFC-0192:** both modifiers run inside `surface.generate`'s decision and are recorded on the `VirtualRouteEntry`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run surface.freshness --app webgogol-com --json
```

### TypeScript contracts

```ts
// Resolved entitlement gains a budget (RFC-0169)
export interface ResolvedEntitlements {
  features: string[];
  pseo?: { indexBudget: number };   // top-K indexable; absent ⇒ unbounded (fail-open)
}

// Blueprint (RFC-0193) declares freshness SLAs
export interface BlueprintFreshness {
  slaDaysPerDepth: Record<number, number>;   // depth → max age before decay
  field: string;                             // record field holding lastVerified (ISO date)
}

export interface IndexDecision {
  recordGate: boolean;     // RFC-0192
  substanceGate: boolean;  // RFC-0194
  withinBudget: boolean;   // RFC-0196 N2
  fresh: boolean;          // RFC-0196 N3
  indexable: boolean;      // AND of the above
  reason?: "over-budget" | "decayed" | "thin" | "too-few-records";
}
```

### File system responsibilities

| Path                                     | Role                                    |
| ---------------------------------------- | --------------------------------------- |
| `apps/*/src/entitlements.generated.json` | Carries `pseo.indexBudget` for the tier |

### Output format

```json
{
  "command": "surface.freshness",
  "status": "ok",
  "surface": "website-local",
  "decayed": 41,
  "examples": [
    { "pageId": "website-local:elektriker:altstadt", "ageDays": 410, "slaDays": 365, "reason": "decayed" }
  ]
}
```

### Failure modes

Neither modifier fails the build. Over-budget and decayed pages are `noindex`, not errors. `surface.freshness` exits zero and reports decayed pages; a CI policy may choose to alert when the decayed share exceeds a threshold. Budget resolution fails open: an unknown/zero budget means unbounded (quality gate still applies), so an entitlement read error never silently empties the index.

## Rollout

- Add `pseo.indexBudget` to the entitlement resolver and the Stripe tier mapping (RFC-0169); existing single-flag `pseo` defaults to unbounded until a tiered product is defined.
- Add freshness SLAs to `website-local`; seed `lastVerified` on the pilot datasets.
- Run `surface.freshness` in `build.prepare`; surface decayed counts in the build report.
- Tiered budgets become a product packaging decision; the engine is agnostic to the specific numbers.

## Alternatives considered

- **Separate "page-count add-on" product decoupled from quality:** rejected — would index arbitrary pages regardless of substance; coupling budget to the substance ranking keeps the cheapest tier's index clean.
- **Time-bomb hard-delete of stale pages:** rejected — `noindex`-decay is reversible and preserves URLs/GEO twins; deletion churns the URL set and breaks links.
- **Live freshness checks at build (call sources):** rejected — slow, nondeterministic, and violates the build-time-only stance; freshness is authored record metadata.

## Risks

- **Index churn at the budget boundary:** pages near the top-K cutoff could flip in and out of the index between builds as substance scores shift. Mitigation: deterministic ranking with a tie-break and a hysteresis band so a page must clear the cutoff by a margin to change state.
- **False decay** when `lastVerified` is not maintained on records. Mitigation: SLA is per depth and tunable; `surface.freshness` reports the decayed share so a maintenance gap is visible before it hurts.
- **Budget fail-open over-indexing** if the entitlement read fails (unbounded). Accepted: the substance gate still bounds quality; CI may alert when indexable count exceeds the expected tier.
- **Tier numbers leaking into the engine.** Mitigation: the engine consumes an opaque `indexBudget`; specific tier sizes live in the product/entitlement mapping, not in code.

## Acceptance criteria

- [x] `pseo.indexBudget` added to `ResolvedEntitlements`; `entitlements.resolve` writes it — from the offline `billing.pseoIndexBudget` (override/dogfood) or, with Stripe, derived from the active tier lookup-key via `PSEO_TIER_BUDGET` (`feature_pseo`→200, `_pro`→5000, `_scale`→50000). Fail-open to unbounded. Verified end-to-end: `billing.pseoIndexBudget: 3` → resolve writes `pseo.indexBudget` → `surface.generate` keeps the top-3 by substance, demotes the rest `over-budget` (evidence: implemented historically)
- [x] Budget keeps the top-K candidates by substance score (RFC-0194); remainder `noindex` `over-budget` (verified: budget 3 → top-3 by score kept, 4 demoted) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Blueprint freshness SLA per depth + a record `lastVerified` field binding (evidence: implemented historically)
- [x] `surface.freshness` decays past-SLA pages to `noindex` (in `surface.generate`) and restores them when the records are re-verified (verified: stale Hamburg → 4 decayed; reverted → 0) (evidence: implemented historically)
- [x] `IndexDecision` (incl. `reason`, `substanceScore`, `withinBudget`, `fresh`) recorded per page in the artifact; `pseo-manifest.json` carries the distribution (evidence: implemented historically)
- [x] `surface.freshness` runs in `build.prepare`; decayed counts in the build report (never fails) (evidence: implemented historically)
- [x] `AGENTS.md` documents the budget + freshness modifiers and their fail-open behavior (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## As-built notes (2026-06-17)

- `pseo.indexBudget` is written by `entitlements.resolve` from the offline `billing.pseoIndexBudget` (override/dogfood) **or**, with Stripe, derived from the active tier lookup-key via `PSEO_TIER_BUDGET` (`feature_pseo`→200, `feature_pseo_pro`→5000, `feature_pseo_scale`→50000; max wins). Fail-open to unbounded.
- The Freshness Ledger composition is configurable per Blueprint via **`freshness.mode`**: `any` (oldest record — decay if any is stale, default), `all` (youngest — decay only when every contributing record is stale; avoids decaying aggregate pages when one child lags), or `median`.
- Budget + freshness decisions run inside `surface.generate` and are recorded on each `VirtualRouteEntry.decision`; `surface.freshness` is a non-failing reporter over the artifact.

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Budget resolution MUST fail open (unbounded) — never drop pages because an entitlement read failed.
- Freshness MUST read authored record metadata via content-source; never call a live source at build.
- Decay MUST be reversible `noindex`, never deletion; URLs and GEO twins persist.
- The budget MUST keep the highest-substance pages; never keep an arbitrary or insertion-order subset.
- Agents MUST NOT weaken freshness SLAs to keep stale pages indexed without a superseding RFC.
