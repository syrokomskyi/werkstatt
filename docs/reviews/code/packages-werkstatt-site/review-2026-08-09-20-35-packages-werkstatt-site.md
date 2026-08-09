---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: f3bb637a...HEAD
filesReviewed:
  - packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.ts
  - packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.astro
  - packages/werkstatt-site/src/domain/ui/components/currency-selector/currency-selector-component.client.test.ts
  - packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.client.ts
  - packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.astro
  - packages/werkstatt-site/src/domain/ui/components/currency-aware-price-display/currency-aware-price-display-component.client.test.ts
  - packages/werkstatt-site/src/domain/ui/components/header/header-component.astro
  - packages/werkstatt-site/src/domain/ui/components/section-header/section-header.astro
  - packages/werkstatt-site/src/domain/ui/components/section-body/paragraphs/section-paragraphs.astro
  - packages/werkstatt-site/src/domain/ui/components/section-body/cards/section-card-grid.astro
  - packages/werkstatt-site/src/domain/ui/components/section-body/list/section-list.astro
  - packages/werkstatt-site/src/domain/ui/sections/faq-list/faq-list-section.astro
  - packages/werkstatt-site/src/domain/ui/sections/price-card/price-card-section.astro
  - packages/werkstatt-site/src/domain/ui/sections/ownership-block/ownership-block-section.astro
  - packages/werkstatt-site/src/domain/ui/sections/hero-decision-card/hero-decision-card-section.astro
  - packages/werkstatt-site/src/domain/ui/sections/transparency/transparency-section.astro
  - packages/werkstatt-site/src/domain/ui/sections/markdown/markdown-section.astro
---

# Code Review: f3bb637a...HEAD (RFC-0782 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and forward-only. One finding on Axis A (Duplicated Code in inline scripts) prevents Approved. The duplication is constrained by the Astro inline script format and documented in the RFC, but a constant shared between the inline scripts and the client module would reduce drift risk.

### Mechanical floor

Pass — 0 errors in changed files. All 16 currency-related unit tests pass. Pre-existing errors in unrelated modules (print.ts, resolve-route.ts, anchors.ts, navigation.ts) are not caused by this diff.

### Axis A — Structural correctness

**Finding A-1: Duplicated key pattern in inline scripts.** Three inline scripts (`header-component.astro:124`, `currency-selector-component.astro:61`, `currency-aware-price-display-component.astro:56`) hardcode the string `"wg-currency:"` + lang` instead of using the `getCurrencyStorageKey` helper from `currency-selector-component.client.ts`. Inline scripts (`is:inline`) cannot import TypeScript modules, so this duplication is structurally unavoidable. However, the prefix `"wg-currency"` is defined as `CURRENCY_STORAGE_KEY_PREFIX` in the client module — if that constant changes, the inline scripts will silently diverge. The RFC documents this risk (line 303), but a build-time constant injection via `define:vars` would eliminate it: `define:vars={{ lang, keyPrefix: CURRENCY_STORAGE_KEY_PREFIX }}` and `localStorage.getItem(keyPrefix + ":" + lang)`.

### Axis B — DNA alignment

No issues. No DNA invariants are touched by this diff. The changes are confined to UI component behavior within `werkstatt-site`.

### Axis C — Ecosystem fit

No issues. All changes are within `packages/werkstatt-site`. No package boundaries crossed, no new commands, no pipeline changes, no cosmic naming changes.

### Axis D — Forward-only compliance

No issues. The old `CURRENCY_STORAGE_KEY` export is replaced with `CURRENCY_STORAGE_KEY_PREFIX` + `getCurrencyStorageKey` — no compatibility shim. The old `wg-currency` localStorage key is not migrated; the RFC explicitly documents this as intentional (line 336). No dual-paths or legacy behavior.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` are properly updated in both `.client.ts` files and both `.astro` component files. The `lang` parameter is required, not optional, matching the RFC contract. Variable names are clear.

### Axis F — Pragmatism

No issues. The `getCurrencyStorageKey` helper is minimal and appropriate. The `lang` parameter is threaded through the minimum set of functions. No over-engineering. All caller components pass `lang` from their existing scope — no new props or state were introduced beyond the `lang` prop on `CurrencyAwarePriceDisplay`.

### Axis G — Blind spots

No issues. The `section-header.astro` uses `lang ?? "de"` as a fallback (line 139, 162) — this is pre-existing behavior from `parsePriceMarkers` usage, not a new pattern. The `lang` is injected via `Astro.props as SectionHeaderProps & { lang?: string }` (line 43), which is a pre-existing type augmentation. Client-side persistence uses `localStorage` only, no cookies.

### Spec compliance

| Requirement from RFC-0782 | Status | Evidence |
| --- | --- | --- |
| UK currency-pricing-policy overlay | Done | `missions/.../uk/currency-pricing-policies/default.md` |
| Locale-scoped localStorage key `wg-currency:{lang}` | Done | `currency-selector-component.client.ts:18-23` |
| `getSelectedCurrency(lang)` requires lang | Done | `currency-selector-component.client.ts:25` |
| `setSelectedCurrency(currency, lang)` requires lang | Done | `currency-selector-component.client.ts:33` |
| `initCurrencySelector` accepts lang | Done | `currency-selector-component.client.ts:49-53` |
| `initCurrencyAwarePriceDisplay` accepts lang | Done | `currency-aware-price-display-component.client.ts:25` |
| All inline scripts use locale-scoped key | Done | 3 inline scripts updated |
| All caller components pass lang | Done | 12 caller files updated |
| Unit tests updated | Done | 2 test files, 16 tests pass |
| Old `CURRENCY_STORAGE_KEY` export removed | Done | Replaced with prefix + helper |

### Questions for the author

1. The inline scripts hardcode `"wg-currency:"` instead of using `CURRENCY_STORAGE_KEY_PREFIX`. If the prefix changes, the inline scripts will diverge silently. Should we inject the prefix via `define:vars` to keep a single source of truth?
2. The `section-header.astro` casts `Astro.props as SectionHeaderProps & { lang?: string }` — should `lang` be promoted to `SectionHeaderProps` proper to avoid the ad-hoc type augmentation?
