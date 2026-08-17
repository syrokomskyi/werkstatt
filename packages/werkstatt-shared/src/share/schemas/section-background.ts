/*
<MODULE_CONTRACT>
<purpose>
[RFC-0101] Canonical SectionBackground discriminated union. Replaces flat
visual-modifier props (texture / transparent / opacity / verticalFade /
noTopFade / noBottomFade / topVerticalFadeOpacity / bottomVerticalFadeOpacity)
across every shared section in packages/ui. Section background is strictly
independent from the global SiteBackground shell block (RFC-0105).
</purpose>
<non-goals>
  <item>Do not include glass effect here (lives in ./glass.ts).</item>
  <item>Do not absorb the full-viewport SiteBackground shell layer (RFC-0105).</item>
  <item>Do not parse image assets; <SectionShell> + <SectionImage> own that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

const cssValueOrToken = z.string().min(1);

/** RFC-0101 — kind: "color". Solid colour background using a CSS token or value. */
const sectionBackgroundColorSchema = z
  .object({
    kind: z.literal("color"),
    /** Defaults to var(--ds-color-bg) when omitted. */
    color: cssValueOrToken.optional(),
  })
  .strict();

/** RFC-0101 — kind: "image". Image background with fit + quality + optional tint overlay. */
const sectionBackgroundImageSchema = z
  .object({
    kind: z.literal("image"),
    /** Bare image name (RFC-0053); resolved by <SectionShell> via shared image utils. */
    imageName: z.string().min(1),
    fit: z.enum(["cover", "tile", "stretch-width", "stretch-height"]).optional(),
    quality: z.enum(["low", "mid", "high", "max"]).optional(),
    /** 0..1; tint overlay opacity using --ds-color-bg above the image. */
    tintOpacity: z.number().min(0).max(1).optional(),
  })
  .strict();

/** RFC-0101 — kind: "texture". Repeating texture pattern (e.g. noise) layered over color. */
const sectionBackgroundTextureSchema = z
  .object({
    kind: z.literal("texture"),
    /** Texture id — "noise" is the only built-in for now. */
    texture: z.string().min(1),
  })
  .strict();

/** RFC-0101 — kind: "transparent". Lets the SiteBackground (RFC-0105) show through. */
const sectionBackgroundTransparentSchema = z
  .object({
    kind: z.literal("transparent"),
    /** Optional tint opacity (0 = fully transparent, 1 = fully opaque --ds-color-bg). */
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();

/**
 * RFC-0101 — kind: "fade". Linear gradient along one axis. Replaces the
 * legacy verticalFade / noTopFade / noBottomFade / topVerticalFadeOpacity /
 * bottomVerticalFadeOpacity permutation matrix with a single parameterised
 * gradient. Per the accepted RFC, direction is restricted to vertical |
 * horizontal (no diagonal / radial).
 */
const sectionBackgroundFadeSchema = z
  .object({
    kind: z.literal("fade"),
    direction: z.enum(["vertical", "horizontal"]),
    /** Start colour token / value. Defaults to var(--ds-color-bg). */
    from: cssValueOrToken.optional(),
    /** End colour token / value. Defaults to var(--ds-color-bg). */
    to: cssValueOrToken.optional(),
    /** 0..1; opacity of the gradient at the start edge. Default 1. */
    startOpacity: z.number().min(0).max(1).optional(),
    /** 0..1; opacity of the gradient at the end edge. Default 1. */
    endOpacity: z.number().min(0).max(1).optional(),
    /** 0..0.5; plateau width fraction. Default 0.2. */
    inset: z.number().min(0).max(0.5).optional(),
    /** Suppress fade at the start edge. */
    noStartFade: z.boolean().optional(),
    /** Suppress fade at the end edge. */
    noEndFade: z.boolean().optional(),
  })
  .strict();

export const sectionBackgroundSchema = z.discriminatedUnion("kind", [
  sectionBackgroundColorSchema,
  sectionBackgroundImageSchema,
  sectionBackgroundTextureSchema,
  sectionBackgroundTransparentSchema,
  sectionBackgroundFadeSchema,
]);

export type SectionBackgroundColor = z.infer<typeof sectionBackgroundColorSchema>;
export type SectionBackgroundImage = z.infer<typeof sectionBackgroundImageSchema>;
export type SectionBackgroundTexture = z.infer<typeof sectionBackgroundTextureSchema>;
export type SectionBackgroundTransparent = z.infer<typeof sectionBackgroundTransparentSchema>;
export type SectionBackgroundFade = z.infer<typeof sectionBackgroundFadeSchema>;
export type SectionBackground = z.infer<typeof sectionBackgroundSchema>;
