/*
<MODULE_CONTRACT>
<purpose>
[RFC-0106] Canonical SectionMotionConfig. Consumed by <SectionShell motion>;
the shell emits data-motion-reveal / data-motion-stagger / data-parallax-speed
attributes that the GSAP scripts pick up via selectors.
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

export const revealVariantSchema = z.enum(["fade", "fade-up", "fade-up-stagger"]);
export type RevealVariant = z.infer<typeof revealVariantSchema>;

export const parallaxVariantSchema = z.enum(["subtle", "balanced", "dramatic"]);
export type ParallaxVariant = z.infer<typeof parallaxVariantSchema>;

export const sectionMotionConfigSchema = z
  .object({
    reveal: z
      .object({
        variant: revealVariantSchema.optional(),
        once: z.boolean().optional(),
        threshold: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
    parallax: z
      .object({
        variant: parallaxVariantSchema.optional(),
        speed: z.number().min(0).max(2).optional(),
      })
      .strict()
      .optional(),
    stagger: z
      .object({
        delay: z.number().min(0).max(2).optional(),
        childSelector: z.string().optional(),
      })
      .strict()
      .optional(),
    off: z.boolean().optional(),
  })
  .strict();
export type SectionMotionConfig = z.infer<typeof sectionMotionConfigSchema>;
