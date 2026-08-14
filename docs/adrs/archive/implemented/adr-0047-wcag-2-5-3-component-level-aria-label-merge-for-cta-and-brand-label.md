---
id: ADR-0047
title: "WCAG 2.5.3 Label in Name — component-level aria-label merge for CTA and brand-label components"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-13
updatedAt: 2026-08-13
implementedAt: 2026-08-13
supersedes: []
supersededBy:
related:
  - RFC-0832
  - RFC-0834
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0047: WCAG 2.5.3 Label in Name — component-level aria-label merge for CTA and brand-label components

## Context

RFC-0832 introduced `a11y.label-in-name.validate`, a post-build validator that checks rendered HTML for WCAG 2.5.3 Label in Name violations — interactive elements where `aria-label` does not include the visible text. During mission `warpgogol-com-m000054` close, this validator flagged multiple pages where CTA links and the brand label had `aria-label` set to a descriptive phrase that did not include the visible button/link text.

Three components had the same pattern: `aria-label={ariaLabelProp}` rendered alongside visible text `{labelProp}`, with no guarantee that the aria-label includes the visible text.

1. **`section-cta.astro`** — `aria-label={ariaLabel}` with `<span>{label}</span>`. Used by every CTA across all pages.
2. **`hero-section.astro`** — `aria-label={props.ctaPrimaryAriaLabel}` with `{props.ctaPrimaryLabel}` (primary CTA), and `aria-label={props.ctaSecondaryAriaLabel}` with `{props.ctaSecondaryLabel}` (secondary CTA).
3. **`brand-label-component.astro`** — `aria-label={content.brandAriaLabel}` with `<span>{content.brandLabel}</span>`. Currently passes because content coincidentally includes "Warpgogol" in the aria-label, but the component does not enforce this.

## Decision

Components that render both `aria-label` and visible text on the same interactive element must merge the visible text into the aria-label when the aria-label does not already contain it. The merge pattern is:

```ts
const resolvedAriaLabel =
  ariaLabel && label && !ariaLabel.toLowerCase().includes(label.toLowerCase())
    ? `${label} — ${ariaLabel}`
    : ariaLabel;
```

Applied to:

- `section-cta.astro`: `resolvedAriaLabel` from `ariaLabel` + `label`
- `hero-section.astro`: `resolvedCtaPrimaryAriaLabel` from `props.ctaPrimaryAriaLabel` + `props.ctaPrimaryLabel`, `resolvedCtaSecondaryAriaLabel` from `props.ctaSecondaryAriaLabel` + `props.ctaSecondaryLabel`
- `brand-label-component.astro`: `resolvedBrandAriaLabel` from `content.brandAriaLabel` + `content.brandLabel`

## Justification

- **Root cause fix**: The post-build validator (RFC-0832) catches the rendered output, but the component is the source of the violation. Fixing the component ensures all usages are correct regardless of content.
- **Idempotent**: When the aria-label already includes the visible text (case-insensitive), the merge is a no-op — the original aria-label is used as-is.
- **Non-destructive**: The merge prepends the visible text, preserving the descriptive aria-label. The accessible name becomes "Label — Description" instead of just "Description".
- **Preventive**: RFC-0834 proposes a component-level validator that will catch this pattern in future components. This ADR documents the fix for existing components that predate the validator.

## Consequences

- Positive: All CTA and brand-label components now guarantee WCAG 2.5.3 compliance regardless of content.
- Positive: The merge is idempotent — content that already includes the visible text in the aria-label is unaffected.
- Negative: The accessible name may become longer ("Label — Description" instead of "Description"). This is acceptable — WCAG 2.5.3 requires the visible text to be part of the accessible name, not the sole component.
- Technical debt: The merge logic is duplicated across three components. A shared `resolveLabelInName` helper could be extracted to `@warpgogol/werkstatt-site/share` in a future refactor.

## Evolution

This ADR documents fixes applied across two platform commits:
- 5.51.6 (2026-08-13): `section-cta.astro` and `hero-section.astro`
- Post-close fix (2026-08-13): `brand-label-component.astro`

The `resolveLabelInName` helper should be extracted to a shared utility when RFC-0834 (component-level WCAG 2.5.3 validator) is implemented — the validator will need to recognize the pattern, and a shared helper makes it canonical.
