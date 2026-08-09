/*
<MODULE_CONTRACT>
<purpose>
[RFC-0104 + RFC-0118] Canonical SectionImageProps + ImageFade for the shared
<SectionImage> primitive. Image fades become a property of the image, not of
the surrounding section. Parallax accepts boolean | number | object per
RFC-0118 to align with RFC-0106 ParallaxVariant semantics.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { livePhotoSchema } from "./live-photo.ts";

export const imageFadeSchema = z
  .object({
    top: z.boolean().optional(),
    bottom: z.boolean().optional(),
    left: z.boolean().optional(),
    right: z.boolean().optional(),
    /** 0..0.5 — fade band width as a fraction of the image. Default 0.25. */
    width: z.number().min(0).max(0.5).optional(),
  })
  .strict();
export type ImageFade = z.infer<typeof imageFadeSchema>;

/**
 * RFC-0118: explicit parallax config. Mirrors RFC-0106 ParallaxVariant for
 * vocabulary consistency.
 */
export const sectionImageParallaxSchema = z
  .object({
    variant: z.enum(["subtle", "balanced", "dramatic"]).optional(),
    /** 0..2; takes precedence over variant default. */
    speed: z.number().min(0).max(2).optional(),
    respectReducedMotion: z.boolean().optional(),
  })
  .strict();
export type SectionImageParallax = z.infer<typeof sectionImageParallaxSchema>;

/**
 * RFC-0118: section image parallax accepts three authoring forms:
 *  - boolean — true is equivalent to { variant: "balanced" }; false disables.
 *  - number  — direct speed (0..2).
 *  - object  — { variant, speed, respectReducedMotion }.
 */
export const sectionImageParallaxPropSchema = z.union([
  z.boolean(),
  z.number().min(0).max(2),
  sectionImageParallaxSchema,
]);
export type SectionImageParallaxProp = z.infer<typeof sectionImageParallaxPropSchema>;

export const sectionImagePropsSchema = z
  .object({
    /** Bare image name (RFC-0053). */
    imageName: z.string().min(1),
    alt: z.string().min(1),
    fit: z.enum(["cover", "contain"]).optional(),
    quality: z.enum(["low", "mid", "high", "max"]).optional(),
    loading: z.enum(["eager", "lazy"]).optional(),
    aspectRatio: z.string().optional(),
    fade: imageFadeSchema.optional(),
    parallax: sectionImageParallaxPropSchema.optional(),
    /** RFC-0202: opt-in living photo — looping sibling `<imageName>.webm` over this image. */
    live: livePhotoSchema.optional(),
    lang: z.string().optional(),
    subPath: z.string().optional(),
  })
  .strict();
export type SectionImageProps = z.infer<typeof sectionImagePropsSchema>;
