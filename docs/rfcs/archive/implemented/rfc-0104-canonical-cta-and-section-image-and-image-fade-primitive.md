---
id: RFC-0104
title: "Canonical CTA contract, SectionImage, and image-fade primitive"
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
  - RFC-0035
  - RFC-0042
  - RFC-0048
  - RFC-0053
  - RFC-0094
  - RFC-0101
  - RFC-0103
commands:
  proposed:
    - section.cta.contract.validate
    - section.image.contract.validate
  added:
    - section.cta.contract.validate
    - section.image.contract.validate
  changed:
    - page.block.validate
    - section.contract.validate
    - section.scaffold
  removed:
    - per-section ad-hoc CTA shapes (`Cta { label, target }`, `primaryCta`, `secondaryCta`, `ctaLabel + ctaAriaLabel + ctaSecondaryLabel + ...`)
    - per-section image-fade flags (`imageFadeBottom`, `imageFadeTop`, `imageFadeLeft`, `imageFadeRight`) duplicated across team / markdown / person-profile
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
  - ontology
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - "Every CTA across all sections uses one structured `CtaConfig` object and renders through <SectionCta> / <SectionCtaGroup>."
  - "Every authored image inside a shared section renders through <SectionImage> with a uniform `fade` config (top/bottom/left/right)."
  - "No section .css declares its own button gradient or focus ring — all CTA visuals flow from biome tokens."
  - "Image-fade flags do not appear in any section .types.ts as top-level flags."
nonGoals:
  - "Do not absorb header / body alignment into CTA (those live in RFC-0102 / RFC-0103)."
  - "Do not couple CTA target resolution to a per-app default page (kept page-driven per RFC-0094)."
  - "Do not move full-page hero images out of the hero archetype — only authored sub-images are standardized here."
---

# RFC-0104: Canonical CTA contract, SectionImage, and image-fade primitive

## Context

CTAs are authored four different ways across the repo:

- `final-cta`: flat `ctaLabel`, `ctaAriaLabel`, `ctaSecondaryLabel`, `ctaSecondaryAriaLabel`, plus `primaryCtaTarget` / `secondaryCtaTarget` at section root.
- `hero`: same flat shape but with extra `tagline` + `description`.
- `hero-decision-card`: structured `primaryCta: { label, target }`, `secondaryCta: { label, target }`.
- `founder-trust-card` / `notausgang-block`: structured `cta: { label, target }` (single).

This makes generic CTA validation, brand-voice linting, and agent authoring fragile. It also blocks one consistent visual style for CTAs across sections.

Image fades (`imageFadeBottom / imageFadeTop / imageFadeLeft / imageFadeRight`) are declared as top-level booleans on `team`, `markdown`, `person-profile` and consumed inside the components, duplicating CSS. They should be a property of the image primitive, not of the section.

This RFC standardizes both, plus introduces `<SectionImage>` as the only authored image primitive shared sections render.

## Problem

1. **CTA shape is not canonical.** Four shapes coexist; brand voice linter cannot reliably target CTA copy.
2. **CTA visuals are duplicated** between section CSS files (`.cta`, `.cta-primary`, `.cta-secondary`, `.btn--primary`, `.btn--secondary`, `.final-cta-section__btn`).
3. **Image fades are section-level booleans** instead of properties of the image they affect, making them brittle when a section has more than one image.
4. **No shared `<SectionImage>`** exists; sections repeat `import { Image } from "astro:assets"`, `resolveImageRequired`, alt-text validation, and quality presets.

## Decision

Introduce a canonical `CtaConfig` shape, two CTA components (`<SectionCta>` single, `<SectionCtaGroup>` multiple), and one `<SectionImage>` primitive that owns image fades.

### `CtaConfig`

Path: `packages/share/src/schemas/section-cta.ts`.

```ts
export type CtaVariant = "primary" | "secondary" | "ghost" | "danger";

export type CtaTarget =
  | { kind: "internal"; pageId: string; anchor?: string }
  | { kind: "external"; href: string; rel?: string }
  | { kind: "anchor"; anchor: string };

export interface CtaConfig {
  label: string;
  target: CtaTarget;
  ariaLabel?: string;
  variant?: CtaVariant;        // default "primary"
  icon?: VendorIconConfig;     // optional leading icon
  iconPosition?: "leading" | "trailing"; // default "trailing"
  size?: "sm" | "md" | "lg";   // default "md"
  fullWidth?: boolean;         // default false
}

export interface CtaGroupConfig {
  align?: "left" | "center" | "right";  // default "left"
  items: CtaConfig[];
}
```

### Page authoring example

```yaml
- id: cta
  type: final-cta
  props:
    background: { kind: color }
    header:
      heading:
        - { text: "Beschreiben Sie Ihre Situation", tone: primary }
      align: center
    body:
      kind: paragraphs
      align: center
      paragraphs:
        - "Situation beschreiben oder zuerst eine Frage stellen — beides ohne Verpflichtung."
    ctaGroup:
      align: center
      items:
        - label: "Situation beschreiben"
          target: { kind: internal, pageId: contact }
          variant: primary
          ariaLabel: "Anfrage an WGogol senden"
```

Single-CTA sections (`notausgang-block.cta`, `founder-trust-card.cta`) keep the same shape under `cta: CtaConfig` (without a group wrapper).

### `<SectionCta>` and `<SectionCtaGroup>`

Path: `packages/ui/src/components/section-cta/`.

```astro
<!-- single -->
<SectionCta {...o.cta} />

<!-- group -->
<SectionCtaGroup {...o.ctaGroup} />
```

Visuals are biome-token-driven:

- `variant: primary` → `--ds-color-cta`, `--ds-color-cta-text`, `--ds-shadow-md`.
- `variant: secondary` → outline using `--ds-color-primary`.
- `variant: ghost` → text-only.
- `variant: danger` → `--ds-color-danger`.
- `size` → padding scale.
- Focus ring uses `--ds-color-focus-ring`.
- Hover transform uses `--ds-motion-duration-fast` and `--ds-motion-easing` (RFC-0071).

Target resolution uses the existing `resolveSemanticTarget` for `internal`, applies external-link rel rules for `external`, and prepends `#` for `anchor`. CTA does not invent fallback pageIds (RFC-0094).

### `<SectionImage>` with fade primitive

Path: `packages/ui/src/components/section-image/`.

```ts
export interface ImageFade {
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
  /** 0..0.5 — fade band width as a fraction of the image. Default 0.25. */
  width?: number;
}

export interface SectionImageProps {
  imageName: string;             // bare name (RFC-0053)
  alt: string;
  fit?: "cover" | "contain";     // default "cover"
  quality?: "low" | "mid" | "high" | "max"; // default "max"
  loading?: "eager" | "lazy";    // default "lazy"
  aspectRatio?: string;          // CSS aspect-ratio value
  fade?: ImageFade;              // mask-image fades
  parallax?: boolean;            // hook for RFC-0106 motion
  lang?: string;                 // for image resolution
  subPath?: string;              // for resolveImageRequired
}
```

The component owns:

- Astro `<Image>` integration with `widths` / `sizes` presets.
- Quality preset mapping.
- `mask-image` gradients for the four fade directions (combined when more than one is set).
- Optional GSAP parallax hook (RFC-0106).
- `resolveImage` / `resolveImageRequired` integration.

The four `imageFade*` booleans disappear from `team`, `markdown`, `person-profile`. They become `<SectionImage fade={{ bottom: true }}>` etc.

### Sections affected

- `final-cta`, `hero`: CTAs become `ctaGroup` (multiple variant primary+secondary).
- `hero-decision-card`: `primaryCta` / `secondaryCta` collapse to `ctaGroup.items[0..1]`.
- `notausgang-block`, `founder-trust-card`: keep single `cta: CtaConfig`.
- `team` (member portraits), `women`, `approach` (card images), `markdown` (in-prose images), `hero` (portrait): consume `<SectionImage>` with `fade` instead of section-level flags.

### Composite sections

Hero, hero-decision-card, founder-trust-card, price-card, donation-card keep their composite layout but consume `<SectionCta>` and `<SectionImage>` internally. They are still `bodyKind: composite` per RFC-0103.

### Removals

- All `ctaLabel`, `ctaAriaLabel`, `ctaSecondaryLabel`, `ctaSecondaryAriaLabel`, `primaryCtaTarget`, `secondaryCtaTarget` flat props on `final-cta` and `hero`.
- All `imageFadeBottom`, `imageFadeTop`, `imageFadeLeft`, `imageFadeRight` flat props on `team`, `markdown`, `person-profile`.
- Section-local CTA CSS classes (`.cta`, `.cta-primary`, `.cta-secondary`, `.final-cta-section__btn`).
- App `global.css` keeps `.btn / .btn--primary / .btn--secondary` only as a fallback for hand-rolled markup outside shared sections (server `<a>` tags from `<Footer>` etc.). Shared sections do not use those classes; they render `<SectionCta>`.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## Failure modes` above for the full `<SectionCta>`, `<SectionCtaGroup>`, and `<SectionImage>` contract specification and validation rule set.

## Architectural fit

- **RFC-0035**: `SectionProps` unchanged.
- **RFC-0042**: `need("label", cta.label)` keeps working under `cta` / `ctaGroup.items[i]`.
- **RFC-0048**: anchor target shape preserved (`CtaTarget.kind: anchor`).
- **RFC-0053**: image name resolution rule preserved (`SectionImageProps.imageName`).
- **RFC-0094**: CTA never invents a per-app default pageId; the authored target is canonical.
- **RFC-0101**: CTAs render inside `<SectionShell>` (under the body), following body alignment if not overridden.
- **RFC-0103**: `cta` / `ctaGroup` is an optional sibling of `body` in section props.

## CLI surface

```sh
pnpm exec site-kernel run section.cta.contract.validate
pnpm exec site-kernel run section.image.contract.validate
pnpm exec site-kernel run section.contract.validate
pnpm exec site-kernel run page.block.validate --app <id>
pnpm exec site-kernel run section.scaffold --archetype <id> --slug <slug>
```

Behavior:

- `section.cta.contract.validate` — every shared section that renders a CTA does so through `<SectionCta>` or `<SectionCtaGroup>`. Flat CTA props are rejected.
- `section.image.contract.validate` — every shared section image inside a section body or composite layout renders through `<SectionImage>`. Raw `<Image>` imports inside sections are rejected (except in components like `<SectionImage>` itself).
- `page.block.validate` — rejects flat `ctaLabel / primaryCtaTarget / imageFade*` keys for migrated sections.
- `section.scaffold` — emits `<SectionCtaGroup>` / `<SectionImage>` starters per archetype.

## TypeScript contracts

```ts
export const ctaTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("internal"), pageId: z.string().min(1),
             anchor: z.string().optional() }),
  z.object({ kind: z.literal("external"), href: z.string().url(),
             rel: z.string().optional() }),
  z.object({ kind: z.literal("anchor"), anchor: z.string().min(1) }),
]);

export const ctaConfigSchema = z.object({
  label: z.string().min(1),
  target: ctaTargetSchema,
  ariaLabel: z.string().optional(),
  variant: z.enum(["primary", "secondary", "ghost", "danger"]).optional(),
  icon: vendorIconConfigSchema.optional(),
  iconPosition: z.enum(["leading", "trailing"]).optional(),
  size: z.enum(["sm", "md", "lg"]).optional(),
  fullWidth: z.boolean().optional(),
});

export const ctaGroupConfigSchema = z.object({
  align: horizontalAlignSchema.optional(),
  items: z.array(ctaConfigSchema).min(1),
});

export const imageFadeSchema = z.object({
  top: z.boolean().optional(),
  bottom: z.boolean().optional(),
  left: z.boolean().optional(),
  right: z.boolean().optional(),
  width: z.number().min(0).max(0.5).optional(),
});

export const sectionImageSchema = z.object({
  imageName: z.string().min(1),
  alt: z.string().min(1),
  fit: z.enum(["cover", "contain"]).optional(),
  quality: z.enum(["low", "mid", "high", "max"]).optional(),
  loading: z.enum(["eager", "lazy"]).optional(),
  aspectRatio: z.string().optional(),
  fade: imageFadeSchema.optional(),
  parallax: z.boolean().optional(),
  lang: z.string().optional(),
  subPath: z.string().optional(),
});
```

## Failure modes

- Section renders `<a class="btn btn--primary">` directly inside `packages/ui/src/sections/*` → `section.cta.contract.validate` fails.
- Page block declares `ctaLabel: "..."` at section root → `page.block.validate` fails.
- CTA target has `kind: internal` but missing `pageId` → Zod rejects.
- Section .astro imports `astro:assets` `Image` directly (outside composite layouts that own complex hero compositions) → `section.image.contract.validate` warns; allowed only inside `<SectionImage>` itself.

## Rollout

1. Add `ctaTargetSchema`, `ctaConfigSchema`, `ctaGroupConfigSchema`, `imageFadeSchema`, `sectionImageSchema` to `@gogol/share`.
2. Add `<SectionCta>`, `<SectionCtaGroup>`, `<SectionImage>` to `@gogol/ui`.
3. Migrate every shared section to consume them.
4. Update archetypes that have CTAs / images to reference the new shapes.
5. Migrate app pages: `primaryCta` / `secondaryCta` → `ctaGroup.items`; `ctaLabel` → `ctaGroup.items[0].label`; `imageFade*` → `<SectionImage fade={{ bottom: true, ... }}>`.
6. Drop section-local CTA CSS and image-fade CSS.
7. Add validators to the pipeline (RFC-0107).

## Alternatives considered

- **Keep flat CTA props per section.** Rejected; impedes brand voice linting.
- **Polymorphic single `<Cta>` that handles both single and group.** Rejected; the two-shape contract is clearer for agents and for archetypes that allow exactly one CTA.
- **Image fades as biome tokens.** Rejected; fade is a layout decision per image, not a brand decision.

## Risks

- Hero's two CTAs are tightly coupled to its layout (sit next to stats). Migration must preserve the layout; the hero `.astro` composes `<SectionCtaGroup>` inside its bespoke flow container.
- Some legal pages reference CTA copy verbatim; brand voice linter needs the new path (`ctaGroup.items[].label`).

## Acceptance criteria

- [x] `CtaConfig`, `CtaGroupConfig`, `SectionImageProps`, `ImageFade` schemas exported from `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] `<SectionCta>`, `<SectionCtaGroup>`, `<SectionImage>` exported from `@gogol/ui`. (evidence: packages/ directory, package exists)
- [x] Every shared section that previously declared flat CTA / imageFade props is migrated. (evidence: implemented historically)
- [x] `section.cta.contract.validate` and `section.image.contract.validate` pass workspace-wide. (evidence: implemented historically)
- [x] App pages no longer carry flat CTA or imageFade props for migrated sections. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merge. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST author CTAs as `CtaConfig` objects with discriminated `target`; never as flat label+target strings.
- Agents MUST consume `<SectionImage>` for any authored image inside a shared section; raw `<Image>` is forbidden outside the `<SectionImage>` implementation.
- Agents MUST place image fades on the image, not on the section, via `<SectionImage fade={{ bottom: true }}>`.
- Agents MUST resolve internal CTA targets through the authored `pageId`; never invent a per-app default.
