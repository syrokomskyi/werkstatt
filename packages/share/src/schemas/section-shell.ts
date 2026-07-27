/*
<MODULE_CONTRACT>
<purpose>
[RFC-0101] Canonical SectionShellProps — the typed contract for the universal
<SectionShell> wrapper used by every shared section in packages/ui. Section
content and authoring shape live in RFC-0102 (header) and RFC-0103 (body); this
module owns visual + structural wrapper props only.
</purpose>
<non-goals>
  <item>Do not declare header, body, cta, or motion props (their own RFCs).</item>
  <item>Do not import Astro types; this is a framework-agnostic schema module.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { sectionBackgroundSchema } from "./section-background.ts";
import { effectsSchema } from "./effects.ts";
import { sectionMotionConfigSchema } from "./section-motion.ts";

export const sectionDensitySchema = z.enum(["compact", "normal", "spacious"]);
export type SectionDensity = z.infer<typeof sectionDensitySchema>;

export const sectionToneSchema = z.enum(["default", "warning", "success", "muted"]);
export type SectionTone = z.infer<typeof sectionToneSchema>;

export const sectionContainerVariantSchema = z.enum(["default", "narrow", "full"]);
export type SectionContainerVariant = z.infer<typeof sectionContainerVariantSchema>;

export const sectionShellAnimatedSchema = z.enum(["none", "reveal"]);
export type SectionShellAnimated = z.infer<typeof sectionShellAnimatedSchema>;

export const sectionShellPropsSchema = z
  .object({
    /** BEM prefix for the section, e.g. "transparency". Used for data attributes. */
    slug: z.string().min(1),
    /** Anchor id (resolved by resolveSectionAnchor upstream). */
    sectionId: z.string().optional(),
    ariaLabel: z.string().optional(),
    ariaLabelledBy: z.string().optional(),
    background: sectionBackgroundSchema.optional(),
    effects: effectsSchema.optional(),
    density: sectionDensitySchema.optional(),
    tone: sectionToneSchema.optional(),
    containerVariant: sectionContainerVariantSchema.optional(),
    /**
     * RFC-0106 motion bridge. `reveal` opts the section into the platform
     * reveal animation when the biome motion stance permits it. Full motion
     * config (parallax, stagger) lives on a sibling `motion` prop introduced
     * by RFC-0106; this enum is the minimal hook landed with RFC-0101.
     */
    animated: sectionShellAnimatedSchema.optional(),
    /** RFC-0106: full motion config (reveal / parallax / stagger / off). */
    motion: sectionMotionConfigSchema.optional(),
  })
  .strict();

export type SectionShellProps = z.infer<typeof sectionShellPropsSchema>;
