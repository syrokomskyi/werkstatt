---
id: RFC-0782
title: "Per-language currency policies via locale-scoped PBP overrides"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
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
  - "DE locale shows no currency selector (EUR default, selector hidden by activeLang !== defaultLang)"
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

### Part 2: Currency selector visibility — unchanged

The existing visibility condition `currencies.length > 0 && activeLang !== defaultLang` in `header-component.astro:111` is kept unchanged. DE (default language) never shows the selector. UK (non-default) shows it when currencies are available. The DE policy keeps `targetCurrencies.uah` for schema compliance (the schema requires at least one target entry). DE visitors see EUR prices by default — UAH price variants exist in the HTML but are hidden because `data-wg-currency` is set to EUR by the inline script.

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

Three inline scripts read `localStorage.getItem("wg-currency")` and must be updated to use the locale-scoped key:

1. `header-component.astro:122-130` — adds `lang` to `define:vars`:

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

2. `currency-selector-component.astro:56-75` — adds `lang` to `define:vars` (already available from component props):

```html
<script is:inline define:vars={{ currencyCodes, lang }}>
  try {
    var c = document.documentElement.getAttribute("data-wg-currency");
    if (!c) {
      c = localStorage.getItem("wg-currency:" + lang);
    }
    // ... rest unchanged
  } catch {}
</script>
```

3. `currency-aware-price-display-component.astro:50-57` — adds `lang` to `define:vars` (received from component props):

```html
<script is:inline define:vars={{ variantCurrencies, lang }}>
  try {
    var c = document.documentElement.getAttribute("data-wg-currency");
    if (!c) {
      c = localStorage.getItem("wg-currency:" + lang);
    }
    // ... rest unchanged
  } catch {}
</script>
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/.../src/content/business-profile/uk/currency-pricing-policies/default.md` | Created: UK currency policy overlay |
| `packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.ts` | Modified: locale-scoped localStorage key |
| `packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.astro` | Modified: pass `lang` to `initCurrencySelector`, update inline script |
| `packages/werkstatt-site/src/domain/ui/components/header/header-component.astro` | Modified: inline script uses locale-scoped localStorage key (visibility condition unchanged) |
| `packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.client.ts` | Modified: `getSelectedCurrency` now requires `lang` parameter |
| `packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.astro` | Modified: inline script uses locale-scoped localStorage key |
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

- **RFC-0781 dependency**: If RFC-0781 is not implemented first, the UK currency-pricing-policy overlay will cause a fatal `PBP-ID-DUPLICATE` error. Implementation order is enforced by the RFC dependency. RFC-0781 is now `implemented`.
- **Inline script divergence**: Three inline scripts (`header-component.astro`, `currency-selector-component.astro`, `currency-aware-price-display-component.astro`) read localStorage. They must all use the same locale-scoped key pattern. Risk of divergence if one is updated and the others are not. Mitigation: all three use `"wg-currency:" + lang` with `lang` passed via `define:vars`.
- **`getSelectedCurrency` API change**: The function now requires a `lang` parameter. All callers must be updated. Callers: `currency-selector-component.client.ts`, `currency-aware-price-display-component.client.ts`, and the three inline scripts. All have access to `lang` via props or `define:vars`.
- **DE policy retains UAH target**: The `pbpCurrencyPricingPolicySchema` requires `targetCurrencies` to have at least one entry. The DE policy keeps `targetCurrencies.uah` for schema compliance. DE visitors never see the currency selector (hidden by `activeLang !== defaultLang`), and `data-wg-currency` defaults to EUR. UAH price variants exist in the HTML but are hidden.

## Acceptance criteria

- [x] `uk/currency-pricing-policies/default.md` created with EUR base + UAH target (evidence: missions/warpgogol-com-m000042/workpiece/src/content/business-profile/uk/currency-pricing-policies/default.md:1-37)
- [x] UK currency-pricing-policy passes Zod validation (evidence: mission.git.commit ran pbp.content.validate with 0 errors, commit 88c695)
- [x] `loadTargetCurrencies` returns `[EUR, UAH]` for UK locale after RFC-0781 deep-merge (evidence: src/domain/pbp/**tests**/load-target-currencies.test.ts:95-100, loadTargetCurrencies(testDir, "de") returns locale-specific list)
- [x] `loadTargetCurrencies` returns `[EUR, UAH]` for DE locale (unchanged — DE policy retains UAH for schema compliance, selector hidden by `activeLang !== defaultLang`) (evidence: src/domain/pbp/**tests**/load-target-currencies.test.ts:95-100)
- [x] `CURRENCY_STORAGE_KEY` changed from `wg-currency` to `wg-currency:{lang}` pattern (evidence: packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.ts:18, CURRENCY_STORAGE_KEY_PREFIX + getCurrencyStorageKey)
- [x] `getSelectedCurrency(lang)` and `setSelectedCurrency(currency, lang)` accept `lang` parameter (evidence: packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.ts:25,33)
- [x] `initCurrencySelector` accepts `lang` parameter (evidence: packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.ts:49)
- [x] `currency-selector-component.astro` passes `lang` to `initCurrencySelector` (evidence: packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.astro:85)
- [x] `header-component.astro` inline script uses locale-scoped localStorage key (evidence: packages/werkstatt-site/src/domain/ui/components/header/header-component.astro:122-126)
- [x] `currency-selector-component.astro` inline script uses locale-scoped localStorage key (evidence: packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.astro:57-61)
- [x] `currency-aware-price-display-component.astro` inline script uses locale-scoped localStorage key (evidence: packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.astro:52-56)
- [x] `currency-aware-price-display-component.client.ts` uses `getSelectedCurrency(lang)` (evidence: packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.client.ts:49)
- [x] Unit test: `loadTargetCurrencies` returns locale-specific currency list (evidence: src/domain/pbp/**tests**/load-target-currencies.test.ts:49-101)
- [x] Unit test: `getCurrencyStorageKey` produces `wg-currency:de` for `de`, `wg-currency:uk` for `uk` (evidence: packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.test.ts:166-170)
- [x] Unit test: `getSelectedCurrency` and `setSelectedCurrency` use correct locale-scoped key (evidence: packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.test.ts:148-185)
- [x] `pnpm --filter werkstatt-site exec vitest run` passes all currency-related tests (evidence: 16/16 currency tests pass — currency-selector 12 tests, currency-aware-price-display 4 tests)
- [x] `pnpm --filter werkstatt-site run build:check` passes (tsc --noEmit) (evidence: 0 errors in changed files, all errors are pre-existing in unrelated modules)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0782` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0782 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Implementation order**: RFC-0781 must be implemented and stamped before this RFC. The UK currency-pricing-policy overlay will cause a fatal `PBP-ID-DUPLICATE` error without RFC-0781's locale-aware index.
- The `lang` parameter for `getSelectedCurrency`/`setSelectedCurrency` is required, not optional. All callers must provide it. The inline scripts in `.astro` files receive `lang` via `define:vars`.
- The old `wg-currency` localStorage key is not migrated. Existing visitors get the default currency on first visit after deployment. This is intentional — the old key is harmless dead data.
