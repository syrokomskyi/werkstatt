---
id: ADR-0033
title: "Model external competitor prices as PBP offering entities with range pricing"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0740
  - RFC-0743
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0033: Model external competitor prices as PBP offering entities with range pricing

## Context

The warpgogol-com site displays competitor platform prices (MyHammer, Blauarbeit: 79–133 EUR/month) in the `digitales-fundament.md` page as a comparison card. These prices were hardcoded as literal strings (`79–133 €`) in the page content, bypassing the PBP business layer and the dynamic pricing pipeline (RFC-0740 derived prices, RFC-0743 currency-aware price display). The site has a zero-hardcoded-prices policy: all prices must be sourced from PBP offering entities and rendered via `{price:offering-id:chargeRef}` markers.

## Decision

External/competitor prices are modeled as PBP offering entities with `range` pricing model, enabling `{price:}` marker resolution and `CurrencyAwarePriceDisplay` rendering.

- The `platform-comparison` offering entity uses `pricing.charges.monthlySubscription.amount.model: range` with `minimum: 79.00` and `maximum: 133.00` EUR.
- Content files reference competitor prices via `{price:platform-comparison:monthlySubscription.minimum}` and `{price:platform-comparison:monthlySubscription.maximum}` markers.

## Justification

- **Zero-hardcoded-prices policy:** The operator requires all prices on the site to be dynamic and currency-aware. Hardcoded EUR strings in content files violate this policy and cannot switch currencies.
- **PBP as canonical business layer (RFC-0471):** All business data — including pricing — belongs in PBP entity files under `src/content/business-profile/{lang}/offerings/`, not in page content.
- **Range pricing model:** The `range` model (minimum/maximum) is already supported by `materializeDerivedPrices` and `buildPriceVariants`, so competitor price ranges reuse existing infrastructure without new schema fields.
- **Alternative considered:** A separate `competitor-prices` content collection outside PBP — rejected because it would bypass the derived prices pipeline and require a new parsing path.
- **Alternative considered:** Hardcoded fallback in the component — rejected because it violates the zero-hardcoded-prices policy.

## Consequences

- Positive: Competitor prices are now currency-aware (EUR/UAH) and update automatically when exchange rates change.
- Positive: All prices on the site — own and competitor — flow through the same PBP → derived prices → `CurrencyAwarePriceDisplay` pipeline.
- Negative: The `platform-comparison` offering entity is not a real Warpgogol product — it is a reference data entity. Future agents must understand it is not sold and has no `catalogEntryRef` pointing to a real catalog entry.
- Technical debt: The competitor price range (79–133 EUR) is manually maintained in the PBP entity file and does not auto-update from competitor websites.

## Evolution

- If competitor prices need to be sourced automatically (e.g. scraping), a new rate-source adapter pattern (similar to `pbp-rate-adapters`) may be needed.
- If more competitor data points are added (features, ratings), the `platform-comparison` entity may need a dedicated `competitor-profile` schema extension.
- Post-hoc: implemented in commit `0696a3b4` (hero-decision-card source amount from derivedPrices) and mission warpgogol-com-m000037 content changes, 2026-08-08.
