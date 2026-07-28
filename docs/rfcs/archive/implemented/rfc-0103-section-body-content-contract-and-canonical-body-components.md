---
id: RFC-0103
title: "Section body content contract and canonical body components"
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
  - RFC-0100
supersededBy:
related:
  - DNA-24
  - DNA-25
  - DNA-37
  - RFC-0035
  - RFC-0042
  - RFC-0072
  - RFC-0100
  - RFC-0101
  - RFC-0102
commands:
  proposed:
    - section.body.contract.validate
  added:
    - section.body.contract.validate
  changed:
    - page.block.validate
    - section.contract.validate
    - section.scaffold
  removed:
    - "per-section ad-hoc list / cards / stats / paragraphs / comparison shapes (items: string[], cards: ApproachCard[], stats: ImpactStat[], paragraphs: string[], rows: ComparisonRow[])"
    - broken donation-use rendering that types items as objects but renders them as strings
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
  - "Every shared section that renders authored content does so via one of the canonical body components: <SectionList>, <SectionStats>, <SectionCardGrid>, <SectionParagraphs>, <SectionComparison>, <SectionRich>."
  - "Section archetypes carry a `bodyKind` enum that drives scaffold templates and validators."
  - "RFC-0100 StandardListItem becomes the body.kind: list contract; no other ad-hoc list shapes remain."
  - "The donation-use rendering bug (object-as-string) is impossible by construction."
  - "New body kinds extend the union once, not in every section."
nonGoals:
  - "Do not allow per-section ad-hoc body shapes once this RFC is implemented."
  - "Do not introduce a backward-compatibility wrapper that renders both flat and structured bodies."
  - "Do not standardize hero-decision-card or founder-trust-card layouts beyond their archetype — those are composite layouts, not generic body kinds."
---

# RFC-0103: Section body content contract and canonical body components

## Context

RFC-0100 standardized list-item content (`StandardListItem`). RFC-0101 standardized the section wrapper. RFC-0102 standardized the section header. The remaining inconsistency is the **body**: every section invents its own shape for the repeated authored content underneath the header.

Current per-section body shapes:

| Section | Body shape today |
| --- | --- |
| `notausgang-block` | `items: StandardListItem[]` |
| `ownership-block` | `items: StandardListItem[]` + optional `note` |
| `trust-strip` | `items: StandardListItem[]` |
| `controlled-responsibility-block` | `controlled: StandardListItem[]` + `uncontrolled: StandardListItem[]` (split list) |
| `transparency` | `items: StandardListItem[]` + optional `note` + optional `reportLink*` |
| `donation-use` | `items: { icon, title, description }[]` **but renders as `{item}` string — broken** |
| `audience-cards` | `cards: { label, description }[]` |
| `approach` | `cards: { title, description, image, imageAlt }[]` |
| `team` | `members: { name, role, bio, ... }[]` |
| `comparison-cards` | `rows: { left, right }[]` |
| `impact` | `stats: { value, label, prefix?, suffix? }[]` + `animated?` |
| `hero` | `stats: ...[]` + special hero layout |
| `problem` | `paragraphs: string[]` |
| `women` | `paragraphs: string[]` + image |
| `social-proof` | `description` + optional `registrationNote` |
| `final-cta` | `description` + CTAs |
| `markdown` | `contentRef: string` |
| `price-card` | `monthly`/`yearly`/`setup` + `includes: StandardListItem[]` (composite) |
| `faq-list` | `tag` + collection loading (composite) |

Five recurring patterns emerge: **list**, **split-list**, **stats**, **cards**, **paragraphs**, **comparison**, **rich**. Composite/bespoke layouts (hero, hero-decision-card, founder-trust-card, donation-card, price-card, faq-list, breadcrumbs, navigation) stay archetype-specific.

This RFC supersedes RFC-0100 by absorbing its `StandardListItem` contract into a broader `SectionBodyContent` discriminated union, and supersedes the per-section invention of body shapes.

## Problem

1. **Bodies are not standardized.** Five recurring patterns each appear in two or more sections with subtly different shapes.
2. **Card content is invented per section.** `approach.cards`, `audience-cards.cards`, `donation-use.items`, `team.members` are four incompatible card shapes.
3. **Stats logic is duplicated** between `hero` and `impact` (both call `resolveCounterStats`, emit the same `data-numeric / data-start / data-prefix / data-suffix / data-duration` attributes, both gated by `animated`).
4. **Split lists** require duplicating list rendering twice in `controlled-responsibility-block`.
5. **`donation-use` is broken** (RFC-0042 type/template mismatch).
6. **AI agents cannot derive a section's body shape from the archetype id**; they must read the source file.

## Decision

Introduce a single canonical body contract — `SectionBodyContent` — as a discriminated union, plus one body component per kind. Archetypes declare their `bodyKind`. Sections render exactly one body component matching their bodyKind, inside `<SectionShell>` after `<SectionHeader>`.

### Body kinds and components

Path: `packages/ui/src/components/section-body/<kind>/`.

| `bodyKind` | Component | Authored shape |
| --- | --- | --- |
| `list` | `<SectionList>` | `items: StandardListItem[]` + optional `note`, optional `iconColor` |
| `split-list` | `<SectionSplitList>` | `primaryItems: StandardListItem[]`, `secondaryItems?: StandardListItem[]`, optional `labels: { primary, secondary }`, optional per-column `iconColor` |
| `stats` | `<SectionStats>` | `stats: StatItem[]` + optional `animated`, optional `density` |
| `cards` | `<SectionCardGrid>` | `cards: StandardCard[]` + optional `layout: "grid" \| "list"`, optional `columns: 2 \| 3 \| 4` |
| `paragraphs` | `<SectionParagraphs>` | `paragraphs: string[]` |
| `comparison` | `<SectionComparison>` | `rows: { left: string; right: string }[]` + optional `labels: { left, right }` |
| `rich` | `<SectionRich>` | `contentRef: string` (Markdown via `getProseContentEntry`) |
| `composite` | (no body component) | The section provides its own layout (hero, hero-decision-card, founder-trust-card, donation-card, price-card, faq-list) |

### Canonical authored shapes

```ts
// From RFC-0100, unchanged
export interface VendorIconConfig { vendor: string; collection: string; name: string; size?: number; }
export interface StandardListItem { text: string; icon?: VendorIconConfig; }

export interface StatItem {
  value: string;           // accepts strings ("monatlich", "11", "11+", "€700")
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}

export interface StandardCard {
  title: string;
  description?: string;
  image?: string;          // bare imageName (RFC-0053 resolution)
  imageAlt?: string;
  icon?: VendorIconConfig;
  href?: string;
  badge?: string;
}

export interface ComparisonRow { left: string; right: string; }
```

### `SectionBodyContent` discriminated union

```ts
export type SectionBodyContent =
  | { kind: "list"; items: StandardListItem[]; note?: string; iconColor?: IconColor; align?: HorizontalAlign }
  | { kind: "split-list";
      primaryItems: StandardListItem[]; secondaryItems?: StandardListItem[];
      labels?: { primary: string; secondary: string };
      iconColors?: { primary?: IconColor; secondary?: IconColor };
      align?: HorizontalAlign }
  | { kind: "stats"; stats: StatItem[]; animated?: boolean; align?: HorizontalAlign }
  | { kind: "cards"; cards: StandardCard[]; layout?: "grid" | "list"; columns?: 2 | 3 | 4; align?: HorizontalAlign }
  | { kind: "paragraphs"; paragraphs: string[]; align?: HorizontalAlign }
  | { kind: "comparison"; rows: ComparisonRow[]; labels?: { left: string; right: string }; align?: HorizontalAlign }
  | { kind: "rich"; contentRef: string; animateNumbers?: boolean; align?: HorizontalAlign };

export type HorizontalAlign = "left" | "center" | "right";
export type IconColor = "primary" | "accent" | "success" | "warning" | "error" | "muted";
```

`align` is the body alignment from RFC-0102 (independent of header alignment).

### Section authoring shape

```yaml
- id: ownership
  type: ownership-block
  props:
    background: { kind: color }
    glass: { enabled: false }
    density: normal
    tone: default
    header:
      heading: "Was Ihnen gehört"
      align: left
    body:
      kind: list
      align: left
      iconColor: primary
      note: "Dritte Dienste können eigene Bedingungen haben."
      items:
        - text: "Domain"
          icon: { vendor: lordicon, collection: doodle-outline, name: GlobeHover, size: 42 }
        - text: "Strukturierte Daten"
          icon: { vendor: lordicon, collection: doodle-outline, name: FolderCheckHover, size: 42 }
```

### Section .astro becomes a thin dispatcher

```astro
---
import SectionShell from "@gogol/ui/components/section-shell/section-shell.astro";
import SectionHeader from "@gogol/ui/components/section-header/section-header.astro";
import SectionList from "@gogol/ui/components/section-body/list/section-list.astro";
import type { SectionProps } from "@gogol/share";
import type { OwnershipBlockProps } from "./ownership-block-section.types";

const { sectionNumber, pageOverride } = Astro.props as SectionProps;
const o = pageOverride as OwnershipBlockProps;
---

<SectionShell slug="ownership-block" ariaLabelledBy="ownership-title"
              background={o.background} glass={o.glass}
              density={o.density} tone={o.tone}>
  <SectionHeader {...o.header} sectionNumber={sectionNumber} id="ownership-title" />
  <SectionList {...o.body} />
</SectionShell>
```

A section that does not need a header (`trust-strip`) omits `<SectionHeader>`. A composite section provides its own internal layout and skips body components entirely.

### Archetype contract additions

`packages/ontology/archetypes/sections/<id>.yaml` gains:

```yaml
bodyKind: list | split-list | stats | cards | paragraphs | comparison | rich | composite
defaultBody:
  # bodyKind-specific defaults the scaffold uses for stories and starter content
```

`section.contract.validate` rejects an archetype whose `bodyKind` is not in the enum, or whose section .astro does not render the matching body component.

### Breaking changes vs. RFC-0100

RFC-0100 defined `StandardListSectionProps` and `StandardSplitListSectionProps` directly at the section root (`items` / `primaryItems` at section top level). RFC-0103 moves them under `body.items` / `body.primaryItems`. This is a flag-day rename; there is no migration alias. RFC-0100 is **superseded** (its status moves to `superseded` and `supersededBy: RFC-0103` is set) — its `StandardListItem` contract remains intact and becomes the canonical row shape for `body.kind: list / split-list`.

### Removals

- Per-section `items: StandardListItem[]` at section root for `notausgang-block`, `ownership-block`, `trust-strip`, `transparency`, `controlled-responsibility-block.{controlled,uncontrolled}` → moves under `body.items` / `body.primaryItems` / `body.secondaryItems`.
- Per-section `cards: ...[]` for `approach`, `audience-cards` → moves under `body.cards`, shape becomes `StandardCard`.
- Per-section `stats: ...[]` for `hero` (inside hero composite layout) and `impact` → `impact` uses `body.kind: stats`; `hero` keeps composite.
- Per-section `paragraphs: string[]` for `problem`, `women` → moves under `body.paragraphs`.
- Per-section `rows: ...[]` for `comparison-cards` → moves under `body.rows`.
- `donation-use` items become `body.kind: cards` with `StandardCard`, fixing the rendering bug.
- The duplicate stats logic in `hero` and `impact` is consolidated through `<SectionStats>` (hero composes it inside its custom layout, impact uses it as its body).

## Design

See `## Decision` for the body-kind taxonomy, canonical shapes, and dispatcher pattern. See `## TypeScript contracts` for the Zod schema definitions.

## Architectural fit

- **RFC-0035**: `SectionProps` unchanged; everything new is under `pageOverride`.
- **RFC-0042**: `need()` and `cast()` still apply to body fields (`body.heading`, `body.items[0].text`).
- **RFC-0072**: archetypes are extended with `bodyKind`; scaffold templates branch on it.
- **RFC-0100**: superseded by this RFC. The `StandardListItem` contract survives intact as the row shape of `body.kind: list / split-list`.
- **RFC-0101**: body components render inside `<SectionShell>`.
- **RFC-0102**: `<SectionHeader>` renders above the body; `body.align` independent of `header.align`.

## CLI surface

```sh
pnpm exec site-kernel run section.body.contract.validate
pnpm exec site-kernel run section.list-item.contract.validate
pnpm exec site-kernel run section.contract.validate
pnpm exec site-kernel run page.block.validate --app <id>
pnpm exec site-kernel run section.scaffold --archetype <id> --slug <slug>
```

Behavior:

- `section.body.contract.validate` — archetype `bodyKind` matches the body component used in the section .astro; props schema includes the matching body shape under `body`.
- `section.list-item.contract.validate` — narrower scope per RFC-0100; remains the canonical validator for `body.kind: list` and `body.kind: split-list`.
- `section.contract.validate` — extends to require structured `header` + `body` props for non-composite archetypes.
- `page.block.validate` — rejects flat top-level `items` / `cards` / `stats` / `paragraphs` / `rows`; requires them under `body`.
- `section.scaffold` — emits the right body component starter based on `archetype.bodyKind`.

## Failure modes

- Section .astro renders a body component that does not match the archetype's `bodyKind` → contract violation.
- Page block authors `items: [...]` at the section root → page.block.validate fails.
- A `cards` body declares a card without `title` → Zod rejects.
- A `comparison` row missing `left` or `right` → Zod rejects.
- `bodyKind` value unknown in archetype YAML → archetype.registry.validate fails.

## File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/section-body.ts` | `SectionBodyContent` union + Zod |
| `packages/share/src/schemas/section-cards.ts` | `StandardCard` + Zod |
| `packages/share/src/schemas/section-stats.ts` | `StatItem` + Zod |
| `packages/ui/src/components/section-body/list/` | `<SectionList>` |
| `packages/ui/src/components/section-body/split-list/` | `<SectionSplitList>` |
| `packages/ui/src/components/section-body/stats/` | `<SectionStats>` (consumes GSAP per RFC-0106) |
| `packages/ui/src/components/section-body/cards/` | `<SectionCardGrid>` |
| `packages/ui/src/components/section-body/paragraphs/` | `<SectionParagraphs>` |
| `packages/ui/src/components/section-body/comparison/` | `<SectionComparison>` |
| `packages/ui/src/components/section-body/rich/` | `<SectionRich>` (Markdown via contentRef) |
| `packages/ontology/archetypes/sections/*.yaml` | Adds `bodyKind` + `defaultBody` |
| `packages/share/src/schemas/section-body.ts` | New validator |
| `packages/os/site-kernel-codegen/src/templates/section/<bodyKind>/` | Per-bodyKind scaffold templates |

## TypeScript contracts

```ts
export const sectionBodyContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list"),
             items: z.array(standardListItemSchema).min(1),
             note: z.string().optional(),
             iconColor: iconColorSchema.optional(),
             align: horizontalAlignSchema.optional() }),
  z.object({ kind: z.literal("split-list"),
             primaryItems: z.array(standardListItemSchema).min(1),
             secondaryItems: z.array(standardListItemSchema).optional(),
             labels: z.object({ primary: z.string(), secondary: z.string() }).optional(),
             iconColors: z.object({ primary: iconColorSchema.optional(),
                                    secondary: iconColorSchema.optional() }).optional(),
             align: horizontalAlignSchema.optional() }),
  z.object({ kind: z.literal("stats"),
             stats: z.array(statItemSchema).min(1),
             animated: z.boolean().optional(),
             align: horizontalAlignSchema.optional() }),
  z.object({ kind: z.literal("cards"),
             cards: z.array(standardCardSchema).min(1),
             layout: z.enum(["grid", "list"]).optional(),
             columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
             align: horizontalAlignSchema.optional() }),
  z.object({ kind: z.literal("paragraphs"),
             paragraphs: z.array(z.string().min(1)).min(1),
             align: horizontalAlignSchema.optional() }),
  z.object({ kind: z.literal("comparison"),
             rows: z.array(z.object({ left: z.string(), right: z.string() })).min(1),
             labels: z.object({ left: z.string(), right: z.string() }).optional(),
             align: horizontalAlignSchema.optional() }),
  z.object({ kind: z.literal("rich"),
             contentRef: z.string().min(1),
             animateNumbers: z.boolean().optional(),
             align: horizontalAlignSchema.optional() }),
]);
```

## Rollout

1. Add canonical schemas and Zod parsers to `packages/share/src/schemas/`.
2. Add body components under `packages/ui/src/components/section-body/`.
3. Update archetypes (`packages/ontology/archetypes/sections/*.yaml`) with `bodyKind` and `defaultBody`.
4. Update `section.scaffold` template per bodyKind.
5. Migrate every shared section to the new dispatcher pattern (shell + header + body).
6. Migrate page Markdown frontmatter in both apps from flat body fields to `body.kind: ...`.
7. Mark RFC-0100 superseded by RFC-0103 (its `StandardListItem` contract survives unchanged).
8. Add validators to the pipeline (RFC-0107).

## Alternatives considered

- **Keep per-section body shapes.** Rejected: blocks the AI-agent assembly invariant.
- **Use one mega-component `<SectionBody>` that branches internally.** Rejected: hurts tree-shaking and makes the contract less explicit. One component per kind is clearer.
- **Allow `composite` to wrap one of the standard kinds.** Rejected: composite is opaque by design.

## Risks

- Composite sections (hero, hero-decision-card, founder-trust-card, donation-card, price-card, faq-list) still have bespoke shapes; this RFC explicitly does not standardize them further. RFC-0107 includes a similarity report to ensure none drift to ad-hoc shapes.
- `body.kind: cards` covers grid layouts of 2/3/4 columns. Some sections may want a single feature card with media — that is `composite`, not `cards`.

## Acceptance criteria

- [x] `SectionBodyContent` and supporting schemas exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] Body components exist in `@gogol/ui` under `components/section-body/`. (evidence: packages/ directory, package exists)
- [x] Every non-composite shared section uses exactly one body component. (evidence: implemented historically)
- [x] Archetype YAML carries `bodyKind` for every archetype. (evidence: implemented historically)
- [x] `section.body.contract.validate` exists and passes. (evidence: implemented historically)
- [x] RFC-0100 status updated to `superseded` with `supersededBy: RFC-0103`. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merge. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST consume one of the seven body kinds; never invent a new body shape.
- Agents MUST author content under `body.<field>`, never at the section root.
- Agents MUST treat `composite` archetypes as opaque and not attempt to map their content to a standard body kind.
- Agents MUST treat the `StandardListItem` contract from RFC-0100 as the row shape for `body.kind: list / split-list`; no string-only list items.
- Agents MUST consume `<SectionStats>` for any animated counter; do not author counter markup directly (this prevents drift from RFC-0040 / RFC-0041 invariants — see RFC-0106).
