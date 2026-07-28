---
id: ADR-0006
title: "Add eyebrow prop to markdown section schema"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: package
decider: architecture
createdAt: 2026-07-28
updatedAt: 2026-07-28
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0567
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0006: Add eyebrow prop to markdown section schema

## Context

The `markdown` section (`packages/ui/src/sections/markdown/`) uses a flat header interface: `heading` and `lead` are direct props, not a nested `header` object composing `section-header`. This is by design — the markdown archetype (`packages/ontology/archetypes/sections/markdown.yaml`) explicitly states that its header lives inline because the layout is fundamentally different from other sections.

RFC-0567 extended the `section-header` fragment with an `eyebrow` field (a short contextual label rendered above the heading). However, because `markdown` does not compose `section-header`, it cannot receive `eyebrow` through that fragment.

The `enhance-site-pages` workflow (mission `warpgogol-com-m000015`) added `header: { eyebrow: "..." }` to UK legal pages (`impressum`, `datenschutz`, `agb`, `barrierefreiheit`) using the `markdown` block type. This causes PAGE-PROPS-01 validation errors because `markdown` does not allow a `header` object.

## Decision

Add `eyebrow` as a flat string prop to the `markdown` section schema, alongside the existing flat `heading` and `lead` props.

- The prop lives at the section root (`props.eyebrow`), not inside a `header` object.
- The `markdown-section.astro` template passes `eyebrow` to `<SectionHeader>` when present.
- The `markdown` archetype (`packages/ontology/archetypes/sections/markdown.yaml`) is updated to declare `eyebrow` in its local props schema.

## Justification

The markdown archetype deliberately uses flat header props (`heading`, `lead`) instead of composing `section-header`. Composing `section-header` would change the interface from flat to nested (`header: { heading, eyebrow, subheading }`) and break all existing markdown content across all sites and languages.

Adding `eyebrow` as a flat prop preserves the existing interface, requires minimal schema and template changes, and aligns with RFC-0567's intent of making `eyebrow` available to sections that need it. The `markdown-section.astro` template already uses `<SectionHeader>` with flat props, so passing `eyebrow` through is a one-line change.

Alternative considered: composing `section-header` in the markdown manifest. Rejected because it would break backward compatibility with all existing markdown blocks that use flat `heading`/`lead`.

## Consequences

- Positive: UK legal pages can use `eyebrow` without validation errors; markdown section gains parity with other sections that support `eyebrow` via `section-header`.
- Negative: `markdown` now has a local `eyebrow` prop that duplicates the `eyebrow` field in `section-header`. Authors must remember that markdown uses flat `eyebrow` while other sections use `header.eyebrow`.
- Technical debt: if markdown ever composes `section-header` in the future, the flat `eyebrow` prop becomes redundant and must be migrated.

## Evolution

Revisit this decision if:

- The markdown archetype is refactored to compose `section-header` (at which point the flat `eyebrow` prop should be removed in favor of `header.eyebrow`).
- A second flat prop beyond `eyebrow` is needed from `section-header` (e.g. `align`, `level`), which would signal that composing the fragment is cheaper than duplicating fields.
