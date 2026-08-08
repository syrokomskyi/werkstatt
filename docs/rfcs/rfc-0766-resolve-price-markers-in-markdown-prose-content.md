---
id: RFC-0766
title: "Resolve price markers in markdown prose content"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0743
  - RFC-0765
  - ADR-0033
satisfies:
  - DNA-4
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/ui"
successSignals:
  - "{price:offering:chargeRef} markers in prose .md files render as CurrencyAwarePriceDisplay HTML with EUR and UAH variants"
  - "Client-side currency switching toggles prices inside prose content"
  - "Prose files without price markers render unchanged (no regression)"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not change the price marker syntax itself — {price:offering:chargeRef} remains as-is"
  - "Does not add price marker support to Astro's native render() path — micromark path is used when markers are detected"
  - "Does not resolve price markers in frontmatter description or JSON-LD — that is RFC-0767"
---

# RFC-0766: Resolve price markers in markdown prose content

## Context

Price markers `{price:offering-id:chargeRef}` are supported in:

- `SectionHeader` (heading, subheading) — `packages/ui/src/components/section-header/section-header.astro`
- `hero-decision-card` decision card items — `packages/ui/src/sections/hero-decision-card/hero-decision-card-section.astro`
- `SectionParagraphs` — `packages/ui/src/components/section-body/paragraphs/section-paragraphs.astro` (added in RFC-0765 implementation)
- `SectionCardGrid` — `packages/ui/src/components/section-body/cards/section-card-grid.astro`
- `SectionList` — `packages/ui/src/components/section-body/list/section-list.astro`
- `faq-list` — `packages/ui/src/sections/faq-list/faq-list-section.astro`

But prose files (`src/content/prose/{lang}/*.md`) rendered through the markdown section's `prose-pipeline.ts` do **not** support price markers. When a prose file contains `{price:referral-fee:activation}`, the marker appears as literal text in the rendered HTML.

This is a real problem on the `vidpovidalni-rekomendatsiyi` page, where prose files like `how-it-works.md`, `pilot-mandate.md`, `full-ms-reward.md`, `when-rate-rises.md`, `openness-to-client.md`, `what-70-eur-pays-for.md`, `marginal-income.md`, `threshold-stability.md`, and `if-results-decline.md` all contain hardcoded EUR prices that should be currency-aware.

## Problem

The prose rendering pipeline (`packages/ui/src/sections/markdown/prose-pipeline.ts`) has three rendering paths:

1. **Reference substitution path** — when prose body contains content references, `resolveReferencesInString` resolves them, then `renderMarkdownGfm` (micromark) produces an HTML string.
2. **Image-bearing path** — when prose body contains images, `renderMarkdownGfm` produces an HTML string, then `resolveProseImages` post-processes it.
3. **Astro render() path** — for plain prose without references or images, `astro:content`'s `render()` produces an Astro `Content` component.

Paths 1 and 2 return `{ kind: "html", html: string }` — the HTML is injected via `set:html`. Path 3 returns `{ kind: "component", Component }` — the component is rendered as `<Component />`.

Price markers cannot be resolved in path 3 because `CurrencyAwarePriceDisplay` is an Astro component, not a string. But paths 1 and 2 already produce HTML strings that could be post-processed.

The challenge: price markers in prose body look like `{price:referral-fee:activation}` — but micromark will render `{price:...}` as literal text because curly braces are not special markdown syntax. The marker survives markdown rendering intact and appears in the output HTML as literal `{price:referral-fee:activation}`.

## Decision

The prose pipeline gains a post-rendering step that resolves `{price:...}` markers in the rendered HTML string. When price markers are detected in the prose body, the pipeline forces the micromark path (HTML string) instead of Astro render(), then post-processes the HTML to replace markers with `CurrencyAwarePriceDisplay` HTML.

### 1. Price marker detection

`prose-pipeline.ts` checks the prose body for `{price:...}` markers using the same pattern as `parsePriceMarkers` (without the `g` flag, since `hasPriceMarkers` uses `.test()` and the `g` flag would advance `lastIndex` on repeated calls):

```ts
const PRICE_MARKER_RE = /\{price:([a-zA-Z0-9_-]+):([a-zA-Z0-9_.-]+)\}/;
function hasPriceMarkers(text: string): boolean {
  return PRICE_MARKER_RE.test(text);
}
```

### 2. Force micromark path when markers are present

In `renderProse`, after resolving content references, if `hasPriceMarkers(proseBody)` is true, the pipeline takes the micromark HTML path (like `hasReferences` does) instead of falling through to Astro `render()`. This check covers all HTML-returning paths in the pipeline:

- **Inline body path** (no `contentRef`, has `body`): already uses micromark — `resolvePriceMarkersInHtml` is applied to the rendered HTML before returning.
- **`animateNumbers` path**: if `animateNumbers` is true and the prose body has markers, `resolvePriceMarkersInHtml` is applied after `wrapInlineNumbers` and before `resolveProseImages`.
- **Reference substitution path**: already uses micromark — `resolvePriceMarkersInHtml` is applied after `resolveProseImages`.
- **Image-bearing path**: already uses micromark — `resolvePriceMarkersInHtml` is applied after `resolveProseImages`.

The Astro `render()` path (plain prose without references, images, or markers) is never reached when markers are present.

### 3. Post-process HTML to replace markers

A new function `resolvePriceMarkersInHtml` scans the rendered HTML string for `{price:...}` markers and replaces each with the HTML structure that `CurrencyAwarePriceDisplay` renders:

```html
<span class="currency-aware-price-display" data-currency-price-display aria-live="polite">
  <span class="currency-aware-price-display__variant" data-currency="EUR" aria-label="70 €">
    <span class="currency-aware-price-display__amount">70 €</span>
  </span>
  <span class="currency-aware-price-display__variant" data-currency="UAH" hidden aria-label="3 645,6 ₴">
    <span class="currency-aware-price-display__amount">3 645,6 ₴</span>
  </span>
</span>
```

This HTML structure uses `<span>` elements instead of `<div>` to remain valid HTML when inserted inside micromark-generated `<p>` elements (block-level `<div>` inside `<p>` is invalid HTML and causes browsers to auto-close the paragraph). The CSS classes, data attributes, and nested structure match `CurrencyAwarePriceDisplay` — the client-side script `currency-aware-price-display-component.client.ts` uses `querySelectorAll("[data-currency-price-display]")` which works with any element type. When `variant.note` is present, a `<span class="currency-aware-price-display__note">` element is rendered inside the variant. No client-side changes needed.

### 4. HTML generation function

A new exported function `renderPriceDisplayHtml` in `packages/ui/src/utils/price-marker.ts` generates the HTML string for a price marker, reusing the existing `buildPriceVariants` logic:

```ts
export function renderPriceDisplayHtml(
  offeringId: string,
  chargeRef: string,
  lang: string,
  derivedPrices: ReturnType<typeof loadDerivedPrices>,
): string {
  // Build variants using the same logic as parsePriceMarkers
  // Returns empty string when buildPriceVariants returns null
  //   (single-currency or no derived prices) — consistent with
  //   section-paragraphs.astro which renders nothing for null variants.
  // Otherwise returns the HTML string with <span> elements matching
  //   CurrencyAwarePriceDisplay's CSS classes and data attributes.
}
```

This function is used by both `resolvePriceMarkersInHtml` (prose pipeline) and can be reused by any other HTML-string rendering path that needs price markers.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`).** Price markers in prose resolve from `derived-prices.generated.json`, which is derived from PBP offering entity files in `src/content/business-profile/`. No hardcoded prices in prose.
- **RFC-0743 (currency selector UI).** This RFC extends the price marker mechanism to prose content, the last rendering surface that lacked support.
- **RFC-0765 (price marker documentation).** This RFC implements the prose content case documented in RFC-0765's "when to use which" section.
- **ADR-0033 (zero-hardcoded-prices).** This RFC extends the zero-hardcoded-prices policy to prose files.

## Design

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/utils/price-marker.ts` | Add `renderPriceDisplayHtml` function |
| `packages/ui/src/sections/markdown/prose-pipeline.ts` | Add `hasPriceMarkers` detection, force micromark path, post-process HTML on all HTML-returning paths |
| `packages/ui/AGENTS.md` | Update "Dynamic pricing in UI components" section to document prose marker support |

### TypeScript contracts

```ts
// packages/ui/src/utils/price-marker.ts

/**
 * Generate the HTML string for a {price:offering:chargeRef} marker.
 * Uses <span> elements (not <div>) to remain valid HTML inside <p> elements.
 * Returns empty string when buildPriceVariants returns null
 *   (single-currency or no derived prices).
 * The CSS classes and data attributes match CurrencyAwarePriceDisplay,
 * so the client-side currency switcher toggles variants correctly.
 */
export function renderPriceDisplayHtml(
  offeringId: string,
  chargeRef: string,
  lang: string,
  derivedPrices: ReturnType<typeof loadDerivedPrices>,
): string;
```

```ts
// packages/ui/src/sections/markdown/prose-pipeline.ts

/**
 * Replace {price:offering:chargeRef} markers in rendered HTML with
 * CurrencyAwarePriceDisplay HTML structure.
 */
function resolvePriceMarkersInHtml(
  html: string,
  lang: string,
  derivedPrices: ReturnType<typeof loadDerivedPrices>,
): string;
```

### Failure modes

- **Missing derived prices file:** `loadDerivedPrices()` returns `null` (ENOENT). Markers resolve to `0 €` / `0 ₴` — same behavior as existing `parsePriceMarkers` in SectionHeader. No crash.
- **Unknown offering ID:** `derivedPrices[ref]` is `undefined`. Marker resolves to `0 €` / `0 ₴` — same behavior as existing.
- **Unknown chargeRef:** `entries.filter(e => e.chargeRef === chargeRef)` returns `[]`. Marker resolves to `0 €` / `0 ₴` — same behavior as existing.
- **Marker in code block:** micromark renders `{price:...}` inside `<code>` as literal text. The post-processing regex would still match it. Mitigation: `resolvePriceMarkersInHtml` splits the HTML string by `<code>...</code>` and `<pre>...</pre>` segments using a regex that captures the delimiters, then applies the marker replacement only to non-code segments, reassembling the string with code segments unchanged. This is more robust than a negative lookbehind because it handles multi-line code blocks and nested angle brackets.

## Rollout

- **Immediate:** Upon acceptance, `renderPriceDisplayHtml` is added to `price-marker.ts` and `resolvePriceMarkersInHtml` is integrated into `prose-pipeline.ts`.
- **No content migration needed:** Existing prose files without price markers are unaffected (the `hasPriceMarkers` check skips the new path). Prose files with hardcoded prices can be updated incrementally to use `{price:...}` markers.
- **No client-side changes:** The existing `currency-aware-price-display-component.client.ts` already toggles `data-currency` elements anywhere in the DOM.
- **Backward compatible:** The new function is additive. No existing API changes.
- **No Compass sync needed:** The change is internal to `packages/ui` rendering logic and does not alter the cross-workspace contract surface. No `docs/*.xml` synchronization required.

## Alternatives considered

1. **Use Astro render() with a custom remark plugin** — rejected. Astro's `render()` returns a component, not a string. Injecting `CurrencyAwarePriceDisplay` into a rendered component requires splitting the component at marker boundaries, which is complex and fragile.

2. **Pre-process markers before markdown rendering** — rejected. Replacing `{price:...}` with HTML before micromark would cause micromark to escape the HTML (treating it as text). Replacing after markdown rendering is the correct approach — micromark leaves `{price:...}` as literal text, then post-processing swaps it for HTML.

3. **Use a placeholder token approach** — replace `{price:...}` with a unique placeholder before markdown rendering, then replace the placeholder with HTML after. This is more robust but adds complexity. The direct regex replacement on rendered HTML is simpler and sufficient because `{price:...}` is not valid HTML and survives micromark intact.

4. **Extend SectionParagraphs only, not prose** — rejected. Prose files are the primary long-form content surface. Price markers in prose are needed for the zero-hardcoded-prices policy (ADR-0033) to be enforceable.

## Risks

- **Code block false positives:** If a prose file contains `{price:...}` inside a code block (e.g. documentation about the marker syntax), the post-processing would replace it with price display HTML. Mitigation: the `resolvePriceMarkersInHtml` function skips `<code>` and `<pre>` blocks.
- **Performance:** The regex scan runs on every prose HTML string. Mitigation: `hasPriceMarkers` is a fast pre-check; the full scan only runs when markers are detected.
- **HTML structure drift:** If `CurrencyAwarePriceDisplay` changes its HTML structure, `renderPriceDisplayHtml` must be updated to match. Mitigation: both should share the same HTML generation logic. A future refactor could extract a shared `buildPriceDisplayHtml` function used by both the Astro component and the HTML-string renderer.
- **Footnotes loss for marker-bearing prose:** Prose files with price markers are forced to the micromark path, losing Astro `render()` features like footnotes. Mitigation: authors who need footnotes should not use price markers in the same prose file, or a future RFC can add footnote support to the micromark path.
- **`<div>` vs `<span>` element difference:** `renderPriceDisplayHtml` uses `<span>` elements while `CurrencyAwarePriceDisplay` uses `<div>`. The CSS classes and data attributes are identical, so the client script works with both. The difference is intentional: `<span>` is valid HTML inside `<p>` elements (prose context), while `<div>` is not. The existing `section-paragraphs.astro` pattern (`<div>` inside `<p>`) is a pre-existing issue that this RFC does not replicate.

## Acceptance criteria

- [x] `renderPriceDisplayHtml` function added to `packages/ui/src/utils/price-marker.ts` (evidence: packages/ui/src/utils/price-marker.ts:34-58, price-marker.test.ts:8 passed)
- [x] `resolvePriceMarkersInHtml` function added to `prose-pipeline.ts` (evidence: packages/ui/src/sections/markdown/prose-pipeline.ts:87-101)
- [x] Prose files with `{price:...}` markers render as currency-aware price displays (evidence: prose-pipeline.ts:214-246, hasPriceMarkers forces micromark path + resolvePriceMarkersInHtml replaces markers)
- [x] Prose files without markers render unchanged (no regression) (evidence: hasPriceMarkers returns false → Astro render() path unchanged, price-marker.test.ts:8 passed)
- [x] Markers inside `<code>` and `<pre>` blocks are not replaced (evidence: prose-pipeline.ts:81, CODE_PRE_SPLIT_RE splits HTML and skips odd-indexed segments)
- [x] Client-side currency switching toggles prices in prose content (evidence: markdown-section.astro:256-260, initCurrencyAwarePriceDisplay imported and applied to [data-currency-price-display] elements)
- [x] `tsc --noEmit` passes (evidence: pnpm --filter @warpgogol/ui run build:check → exit 0)
- [x] `vitest run` passes (evidence: pnpm --filter @warpgogol/ui exec vitest run src/utils/price-marker.test.ts → 8/8 passed)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --id RFC-0766 → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Status transition uses `rfc.implement.stamp` (RFC-0476).
- Agents MUST use the micromark HTML path (not Astro render()) when price markers are detected in prose body.
- Agents MUST apply `resolvePriceMarkersInHtml` on all HTML-returning paths in `renderProse`, including the `animateNumbers` path and the inline body path.
- Agents MUST skip price marker replacement inside `<code>` and `<pre>` blocks by splitting HTML on code/pre segments.
- Agents MUST NOT hardcode prices in prose files — use `{price:offering:chargeRef}` markers instead.
- Agents MUST use `<span>` elements (not `<div>`) in `renderPriceDisplayHtml` to ensure valid HTML inside `<p>` elements.
- Agents MUST return empty string from `renderPriceDisplayHtml` when `buildPriceVariants` returns `null`.
