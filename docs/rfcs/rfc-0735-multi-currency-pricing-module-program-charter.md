---
id: RFC-0735
title: "Multi-Currency Pricing Module — Program Charter"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-4
  - DNA-55
  - RFC-0437
  - RFC-0728
  - RFC-0729
  - RFC-0730
  - pbp-specification-package/ADR-010
  - pbp-specification-package/ADR-011
  - pbp-specification-package/ADR-012
satisfies:
  - DNA-4
  - DNA-55
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/pbp"
  - "@warpgogol/share"
  - "@warpgogol/ui"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "CurrencyPricingPolicy, RatePolicy, RateSchedule, RateSnapshot entities exported from @warpgogol/pbp"
  - "currency-conversion derivation contract registered in compiler"
  - "multi-currency feature in ENTITLED_FEATURES catalog"
  - "Currency selector UI component renders on warpgogol-com"
  - "Derived prices materialize at build time and project to website"
nonGoals:
  - "Does not implement Quote, Contract, Invoice, or Settlement — currentUses.prohibited for all transactional scopes"
  - "Does not implement automatic invoice generation — future phase"
  - "Does not support multiple strategies for the same target currency across Offerings"
  - "Does not implement min/max price clamps or 'not cheaper than X' rules"
  - "Does not implement price endings other than ...9 and ...99"
  - "Does not modify the canonical PbpCharge.amount field — derived prices are materialized separately"
---

# RFC-0735: Multi-Currency Pricing Module — Program Charter

## Context

The Werkstatt platform creates sites that display prices to visitors. Currently, prices are authored in a single canonical currency (EUR) via PBP `Offering.pricing.charges` (RFC-0437, RFC-0728). The `money` pipe formatter (RFC-0729) already accepts `targetCurrency` and `rate` params for render-time display formatting, and RFC-0730 eliminated presentation duplication by routing all price display through canonical PBP references + pipe formatting.

However, there is no PBP model for:

- Which target currencies a business supports
- How exchange rates are sourced and governed
- How derived prices are calculated deterministically
- How derived prices are materialized and projected
- How the `multi-currency` capability is gated as a paid module

A detailed research document (`obsidian/.../6 Prices and Currencies - Chat GPT 5.6 Sol High.md`) explored the domain model with an external expert. The expert did not know our exact PBP architecture. This program charter adapts the expert's proposals to our actual system.

## Problem

1. **No business-level currency strategy.** There is no PBP entity declaring which target currencies a business supports, whether each is fixed or derived, or what exchange rate policy applies.

2. **No exchange rate model.** There are no PBP entities for rate policies, rate schedules (internal fixed rates), or rate snapshots (immutable observations).

3. **No currency conversion derivation.** The existing derivation engine (`runDerivations` in `packages/pbp/src/compiler/derivations.ts`) supports `first-year-cost` and `tco` but has no `currency-conversion` contract.

4. **No derived price materialization.** Derivation results are not persisted as materialized price objects in the compiled graph. The site has no way to read a pre-computed derived price.

5. **No entitlement gating.** The `ENTITLED_FEATURES` catalog (in `packages/share/src/entitlement.ts`) has no `multi-currency` feature. There is no way to gate the capability as a paid module.

6. **No currency selection UI.** There is no component for visitors to select their preferred display currency.

7. **No rate fetching service.** There is no service that fetches exchange rates from external sources and creates rate snapshots.

## Decision

This RFC is a **program charter**. It defines the full scope, adopts 35 design decisions from the research document, and establishes a sequence of 11 RFCs (RFC-0735 through RFC-0745) that implement the multi-currency pricing module.

### Architectural principles

1. **Canonical price is untouched.** `PbpCharge.amount` remains the single canonical declared price in the base currency. Derived prices are materialized separately by the compiler — not authored.

2. **Business-level currency strategy.** A new `CurrencyPricingPolicy` entity at the business level declares which target currencies are supported and how each is obtained. One strategy per target currency — enforced by the compiler.

3. **Derived prices are deterministic.** A `currency-conversion` derivation contract applies a fixed pipeline (conversion → percentage adjustment → fixed adjustment → rounding → price ending) using decimal arithmetic. The result is a `PbpDerivationResult` with full provenance and trace.

4. **Materialize at build time.** Derived prices are materialized into the compiled graph at build time, not computed at page-render time. The site reads pre-computed results.

5. **Paid module gating.** The `multi-currency` entitled feature gates site presentation (currency selector UI, derived price projections, currency-aware display). PBP entities exist in the model regardless — the entitlement gates compilation and projection.

6. **Separation of presentation and transaction.** `currentUses` on `CurrencyPricingPolicy` declares which scopes are allowed (presentation, aiAnswers, quote, contract, invoice, settlement). Current phase: `presentation: allowed`, all transactional scopes: `prohibited`.

7. **No backward compatibility.** No migration, no legacy support. The site (warpgogol-com) is rewritten to use the new model directly.

### Design decisions adopted from research document

All 35 decisions from "Решения для окончательного проектирования" are adopted:

**Derived price status:**

1. Derived prices CAN be official contract/invoice prices — `currentUses` field supports future enablement
2. Current scope: site presentation only
3. One strategy per target currency — no per-Offering overrides

**Rates:** 4. Internal fixed rate per currency pair 5. One internal rate for all Offerings 6. No per-Product or per-PricingSet rates 7. Daily review cycle (`reviewEvery: P1D`) 8. Old rate valid until explicitly replaced 9. Future `validFrom` supported

**Rate sources:** 10. One rate source for the business (with fallback) 11. Fallback source supported 12. Single normalized return value — adapter handles semantics 13. Maximum age: 1 month (configurable) 14. Last known rate allowed within max age

**Models:** 15. PriceDerivationModel at business level 16. Percentage markup allowed (before rounding) 17. Fixed adjustment after conversion 18. No min/max price 19. No "not cheaper than X" rules 20. Only `…9` and `…99` price endings 21. One model for multiple target currencies

**Scope:** 22. Model applied per Charge 23. TCO: do NOT sum rounded per-charge target amounts 24. TCO: aggregate in source currency, then convert and round once 25. Do NOT show activation + monthly + first-year simultaneously

**Fixation:** 26. Price fixation: future phase (current scope is presentation only) 27. Quote validity: 3 days (configurable) — future 28. Rate snapshot in contract: yes — future 29. Show rate to customer: yes 30. Change PriceModel without changing Offering: yes

**Presentation:** 31. Do NOT show source EUR price alongside derived price 32. Brief explanation, not formula 33. Text note only, no `≈` symbol 34. No rate date near price 35. Full calculation trace for AI agent

### RFC sequence

| RFC | Title | Kind | Depends on |
| --- | --- | --- | --- |
| RFC-0735 | Multi-Currency Pricing Module — Program Charter (this RFC) | architecture | — |
| RFC-0736 | CurrencyPricingPolicy Entity | contract | RFC-0735 |
| RFC-0737 | RatePolicy and RateSchedule Entities | contract | RFC-0735 |
| RFC-0738 | RateSnapshot Entity | contract | RFC-0737 |
| RFC-0739 | Currency Conversion Derivation Contract | contract | RFC-0736, RFC-0737, RFC-0738 |
| RFC-0740 | Derived Price Materialization | architecture | RFC-0739 |
| RFC-0741 | `multi-currency` Entitled Feature and Build Pipeline | architecture | RFC-0740 |
| RFC-0742 | Currency-Aware Price Projection | architecture | RFC-0741 |
| RFC-0743 | Currency Selector UI Component | architecture | RFC-0742 |
| RFC-0744 | Rate Fetcher Service | architecture | RFC-0738 |
| RFC-0745 | Currency-Aware Schema.org Mapping | architecture | RFC-0742 |

### Package impact

| Package | Change |
| --- | --- |
| `@warpgogol/pbp` | New entities: CurrencyPricingPolicy, RatePolicy, RateSchedule, RateSnapshot. New derivation: `currency-conversion`. Compiler extension: materialize derived prices. |
| `@warpgogol/share` | New entitled feature: `multi-currency`. Stripe lookup key mapping. Route registry gate. Price projection envelope. |
| `@warpgogol/ui` | New components: currency-selector, currency-aware price display. |
| `@warpgogol/site-kernel-checks` | New commands: `rate-snapshot.resolve`, `currency-pricing.compile`, `derived-prices.materialize`. Pipeline extension. |
| `services/rate-fetcher-worker` | New service workspace for daily rate fetching. |

### Entity hierarchy

```
Offering
└── PricingSet (existing: pricing.charges)
    └── Charge (existing: PbpCharge)
        └── amount (existing: canonical source price, e.g. 70 EUR)
            │
            └── CurrencyPricingPolicy (NEW: business-level)
                ├── targetCurrencies[].strategy: derived | fixed
                ├── targetCurrencies[].ratePolicyRef
                ├── targetCurrencies[].derivationContractRef
                └── targetCurrencies[].currentUses
                    │
                    ├── RatePolicy (NEW)
                    │   ├── mode: external | business-fixed
                    │   ├── sources: primary + fallback
                    │   └── freshness: maximumAge, allowLastKnownValue
                    │
                    ├── RateSchedule (NEW: for business-fixed mode)
                    │   └── entries[].validFrom + value
                    │
                    └── RateSnapshot (NEW: immutable observation)
                        ├── value, observedAt, freshUntil
                        └── digest
                    │
                    ↓ currency-conversion derivation
                    │
                    └── Materialized Derived Price (NEW: in compiled graph)
                        ├── amount (target currency)
                        ├── priceKind: derived
                        ├── derivation provenance + trace
                        └── allowedUses
```

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`).** All currency policies, rate policies, and rate schedules are authored content in `src/content/business-profile/`. Derived prices are materialized by the compiler — not authored.
- **DNA-55 (Spec vendoring).** New PBP entities extend the `pbp/*@1` namespace additively (new entity types, no key renames or semantic changes — permitted within `@1` per DNA-55's additive-only constraint). The vendored spec package is referenced but not modified — new entities are platform RFCs, not spec amendments.
- **RFC-0437 (Pricing Core).** `PbpCharge` and `PbpChargeAmount` are unchanged. The canonical `amount` field stays.
- **RFC-0728 (Charge schema enforcement).** `pbpChargeSchema` enforcement is unchanged. Derived prices are separate from the authored charge.
- **RFC-0729 (Money formatter).** The `money` pipe formatter already supports `targetCurrency` and `rate` params. The currency selector UI will use this formatter with materialized derived price data.
- **RFC-0730 (Presentation elimination).** Price display routes through canonical PBP references + pipe formatting. Derived price projection data feeds into the same pipe formatting path.

## Design

### CLI surface

No new CLI commands in this RFC. Subsequent RFCs define:

- `rate-snapshot.resolve` (RFC-0741)
- `currency-pricing.compile` (RFC-0741)
- `derived-prices.materialize` (RFC-0740)

### TypeScript contracts

No new types in this RFC. Subsequent RFCs define:

- `PbpCurrencyPricingPolicy` (RFC-0736)
- `PbpRatePolicy`, `PbpRateSchedule` (RFC-0737)
- `PbpRateSnapshot` (RFC-0738)
- `PbpCurrencyConversionDerivation` (RFC-0739)
- `PbpMaterializedDerivedPrice` (RFC-0740)

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/rfcs/rfc-0735-*.md` through `docs/rfcs/rfc-0745-*.md` | This RFC program |
| `docs/explorations/multi-currency-pricing-module.md` | Exploration document (pre-RFC analysis) |

### Output format

N/A — program charter.

### Failure modes

N/A — program charter.

## Rollout

- **Charter acceptance.** This charter transitions from `draft` to `accepted` upon architecture review approval — not upon implementation of all child RFCs. Child RFCs (0736–0745) are accepted individually as they pass review. The program-level acceptance criteria below track program completion, not charter acceptance.
- **Sequential implementation.** RFCs 0736–0745 are implemented one by one in dependency order.
- **No migration.** warpgogol-com is the only site. No backward compatibility. Content files are rewritten directly.
- **No grace period.** The multi-currency module is either fully present or absent (gated by entitlement).
- **Build pipeline.** New pipeline steps are added to `build-prepare` and gated by the `multi-currency` entitlement. If not entitled, steps are skipped.

## Alternatives considered

- **Amount Rules on Charge (expert's proposal).** Replace `PbpCharge.amount` with an `amounts` map of per-currency rules. Rejected: decision #3 (one strategy per target currency) means the multi-currency logic belongs at the business level, not duplicated per Charge. The Charge keeps its single canonical `amount`.

- **Separate PriceModel entity (expert's proposal).** Create `pbp/price-model@1` as a new top-level entity. Rejected: the source price is already embedded in `PbpCharge.amount`. A parallel entity creates duplication. Derived prices are materialized by the compiler, not authored.

- **Runtime conversion at page-render time.** Compute derived prices on each page load. Rejected: the research doc explicitly recommends build-time materialization for consistency, reproducibility, and cacheability.

- **Spec amendment to pbp-specification-package.** Add new entity types to the vendored spec. Rejected: the spec is `accepted` at `@1`. New entities are platform RFCs that reference the existing spec without modifying it.

## Risks

- **Decimal arithmetic precision.** Currency conversion requires decimal arithmetic without binary float. Mitigation: RFC-0739 mandates decimal-string arithmetic (bigint-based or equivalent) and golden tests. The existing `decimalString` schema primitive in `packages/pbp/src/schemas/primitives.ts` validates the format; RFC-0739 defines the arithmetic semantics.

- **Rate source availability.** External rate sources may be unavailable. Mitigation: fallback source + last-known-value within max age (RFC-0737).

- **Entitlement gating complexity.** The multi-currency module touches multiple layers (PBP, build pipeline, projection, UI). Mitigation: each layer's gating is explicit in its RFC.

- **Scope creep.** The research document proposes Quote, Contract, Invoice, and Settlement integration. Mitigation: `currentUses` field is `prohibited` for all transactional scopes in this phase. Transactional integration is a future phase.

## Acceptance criteria

- [ ] All 11 RFCs (0735–0745) written and validated
- [ ] RFC-0736: `PbpCurrencyPricingPolicy` entity exported from `@warpgogol/pbp`
- [ ] RFC-0737: `PbpRatePolicy`, `PbpRateSchedule` entities exported
- [ ] RFC-0738: `PbpRateSnapshot` entity exported
- [ ] RFC-0739: `currency-conversion` derivation registered in compiler
- [ ] RFC-0740: `derived-prices.materialize` command produces materialized prices
- [ ] RFC-0741: `multi-currency` in `ENTITLED_FEATURES`, build pipeline steps gated
- [ ] RFC-0742: Price projection envelope includes currency-aware data
- [ ] RFC-0743: Currency selector UI renders on warpgogol-com
- [ ] RFC-0744: Rate fetcher service creates rate snapshots
- [ ] RFC-0745: Schema.org output emits business-declared prices only
- [ ] `pnpm build:check` passes
- [ ] `pnpm test` passes
- [ ] `rfc.validate` passes on all 11 RFCs

## Implementation notes for agents

- Agents MAY implement code changes ONLY when each RFC has status: accepted (or implemented).
- Implement RFCs sequentially: 0736 → 0737 → 0738 → 0739 → 0740 → 0741 → 0742 → 0743 → 0744 → 0745.
- No migration, no backward compatibility. Rewrite content files directly.
- The site is warpgogol-com. All content changes target `src/content/business-profile/` in that site.
- Agents MUST NOT weaken or remove enforcement rules established by any RFC in this program without a new RFC that supersedes it.
