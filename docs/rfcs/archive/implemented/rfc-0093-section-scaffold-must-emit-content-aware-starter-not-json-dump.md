---
id: RFC-0093
title: "section.scaffold must emit a content-aware starter"
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
related:
  - RFC-0072
  - RFC-0091
commands:
  proposed:
    - section.placeholder.lint
  added:
    - section.placeholder.lint
  changed:
    - section.scaffold
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - os/site-kernel-codegen
  - os/site-kernel-checks
  - ui
successSignals:
  - 'First `pnpm --filter <app> dev` after onboarding produces a viewable page (no raw `{"items":[…]}` JSON on screen).'
  - "Every section component under `packages/ui/src/sections/` renders props as real HTML."
  - "`packages-check.run` fails any PR that adds or keeps a `JSON.stringify(pageOverride)` stub."
nonGoals:
  - Auto-generating bespoke markup per-archetype — authors still write archetype-specific layouts.
  - Removing the section-scaffold; the starter component is a baseline to customize, not a final implementation.
---

# RFC-0093: section.scaffold must emit a content-aware starter

## Context

`section.scaffold --name=<slug> --archetype=<id>` writes a new section component under `packages/ui/src/sections/<slug>/<slug>-section.astro`. Until May 2026 the template emitted:

```astro
---
import type { SectionProps } from "@gogol/share";
const { pageOverride } = Astro.props as SectionProps;
---

<section class="my-section">
  <div class="container">{JSON.stringify(pageOverride ?? {})}</div>
</section>
```

That is a developer-debug stub. Shipping it produces the page screenshot the May 2026 warpgogol-com onboarding handed off: the entire site is a wall of `{"items":[{"label":"Preis","value":"70 €/Monat or 700 €/Jahr + 200 € Einrichtung"},…]}` text. No styling, no semantic structure, no recognizable site.

This pattern is invisible during the onboarding workflow because:

- `page.block.validate` checks that the block exists, that its props pass the propsSchema, and that the component is registered. It does NOT render.
- `apps-check.author` runs static validators on content, not on rendered HTML.
- `pnpm build` succeeds — the Astro template compiles fine.
- `pnpm dev` succeeds at startup — the error only shows when a human opens the page.

The agent finishes the workflow with a green ladder and the site is still unfit to show.

## Problem

1. The scaffold's default output is unfit for production by construction.
2. Nothing in the pipeline detects the stub before handoff.
3. New apps onboarded against the handwerk-trust-funnel family produced 9 such stubs at once.

## Decision

**A. Replace the scaffold template** with a content-aware starter that renders the most common `pageOverride` shapes — `heading`, `kicker`, `body`, `items[]`, `cards[]`, `cta` — using semantic HTML and biome tokens. Unknown extra props are silently ignored at render time; the propsSchema validator catches genuinely required missing fields. The starter is a baseline; authors customize per archetype.

**B. Add `section.placeholder.lint`** to `PACKAGES_CHECK_PIPELINE`. It scans every `.astro` file under `packages/ui/src/sections/` and fails on any file matching `JSON\.stringify\s*\(\s*pageOverride`. Failure prints the section name and points at this RFC.

**C. Backfill the 9 warpgogol-com handwerk sections** scaffolded during the May 2026 onboarding with real content-aware markup using biome tokens.

## Architectural fit

- **RFC-0072** introduced section archetypes with `semanticRole` and `layoutHint`. This RFC requires the scaffold output to respect both.
- **RFC-0091** derived the runtime `PLANET_IMPORT_PATHS` from the archetype catalog. RFC-0093 ensures the components those paths point at are renderable, not stubs.

## Design

### New starter template (excerpt)

```astro
---
import type { SectionProps } from "@gogol/share";
import "./<slug>-section.css";

interface Cta { label: string; target: string }
interface Card { label?: string; title?: string; description?: string; body?: string }
interface Override {
  hideSectionNumber?: boolean;
  heading?: string;
  kicker?: string;
  body?: string;
  items?: string[];
  cards?: Card[];
  cta?: Cta;
}

const { sectionNumber, linkRegistry = {}, pageOverride } = Astro.props as SectionProps;
const o = (pageOverride ?? {}) as Override;
const resolve = (t?: string) => (t ? linkRegistry[t] ?? `#${t}` : "#");
---

<section class="<slug>">
  <div class="container">
    {!o.hideSectionNumber && <div class="section-number">{sectionNumber}</div>}
    {o.kicker && <p class="section-kicker">{o.kicker}</p>}
    {o.heading && <h2 class="section-heading">{o.heading}</h2>}
    {o.body && <p class="section-body">{o.body}</p>}
    {o.items && <ul class="section-items">{o.items.map((it) => <li>{it}</li>)}</ul>}
    {o.cards && (
      <div class="section-cards">
        {o.cards.map((c) => (
          <article class="section-card">
            {(c.label || c.title) && <h3>{c.label ?? c.title}</h3>}
            {(c.description || c.body) && <p>{c.description ?? c.body}</p>}
          </article>
        ))}
      </div>
    )}
    {o.cta && <a class="cta cta-primary" href={resolve(o.cta.target)}>{o.cta.label}</a>}
  </div>
</section>
```

### Lint output

```
[ERROR] packages/ui/src/sections/hero-decision-card/hero-decision-card-section.astro —
        section "hero-decision-card" still renders the JSON.stringify(pageOverride)
        scaffold stub. Replace it with content-aware markup that renders the section's
        actual props (heading, body, items, cta, …). The site-kernel-codegen
        section.scaffold template (RFC-0093) emits a starter with this shape — use it
        as the baseline and customize for the archetype's layoutHint.
```

## Rollout

1. Update `packages/os/site-kernel-codegen/src/section-scaffold.ts` to emit the new starter (this RFC ships the change).
2. Implement `section.placeholder.lint` in `packages/os/site-kernel-checks/src/section-placeholder.ts`. Register in `module.ts`, wire into `PACKAGES_CHECK_PIPELINE`.
3. Backfill the 9 warpgogol-com sections (hero-decision-card, trust-strip, comparison-cards, audience-cards, ownership-block, notausgang-block, controlled-responsibility-block, price-card, founder-trust-card) with bespoke markup matching their content schemas.
4. Verify `pnpm --filter warpgogol-com dev` renders `/de/` with no raw JSON visible.
5. Update root `AGENTS.md` to note the lint and the scaffold's new behavior.

## Alternatives considered

- **Render bespoke markup per archetype from the YAML manifest.** Generating component HTML from a YAML schema is brittle and forces the manifest to know layout details. The starter handles the 80% case; authors keep full control of the remaining 20%.
- **Block-list `JSON.stringify(pageOverride)` in code review only.** Already proven insufficient — the May 2026 onboarding shipped 9 stubs and `apps-check.run` was fully green.
- **Make the scaffold prompt for fields interactively.** Adds friction to the workflow without solving the "still ships a stub" failure mode.

## Risks

- An archetype with unusual props (e.g. images, maps) needs custom markup; the starter cannot infer everything. Mitigation: starter renders only what it recognizes; authors customize. The lint blocks only the JSON-dump pattern, not under-rendering.
- A future stub helper might rephrase the JSON dump. Mitigation: the regex matches `JSON.stringify(pageOverride…)` directly; a substantively different stub would need a new lint rule. Add new patterns when discovered.

## Acceptance criteria

- [x] `section.scaffold` writes a content-aware starter, not `{JSON.stringify(pageOverride ?? {})}`. (evidence: implemented historically)
- [x] `section.placeholder.lint` workspace command registered and wired into `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] The 9 warpgogol-com handwerk sections backfilled with content-aware markup. (evidence: implemented historically)
- [x] `pnpm --filter warpgogol-com dev` → `curl /de/` returns rendered HTML with no `JSON.stringify` text visible. (evidence: implemented historically)
- [x] Root `AGENTS.md` mentions the lint and the new scaffold behavior. (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- When `section.placeholder.lint` fires, agents MUST replace the stub with content-aware markup for that section before any other handoff. The starter template in this RFC is the recommended baseline.
- When scaffolding a section whose archetype has an unusual prop shape (image, geometry, third-party embed), agents MAY extend the starter with additional rendering branches and add the corresponding CSS in `<slug>-section.css`.
- Do NOT solve a failing `section.placeholder.lint` by deleting the JSON.stringify line and shipping an empty section. The lint reports under-rendering implicitly via the empty page; future iterations of this RFC may add a "section has at least one rendered field" assertion.
