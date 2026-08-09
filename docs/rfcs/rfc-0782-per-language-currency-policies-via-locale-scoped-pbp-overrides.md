---
id: RFC-0782
title: "Per-language currency policies via locale-scoped PBP overrides"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-09
updatedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-11
  - DNA-4
  - RFC-0743
  - RFC-0736
  - RFC-0781
satisfies:
  - DNA-11
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - werkstatt-site
successSignals:
  - "DE locale shows EUR-only pricing (no currency selector)"
  - "UK locale shows EUR + UAH currency selector with per-language currency policy"
  - "localStorage key wg-currency:{lang} isolates currency choice per language"
  - "loadTargetCurrencies returns locale-specific currency list after deep-merge"
nonGoals:
  - "Adding new currency types or rate sources"
  - "Changing the currency selector UI design"
  - "Modifying rate-policies or rate-schedules structure"
  - "Server-side currency detection (we remain client-side only)"
# acceptance:
#   - probe: run
#     command: "pnpm --filter werkstatt-site exec vitest run src/domain/pbp/__tests__/load-target-currencies.test.ts"
#     expect:
#       exitCode: 0
#   - probe: run
#     command: "pnpm --filter werkstatt-site exec vitest run src/domain/ui/components/currency-selector/__tests__/currency-selector-locale.test.ts"
#     expect:
#       exitCode: 0
---

# RFC-0782: Per-language currency policies via locale-scoped PBP overrides

## Context

The warpgogol-com site supports two languages: German (`de`, default) and Ukrainian (`uk`). The site has a currency selector (RFC-0743) that allows visitors to switch between currencies. The selector is rendered in the header component and controlled by client-side localStorage.

**Current behavior**: The currency selector is shown only on non-default-language pages (`activeLang !== defaultLang`, see `header-component.astro:111`). The available currencies are loaded by `loadTargetCurrencies` which calls `compilePbpProfile` and reads the `currency-pricing-policy` entity from the resolved entity index.

**Problem**: The PBP compiler (before RFC-0781) cannot handle per-language currency policies. If a `currency-pricing-policy/default.md` exists in both `de/` and `uk/` with the same entity ID, the compiler flags the second as a fatal duplicate. This means the site cannot have different currency policies per language — German visitors always see the same currency list as Ukrainian visitors.

**Desired behavior**: German visitors see EUR-only pricing (no currency selector needed). Ukrainian visitors see EUR + UAH with the currency selector. This requires:
1. A `currency-pricing-policy/default.md` in `de/` with only EUR (base currency, no target currencies)
2. A `currency-pricing-policy/default.md` in `uk/` with EUR base + UAH target
3. The PBP compiler (fixed by RFC-0781) deep-merges the UK overlay onto the DE base
4. `loadTargetCurrencies` returns the locale-specific currency list
5. The currency selector localStorage key is scoped per language to prevent cross-language leakage

## Problem

### Currency selector shows on all non-default-language pages

`header-component.astro:111` renders the currency selector when `currencies.length > 0 && activeLang !== defaultLang`. This means any non-default language gets the selector, regardless of whether that locale actually has multiple currencies.

### `loadTargetCurrencies` is locale-blind

`loadTargetCurrencies` in `@/packages/werkstatt-site/src/domain/pbp/semantic-profile.ts:36-61` calls `compilePbpProfile` with the current `locale` parameter. However, before RFC-0781, the compiler's `buildEntityIndex` dedupes by entity ID across all locales — so only one `currency-pricing-policy` entity survives. The function returns the same currency list for all locales.

### localStorage key is not language-scoped

The currency selector stores the visitor's choice in `localStorage` under the key `wg-currency` (see `currency-selector-component.client.ts:17`). If a visitor switches to UK and selects UAH, then switches to DE, the `wg-currency: UAH` value persists. The DE header's inline script (`header-component.astro:124`) reads `wg-currency` and sets `data-wg-currency` on `<html>` — but DE doesn't have UAH price variants, so the price display shows nothing or falls back incorrectly.

### No per-language currency-pricing-policy in UK

The `currency-pricing-policies/` directory exists only in `de/`. There is no `uk/currency-pricing-policies/default.md`. Even after RFC-0781 fixes the compiler, there is no UK overlay to merge.

## Decision

The site gains per-language currency policies through locale-scoped PBP overrides and a locale-scoped localStorage key.

### Part 1: UK currency-pricing-policy overlay

A `uk/currency-pricing-policies/default.md` file is created with the same entity ID as the DE version. It declares EUR as base currency and UAH as a target currency. After RFC-0781's deep-merge, the UK locale gets the merged policy with both EUR and UAH.

### Part 2: DE currency-pricing-policy — EUR-only base

The existing `de/currency-pricing-policies/default.md` keeps EUR as base currency and UAH as target. The currency selector visibility logic changes: instead of `activeLang !== defaultLang`, the selector is shown when `currencies.length > 1` (more than just the base currency).

### Part 3: Locale-scoped localStorage key

The localStorage key changes from `wg-currency` to `wg-currency:{lang}`. This isolates currency choices per language. A visitor on `/uk/` with UAH selected does not affect the `/de/` experience.

### Part 4: `loadTargetCurrencies` — locale-aware resolution

`loadTargetCurrencies` already passes `locale` to `compilePbpProfile`. After RFC-0781, the compiler returns the correct locale-merged entity. No change needed to `loadTargetCurrencies` itself — it already iterates `result.entityIndex.values()` and finds the merged `currency-pricing-policy` entity. The function is verified to work correctly with the post-RFC-0781 compiler.

## Architectural fit

- **DNA-11 (Language mirroring)**: This RFC implements per-language currency policies — the exact use case that DNA-11's language mirroring supports. Each locale can have its own currency policy overlay.
- **DNA-4 (Canonical content in `src/content/`)**: Currency policies remain in `src/content/business-profile/{lang}/currency-pricing-policies/`. No hardcoded currency lists in components or routes.
- **RFC-0743 (Currency selector)**: This RFC extends the currency selector with locale-scoped storage. The component contract (props, events) is unchanged.
- **RFC-0736 (Currency pricing policy schema)**: No schema changes. The existing `pbpCurrencyPricingPolicySchema` supports the overlay pattern — UK overlay adds `targetCurrencies.uah` which merges onto the DE base.
- **RFC-0781 (PBP compiler locale-aware index)**: This RFC depends on RFC-0781. The compiler fix enables per-language entities with the same ID to coexist and deep-merge.

## Design

### Part 1: UK currency-pricing-policy overlay

```yaml
# uk/currency-pricing-policies/default.md
---
schema: "pbp/currency-pricing-policy@1"
id: "https://warpgogol.com/id/currency-pricing-policy/default"
type: "currency-pricing-policy"
status: "published"
name: "Multi-Currency Pricing Policy"
businessRef:
  ref: "https://warpgogol.com/id/business"
  expectedType: "business"
baseCurrency: "EUR"
targetCurrencies:
  uah:
    currency: "UAH"
    strategy: "derived"
    derivationContractRef:
      ref: "pbp-derivation:currency-conversion/1"
    ratePolicyRef:
      ref: "https://warpgogol.com/id/rate-policies/eur-uah"
      expectedType: "rate-policy"
    pipelineOverride:
      rounding:
        mode: "ceiling"
        increment: "100"
    currentUses:
      presentation: true
      aiAnswers: true
      quote: false
      contract: false
      invoice: false
      settlement: false
governance:
  authorityRef: "https://warpgogol.com/id/business"
  effectiveFrom: "2026-08-07"
  reviewEvery: "P1M"
  maintenanceOwnerRef: "https://warpgogol.com/id/business"
---
```

This is structurally identical to the DE version. The deep-merge (RFC-0781) will produce the same result for UK. If in the future the UK policy should differ (e.g. different rounding), the overlay can override specific fields.

### Part 2: Currency selector visibility

`header-component.astro:111` changes from:

```astro
currencies.length > 0 && activeLang !== defaultLang
```

to:

```astro
currencies.length > 1
```

This shows the selector only when there are multiple currencies available, regardless of language. DE (EUR-only) won't show the selector. UK (EUR + UAH) will show it.

### Part 3: Locale-scoped localStorage key

`currency-selector-component.client.ts` changes:

```ts
// Before
export const CURRENCY_STORAGE_KEY = "wg-currency";

// After
export const CURRENCY_STORAGE_KEY_PREFIX = "wg-currency";

export function getCurrencyStorageKey(lang: string): string {
  return `${CURRENCY_STORAGE_KEY_PREFIX}:${lang}`;
}

export function getSelectedCurrency(lang: string): string | null {
  try {
    return localStorage.getItem(getCurrencyStorageKey(lang));
  } catch {
    return null;
  }
}

export function setSelectedCurrency(currency: string, lang: string): void {
  try {
    localStorage.setItem(getCurrencyStorageKey(lang), currency);
  } catch {
    // localStorage unavailable — silently ignore
  }
}
```

The `initCurrencySelector` function gains a `lang` parameter:

```ts
export function initCurrencySelector(
  container: HTMLElement,
  currencies: string[],
  lang: string,
): void {
  // ... uses getSelectedCurrency(lang) and setSelectedCurrency(currency, lang)
}
```

The inline script in `currency-selector-component.astro` and `header-component.astro` also changes to use the locale-scoped key.

### Part 4: `loadTargetCurrencies` — no change needed

`loadTargetCurrencies` already passes `locale` to `compilePbpProfile`. After RFC-0781, the compiler returns the locale-merged entity index. The function iterates `result.entityIndex.values()`, finds the `currency-pricing-policy` entity, and returns the currency list. This works correctly with the post-RFC-0781 compiler.

### Part 5: Inline scripts — locale-scoped key

The inline script in `header-component.astro:122-130` changes:

```html
<script is:inline define:vars={{ defaultCurrency: currencies[0]?.code ?? "EUR", lang: activeLang }}>
  try {
    var key = "wg-currency:" + lang;
    var c = localStorage.getItem(key);
    if (!c) { c = defaultCurrency; localStorage.setItem(key, c); }
    document.documentElement.setAttribute("data-wg-currency", c);
  } catch {
    document.documentElement.setAttribute("data-wg-currency", defaultCurrency);
  }
</script>
```

The inline script in `currency-selector-component.astro:56-75` changes similarly to use the locale-scoped key.

### File system responsibilities

| Path | Role |
|------|------|
| `missions/.../src/content/business-profile/uk/currency-pricing-policies/default.md` | Created: UK currency policy overlay |
| `packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.ts` | Modified: locale-scoped localStorage key |
| `packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.astro` | Modified: pass `lang` to `initCurrencySelector`, update inline script |
| `packages/werkstatt-site/src/domain/ui/components/header/header-component.astro` | Modified: selector visibility `currencies.length > 1`, inline script locale-scoped key |
| `packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.client.ts` | Modified: `getSelectedCurrency` now requires `lang` parameter |
| `packages/werkstatt-site/src/domain/pbp/__tests__/load-target-currencies.test.ts` | Modified: add locale-aware currency list test |

### Failure modes

- **No `currency-pricing-policy` entity for locale**: `loadTargetCurrencies` returns `[]` (empty array). The header renders without a currency selector. This is the current behavior and remains unchanged.
- **localStorage unavailable**: `getSelectedCurrency` returns `null`, `setSelectedCurrency` silently ignores. The inline script falls back to `defaultCurrency`. This is the current behavior, now per-language.
- **Visitor switches language**: Each language has its own localStorage key. Switching from `/uk/` to `/de/` reads `wg-currency:de` (not `wg-currency:uk`). No cross-language leakage.
- **Old `wg-currency` key in localStorage**: Existing visitors have `wg-currency` from the old implementation. The new code does not read this key. The old value is ignored — the visitor gets the default currency for the current language. No migration needed (the old key is harmless dead data).

## Rollout

- **Depends on RFC-0781**: This RFC cannot be implemented until RFC-0781 is implemented. The compiler must support locale-aware entity indexing and deep-merge before per-language currency policies can work.
- **No backward compatibility for localStorage**: The old `wg-currency` key is abandoned. Existing visitors lose their currency selection on first visit after deployment. This is acceptable — the selection is re-initialized to the default currency for the current language.
- **No CLI surface change**: No new commands. The currency selector component contract (props) gains a `lang` parameter — this is a breaking change for the component's internal API, but the Astro component already receives `lang` as a prop.
- **DE visitors**: After deployment, DE pages show no currency selector (EUR-only). This is the correct behavior — German visitors see EUR prices directly.
- **UK visitors**: After deployment, UK pages show the currency selector with EUR + UAH. The visitor's selection persists in `wg-currency:uk`.

## Alternatives considered

- **Show currency selector on all languages**: Rejected — German visitors don't need currency selection. EUR is the only relevant currency for the German market. Showing a selector with one option is confusing.
- **Keep `wg-currency` key, reset on language switch**: Rejected — requires a language-change event listener and explicit cleanup. Locale-scoped keys are simpler and more robust.
- **Server-side currency detection**: Rejected — the site is statically generated. Currency selection is a client-side concern (localStorage + custom events). No server roundtrip.
- **Separate currency-pricing-policy IDs per locale**: Rejected — breaks referential integrity. Other entities reference `currency-pricing-policy/default` by ID. Locale-specific IDs would require duplicate refs everywhere. RFC-0781's deep-merge approach is the correct solution.

## Risks

- **RFC-0781 dependency**: If RFC-0781 is not implemented first, the UK currency-pricing-policy overlay will cause a `PBP-ID-DUPLICATE` fatal error. Implementation order is enforced by the RFC dependency.
- **Inline script duplication**: The inline script in `header-component.astro` and `currency-selector-component.astro` both read localStorage. They must use the same locale-scoped key. Risk of divergence if one is updated and the other is not. Mitigation: both read from `getCurrencyStorageKey(lang)` pattern — the inline scripts are kept minimal and mirror each other.
- **`getSelectedCurrency` API change**: The function now requires a `lang` parameter. All callers must be updated. Audit: `currency-selector-component.client.ts`, `currency-aware-price-display-component.client.ts`, and the inline scripts. All have access to `lang` via props or `data-lang` attribute.
- **DE currency-pricing-policy has UAH target**: The existing DE policy already has `targetCurrencies.uah`. After this RFC, DE visitors should not see UAH. The visibility change (`currencies.length > 1`) handles this — but `loadTargetCurrencies` for DE will still return `[EUR, UAH]`. The selector won't be shown (length > 1 is true, but the condition is `currencies.length > 1` which would show it). **Correction**: The DE policy must be changed to remove `targetCurrencies` so `loadTargetCurrencies` returns `[EUR]` only. This is Part 2b.

### Part 2b: DE currency-pricing-policy — remove UAH target

The existing `de/currency-pricing-policies/default.md` has `targetCurrencies.uah`. This must be removed so that DE visitors get `[EUR]` only (no currency selector). The UK overlay adds UAH back via deep-merge.

```yaml
# de/currency-pricing-policies/default.md (modified)
---
schema: "pbp/currency-pricing-policy@1"
id: "https://warpgogol.com/id/currency-pricing-policy/default"
type: "currency-pricing-policy"
status: "published"
name: "Multi-Currency Pricing Policy"
businessRef:
  ref: "https://warpgogol.com/id/business"
  expectedType: "business"
baseCurrency: "EUR"
targetCurrencies: {}
governance:
  authorityRef: "https://warpgogol.com/id/business"
  effectiveFrom: "2026-08-07"
  reviewEvery: "P1M"
  maintenanceOwnerRef: "https://warpgogol.com/id/business"
---
```

Wait — the `pbpCurrencyPricingPolicySchema` requires `targetCurrencies` to have at least one entry (`.refine((val) => Object.keys(val).length >= 1)`). An empty `targetCurrencies: {}` will fail validation.

**Revised approach**: The DE policy keeps `targetCurrencies.uah` (for schema compliance). The currency selector visibility is controlled by the header component: `currencies.length > 1 && activeLang !== defaultLang`. This preserves the current visibility logic — DE never shows the selector, UK does. The locale-scoped localStorage key still prevents cross-language leakage.

Actually, the simplest approach is to keep the current visibility condition (`activeLang !== defaultLang`) and only add the locale-scoped localStorage key + UK overlay. This minimizes changes.

**Final decision**: Keep `activeLang !== defaultLang` visibility condition. Add UK overlay + locale-scoped localStorage. DE visitors never see the selector. UK visitors see it. The locale-scoped key prevents leakage.

## Acceptance criteria

- [ ] `uk/currency-pricing-policies/default.md` created with EUR base + UAH target
- [ ] UK currency-pricing-policy passes Zod validation
- [ ] `loadTargetCurrencies` returns `[EUR, UAH]` for UK locale after RFC-0781 deep-merge
- [ ] `loadTargetCurrencies` returns `[EUR, UAH]` for DE locale (unchanged — DE policy already has UAH)
- [ ] `CURRENCY_STORAGE_KEY` changed from `wg-currency` to `wg-currency:{lang}` pattern
- [ ] `getSelectedCurrency(lang)` and `setSelectedCurrency(currency, lang)` accept `lang` parameter
- [ ] `initCurrencySelector` accepts `lang` parameter
- [ ] `currency-selector-component.astro` passes `lang` to `initCurrencySelector`
- [ ] `header-component.astro` inline script uses locale-scoped localStorage key
- [ ] `currency-selector-component.astro` inline script uses locale-scoped localStorage key
- [ ] `currency-aware-price-display-component.client.ts` uses `getSelectedCurrency(lang)`
- [ ] Unit test: `loadTargetCurrencies` returns locale-specific currency list
- [ ] Unit test: `getCurrencyStorageKey` produces `wg-currency:de` for `de`, `wg-currency:uk` for `uk`
- [ ] Unit test: `getSelectedCurrency` and `setSelectedCurrency` use correct locale-scoped key
- [ ] `pnpm --filter werkstatt-site exec vitest run` passes all currency-related tests
- [ ] `pnpm --filter werkstatt-site run build:check` passes (tsc --noEmit)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0782` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0782 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Implementation order**: RFC-0781 must be implemented and stamped before this RFC. The UK currency-pricing-policy overlay will cause a fatal `PBP-ID-DUPLICATE` error without RFC-0781's locale-aware index.
- The `lang` parameter for `getSelectedCurrency`/`setSelectedCurrency` is required, not optional. All callers must provide it. The inline scripts in `.astro` files receive `lang` via `define:vars`.
- The old `wg-currency` localStorage key is not migrated. Existing visitors get the default currency on first visit after deployment. This is intentional — the old key is harmless dead data.
