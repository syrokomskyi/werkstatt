# Design System AI Guide

This guide defines how AI contributors must work with the design system and section styles.

## 1) Single Source of Truth

- **Tokens live in:** `src/styles/distilled.css`.
- **Rule:** any new value (colors, spacing, shadows, radii, durations, blur) **must be added as a `--ds-*` token first**.
- **Forbidden:** hardcoded `rgba(...)`, `#hex`, or fixed `px` values inside `src/styles/components/section/*.css` unless a matching `--ds-*` token (or an existing contract variable) exists.

## 2) Token Naming Conventions

- Colors: `--ds-color-*`.
- Shadows: `--ds-shadow-*`.
- Sizes & typography: `--ds-size-*`, `--ds-text-*`, `--ds-line-height-*`.
- Motion: `--ds-duration-*`, `--ds-ease-*`.
- Spacing: `--ds-space-*`.

### Alpha gradation cap (keep tokens small)

- **Rule:** for any base color token series (alpha variants), keep **at most 4 alpha gradations**.
- **Allowed gradations:** `12`, `36`, `60`, `84`.
- **Invariant:** do not add new gradations (e.g. `28`). Pick the closest existing gradation instead.

**Always search for an existing token first.** Only add a new token when no equivalent exists.

## 3) Token Addition Workflow

1. Identify a repeated or new hardcoded value in a section stylesheet.
2. Search `distilled.css` for an existing, equivalent `--ds-*` token.
3. If not found, add a **semantic** `--ds-*` token to `distilled.css` (name by intent, not location).
4. Replace all occurrences in section styles with the new token.

## 4) Scope & Safety

- **Safe edit zone:** `src/styles/components/section/*`.
- **High-risk areas:** global layouts, middleware, and scripts—avoid changing these during CSS token refactors.

## 5) AI Checklist Before Finishing

- No new `rgba()` or `#hex` in section styles.
- All sizing uses `--ds-size-*` / `--ds-space-*` / `--ds-text-*`.
- All shadows and blurs use `--ds-shadow-*` / `--ds-blur-*` tokens.
- Do not remove debug console statements or comments.

### Token guardrails

- Validate ultra-strict token rule: `pnpm tokens:ds:lint`

## 6) Correct vs Incorrect Example

```css
/* ❌ Incorrect */
.card {
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

/* ✅ Correct */
.card {
  background: var(--ds-color-surface-glass-strong);
  box-shadow: var(--ds-shadow-appeal);
}
```

## 7) Layering Guidance

- **Design Tokens** = the only source of raw values.
- **Section Styles** = compose tokens into layouts and visuals.

This keeps the design system consistent, predictable, and easy to scale.

## 8) "Volume Edge" (Depth) Effect

Use this effect when you need a clear, “cut edge” / depth separation between colored layers (e.g. clipped shapes) or when you want an image/canvas to feel elevated.

- **Rule:** do not hardcode alpha colors or shadow numbers in page/section styles.
- **Use the contract from:** `src/styles/global.css`

### Contract attributes

- `data-volume="edge" | "surface"` (selects the depth mode)
- `data-volume-apply="filter"` (applies the computed filter)
- `data-volume-highlight="inset-top"` (adds the inset highlight overlay)

### Pattern A: Clipped shape edge depth (recommended)

Apply to the clipped layer itself (the element that uses `clip-path`).

```css
.banner-bg::before {
  clip-path: polygon(...);
}
```

### Pattern B: Elevated media (images/canvases)

Apply to the media container (not the `<img>`), with an inset highlight overlay.

```css
.media {
}
```

## 9) Volume Contract Rules

Use the `data-volume` contract for consistent application of depth effects across components.

- **Header:** always use `data-volume="edge"` (thin edge depth).
- **Footer:** always use `data-volume="surface"` (stronger surface depth).
- **Banners/Heroes:** use `data-volume="edge"` for clipped shapes, `data-volume="surface"` for elevated images.
- **Rule:** do not mix modes or hardcode filters in component styles—use the contract attributes instead.
