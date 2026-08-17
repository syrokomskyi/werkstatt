/*
<MODULE_CONTRACT>
<purpose>
[RFC-0105] Canonical SiteBackgroundConfig — global viewport background shell
block, independent of section-level SectionBackground.
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

const colorLayer = z
  .object({
    kind: z.literal("color"),
    color: z.string().min(1).optional(),
  })
  .strict();

const imageLayer = z
  .object({
    kind: z.literal("image"),
    imageName: z.string().min(1),
    fit: z.enum(["cover", "tile", "stretch-width", "stretch-height"]).optional(),
    quality: z.enum(["low", "mid", "high", "max"]).optional(),
    loading: z.enum(["eager", "lazy"]).optional(),
    tint: z
      .object({
        color: z.string().min(1).optional(),
        opacity: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
    parallax: z
      .object({
        speed: z.number().min(0).max(2).optional(),
        respectReducedMotion: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const gradientStop = z
  .object({
    at: z.number().min(0).max(1),
    color: z.string().min(1),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();

const gradientLayer = z
  .object({
    kind: z.literal("gradient"),
    direction: z.enum(["vertical", "horizontal", "radial"]),
    stops: z.array(gradientStop).min(2),
  })
  .strict();

export const siteBackgroundLayerSchema = z.discriminatedUnion("kind", [
  colorLayer,
  imageLayer,
  gradientLayer,
]);
export type SiteBackgroundLayer = z.infer<typeof siteBackgroundLayerSchema>;

export const siteBackgroundConfigSchema = z
  .object({
    layers: z.array(siteBackgroundLayerSchema).min(1),
    lang: z.string().optional(),
  })
  .strict();
export type SiteBackgroundConfig = z.infer<typeof siteBackgroundConfigSchema>;
