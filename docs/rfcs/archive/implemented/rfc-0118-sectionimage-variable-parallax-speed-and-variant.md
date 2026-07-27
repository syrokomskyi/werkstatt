---
id: RFC-0118
title: "SectionImage variable parallax speed and variant"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0104
  - RFC-0106
  - RFC-0115
  - RFC-0116
commands:
  proposed: []
  added: []
  changed:
    - page.block.validate
    - section.motion.contract.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
successSignals:
  - "<SectionImage> accepts parallax: boolean | number | { speed?, variant? }."
  - "data-parallax-speed reflects the authored speed (or the variant default), not a hard-coded 0.4."
  - "section.motion.contract.validate continues to deny parallax when the biome motionStance is restrained or static (RFC-0116)."
  - "Existing pages that author `parallax: true` continue to work unchanged."
nonGoals:
  - "Do not introduce a new motion library beyond GSAP."
  - "Do not introduce a non-numeric speed scale (only the variant alias is allowed)."
  - "Do not couple SectionImage parallax to SiteBackground parallax — they remain independent primitives."
---

# RFC-0118: SectionImage variable parallax speed and variant

## Context

RFC-0104 introduced `<SectionImage>` with `parallax: boolean`. The implementation emits `data-parallax-speed="0.4"` when `parallax: true` and nothing otherwise. RFC-0106 defines `ParallaxVariant` (`subtle | balanced | dramatic`) with defaults `0.2 | 0.4 | 0.7`, but that variant resolution lives on `SiteBackground` and the `<SectionShell motion>` config — not on `<SectionImage>`.

Result: a section image can either be parallax-on at fixed 0.4, or parallax-off. There is no way to author a `subtle` or `dramatic` parallax on an image without dropping to raw HTML.

## Problem

1. **Speed is hard-coded.** Every parallax image moves at 0.4.
2. **No variant alias.** Authors cannot say "subtle parallax" without knowing the numeric scale.
3. **Inconsistency with SiteBackground.** SiteBackground supports `parallax: { speed?, respectReducedMotion? }` and the motion config supports `parallax: { variant?, speed? }`; SectionImage is the odd one out.

## Decision

Promote `SectionImage.parallax` to the canonical RFC-0106 parallax shape (boolean | numeric | object). All three forms produce the same `data-parallax-speed` attribute the GSAP parallax script consumes.

### Updated `SectionImageProps` (in `@gogol/share`)

```ts
export type ParallaxVariant = "subtle" | "balanced" | "dramatic";

export interface SectionImageParallax {
  variant?: ParallaxVariant;
  speed?: number;                 // 0..2; takes precedence over variant
  respectReducedMotion?: boolean; // default true
}

export interface SectionImageProps {
  imageName: string;
  alt: string;
  fit?: "cover" | "contain";
  quality?: "low" | "mid" | "high" | "max";
  loading?: "eager" | "lazy";
  aspectRatio?: string;
  fade?: ImageFade;
  /**
   * RFC-0118: variable parallax shape.
   *  - boolean — true equivalent to { variant: "balanced" }; false disables.
   *  - number  — direct speed (0..2).
   *  - object  — { variant, speed, respectReducedMotion }.
   */
  parallax?: boolean | number | SectionImageParallax;
  lang?: string;
  subPath?: string;
}
```

### Resolution (in `<SectionImage>`)

```ts
const VARIANT_SPEED: Record<ParallaxVariant, number> = {
  subtle: 0.2,
  balanced: 0.4,
  dramatic: 0.7,
};

function resolveParallaxSpeed(p: SectionImageProps["parallax"]): number | undefined {
  if (p === undefined || p === false) return undefined;
  if (p === true) return VARIANT_SPEED.balanced;
  if (typeof p === "number") return p;
  if (typeof p.speed === "number") return p.speed;
  return VARIANT_SPEED[p.variant ?? "balanced"];
}
```

The component emits:

```astro
<div data-parallax-speed={resolved !== undefined ? String(resolved) : undefined}>
```

`gsap-parallax.ts` is unchanged — it already reads `data-parallax-speed` as a number.

### Page authoring examples

```yaml
# Boolean (back-compat)
parallax: true

# Variant alias
parallax:
  variant: subtle

# Explicit speed
parallax: 0.6

# Full config
parallax:
  variant: dramatic
  speed: 0.85
  respectReducedMotion: false
```

### Validator coupling

- `page.block.validate` accepts the new union via `sectionImageSchema` (Zod): the shape is one of `boolean | number | SectionImageParallax`.
- `section.motion.contract.validate` (RFC-0116) continues to deny parallax (any non-false form) when the biome `motionStance` is `restrained` or `static`.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full `parallax` prop schema, variant alias table, and motion gate specification.

## Architectural fit

- **RFC-0104** — `<SectionImage>` is canonical; this RFC only widens the parallax authoring shape.
- **RFC-0106** — variant scale and `respectReducedMotion` semantics preserved.
- **RFC-0115** — `team` / PersonProfile portraits inherit the expanded contract.
- **RFC-0116** — motionStance envelope still gates availability.

## CLI surface

No new commands. The schema change propagates through the existing validator pipeline.

## TypeScript contracts

```ts
// In @gogol/share/schemas/section-image.ts:
export const sectionImageParallaxSchema = z
  .object({
    variant: z.enum(["subtle", "balanced", "dramatic"]).optional(),
    speed: z.number().min(0).max(2).optional(),
    respectReducedMotion: z.boolean().optional(),
  })
  .strict();

export const sectionImageSchema = z
  .object({
    /* ...unchanged fields... */
    parallax: z.union([
      z.boolean(),
      z.number().min(0).max(2),
      sectionImageParallaxSchema,
    ]).optional(),
  })
  .strict();
```

## File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/share/src/schemas/section-image.ts` | Widen `parallax` to the union; export `SectionImageParallax`. |
| `packages/share/src/index.ts` | Re-export the new type and schema. |
| `packages/ui/src/components/section-image/section-image.astro` | Resolve the union → numeric speed; emit `data-parallax-speed`. |
| `packages/ontology/src/shared-section-props/index.ts` | Update body-cards or any fragment that mentions parallax (no body fragment touches parallax today — no edits needed). |
| `packages/os/site-kernel-checks/src/section-framework.ts` | Update IMG validator to recognise the union (no rejection logic changes). |

## Failure modes

- A page declares `parallax: 3` → Zod rejects via `min/max` bound.
- A page declares `parallax: { variant: "extreme" }` → Zod enum rejects.
- A page declares `parallax: { speed: 0.5 }` under a `restrained` biome → RFC-0116 MOT-01 rejects.
- An older page authored `parallax: true` continues to render at the same 0.4 speed (back-compat preserved).

## Rollout

1. Land the schema widening in `@gogol/share`.
2. Update `<SectionImage>` to consume the union.
3. (Optional) Document one example in `nicaragua-projekt` `about-us.md` to demonstrate the variant alias.
4. No app migration required — existing `parallax: true` remains valid.

## Alternatives considered

- **Keep parallax boolean-only and require config on `<SectionShell motion.parallax>` instead.** Rejected — section motion config governs the whole section, but parallax is naturally an image-level property; keeping it on `<SectionImage>` is the cleaner mental model.
- **Use a string scale (`slow | medium | fast`) instead of variant names.** Rejected — RFC-0106 already defines `ParallaxVariant` and reusing the names keeps the system coherent.

## Risks

- Numeric `parallax` value without a `respectReducedMotion` guard may cause discomfort. Mitigation: the default for `respectReducedMotion` is `true`; authors must opt out explicitly.
- Biome stance validation may be bypassed by authors passing `{ speed: X }` directly. Mitigation: `section.motion.contract.validate` reads the composed biome stance and rejects any non-`off` parallax when `motionStance: static`.

## Acceptance criteria

- [x] `SectionImageProps.parallax` accepts `boolean | number | { variant?, speed?, respectReducedMotion? }` (2026-05-27). (evidence: implemented historically)
- [x] `<SectionImage>` resolves the union to a numeric speed and emits `data-parallax-speed` (2026-05-27). (evidence: implemented historically)
- [x] `page.block.validate` accepts all three forms and rejects out-of-range values (via the new Zod union in `@gogol/share/schemas/section-image.ts`; `additionalProperties: false` is enforced through Zod `.strict()`). (evidence: packages/ directory, package exists)
- [x] Existing pages with `parallax: true` continue to render identically (boolean `true` resolves to the `balanced` variant default = 0.4 — same value the prior hard-coded path emitted). (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST prefer the variant alias (`{ variant: "subtle" }`) over raw numbers when authoring content; numeric speed is reserved for fine-tuning.
- Agents MUST never bypass the biome `motionStance` envelope; any parallax form is rejected under `restrained` or `static` stances.
