---
id: RFC-0742
title: "Currency-Aware Price Projection"
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
acceptedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-4
  - DNA-55
  - RFC-0735
  - RFC-0740
  - RFC-0741
  - RFC-0729
  - RFC-0730
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
successSignals:
  - "PbpPriceProjection interface exported from @warpgogol/pbp"
  - "PbpPriceDisplayConfig interface exported"
  - "buildPriceProjection function exported"
  - "Projection includes currency-aware data when multi-currency entitled"
  - "AI Answer Projection includes full calculation trace"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define the currency selector UI — that is RFC-0743"
  - "Does not define Schema.org output — that is RFC-0745"
  - "Does not define the rate fetcher service — that is RFC-0744"
  - "Does not compute prices at render time — all prices are pre-materialized"
---

# RFC-0742: Currency-Aware Price Projection

## Context

RFC-0740 materializes derived prices into the compiled graph. RFC-0741 gates the pipeline. This RFC defines how materialized derived prices are projected to the website and AI agent.

The existing projections are:

- Website Projection (RFC-PBP-080 / RFC-0455) — for visitor-facing pages
- AI Answer Projection (RFC-PBP-081 / RFC-0456) — for AI agents

This RFC extends both projections to include currency-aware price data.

The research document specifies (decisions adopted in RFC-0735 § Design decisions adopted from research document):

- The UI receives a ready-to-display Price Projection, not raw price models
- The projection includes formatted amount, price kind, display config, and allowed uses
- The AI agent gets a full calculation trace (decision #35)
- Do NOT show source EUR price alongside derived price (decision #31)
- Brief explanation, not formula (decision #32)
- Text note only, no `≈` symbol (decision #33)
- No rate date near price (decision #34)
- Show rate to customer (decision #29)

## Problem

1. **No price projection type.** There is no structured projection that the UI can consume to display a derived price. The UI would need to read raw materialized prices, format them, and compose disclosure notes — violating the separation of concerns.

2. **No display config.** There is no field telling the UI whether to show the source price, show the rate, or show a disclosure note. Without this, each component would implement its own display logic.

3. **No AI trace projection.** The AI Answer Projection does not include the calculation trace. AI agents cannot explain how a derived price was computed.

4. **No `allowedUses` enforcement in projection.** The projection does not check `allowedUses` before including a derived price. A derived price marked `invoice: false` could leak into an invoice projection.

## Decision

### 1. `PbpPriceProjection` type

A new projection type that carries the formatted amount, price kind, display config, `allowedUses`, and rate information. The `rate.pair` field (e.g. `"EUR/UAH"`) is pre-computed so the consumer does not need to look up the source currency from the materialized price. Full type signatures are in § TypeScript contracts below.

Types `PbpPriceKind`, `PbpCommercialMeaning`, `PbpCurrentUses`, and `PbpCurrencyConversionTrace` are defined in RFC-0740.

### 2. Display config defaults (from research decisions)

```ts
const DEFAULT_DISPLAY_CONFIG: PbpPriceDisplayConfig = {
  showSourcePrice: false,         // decision #31
  showRate: true,                 // decision #29
  showRateDateNearPrice: false,   // decision #34
  note: null,                     // set per price kind
};
```

### 3. Disclosure note

The note is composed by the projection builder based on `commercialMeaning` and `locale`. No `≈` symbol (decision #33). Brief explanation, not formula (decision #32).

For `commercialMeaning: "derived-price"`:

- UK: `"Ціна розрахована за курсом 1 EUR = {rate} {currency}."`
- DE: `"Preis berechnet nach Kurs 1 EUR = {rate} {currency}."`

For `commercialMeaning: "indicative"`:

- UK: `"Орієнтовна ціна. Підсумкова сума залежить від поточного курсу."`
- DE: `"Richtpreis. Der Endbetrag hängt vom geltenden Kurs ab."`

The `{rate}` and `{currency}` placeholders are filled from the materialized price's rate value and target currency. The note is composed by the projection builder, not by the UI component. The UI receives the final note string.

### 4. `buildPriceProjection` function

```ts
export function buildPriceProjection(
  materialized: PbpMaterializedDerivedPrice,
  locale: string,
): PbpPriceProjection | null;
```

Returns `null` when `allowedUses` prohibits the projection (see §7 below).

This function:

1. Formats the amount using `Intl.NumberFormat` with the target currency and locale.
2. Formats the rate using `Intl.NumberFormat` with the source currency.
3. Composes the disclosure note based on `commercialMeaning`.
4. Sets `display` config from defaults.
5. Copies `allowedUses` from the materialized price.

### 5. Website Projection extension

The existing `PbpWebsiteProjection` (defined in `packages/pbp/src/projections/website.ts`, RFC-0455) gains an optional `priceProjections` field:

```ts
export interface PbpWebsiteProjection {
  // ... existing fields ...
  priceProjections?: Record<string, PbpPriceProjection>;
}
```

Keyed by target currency code. Only present when `multi-currency` is entitled and derived prices are materialized.

### 6. AI Answer Projection extension

The existing `PbpAiAnswerProjection` (defined in `packages/pbp/src/projections/ai-answer.ts`, RFC-0456) gains an optional `priceTraces` field:

```ts
export interface PbpAiAnswerProjection {
  // ... existing fields ...
  priceTraces?: Record<string, PbpCurrencyConversionTrace>;
}
```

Keyed by target currency code. Includes the full calculation trace (decision #35, RFC-0735). Only present when `multi-currency` is entitled.

### 7. `allowedUses` enforcement

The projection builder (`buildPriceProjection`) MUST check `allowedUses` before producing a projection. The following logic is illustrative — the exact enforcement point is inside `buildPriceProjection`, which returns `null` when the relevant use is prohibited:

```ts
// Illustrative — actual enforcement is inside buildPriceProjection
if (!materialized.allowedUses.presentation) {
  return null; // do not include in website projection
}
if (!materialized.allowedUses.aiAnswers) {
  return null; // do not include in AI answer projection
}
```

In the current phase, all target currencies have `presentation: true` and `aiAnswers: true`. The enforcement is in place for future phases when transactional scopes are enabled.

### 8. Integration with `money` pipe formatter (RFC-0729)

The `money` pipe formatter already supports `targetCurrency` and `rate` params. The price projection's `formatted` field is produced by the same `Intl.NumberFormat` logic. Content authors can use:

```md
=(ref | money currency=EUR locale=de targetCurrency=UAH rate=46.18)
```

But with materialized derived prices, the projection provides the pre-formatted string directly. The pipe formatter is used for ad-hoc conversions in content; the projection is used for structured price display in components.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`).** Canonical price data remains in `src/content/business-profile/`. Price projections are build-time derived data, not authored content. This RFC does not add content files — it extends the compiler's projection phase.
- **DNA-55 (Spec vendoring).** This RFC extends platform-side projection types (`PbpWebsiteProjection`, `PbpAiAnswerProjection`) without modifying the vendored `pbp-specification-package` snapshot. The `pbp/*@1` namespace is frozen; new projection fields are platform extensions, not spec amendments.
- **RFC-0729 (Money formatter).** The projection's `formatted` field uses the same `Intl.NumberFormat` logic.
- **RFC-0730 (Presentation elimination).** Price display routes through canonical references. The projection provides the display data.
- **RFC-0740 (Derived Price Materialization).** This RFC projects the materialized prices.

## Design

### CLI surface

No new CLI command. The projection is built as part of the existing compiler Phase 12 (Projection) in `packages/pbp/src/compiler/projection.ts`, extended to call `buildPriceProjection` for each materialized derived price and attach `priceProjections` / `priceTraces` to the respective projection types.

### TypeScript contracts

```ts
// packages/pbp/src/projections/price-projection.ts

export interface PbpPriceDisplayConfig {
  showSourcePrice: boolean;
  showRate: boolean;
  showRateDateNearPrice: boolean;
  note: string | null;
}

export interface PbpPriceProjection {
  amount: {
    value: string;
    currency: string;
    formatted: string;
  };
  priceKind: PbpPriceKind;
  commercialMeaning: PbpCommercialMeaning;
  display: PbpPriceDisplayConfig;
  allowedUses: PbpCurrentUses;
  rate: {
    value: string;
    pair: string;
    formatted: string;
  };
}

export function buildPriceProjection(
  materialized: PbpMaterializedDerivedPrice,
  locale: string,
): PbpPriceProjection | null;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/projections/price-projection.ts` | `PbpPriceProjection`, `PbpPriceDisplayConfig`, `buildPriceProjection` |
| `packages/pbp/src/projections/website.ts` | Extended with `priceProjections` field |
| `packages/pbp/src/projections/ai-answer.ts` | Extended with `priceTraces` field |
| `packages/pbp/src/index.ts` | Re-exports |
| `packages/pbp/AGENTS.md` | API surface section updated with new types |
| `docs/technology.xml` | Synchronized if projection types are declared in the technology Compass |

### Output format

Example `PbpPriceProjection` JSON:

```json
{
  "amount": {
    "value": "3239.00",
    "currency": "UAH",
    "formatted": "3\u00A0239\u00A0₴"
  },
  "priceKind": "derived",
  "commercialMeaning": "derived-price",
  "display": {
    "showSourcePrice": false,
    "showRate": true,
    "showRateDateNearPrice": false,
    "note": "Ціна розрахована за курсом 1 EUR = 46,18 UAH."
  },
  "allowedUses": {
    "presentation": true,
    "aiAnswers": true,
    "quote": false,
    "contract": false,
    "invoice": false,
    "settlement": false
  },
  "rate": {
    "value": "46.18",
    "pair": "EUR/UAH",
    "formatted": "1 EUR = 46,18 UAH"
  }
}
```

### Failure modes

- **No materialized price for a target currency.** The projection does not include that currency. The UI shows the source-currency price for that currency.
- **`allowedUses.presentation: false`.** The projection returns `null`. The price is not included in the website projection.
- **Formatting failure.** If `Intl.NumberFormat` fails for the currency/locale, the projection falls back to `{value} {currency}` format.
- **Unsupported locale.** If the `locale` parameter is not a site-supported locale, `Intl.NumberFormat` falls back to the runtime default. The projection builder validates `locale` against the site's supported locales and falls back to the site's default locale if unsupported.

## Rollout

- **Immediate:** Upon acceptance, projection types and `buildPriceProjection` are added.
- **Integration:** Compiler Phase 12 (Projection) is extended to call `buildPriceProjection` for each materialized derived price.
- **Consumer adoption:** Existing projection consumers (website components, AI answer generators) check for `priceProjections` / `priceTraces` presence (`!== undefined`). When absent, they render the source-currency price as before. No consumer changes are required for sites without `multi-currency` entitlement.
- **No backward compatibility:** The projection is extended. Existing fields are unchanged.
- **Compass sync:** `docs/technology.xml` is updated if projection types are declared in the technology Compass. `packages/pbp/AGENTS.md` API surface section is updated with the new exported types.

## Alternatives considered

- **Let the UI format prices.** Pass raw materialized prices to the UI and let components format them. Rejected: the research document specifies the UI receives a ready-to-display projection. Formatting logic in components creates duplication and inconsistency.

- **No disclosure note in projection.** Let the UI compose the note. Rejected: the note depends on `commercialMeaning` and locale. Composing it in the projection ensures consistency and localization.

- **Include source price in projection.** Show both source and derived prices. Rejected: decision #31 explicitly says "do NOT show source EUR price alongside derived price."

## Risks

- **Localization of disclosure notes.** Notes must be localized per language. Mitigation: the projection builder accepts a `locale` parameter and selects the note template accordingly. Note templates are defined in the projection builder, not in content.

- **Projection size.** Adding `priceProjections` for every Offering × every target currency × every locale increases the projection size. Mitigation: for the current site (6 Offerings × 2 currencies × 2 locales = 24 projections), this is negligible.

## Acceptance criteria

- [ ] `PbpPriceProjection` interface exported from `@warpgogol/pbp`
- [ ] `PbpPriceDisplayConfig` interface exported
- [ ] `buildPriceProjection` function exported
- [ ] Website Projection includes `priceProjections` when multi-currency entitled
- [ ] AI Answer Projection includes `priceTraces` when multi-currency entitled
- [ ] `allowedUses` enforcement prevents projection when `false`
- [ ] Display config follows decisions #29, #31, #32, #33, #34
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The UI receives the `PbpPriceProjection` and does NOT compute, format, or compose notes. It renders the projection as-is.
- `showSourcePrice` MUST be `false` (RFC-0735 decision #31). Do not show the EUR price alongside the derived price.
- `showRateDateNearPrice` MUST be `false` (RFC-0735 decision #34). The rate date is available in the trace for AI agents, not shown near the price.
- No `≈` symbol in notes (RFC-0735 decision #33). Use plain text.
- Disclosure notes MUST use the templates defined in §3 for the site locales (UK, DE). Do not invent new note text.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
