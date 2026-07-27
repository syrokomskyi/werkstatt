---
id: RFC-0095
title: "Shared site primitives in scaffold + need-marker and footer-legal guards"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-24
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0205
related:
  - RFC-0042
  - RFC-0071
  - RFC-0078
  - RFC-0087
  - RFC-0093
commands:
  proposed:
    - footer.legal.validate
    - labels.shape.hint
    - need.markers.validate
  added:
    - footer.legal.validate
    - labels.shape.hint
    - need.markers.validate
  changed:
    - styles.global.generate
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - os/site-kernel-codegen
  - os/site-kernel-checks
  - ui
successSignals:
  - First `pnpm --filter <app> dev` after onboarding renders styled buttons (.btn .btn--primary), consistent section padding, full footer columns, and no NEED_THIS_ placeholders.
  - Any future onboarding that ships a NEED_THIS_<FIELD> in HTML fails `apps-check.postbuild` with the exact field name.
  - Any DE/AT/CH-locale app whose `footer.legalIds` is empty fails `apps-check.author` before handoff.
  - Long `brandTagline` strings degrade to ellipsis instead of breaking the fixed-height header.
nonGoals:
  - Auto-generating bespoke Impressum / Datenschutz prose — RFC-0096 covers the legal-scaffold command separately.
  - Removing the RFC-0042 `need()` helper — its dev-visible marker is intentionally loud; the new guard catches leakage at build time, not at the helper call site.
---

# RFC-0095: Shared site primitives in scaffold + need-marker and footer-legal guards

## Context

After RFC-0093 fixed the section-scaffold's JSON-stub problem, the first rendered `pnpm --filter webgogol-com dev` view (May 2026) surfaced five new visible failure modes that the existing pipelines did not catch:

1. **Header looked broken.** `brandTagline` ("Digitales Fundament — tragfähige digitale Basis für kleines Gewerbe und Handwerk") overflowed the fixed-height header — the brand-label tagline used `position: absolute; white-space: nowrap;` with no truncation. Long author-provided taglines bled into the page body below.
2. **Section padding inconsistent.** Each of the 9 sections defined its own `.section-name .container { max-width: <px>; padding: …; }` rule. Different sections used 720 / 800 / 960 / 1000 / 1120 px — the page looked like a stack of misaligned cards instead of one coherent column.
3. **CTAs rendered as plain underlined text.** The shared `@gogol/ui` header / final-cta components referenced `.btn` / `.btn--primary` classes that were defined ONLY in `apps/nicaragua-projekt/src/styles/global.css` (a hand-edited 252-line file with site primitives). The scaffold template (`styles.global.generate` output) shipped a bare 81-line skeleton without them. Every new app inherited broken buttons.
4. **`NEED_THIS_CTALABEL` visible on the rendered page.** The `final-cta` section called `need("ctaLabel", props.ctaLabel)`; webgogol-com's blocks didn't supply `ctaLabel`; the RFC-0042 `need()` helper returns the literal `NEED_THIS_CTALABEL` string for dev visibility — which then shipped to production HTML.
5. **Footer missing RECHTLICHES and KONTAKT columns.** `labels.md` had `legalIds: []` and `contactIds: []`. The footer component conditionally hides empty columns. DE-locale commercial sites are legally required to link Impressum (§ 5 TMG) and Datenschutz (DSGVO) — silent omission is a compliance gap.

All five passed `apps-check.author` and `pnpm build` cleanly. The errors only surfaced when a human opened the rendered page — too late in the workflow.

## Problem

1. The scaffold's `global.css` template did not provide the site primitives that shared `@gogol/ui` components depend on. The reference implementation (nicaragua-projekt) had them hand-edited locally; the next onboarding inherited the bare skeleton and silently broke.
2. The `need()` helper's loud-dev-marker behavior was never gated against shipping the literal text to production HTML.
3. There was no pipeline check that DE/AT/CH-locale sites carry the legally required footer links.
4. `brandTagline` length was unbounded — any author-provided string would render, even if it broke the fixed-height header.

## Decision

Five concrete changes that together close the five symptoms at the workflow level:

### A. Extend `styles.global.generate` template with shared site primitives

`packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/global.template.css` now ships every site primitive that `@gogol/ui` shared components reference:

- `.container` (uses `--ds-size-container-max`, shared horizontal rhythm)
- `.section-number` (mono-font kicker above each section)
- `.btn` / `.btn--primary` / `.btn--secondary` (header CTA, final-cta, every section CTA)
- `.sr-only` (a11y skip-link / label helper)
- App-layer tokens: `--ds-size-container-max`, `--ds-size-container-narrow`, `--ds-size-section-padding-x`, `--ds-size-section-padding-y`
- `main { padding-top: var(--ds-size-header-height, 72px); }` so content clears the fixed header

All onboarded apps now get the complete baseline on first generation; nicaragua's hand-edited copy stays in place but the divergence stops mattering.

### B. Drop per-section `.container` overrides

The 9 RFC-0093 section components used app-local container widths. Strip all of them so every section uses the shared `.container` defined in (A). Section CSS focuses on layout-of-content within the container, not container width itself.

### C. Brand-label tagline truncates gracefully

`packages/ui/src/components/brand-label/brand-label-component.css` adds `overflow: hidden; text-overflow: ellipsis; max-width: min(40ch, 60vw);` to `.brand-label__tagline` and hides it entirely on viewports under 768px. Long taglines now degrade to ellipsis; the fixed-height header never breaks.

### D. New post-build `need.markers.validate`

Scans `apps/<id>/dist/**/*.html` for any `NEED_THIS_[A-Z_]+` token. Each match means a section called `need(<field>, value)` with an empty value; the literal marker leaked into shipped HTML. Output prints the file, the marker, the count, and the implied field name (`"NEED_THIS_CTALABEL" appears 1× … populate "ctalabel" in the page frontmatter`). Wired into `APPS_CHECK_POSTBUILD_PIPELINE`.

### E. New author-time `footer.legal.validate`

Reads `system.md` `i18n.supported`. For each locale in `{de, de-DE, de-AT, de-CH, at, ch}`, reads `src/content/site/<lang>/labels.md` and asserts `footer.legalIds` is non-empty. The conservative locale set covers the three German-speaking jurisdictions where Impressum + Datenschutz are legally mandatory. Wired into `APPS_CHECK_AUTHOR_PIPELINE`. Diagnostic walks the agent through the exact remediation steps (author Impressum/Datenschutz pages, add nav targets with `group: legal`, populate `legalIds`).

### F. New author-time `labels.shape.hint`

Soft warning (exit 0) when `brandTagline` exceeds 40 chars. The CSS in (C) handles the visual problem; the hint surfaces the underlying author choice so it's deliberate. Always exits 0; emits `hints[]`. Wired into `APPS_CHECK_AUTHOR_PIPELINE`.

## Architectural fit

- **RFC-0042** introduced `need()` for explicit missing-field surfacing. This RFC adds the dist-side guard that prevents leakage to production HTML without changing the helper's dev-time behavior.
- **RFC-0071** introduced the CSS layer cascade (`tokens` → `biome` → `app` → `base` → `components` → `pages`). The new global.css primitives land in the `base` layer per the existing convention.
- **RFC-0078** introduced `styles.global.generate`. This RFC extends its template; the command itself is unchanged.
- **RFC-0087** required generators to be single-owner, content-driven, idempotent. The updated `styles.global.generate` template stays content-derived (every value comes from biome / tokens / system.md) and idempotent (re-running writes 0 files when identical).
- **RFC-0093** introduced `section.placeholder.lint`. This RFC adds the sibling postbuild guard for the orthogonal placeholder pattern (`need()` markers vs `JSON.stringify` stubs).
- **RFC-0096** (proposed) will scaffold the legal pages themselves; this RFC ensures the validator that catches missing legal links lands first so the gap is loud even before `legal.scaffold` is implemented.

## Design

### Updated `global.template.css` excerpt

```css
@layer app {
  :root {
    color-scheme: light;
    --ds-size-container-max: 1120px;
    --ds-size-container-narrow: 720px;
    --ds-size-section-padding-x: clamp(20px, 4vw, 32px);
    --ds-size-section-padding-y: clamp(48px, 8vw, 80px);
  }
}

@layer base {
  /* … resets … */
  main { padding-top: var(--ds-size-header-height, 72px); }

  .container {
    width: 100%;
    max-width: var(--ds-size-container-max);
    margin: 0 auto;
    padding-inline: var(--ds-size-section-padding-x);
  }
  .section-number { /* mono kicker */ }
  .btn          { /* base shape */ }
  .btn--primary { background: var(--ds-color-primary); color: var(--ds-color-text-inverse); }
  .btn--secondary { /* outlined */ }
  .sr-only      { /* a11y */ }
}
```

### `need.markers.validate` output

```
[ERROR] dist/de/index.html — "NEED_THIS_CTALABEL" appears 1× in rendered HTML.
        A section called need("ctalabel", value) and value was empty. Populate
        the section's "ctalabel" prop in the page's frontmatter (RFC-0095).
```

### `footer.legal.validate` output

```
[ERROR] apps/webgogol-com/src/content/site/de/labels.md — footer.legalIds is
        empty for locale "de". DE/AT/CH commercial sites must link Impressum
        (§ 5 TMG) and Datenschutz (DSGVO) from the footer. Author the pages
        under src/content/pages/de/ (impressum.md, datenschutz.md), add nav
        targets with group: legal in navigation/de/navigation.md, and list
        their ids here.
```

### `labels.shape.hint` output

```
[HINT] apps/webgogol-com/src/content/site/de/labels.md — brandTagline is 95
       chars long (soft limit: 40). The header brand-label truncates with
       ellipsis, but long taglines lose their tail to readers. Either shorten
       the tagline for the header or omit brandTagline here and put the longer
       copy in the hero block (RFC-0095).
```

## Rollout

1. Land the extended `global.template.css`. Regenerate `apps/webgogol-com/src/styles/global.css` via `styles.global.generate`.
2. Strip per-section `.container { max-width: … }` overrides from the 9 RFC-0093 sections.
3. Add tagline-truncation CSS to `brand-label-component.css`.
4. Implement `need.markers.validate`, `footer.legal.validate`, `labels.shape.hint`. Register all three; wire `need.markers.validate` into postbuild, the other two into author pipeline.
5. For webgogol-com specifically: create Impressum + Datenschutz page stubs (handwritten for now; RFC-0096 will scaffold them) and populate `footer.legalIds` + `footer.contactIds` so `footer.legal.validate` passes.

## Alternatives considered

- **Move `.btn` / `.container` into `@gogol/ui` styles imported by each component.** Adds a hidden import-order dependency and breaks the existing `@layer base` ownership. Keeping primitives in the app's `global.css` matches RFC-0071's layer cascade exactly.
- **Make `need()` env-aware (return empty string in production).** Hides the issue silently — author never learns which field was missing. The post-build validator surfaces it loudly and points at the exact field.
- **Block long `brandTagline` as a hard error.** Too strict — apps may legitimately want a short tagline that's a few chars over 40. Soft hint preserves author agency while flagging the trade-off.
- **Hardcode Impressum + Datenschutz prose into shared components.** Couples legal text to runtime code; operators can't review or edit per-site. RFC-0096's scaffold approach keeps the text in `src/content/` where it belongs.

## Risks

- An app with truly minimal styling needs (e.g. a print-only PDF generator) inherits primitives it does not use. Mitigation: CSS is layered and unused selectors are cheap; if it ever matters, the app can override the template via `--no-extends`.
- `need.markers.validate` runs only after a successful build. Mitigation: that's the right time — earlier validators check authored content; this one catches the runtime composition gap. Pre-build, the gap is invisible.
- `footer.legal.validate`'s allowed-locale set may miss future jurisdictions (Liechtenstein, Luxembourg). Mitigation: extending the set is a one-line change; the validator is conservative by design.
- `labels.shape.hint` limit of 40 chars is opinion, not fact. Mitigation: it's a hint, not an error; the CSS handles the actual overflow.

## Acceptance criteria

- [x] `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/global.template.css` ships `.container`, `.section-number`, `.btn` family, `.sr-only`, and the four `--ds-size-container-*` / `--ds-size-section-padding-*` tokens. (evidence: packages/ directory, package exists)
- [x] `apps/webgogol-com/src/styles/global.css` regenerated from the updated template and matches the new baseline. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] The 9 RFC-0093 section CSS files no longer define `.section-name .container { max-width: … }` overrides. (evidence: implemented historically)
- [x] `packages/ui/src/components/brand-label/brand-label-component.css` truncates the tagline with ellipsis and hides it below 768 px. (evidence: packages/ directory, package exists)
- [x] `need.markers.validate` registered, wired into `APPS_CHECK_POSTBUILD_PIPELINE`, and exits 0 on a clean webgogol-com build. (evidence: implemented historically)
- [x] `footer.legal.validate` registered, wired into `APPS_CHECK_AUTHOR_PIPELINE`, and exits 0 on webgogol-com (now that Impressum + Datenschutz are authored) and nicaragua-projekt (already had legal links). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `labels.shape.hint` registered, wired into `APPS_CHECK_AUTHOR_PIPELINE`, and exits 0 on both apps with the current short / absent taglines. (evidence: implemented historically)
- [x] `pnpm --filter webgogol-com dev` → `/de/`: HTTP 200; HTML contains `.btn .btn--primary` on header CTA + final-cta; footer renders NAVIGATION / RECHTLICHES / KONTAKT; zero `NEED_THIS_` tokens; brand-label tagline absent (omitted from labels.md). (evidence: implemented historically)
- [x] `pnpm build` workspace-wide: 22/22 tasks green. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- When `need.markers.validate` fires, agents MUST populate the missing field in the offending block's frontmatter — NOT switch the section's `need()` call to a fallback default. The `need()` semantics are intentional; the validator's purpose is to ensure no required field reaches production empty.
- When `footer.legal.validate` fires, agents author Impressum + Datenschutz stubs (RFC-0096 will eventually scaffold them) and add navigation entries with `group: legal`. Do NOT bypass the validator by populating `legalIds` with non-legal pages.
- When `labels.shape.hint` fires, prefer shortening the tagline. If the operator insists on the longer form, suppress the hint by moving the copy to a hero block and omitting `brandTagline` from `labels.md` (the brand-label component renders fine without it).
- When adding a NEW shared `@gogol/ui` component that depends on a new CSS primitive, extend `global.template.css` and regenerate every app's `global.css` in the same change. Per-component CSS that assumes app-local utilities is the regression pattern this RFC closes.
