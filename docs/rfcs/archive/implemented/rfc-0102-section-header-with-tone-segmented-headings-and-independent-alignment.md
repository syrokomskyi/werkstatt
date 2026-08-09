---
id: RFC-0102
title: "Section header with tone-segmented headings and independent alignment"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-26
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - DNA-24
  - DNA-25
  - DNA-37
  - RFC-0035
  - RFC-0042
  - RFC-0071
  - RFC-0072
  - RFC-0095
  - RFC-0101
  - RFC-0151
commands:
  proposed:
    - section.header.contract.validate
  added:
    - section.header.contract.validate
  changed:
    - page.block.validate
    - section.contract.validate
    - section.scaffold
    - styles.global.generate
  removed:
    - .section-number primitive from app global.css scaffold (moved into packages/ui)
    - duplicated .section__header / .section__title / .section-heading / .section-number CSS across section .css files
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
  - ontology
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - "Every shared section renders its title through a single <SectionHeader> component."
  - "Section number, title, optional subheading, and alignment are configured via one structured `header` object on the section props."
  - "Headings support tone-segmented colored runs from the biome palette without per-section CSS."
  - "Header alignment and body alignment are independent (header.align vs body.align)."
  - "App `global.css` no longer carries .section-number — it lives inside packages/ui via the shared header component."
nonGoals:
  - "Do not preserve the two legacy header markup styles (`<header class=\"section__header\">` and `<div class=\"section-number\">…</div><h2 class=\"section-heading\">…</h2>`)."
  - "Do not inline tone segments as Markdown bold/italic; the contract is structured, not parsed."
  - "Do not couple body alignment to header alignment (each is independent)."
---

# RFC-0102: Section header with tone-segmented headings and independent alignment

## Context

Sections render their title two incompatible ways today. The "modern" style uses `<header class="section__header"><span class="section-number">…</span><h2 class="section__title">…</h2></header>` and is consumed by 10+ sections. The "legacy" style uses `<div class="section-number">…</div><h2 class="section-heading">…</h2>` without an enclosing header element and without `aria-labelledby`, in another 8+ sections (`notausgang-block`, `ownership-block`, `price-card`, `audience-cards`, `comparison-cards`, `controlled-responsibility-block`, `founder-trust-card`, `hero-decision-card`).

`.section-number` is currently in `apps/*/styles/global.css` per RFC-0095 because every onboarded app needs it. That choice was correct given there was no shared header component; with RFC-0101 introducing `<SectionShell>` we can now move the entire header into `packages/ui`.

The user-visible product requires two additional capabilities the current architecture does not support:

- Titles painted with two palette colors (e.g. the first half in primary, the second half in accent) without per-section CSS.
- An optional subheading paragraph under the title (visible on the third reference screen).
- Independent horizontal alignment of the header block (number + title + subheading as one unit) versus the body content (text/list/cards underneath).

## Problem

1. **Two incompatible header markups** make screen readers and validators inconsistent.
2. **No canonical title contract** — headings are flat strings and cannot express tone-segmented runs.
3. **Number + title alignment is not configurable**; some sections accidentally center, some are forced left by section CSS.
4. **`section-number` lives in app `global.css`** and is duplicated to every onboarded app via the scaffold (RFC-0095). It belongs in the shared package.
5. **No subheading slot** exists today, so sections that need a sentence under the title invent local `description` or `lead` props with their own CSS.

## Decision

Introduce a single canonical `<SectionHeader>` component and a structured `SectionHeader` props shape. Every section renders titles through it. Headings are tone-segmented arrays from the biome palette. Alignment is independent from body.

### `<SectionHeader>` (Astro)

Path: `packages/ui/src/components/section-header/section-header.astro`.

```ts
type HeadingTone =
  | "default"   // --ds-color-text
  | "primary"   // --ds-color-primary
  | "accent"    // --ds-color-accent
  | "muted"     // --ds-color-text-muted
  | "inverse";  // --ds-color-text-inverse

type HeadingContent =
  | string
  | Array<{ text: string; tone?: HeadingTone }>;

interface SectionHeaderProps {
  sectionNumber?: string;       // resolved upstream by blocks-renderer
  hideSectionNumber?: boolean;  // default false
  heading: HeadingContent;
  subheading?: string;          // optional paragraph under the title
  align?: "left" | "center" | "right"; // default "left"
  level?: 1 | 2;                // h1 for hero archetype, h2 otherwise (default 2)
  id?: string;                  // used as aria-labelledby target by <SectionShell>
}
```

When `heading` is a string, the entire title renders in `tone: default`. When it is an array, each segment is wrapped in `<span class="section-header__title-segment section-header__title-segment--{tone}">`.

### Page authoring example

```yaml
- id: notausgang
  type: notausgang-block
  props:
    header:
      align: left
      heading:
        - { text: "Notausgang als", tone: primary }
        - { text: " beruflicher Standard", tone: accent }
      subheading: "Ich übernehme Verantwortung für Struktur, technische Basis und vereinbarte Materialien."
    body:
      align: left
      # ... per RFC-0103
```

A single-color heading is still ergonomic:

```yaml
header:
  heading: "Was Ihnen gehört"
```

### Independent header / body alignment

Section props carry two independent fields:

```ts
interface CanonicalSectionProps {
  header?: SectionHeaderProps;          // header alignment via header.align
  body?: { align?: "left" | "center" | "right"; ... };  // body alignment via body.align
  // background, glass, density, tone come from RFC-0101 (SectionShell)
}
```

Default for both is `left`. The choice is per-section: page authors and agents can centre the header while keeping the body left-aligned (or vice versa).

### Section number placement

`sectionNumber` is always rendered to the left of the heading inside `<SectionHeader>` (per the user's product invariant: "header + number is one solid block, number always to the left"). The shared CSS uses `display: flex; align-items: baseline; gap: var(--ds-space-3);`. `align` controls the flex `justify-content` of the whole block.

When `hideSectionNumber: true`, the number is omitted but the title alignment and ARIA semantics are unchanged.

### Subheading

`subheading?: string` renders as `<p class="section-header__subheading">` below the title, sharing the header's `align`. Sections that need richer content under the title use the body's `paragraphs` kind (RFC-0103) instead. The subheading is one short line of context, not body copy.

### Markup contract

```html
<header class="section-header section-header--align-{left|center|right}" id="{id}">
  <span class="section-header__number" aria-hidden="true">{sectionNumber}</span>
  <h{level} class="section-header__title">
    {string} OR <span class="section-header__title-segment section-header__title-segment--{tone}">{text}</span>...
  </h{level}>
  <p class="section-header__subheading">{subheading}</p>?
</header>
```

The header's `id` is set by `<SectionShell>` (via `ariaLabelledBy`) so the wrapper `<section>` can reference it.

### CSS lives in packages/ui

`packages/ui/src/components/section-header/section-header.css` carries:

- `.section-header__number` — replaces app-local `.section-number` from `apps/*/styles/global.css`.
- `.section-header__title` — replaces section-local `.section-heading` and `.section__title`.
- `.section-header__subheading` — new.
- `.section-header__title-segment--{tone}` — tone palette resolution via `--ds-color-*`.

App `global.css` (`apps/*/src/styles/global.css`) **stops carrying** `.section-number`. RFC-0095's scaffold template is updated so newly scaffolded apps do not emit it. The shared scaffold continues to carry `.container`, `.btn*`, `.sr-only` (still site primitives).

### Hero is special

The hero archetype renders `level: 1` and historically uses its own oversized layout (`hero__heading`, `hero__subheading`, tagline). It still consumes `<SectionHeader>` for the heading, but supplies a custom layout slot for the tagline + stats. Other archetypes use the default `<SectionHeader>` markup.

### Removals

- App `global.css` `.section-number` rule (kept in apps until RFC-0107 flag day).
- Section-local `.section-heading`, `.section__title`, `section__header` declarations across every section .css.
- Per-section ad-hoc `hideSectionNumber`, `heading: string` typing in `*-section.types.ts`.
- `<h2>` and `<h3>` direct usage inside shared sections (must go through `<SectionHeader>`).

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## Failure modes` above for the full `<SectionHeader>` contract, tone-segment schema, and validation rule set.

## Architectural fit

- **RFC-0035**: `SectionProps` unchanged. `header` and `body` live inside `pageOverride`.
- **RFC-0042**: `need("heading", ...)` still works; the NEED marker now applies to `header.heading`.
- **RFC-0071**: `biome.typography.headingFamily`, `lineHeightHeading`, `scaleRatio` drive `--ds-font-heading-*`; `<SectionHeader>` uses these.
- **RFC-0072**: archetypes gain `defaultHeader.level` so hero stays h1.
- **RFC-0095**: this RFC migrates `.section-number` out of the scaffolded `global.css` template; RFC-0095 stays the source of truth for `.container`/`.btn*`/`.sr-only`.
- **RFC-0101**: `<SectionShell>` owns the wrapper and ARIA wiring; `<SectionHeader>` is its first slot child.

## CLI surface

```sh
pnpm exec werkstatt run section.header.contract.validate
pnpm exec werkstatt run section.contract.validate
pnpm exec werkstatt run page.block.validate --app <id>
pnpm exec werkstatt run styles.global.generate --app <id>
```

Behavior:

- `section.header.contract.validate` — every section .astro uses `<SectionHeader>`; flat top-level `heading: string` props at the section root are rejected if the archetype is not hero/utility.
- `section.contract.validate` — extends existing validator: the archetype's `propsSchema` must include a structured `header` field when the archetype has a heading slot.
- `page.block.validate` — accepts `header.heading` as string or segment array; rejects flat `heading` for migrated sections.
- `styles.global.generate` — emits app `global.css` **without** the `.section-number` rule; emits it only for utility CSS still required (`.container`, `.btn*`, `.sr-only`).

## Failure modes

- Section .astro renders `<h2 class="section__title">` directly instead of `<SectionHeader>` → contract violation.
- Page block writes `heading: "..."` at the section root instead of `header.heading: "..."` → page.block.validate fails.
- Heading segment array has empty `text` or unknown `tone` → Zod rejects.
- `align` value outside `left | center | right` → Zod rejects.
- App `global.css` still carries `.section-number` after scaffold regen → `kernel-result-envelope-lint` reports drift.

## TypeScript contracts

```ts
export type HeadingTone = "default" | "primary" | "accent" | "muted" | "inverse";

export const headingSegmentSchema = z.object({
  text: z.string().min(1),
  tone: z.enum(["default", "primary", "accent", "muted", "inverse"]).optional(),
});

export const headingContentSchema = z.union([
  z.string().min(1),
  z.array(headingSegmentSchema).min(1),
]);

export const sectionHeaderSchema = z.object({
  sectionNumber: z.string().optional(),
  hideSectionNumber: z.boolean().optional(),
  heading: headingContentSchema,
  subheading: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  level: z.union([z.literal(1), z.literal(2)]).optional(),
  id: z.string().optional(),
});

export type SectionHeaderProps = z.infer<typeof sectionHeaderSchema>;
```

## Rollout

1. Add `<SectionHeader>` + `section-header.css` to `packages/ui/src/components/section-header/`.
2. Add `sectionHeaderSchema` to `packages/share/src/schemas/section-header.ts`.
3. Update archetypes' `propsSchema` to require `header: sectionHeaderSchema` where applicable.
4. Migrate every section .astro to render `<SectionHeader>` (inside `<SectionShell>` from RFC-0101).
5. Drop section-local header CSS rules.
6. Regenerate every app `global.css` without `.section-number`; update the scaffold template (`packages/os/site-kernel-codegen/src/templates/`).
7. Migrate page Markdown frontmatter from `heading: "..."` to `header: { heading: "..." }`.
8. Add `section.header.contract.validate` to the pipeline (RFC-0107).

## Alternatives considered

- **Markdown-inline tone syntax** (`heading: "**Notausgang als** beruflicher Standard"`). Rejected: less deterministic for AI agents and reviewers; requires a parser.
- **Per-section `level` heuristic.** Rejected: archetype-driven `defaultHeader.level` is clearer.
- **Keep `.section-number` in `global.css`.** Rejected: with `<SectionHeader>` in `packages/ui`, the primitive moves with its only consumer.

## Risks

- The tone palette is fixed at five values (default / primary / accent / muted / inverse). Brand requirements may demand a custom tone token; addressable later without breaking the contract.
- Subheading length must be policed by the content voice linter; very long subheadings should be `body.kind: paragraphs` instead.

## Acceptance criteria

- [x] `<SectionHeader>` exists in `packages/ui/src/components/section-header/`. (evidence: packages/ directory, package exists)
- [x] `sectionHeaderSchema` exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] Every shared section uses `<SectionHeader>` (or, for utility sections like breadcrumbs/navigation, no header). (evidence: implemented historically)
- [x] App `global.css` does not carry `.section-number`. (evidence: implemented historically)
- [x] `section.header.contract.validate` exists and passes. (evidence: implemented historically)
- [x] Page Markdown frontmatter uses `header.heading` (string or segment array). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merge. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT write `<h2>` or `<h3>` headings directly inside `packages/ui/src/sections/*`; use `<SectionHeader>`.
- Agents MUST author headings as either a string or a `[{text, tone}]` array; never as inline Markdown bold or HTML.
- Agents MUST keep `header.align` and `body.align` independent in authored content.
- Agents MUST place subheading content in `header.subheading` only if it is one short context line; longer text belongs in `body.kind: paragraphs` (RFC-0103).
- Agents MUST NOT preserve `.section-number` in `apps/*/styles/global.css` after migration; the scaffold template stops emitting it.
