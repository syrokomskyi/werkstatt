---
reviewId: REVIEW-CODE-2026-08-02-01
date: 2026-08-02
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: cb552dba..52d69f60
filesReviewed:
  - packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs
---

# Code Review: cb552dba..52d69f60 (ADR-0017 implementation)

### Verdict: Approved

The diff is a minimal 6-line change to the shared Astro build config template that correctly implements ADR-0017. It adds `cssMinify: "esbuild"` to the Vite build config, replacing lightningcss as the CSS minifier to preserve `background-color: inherit` declarations. The change is well-documented with an inline comment and a Compass CHANGE_SUMMARY entry referencing ADR-0017.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-onboarding run build:check` (tsc --noEmit) exits 0. `adr.validate --id ADR-0017` passes with zero errors.

### Axis A — Structural correctness

No issues. The change adds a single string-literal property (`cssMinify: "esbuild"`) to the existing `vite.build` object. The value `"esbuild"` is a valid member of Vite's `cssMinify` union type (`boolean | "lightningcss" | "esbuild"`). No magic numbers, no dead code, no duplicated logic, no error handling concerns.

### Axis B — DNA alignment

No issues. No DNA invariants govern CSS minification or build template configuration. DNA-3 (Astro as the site framework) permits per-app adapter configuration; the template is the shared starting point, and `config.regenerate` propagates changes to existing sites. DNA-10 (no hardcoded design tokens) is not affected — the change is about minification behavior, not token usage.

### Axis C — Ecosystem fit

No issues. The change is in the correct location: `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs` is the canonical shared build config template. The Compass CHANGE_SUMMARY entry was added. No new commands, no pipeline changes, no package boundary changes.

### Axis D — Forward-only compliance

No issues. The change directly sets `cssMinify: "esbuild"` — no dual paths, no feature flags, no backward compatibility shims. The previous default (lightningcss) is replaced, not maintained alongside.

### Axis E — Agent-facing clarity

No issues. The inline comment (`[ADR-0017]`) explains the rationale: lightningcss strips `background-color: inherit` via its "remove default property sub-values" optimization, which breaks axe color-contrast checks. The CHANGE_SUMMARY entry references ADR-0017. Another agent reading this file can trace the decision to the ADR.

### Axis F — Pragmatism

No issues. The change is minimal — one property, one comment block, one CHANGE_SUMMARY entry. No new abstractions, no new commands, no scope creep.

### Axis G — Blind spots

No issues. esbuild CSS minification is faster than lightningcss, so no performance regression. The change applies to all sites via the shared template; existing sites receive the change through `config.regenerate` or `config.template.sync`, which is the standard propagation path for template changes. No edge cases specific to this change — `cssMinify: "esbuild"` is a well-supported Vite option.

### Spec compliance

| Requirement from ADR-0017 | Status | Evidence |
| --- | --- | --- |
| Use esbuild for CSS minification | Done | `astro.config.template.mjs:164` — `cssMinify: "esbuild"` |
| Apply to all sites via shared template | Done | Change is in `astro.config.template.mjs` |
| JS minification continues to use terser | Done | `astro.config.template.mjs:159` — `minify: "terser"` (unchanged) |

### Questions for the author

No questions — the diff is self-explanatory and correctly implements the ADR decision.
