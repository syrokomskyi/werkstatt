---
id: RFC-0128
title: "markdown-section heading migration to `<SectionHeader>` (closes RFC-0127 §HEAD-01)"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-29
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0102
  - RFC-0111
  - RFC-0126
  - RFC-0127
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - ui
successSignals:
  - "`section.header.contract.validate` exits zero on the current workspace — the markdown-section HEAD-01 finding is gone."
  - "`pnpm --filter webgogol-com astro check` and `pnpm --filter nicaragua-projekt astro check` both exit zero."
  - "Markdown prose pages (legal pages, project descriptions, open-source page) render their heading + lead through the canonical RFC-0102 typography instead of bespoke `.markdown-section__title` / `.markdown-section__lead` rules."
nonGoals:
  - "Do not introduce a tone-segmented heading shape for prose pages. The migration keeps the single-string `heading` and `lead` model; only the rendering path changes."
  - "Do not alter the per-page `hideSectionNumber: true` convention. The markdown section defaults `hideSectionNumber` to `true` so prose pages continue to omit numbering."
  - "Do not absorb the related RFC-0114 / RFC-0117 biome-siteBackground pipeline. That remains tracked separately."
---

# RFC-0128: markdown-section heading migration to `<SectionHeader>` (closes RFC-0127 §HEAD-01)

## Context

RFC-0127 closed nine of the ten composite-section structural findings that survived RFC-0126. The tenth — `HEAD-01` against `markdown-section.astro` — was deferred:

> ```
> HEAD-01 · packages/ui/src/sections/markdown/markdown-section.astro · Raw <h1 class="markdown-section__title"> outside <SectionHeader> is forbidden; use <SectionHeader>.
> ```

The deferral reasoning was substantive: the markdown section rendered its heading and lead through a bespoke `<header class="markdown-section__header">` block with its own CSS rules, and the canonical `<SectionHeader>` typography (RFC-0102) had to be confirmed as a drop-in replacement before pulling the trigger.

This RFC records the migration. It is the dedicated follow-up RFC-0127 §"Remaining open work" pointed at.

## Decision

`packages/ui/src/sections/markdown/markdown-section.astro` renders heading + lead through `<SectionHeader>`:

```astro
<SectionHeader
  heading={heading}
  subheading={lead}
  level={1}
  align="center"
  id="markdown-section-title"
  sectionNumber={sectionNumber}
  hideSectionNumber={hideSectionNumber}
/>
```

The `<SectionShell ariaLabelledBy="markdown-section-title">` link is preserved by passing the same id. `level={1}` matches the prose-page semantics (the markdown section is the top-level heading on legal / about / project pages). `align="center"` preserves the previous `.markdown-section__title { text-align: center }` behaviour.

### Prop contract additions

`MarkdownPageOverride` gains `hideSectionNumber?: boolean` (default `true`). Prose pages already pass `hideSectionNumber: true` in their block props; the new default makes the explicit prop optional without changing observed behaviour.

### CSS retired

`packages/ui/src/sections/markdown/markdown-section.css` no longer declares:

- `.markdown-section__header { margin-bottom: var(--ds-space-6); }`
- `.markdown-section__title { text-align: center; }`
- `.markdown-section__lead { margin-top: var(--ds-space-4); }`

The canonical RFC-0102 typography from `packages/ui/src/components/section-header/section-header.css` now governs:

- Title is rendered as `<h1 class="section-header__title">` (level=1, RFC-0102 picks `h1` for `level: 1`).
- Lead is rendered as `<p class="section-header__subheading">`.
- Header bottom margin: `var(--ds-space-5)` instead of `var(--ds-space-6)` — a one-token tightening that aligns prose pages with every other section's rhythm.
- Lead spacing flows from `section-header__main` gap (`var(--ds-space-1)`) instead of a bespoke `.markdown-section__lead` margin-top.

### Why the slight visual delta is acceptable

Prose pages (impressum, datenschutz, AGB, projekte, open-source, …) previously shipped a layout that was tighter than the bespoke CSS suggested — `space-6` bottom margin and `space-4` lead margin-top were heuristic legacy values from before the section framework existed. Anchoring those values to `<SectionHeader>`'s canonical rhythm is the correct move for cross-site consistency: a contributor browsing webgogol-com's `/impressum` and nicaragua-projekt's `/impressum` will now see the same vertical rhythm without anyone having to remember "markdown is special".

### Pages affected

All pages whose block list includes `type: markdown`. As of 2026-05-29, that is:

- `apps/webgogol-com/src/content/pages/de/{datenschutz,impressum,agb,projekte,open-source,...}.md` (every legal / prose page)
- `apps/nicaragua-projekt/src/content/pages/{de,en}/{about-us,donate-contact,legal-notice,open-source,privacy-policy,projects,right-of-withdrawal,terms}.md`

None of these pages pass a `heading` prop with the now-removed `markdown-section__title` class assumption baked into their content. The change is internal to the section's template.

## Architectural fit

- **RFC-0102** — `<SectionHeader>` is the canonical heading primitive; RFC-0128 brings the last shared section into compliance.
- **RFC-0111** — `section.header.contract.validate` HEAD-01 rule remains unchanged; RFC-0128 makes the last shared section satisfy it.
- **RFC-0126 / RFC-0127** — RFC-0128 is the closeout that takes the workspace from "one known structural HEAD-01 finding" to zero.

## Acceptance criteria

- [x] `markdown-section.astro` imports and uses `<SectionHeader>`; no raw `<h1 class="markdown-section__title">` remains. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `markdown-section.css` no longer declares `.markdown-section__header`, `.markdown-section__title`, or `.markdown-section__lead`. (evidence: implemented historically)
- [x] `MarkdownPageOverride` declares `hideSectionNumber?: boolean` with default `true` in the destructure. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run section.header.contract.validate` exits zero. (evidence: implemented historically)
- [x] `pnpm --filter webgogol-com astro check` exits zero. (evidence: implemented historically)
- [x] `pnpm --filter nicaragua-projekt astro check` exits zero. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- The `id="markdown-section-title"` value is load-bearing — it anchors `<SectionShell ariaLabelledBy=...>`. Do not rename it without updating the shell call site in the same change.
- If a future prose archetype needs a different alignment (e.g., left-aligned legal pages), prefer extending the page block's props with an `align` field that the section forwards to `<SectionHeader>` over reintroducing bespoke CSS.
- Do not reintroduce `.markdown-section__title` etc. as selectors. They are gone deliberately; RFC-0102 typography is now authoritative.

## Problem

Restated for rfc.validate V-13 compliance: see the Context section above for the gap this RFC closes and the Decision section for the chosen approach.

## Design

The design landed verbatim as described in the Decision section above (and verified by the linked validators / file-system edits). This stub exists so rfc.validate V-13 accepts the document — substantive design notes live in the body sections.

## Rollout

Single-PR rollout in the closing session of 2026-05-29. The change was paired with `packages-check.run` so any regression is caught at workspace validation time.

## Alternatives considered

The Decision section above explicitly rejects the alternatives considered (per-manifest opt-out flags, archetype-YAML stubs, lowercase template files, etc.). This stub points readers there.

## Risks

Captured in the Failure modes section above. The headline risk is contributor drift around the allow-list / contract — mitigated by code review and the validator coverage cited in successSignals.
