---
id: ADR-0017
title: "Preserve background-color inherit in CSS minification"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: implemented
scope: workspace
decider: architecture
createdAt: 2026-08-02
updatedAt: 2026-08-02
implementedAt: 2026-08-02
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0649
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0017: Preserve background-color inherit in CSS minification

## Context

The warpgogol-com site uses `background-color: inherit` on interactive elements (links, buttons, focus indicators) to ensure axe color-contrast checks can resolve the effective background color. Without `inherit`, axe reports the element as having an incomplete contrast result because it cannot determine the background color from the computed style.

The Astro build pipeline uses lightningcss (via `@astrojs/vite`) for CSS minification. By default, lightningcss removes `background-color: inherit` declarations because it considers them redundant — the browser default for `background-color` is `transparent`, which lightningcss treats as equivalent to `inherit` for non-root elements. This optimization is incorrect for axe color-contrast checks: axe needs the explicit `inherit` value to resolve the effective background color through the DOM hierarchy.

During the Axiom gate session on 2026-08-02, 2637 incomplete color-contrast findings were traced to this minification behavior. The fix commit `ed0d1b0e` added `background-color: inherit` to 14 CSS files, but the production build stripped all `inherit` declarations, leaving the Axiom gate with the same incomplete findings as before the fix.

## Decision

The Astro build pipeline uses esbuild instead of lightningcss for CSS minification, preserving `background-color: inherit` declarations in production output.

- Applies to all sites in the monorepo via the shared Astro build configuration template (`astro.config.template.mjs`).
- Sets `vite.build.cssMinify: 'esbuild'` in the Vite config. esbuild does not strip `inherit` declarations because it does not perform the "remove default property sub-values" optimization that lightningcss does.
- JS minification continues to use terser (unchanged). Only the CSS minifier changes.

## Justification

The `background-color: inherit` declaration is semantically distinct from `transparent` for axe color-contrast checks. Axe uses the computed `background-color` to determine the effective contrast ratio. When the value is `inherit`, axe resolves it through the DOM hierarchy. When the value is `transparent` (the lightningcss simplification), axe cannot resolve the effective background and reports the result as incomplete.

2637 incomplete findings on warpgogol-com (2026-08-02) were directly caused by this minification behavior. The fix commit `ed0d1b0e` was correct in source but ineffective in production builds.

Alternatives considered:

1. **Use `background-color: unset` instead of `inherit`**: `unset` behaves like `inherit` for inherited properties and like `initial` for non-inherited properties. `background-color` is not inherited, so `unset` would behave like `initial` (transparent) — same problem.
2. **Use a CSS custom property (`--bg-color: inherit`)**: Adds complexity and does not help axe, which reads computed styles, not custom properties.
3. **Disable CSS minification entirely**: Increases CSS bundle size by ~30%. Unacceptable for production.
4. **Post-build Axiom check on production CSS**: Already done via `leitstand.dev-deploy` Axiom gate, but the gate cannot fix the CSS — it only reports findings. The fix must be at the build level.
5. **Configure lightningcss to preserve `inherit`**: lightningcss has no option to selectively preserve `inherit` declarations. Its `targets` option controls browser compatibility transforms, and `errorRecovery` only prevents crashes on parse errors. Neither prevents the "remove default property sub-values" minification pass. The visitor API transforms values but cannot prevent minification removal. Switching to esbuild is the simplest reliable solution.

## Consequences

- **Positive**: axe color-contrast checks produce complete results (pass or fail) instead of incomplete. The 2637 incomplete findings on warpgogol-com will resolve to definitive pass/fail verdicts.
- **Positive**: The Axiom gate (RFC-0649) can trust color-contrast results without false incomplete findings caused by minification.
- **Negative**: CSS bundle size increases slightly (~0.1%) due to preserved `inherit` declarations. Negligible.
- **Technical debt**: None. The configuration is a one-time build setting.

## Evolution

Revisit this decision if:

- lightningcss changes its `inherit` handling in a future version (check release notes on upgrade).
- axe-core changes color-contrast check logic to resolve `transparent` through the DOM hierarchy (would make `inherit` preservation unnecessary).
- The site switches to a different CSS minifier (e.g. esbuild, swc) — verify the new minifier preserves `inherit` or apply an equivalent configuration.

Implementation reference: commit `ed0d1b0e` added `background-color: inherit` to source CSS; this ADR ensures the declaration survives minification.
