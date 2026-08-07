---
id: RFC-0743
title: "Currency Selector UI Component"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
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
  - DNA-5
  - DNA-17
  - RFC-0735
  - RFC-0742
satisfies:
  - DNA-5
  - DNA-17
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/ui"
  - "@warpgogol/share"
  - "@warpgogol/ontology"
  - "@warpgogol/pbp"
successSignals:
  - "currency-selector component renders available target currencies"
  - "User selection persists across page loads"
  - "Price display components read selected currency from projection"
  - "Component only renders when multi-currency entitled"
  - "Component manifests follow Mirror Quintet contract (DNA-17)"
  - "Cosmic names registered in MoonCatalog and MOON_IMPORT_PATHS"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not define the price projection — that is RFC-0742"
  - "Does not define the build pipeline — that is RFC-0741"
  - "Does not implement currency conversion at runtime — all prices are pre-materialized"
  - "Does not add new routes — the selector enriches existing pages"
---

# RFC-0743: Currency Selector UI Component

## Context

RFC-0742 defines the price projection that the UI consumes. This RFC defines the currency selector component that lets visitors choose their preferred display currency, and the extension of price display components to show derived prices.

The research document specifies:

- The UI receives a ready-to-display Price Projection (RFC-0742)
- The user selects a currency via a selector
- The selection persists across page loads
- The price display shows the selected currency's projection
- No source EUR price shown alongside (decision #31)
- Brief explanation note, no `≈` (decisions #32, #33)
- No rate date near price (decision #34)

## Problem

1. **No currency selector.** There is no UI component for visitors to choose their preferred display currency.

2. **No currency persistence.** There is no mechanism to persist the user's currency selection across page loads.

3. **No currency-aware price display.** Existing price display components show source-currency prices only. They do not read the price projection for the selected currency.

4. **No entitlement gate on UI.** The currency selector must only render when `multi-currency` is entitled. Without a gate, the selector would render for non-entitled sites.

## Decision

### 1. `currency-selector` component

A UI component in `packages/ui/src/components/currency-selector/` that:

- Reads available target currencies from the compiled CurrencyPricingPolicy projection
- Renders a dropdown or button group for currency selection
- Persists selection via `localStorage` key `wg-currency`
- Dispatches a `wg-currency-change` CustomEvent that price display components listen to
- Only renders when `multi-currency` is entitled

### 2. `currency-aware-price-display` component

A UI component (or extension of existing price display) that:

- Reads the selected currency from `localStorage` (or default)
- Reads the `PbpPriceProjection` for the selected currency from the page's projection data
- Renders the formatted amount
- Renders the disclosure note from `display.note`
- Does NOT show the source EUR price alongside the derived price (decision #31)
- Does NOT show the rate date near the price (decision #34)
- Falls back to source-currency price if no projection exists for the selected currency (source price shown alone, not alongside derived — consistent with decision #31)

### 3. Mirror Quintet compliance

Both components follow the Mirror Quintet contract (DNA-17):

- `.astro` component file
- `<slug>-component.manifest.yaml` with `id`, `uniName`, `layer`, `semanticId`, `archetype`, `cosmicName`, `role`, `version`, `intent[]`, `industryFit[]`, `contentSchemaKey`, `contentTypesPath`, `propsSchema`
- Content schema in `@warpgogol/ontology` (referenced via `contentSchemaKey`)
- Colocated `.css` file using `--ds-*` tokens only (DNA-10)
- Content `.md` file (for selector labels and translations)

Cosmic names for both components are drawn from `MoonCatalog` in `@warpgogol/ontology`. The chosen names MUST be registered in `MOON_IMPORT_PATHS` in `packages/share/src/page.ts` in the same change that adds the components.

### 4. Client-side behavior

The currency selector uses a small client-side script (`currency-selector-component.client.ts`) that:

- Reads `localStorage.getItem("wg-currency")` on load
- Sets the initial selected currency
- On change, writes `localStorage.setItem("wg-currency", currency)`
- Dispatches `window.dispatchEvent(new CustomEvent("wg-currency-change", { detail: { currency } }))`

The `currency-aware-price-display` component uses its own client-side script (`currency-aware-price-display-component.client.ts`) that:

- Listens for `wg-currency-change` events
- Swaps the displayed price by toggling `hidden` on pre-rendered currency variants
- Each currency variant is rendered server-side in the `.astro` component with `data-currency` attributes; the client script shows the selected variant and hides all others

Each `currency-aware-price-display` instance independently listens for the event — no shared controller. This follows the established pattern of self-contained component scripts (e.g. `donation-card-component.client.ts`).

This follows DNA-15 (scripts follow placement contract) — both scripts are bounded feature-scoped `*.client.ts` files colocated with their components.

### 5. Server-side rendering

For SSR/SSG, the initial price display uses the default target currency (first in CurrencyPricingPolicy) or the source currency if no target currencies are configured. The client-side script enhances the experience by allowing switching without a page reload.

Since prices are pre-materialized (RFC-0740), all currency variants are available in the page data. Switching currencies is a client-side data swap — no network request.

**Data flow:** The route registry (RFC-0741) enriches offering page routes with `priceProjections` data when `multi-currency` is entitled. The page route passes projection data as props to sections, which pass it to `currency-aware-price-display` components. Each component pre-renders all currency variants in HTML; the client script toggles visibility on currency change.

### 6. Entitlement gate

The component checks entitlement at build time:

- If `multi-currency` is entitled, the component is included in the page
- If not entitled, the component is not rendered

This is enforced by the route registry (RFC-0741) which only includes projection data when entitled.

### 7. Placement

The currency selector is placed in the site header, next to the `lang-switcher` component. This co-locates the two visitor-facing selectors (language and currency) in a single header area. On mobile, the selector renders as a compact dropdown matching the lang-switcher's mobile pattern.

### 8. Accessibility

- The selector is a `<select>` element with an accessible label
- The disclosure note is an `aria-live="polite"` region that updates when currency changes
- The price display container has `aria-live="polite"` so screen readers announce price changes when currency is switched
- The price display has `aria-label` with the full amount and currency name

## Architectural fit

- **DNA-5 (Component ↔ content ↔ schema mirror).** Each component ships with `.astro`, `<slug>-component.manifest.yaml`, content schema in `@warpgogol/ontology`, `.css`, and content `.md`.
- **DNA-17 (Uni manifest contract).** `<slug>-component.manifest.yaml` declares `id`, `uniName`, `layer`, `semanticId`, `archetype`, `cosmicName`, `role`, `version`, `intent[]`, `industryFit[]`, `contentSchemaKey`, `contentTypesPath`, `propsSchema`. Cosmic names are drawn from `MoonCatalog` in `@warpgogol/ontology` and registered in `MOON_IMPORT_PATHS` in `@warpgogol/share/src/page.ts`.
- **DNA-15 (Scripts follow placement contract).** Both client scripts are bounded `*.client.ts` files colocated with their components.
- **DNA-10 (No hardcoded design tokens).** Component `.css` files use `--ds-*` custom properties only.
- **RFC-0742 (Price Projection).** The `currency-aware-price-display` component consumes `PbpPriceProjection` from `@warpgogol/pbp`.

## Design

### CLI surface

No CLI command. UI component only.

### TypeScript contracts

```ts
// packages/ui/src/components/currency-selector/currency-selector.types.ts

export interface CurrencySelectorContent {
  label: string;
  currencies: Array<{
    code: string;
    label: string;
  }>;
}
```

```ts
// packages/ui/src/components/currency-selector/currency-selector-component.client.ts

export const CURRENCY_STORAGE_KEY = "wg-currency";
export const CURRENCY_CHANGE_EVENT = "wg-currency-change";

export function getSelectedCurrency(): string | null;
export function setSelectedCurrency(currency: string): void;
export function dispatchCurrencyChange(currency: string): void;
```

```ts
// packages/ui/src/components/currency-aware-price-display/currency-aware-price-display.types.ts

export interface CurrencyAwarePriceDisplayContent {
  /** Pre-rendered price variants keyed by currency code */
  priceVariants: Array<{
    currency: string;
    formatted: string;
    note: string | null;
  }>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/components/currency-selector/currency-selector.astro` | Selector component |
| `packages/ui/src/components/currency-selector/currency-selector.css` | Selector styles (`--ds-*` tokens only) |
| `packages/ui/src/components/currency-selector/currency-selector-component.manifest.yaml` | Mirror Quintet manifest |
| `packages/ui/src/components/currency-selector/currency-selector-component.client.ts` | Client-side selector behavior |
| `packages/ui/src/components/currency-selector/currency-selector.types.ts` | Content type definitions |
| `packages/ui/src/components/currency-selector/currency-selector.md` | Content template (labels, translations) |
| `packages/ui/src/components/currency-aware-price-display/currency-aware-price-display.astro` | Price display component |
| `packages/ui/src/components/currency-aware-price-display/currency-aware-price-display.css` | Price display styles (`--ds-*` tokens only) |
| `packages/ui/src/components/currency-aware-price-display/currency-aware-price-display-component.manifest.yaml` | Mirror Quintet manifest |
| `packages/ui/src/components/currency-aware-price-display/currency-aware-price-display-component.client.ts` | Client-side price swap behavior |
| `packages/ui/src/components/currency-aware-price-display/currency-aware-price-display.types.ts` | Content type definitions |
| `packages/ui/src/components/currency-aware-price-display/currency-aware-price-display.md` | Content template |
| `packages/ontology/src/moon-catalog.yaml` | New cosmic names added to MoonCatalog |
| `packages/share/src/page.ts` | `MOON_IMPORT_PATHS` registration for both components |

### Output format

N/A — UI component.

### Failure modes

- **No projection data.** If the page has no `priceProjections`, the selector does not render and prices show in source currency.
- **`localStorage` unavailable.** The selector defaults to the first target currency. No error.
- **Unknown currency in `localStorage`.** The selector ignores it and defaults to the first target currency.

## Rollout

- **Immediate:** Upon acceptance, components are added to `@warpgogol/ui`.
- **Site integration:** warpgogol-com includes the selector in its header and uses the price display component on offering pages.
- **No backward compatibility:** The `currency-aware-price-display` component is a new component that complements the existing `price-card` section. It does not replace `price-card` — it enriches price display with currency-awareness when `multi-currency` is entitled. Sites without the entitlement continue using `price-card` as-is.

## Alternatives considered

- **URL parameter for currency.** Use `?currency=UAH` instead of `localStorage`. Rejected: URL params require page reloads and complicate SEO. `localStorage` allows instant switching. URL params can be added as a future enhancement for shareable links.

- **Cookie for currency.** Use a cookie instead of `localStorage`. Rejected: cookies are sent with every request, adding overhead. `localStorage` is client-side only. Cookies can be added as a future enhancement for server-side rendering of the selected currency.

- **Server-side currency detection.** Detect currency from `Accept-Language` header. Rejected: language does not determine currency (e.g. a German speaker in Ukraine wants UAH). The selector gives the user explicit control.

## Risks

- **Flash of source currency (FOUC).** On initial page load, the server renders the default currency. If the user has a different currency in `localStorage`, the client script switches it, causing a brief flash. Mitigation: the selector's `currency-selector-component.client.ts` runs on `DOMContentLoaded` and dispatches the initial currency before first paint where possible. The `currency-aware-price-display` component pre-renders all variants with `hidden` attributes; the client script un-hides the correct variant immediately.

- **SEO impact.** Search engines see the default currency. This is intentional — Schema.org output (RFC-0745) emits business-declared prices only. The selector is a client-side enhancement.

- **Component maintenance.** Two new components add maintenance burden. Mitigation: the components are small and focused. The price display component is a thin wrapper around the projection data.

## Acceptance criteria

- [ ] `currency-selector` component renders available target currencies
- [ ] `currency-selector` persists selection in `localStorage`
- [ ] `currency-selector` dispatches `wg-currency-change` event
- [ ] `currency-aware-price-display` reads projection for selected currency
- [ ] `currency-aware-price-display` renders formatted amount and disclosure note
- [ ] `currency-aware-price-display` does NOT show source EUR price
- [ ] Both components have `<slug>-component.manifest.yaml` following Mirror Quintet (DNA-17) with all required fields
- [ ] Components only render when `multi-currency` is entitled
- [ ] Client script follows DNA-15 placement contract
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Both components MUST have `<slug>-component.manifest.yaml` following the Mirror Quintet contract (DNA-17) with all required fields: `id`, `uniName`, `layer`, `semanticId`, `archetype`, `cosmicName`, `role`, `version`, `intent[]`, `industryFit[]`, `contentSchemaKey`, `contentTypesPath`, `propsSchema`.
- Both components MUST have a colocated `.css` file using `--ds-*` tokens only (DNA-10, DNA-17).
- Cosmic names MUST be drawn from `MoonCatalog` in `@warpgogol/ontology` and registered in `MOON_IMPORT_PATHS` in `packages/share/src/page.ts` in the same change.
- Both client scripts MUST be bounded `*.client.ts` files under their component directories (DNA-15).
- Never show the source EUR price alongside the derived price (decision #31).
- Never use `≈` in the disclosure note (decision #33).
- The disclosure note comes from the projection's `display.note` field — do not compose it in the component.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
