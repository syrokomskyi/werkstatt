---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: d5df5c9e...HEAD
filesReviewed:
  - packages/ui/src/utils/price-marker.ts
  - packages/ui/src/utils/price-marker.test.ts
  - packages/ui/src/sections/markdown/prose-pipeline.ts
  - packages/ui/src/sections/markdown/markdown-section.astro
  - packages/ui/AGENTS.md
---

# Code Review: d5df5c9e...HEAD (RFC-0766 implementation)

### Verdict: Needs revision

The implementation is structurally sound and covers all four HTML-returning paths in the prose pipeline. However, the CSS imported from `currency-aware-price-display-component.css` uses `display: block` on all elements, which will break inline rendering when price markers appear inside `<p>` elements in prose content. The regex pattern is also duplicated between `price-marker.ts` and `prose-pipeline.ts`.

### Mechanical floor

Pass — `tsc --noEmit` passes, `vitest run` passes (8/8 new tests, 5 pre-existing failures in `currency-selector-component.client.test.ts` unrelated to this RFC).

### Axis A — Structural correctness

- **Duplicated regex pattern.** The price marker regex `/\{price:([a-zA-Z0-9_-]+):([a-zA-Z0-9_.-]+)\}/` is defined three times: once as `priceMarkerRe` in `price-marker.ts:16` (with `g` flag), and twice as `PRICE_MARKER_RE` and `PRICE_MARKER_GLOBAL_RE` in `prose-pipeline.ts:79-80`. The pattern should be exported from `price-marker.ts` and imported in `prose-pipeline.ts` to prevent drift. The `packages/AGENTS.md` rule on regex duplication applies in spirit even within the same package.

### Axis B — DNA alignment

No issues. The change satisfies DNA-4 (canonical content in `src/content/`) — prose content remains the source of truth, price markers are resolved at render time.

### Axis C — Ecosystem fit

No issues. `packages/ui/AGENTS.md` updated with RFC-0766 prose marker documentation. No Compass XML changes needed (confirmed by RFC). No commands added/changed/removed.

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual paths. The price marker resolution is integrated directly into the existing pipeline paths.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding updated in `prose-pipeline.ts`. New test file `price-marker.test.ts` carries Compass scaffolding. Comments reference real functions and RFCs.

### Axis F — Pragmatism

- **Duplicated regex** (same as Axis A finding). The `PRICE_MARKER_RE` and `PRICE_MARKER_GLOBAL_RE` could be imported from `price-marker.ts` instead of redefined. The non-global variant is only used for `hasPriceMarkers()` — a single exported `priceMarkerRe` with `g` flag could serve both purposes (use `.test()` which ignores `g` flag state when called without prior `exec`).

### Axis G — Blind spots

- **CSS `display: block` breaks inline rendering in prose.** `markdown-section.astro:17` imports `currency-aware-price-display-component.css`, which sets `display: block` on `.currency-aware-price-display`, `.currency-aware-price-display__variant`, and `.currency-aware-price-display__amount` (lines 14, 18, 30). In prose context, price markers appear inline inside `<p>` elements (e.g. "The price is {price:main:monthly} per month"). With `display: block`, the `<span>` elements will force line breaks, producing:
  ```
  The price is
  [price display]
  per month.
  ```
  instead of inline rendering. The `packages/ui/AGENTS.md` explicitly warns: "Add `display: inline` rules for `.currency-aware-price-display` and its children within the component's colocated CSS to prevent line breaks inside formatted prices." Fix: add CSS overrides in `markdown-section.css` scoped to `.markdown-section__content .currency-aware-price-display` to set `display: inline` on the container, variants, and amounts.

- **Code block regex doesn't match `<code>` with attributes.** `CODE_PRE_SPLIT_RE` at `prose-pipeline.ts:81` matches `<code>` without attributes. Micromark's GFM output for fenced code blocks wraps `<code class="language-ts">` inside `<pre>`, which is matched by the `<pre>` alternative. However, raw HTML `<code class="...">` without a `<pre>` wrapper (possible with `allowDangerousHtml: true`) would not be skipped, and markers inside would be replaced. This is an edge case but could affect prose files that include raw HTML code snippets with price marker syntax.

### Spec compliance

| Requirement from RFC-0766 | Status | Evidence |
| --- | --- | --- |
| `renderPriceDisplayHtml` function | Done | `price-marker.ts:34-58` |
| `resolvePriceMarkersInHtml` function | Done | `prose-pipeline.ts:87-101` |
| `hasPriceMarkers` detection | Done | `prose-pipeline.ts:83-85` |
| Force micromark path when markers present | Done | `prose-pipeline.ts:214-215` |
| All 4 HTML-returning paths covered | Done | inline body (153-156), animateNumbers (206-209), references (226-229), image-bearing (241-244) |
| `<span>` elements (not `<div>`) | Done | `price-marker.ts:53-55` |
| HTML-escape variant values | Done | `price-marker.ts:18-24` |
| Code/pre skipping | Done | `prose-pipeline.ts:81,92-95` |
| Client-side currency switching | Done | `markdown-section.astro:256-260` |
| CSS import for price display | Partial | CSS imported but `display: block` will break inline rendering in prose |
| AGENTS.md update | Done | `packages/ui/AGENTS.md:389` |

### Questions for the author

1. How should the price display render inline within paragraph text? The current CSS (`display: block`) will force line breaks. Should `markdown-section.css` override to `display: inline` for prose context, or should the component CSS itself use `display: inline-block`?
2. Should the price marker regex be exported from `price-marker.ts` to avoid pattern duplication in `prose-pipeline.ts`?
3. Is the `<code>` without attributes edge case acceptable, or should `CODE_PRE_SPLIT_RE` match `<code[^>]*>` to handle attributes?
